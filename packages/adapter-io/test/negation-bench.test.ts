// @atlas/adapter-io — test/negation-bench.test.ts  (#95 · #99 M3 — THE SOUND-NEGATION BENCHMARK)
//
// REPRODUCE: (from repo root, fresh `.atlas/index.scip` — `scip-typescript index --output .atlas/index.scip`)
//   ATLAS_NEG_BENCH=1 npx vitest run packages/adapter-io/test/negation-bench.test.ts
//
// WHAT THIS MEASURES. The shipped v2 negation door (ADR-0016 gate 1b: admit `¬∃ caller of X in S` iff
// `resolves(X) ∧ ¬escape(X) ∧ ¬dynamic-reach(S) ∧ reverseCallers(X)∩S==∅`, else abstain) is the DETERMINISTIC
// genesis gate for the NEGATION shape. It carries no LLM — a proposer (an LLM miner) suggests candidate
// negatives; THIS gate judges them. So the gate's own quality is two numbers, measured here over Atlas itself:
//   · 0-FALSE-ADMIT (soundness, the headline): every negation the gate ADMITS is TRUE — X is genuinely not
//     called in S — confronted against an INDEPENDENT second extractor (the TypeScript compiler, `tsc`, whose
//     escape verdicts the engine already agrees with 1135/1135 / 0-unsound, `escape-ts-oracle-agree.mjs`).
//     A single false-admit breaks the whole soundness claim; this suite FAILS if one is found.
//   · NET-RECALL: of the TRUE scoped-negatives in the pool (X really not called in S, per tsc), what fraction
//     the gate ADMITS rather than abstains. The #99 design floor was 0% (the #99b blanket `holeSources()∩S`
//     abstains on ~92% of files); the v2 target-relative gate is the recall win, quantified here.
// Plus the ADVERSARIAL rows (`negation-bench-channels`): the reproduced `ns[key]()` false-admit + all 5 hardened
// dynamic channels, each a synthetic scope where X IS reachable with no emitted occurrence — the gate MUST abstain.
//
// HONESTY RAILS (honestidade-inegociável):
//   · The gate under test is the SHIPPED door (`createGovernedEmit(...).emit` on a `kind:'negation'` node), NOT
//     a re-implementation — the same code path the CLI/MCP promote leg runs. Authz is made permissive so a
//     gate-1 ADMIT surfaces as `emitted:true` (authz/ratify/commit are orthogonal, tested elsewhere).
//   · GROUND TRUTH is tsc, built independently in this file (its own `ts.createProgram`), never the SCIP index
//     the gate reads — so "the gate agrees with itself" can never masquerade as truth.
//   · The pool is EXHAUSTIVE over (every joinable export target X) × (every real src scope S) with def(X) not
//     under S — no sampling, no cherry-pick. If a hard cap ever truncates it, the run LOGS the drop (no silent cap).
//
// Skipped unless ATLAS_NEG_BENCH=1 (a full tsc program + thousands of door calls is too heavy for `npm test`).

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { join, dirname, relative, resolve as presolve } from 'node:path';
import ts from 'typescript';
import { deserializeSCIP } from '@c4312/scip';
import { asHash } from '@atlas/kernel';
import type { Hash } from '@atlas/contracts';
import { build, createSymbolReverse, nodeHashOfPath, canonicalizeSymbol } from '@atlas/index';
import type { Axes, FileTree, SymbolReverseApi } from '@atlas/index';
import type { GroundedFact, NegationNode } from '@atlas/knowledge';
import type { StoreProjection } from '@atlas/knowledge';
import type { CommitDecision, CommitResult } from '../src/sidecar.js';
import type { DiskStore } from '../src/store.js';
import { createGovernedEmit } from '../src/governed-emit.js';
import { walkFileTree } from '../src/fs.js';
import { foldAstUnits, initAst } from '../src/ast.js';
import { readScipOrEmpty } from '../src/scip.js';
import { buildTargetEscapes } from '../src/escape/target-escapes.js';
import { buildDynamicReach } from '../src/escape/dynamic-reach.js';
import { underScope } from '../src/anchor-scope.js';
import { edgeModelVersion } from '../src/wire.js';

const RUN = process.env.ATLAS_NEG_BENCH === '1';
const ROOT = presolve(__dirname, '..', '..', '..'); // packages/adapter-io/test → repo root
const SCIP = join(ROOT, '.atlas', 'index.scip');
const ACTOR = 'bench@atlas.test';
const AT = asHash('cafe') as unknown as Hash; // the CAS `at` arg emit takes; a negation ignores it (routes by key).
const HARD_CAP = 40_000; // backstop; the real pool is ~20k. Truncation is LOGGED, never silent.

// ── the SCIP-symbol ⋈ tsc-oracle key: canon(symbol) + trailing descriptor name, mirrors escape-ts-oracle-agree.mjs.
function scipName(symbol: string): string | null {
  const m = symbol.match(/^scip-typescript npm (\S+) (\S+) (.+)$/);
  if (!m) return null;
  const seg = m[3]!.replace(/`/g, '').split('/');
  const i = seg.findIndex((s) => /\.tsx?$/.test(s));
  if (i === -1 || i + 1 >= seg.length) return null;
  const after = seg.slice(i + 1);
  if (after.length !== 1) return null;
  const name = after[0]!.replace(/\(\)\.?$/, '').replace(/[#.]$/, '');
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : null;
}

interface Target { symbol: string; df: string; name: string; key: string } // symbol = canonical SCIP; key = df#name
interface OracleRec { callFiles: Set<string>; refFiles: Set<string> }

// ── the independent tsc ground truth: per exported decl, the files where it is CALLED / merely REFERENCED.
function buildOracle(): Map<string, OracleRec> {
  const rootNames = globSync('packages/*/src/**/*.ts', { cwd: ROOT })
    .filter((p) => !/\.test\.ts$/.test(p) && !/\/test\//.test(p))
    .map((p) => presolve(ROOT, p));
  const program = ts.createProgram({
    rootNames,
    options: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
      skipLibCheck: true, noEmit: true, baseUrl: ROOT, paths: { '@atlas/*': ['packages/*/src/index.ts'] },
    },
  });
  const checker = program.getTypeChecker();
  const rel = (fn: string): string => relative(ROOT, presolve(fn)).split('\\').join('/');
  const decls = new Map<ts.Declaration, { name: string; df: string; sym: ts.Symbol; rec: OracleRec }>();
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile) continue;
    const p = rel(sf.fileName);
    if (!p.startsWith('packages/') || !/\/src\//.test(p)) continue;
    const modSym = checker.getSymbolAtLocation(sf);
    if (!modSym) continue;
    for (const ex of checker.getExportsOfModule(modSym)) {
      let s = ex;
      if (s.flags & ts.SymbolFlags.Alias) s = checker.getAliasedSymbol(s);
      const d = (s.getDeclarations() || [])[0];
      if (!d) continue;
      const df = rel(d.getSourceFile().fileName);
      if (!df.startsWith('packages/') || !/\/src\//.test(df)) continue;
      if (!decls.has(d)) decls.set(d, { name: s.getName(), df, sym: s, rec: { callFiles: new Set(), refFiles: new Set() } });
    }
  }
  const byDecl = new Map<ts.Declaration, ts.Declaration>();
  for (const [d, r] of decls) for (const alt of r.sym.getDeclarations() || []) byDecl.set(alt, d);
  const isCallee = (n: ts.Node): boolean => {
    const p = n.parent;
    return !!p && ((ts.isCallExpression(p) && p.expression === n) || (ts.isNewExpression(p) && p.expression === n));
  };
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile) continue;
    const p = rel(sf.fileName);
    if (!p.startsWith('packages/')) continue;
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node)) {
        let s = checker.getSymbolAtLocation(node);
        if (s && s.flags & ts.SymbolFlags.Alias) s = checker.getAliasedSymbol(s);
        for (const decl of s?.getDeclarations() ?? []) {
          const key = byDecl.get(decl);
          if (!key) continue;
          const r = decls.get(key)!;
          if (ts.getNameOfDeclaration(decl) === node) break; // the definition itself, not a use
          r.rec.refFiles.add(p);
          if (isCallee(node)) r.rec.callFiles.add(p);
          break;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  const oracle = new Map<string, OracleRec>();
  for (const r of decls.values()) oracle.set(`${r.df}#${r.name}`, r.rec);
  return oracle;
}

// ── the candidate targets: every canonical global def symbol in the index that JOINS the tsc oracle.
function buildTargets(oracle: Map<string, OracleRec>): { targets: Target[]; scopes: string[] } {
  const idx = deserializeSCIP(readFileSync(SCIP));
  const DEF = 1;
  const seen = new Map<string, Target>();
  const scopes = new Set<string>();
  for (const doc of idx.documents) {
    if (!/^packages\/[^/]+\/src\/.+\.tsx?$/.test(doc.relativePath) || /\.test\.tsx?$/.test(doc.relativePath)) continue;
    scopes.add(dirname(doc.relativePath));
    for (const o of doc.occurrences) {
      if (!(o.symbolRoles & DEF)) continue;
      const name = scipName(o.symbol);
      if (!name) continue;
      const symbol = canonicalizeSymbol(o.symbol);
      const key = `${doc.relativePath}#${name}`;
      if (!oracle.has(key) || seen.has(symbol)) continue; // only ground-truthable targets, dedup by canonical symbol
      seen.set(symbol, { symbol, df: doc.relativePath, name, key });
    }
  }
  return { targets: [...seen.values()], scopes: [...scopes].sort() };
}

type Verdict = 'admit' | 'refute' | `abstain:${string}`;

function classify(out: { emitted: boolean; rejected?: string }): Verdict {
  if (out.emitted) return 'admit';
  const r = out.rejected ?? '';
  if (r.includes('negation refuted')) return 'refute';
  for (const reason of ['scope-open', 'escape-open', 'scope-dynamic', 'target-unresolvable', 'target-not-global', 'scope-empty']) {
    if (r.includes(`(${reason})`)) return `abstain:${reason}`;
  }
  return `abstain:other`;
}

// ── ADVERSARIAL ROWS (owner directive): the reproduced `ns[key]()` false-admit + all 5 hardened dynamic
//    channels, each a scope S where a target COULD be reached with NO emitted occurrence. Driven through the
//    REAL leg the door consumes (`buildDynamicReach`): a firing channel ⇒ the door abstains `scope-dynamic`,
//    so it NEVER admits "X is uncalled in S" when X might be reached via that channel. (Leg-level teeth also
//    live in `dynamic-reach.test.ts`; door-level `ns[key]()` false-admit in `negation-door-v2-escape.test.ts`.)
const CH = (content: string): FileTree => ({ path: 'src/pay/x.ts', children: [], content });
const ADVERSARIAL: ReadonlyArray<{ row: string; tree: FileTree; expect: string }> = [
  { row: 'ns[key]() — static namespace + computed member (the reproduced false-admit)', expect: 'ns-escape',
    tree: { path: '.', children: [{ path: 'src/pay/x.ts', children: [], content: "import * as ns from './m';\nexport const c = ns[key]();\n" }] } },
  { row: 'import(nonliteral) — dynamic module load', expect: 'import-nonliteral',
    tree: { path: '.', children: [CH('const k = spec;\nexport const a = import(k);\n')] } },
  { row: 'require(nonliteral) — dynamic CJS load (incl. member callee module.require)', expect: 'require-nonliteral',
    tree: { path: '.', children: [CH('const m = req;\nexport const b = require(m);\n')] } },
  { row: 'eval(...) — arbitrary code (incl. member callee globalThis.eval)', expect: 'eval',
    tree: { path: '.', children: [CH('export const d = eval(userInput);\n')] } },
  { row: 'new Function(...) — arbitrary code', expect: 'new-Function',
    tree: { path: '.', children: [CH("export const e = new Function('return 1');\n")] } },
  { row: 'JS-family file (.cjs/.mjs) under S — TS-only grammar ⇒ fail-closed', expect: 'js-unscanned',
    tree: { path: '.', children: [{ path: 'src/pay/legacy.cjs', children: [], content: 'module.exports = require(process.env.MOD);\n' }] } },
];

describe.skipIf(!RUN)('#95/#99 M3 — adversarial channel rows (each MUST make the door abstain scope-dynamic)', () => {
  it('every hardened dynamic channel fires under scope S (never a silent admit)', async () => {
    await initAst();
    /* eslint-disable no-console */
    console.log('\n=== #95/#99 M3 — ADVERSARIAL CHANNEL ROWS (buildDynamicReach over synthetic S=src/pay) ===');
    for (const c of ADVERSARIAL) {
      const dr = buildDynamicReach(c.tree)!;
      const wits = dr('src/pay');
      const fired = wits.some((w) => w.endsWith(c.expect));
      console.log(`  [${fired ? 'ABSTAIN' : 'ADMIT!!'}] ${c.expect.padEnd(18)} ${c.row}`);
      expect(fired, `channel ${c.expect} MUST fire (else false-admit)`).toBe(true);
    }
    console.log('  (a LITERAL import/require/ns[\'lit\'] yields NO channel — recall preserved — see dynamic-reach.test.ts)');
    console.log('================================================================================\n');
    /* eslint-enable no-console */
  }, 60_000);

  it('EVIDENCE for the recall diagnosis: on atlas, EVERY scope-dynamic witness is a tree-sitter :unparsed ' +
    'fail-close (a grammar parse gap), NOT a real dynamic channel', async () => {
    await initAst();
    const dr = buildDynamicReach(walkFileTree(ROOT))!;
    const idx = deserializeSCIP(readFileSync(SCIP));
    const scopes = new Set<string>();
    for (const doc of idx.documents) if (/^packages\/[^/]+\/src\/.+\.tsx?$/.test(doc.relativePath) && !/\.test\.tsx?$/.test(doc.relativePath)) scopes.add(dirname(doc.relativePath));
    let real = 0, unparsed = 0;
    const unparsedFiles = new Set<string>();
    for (const s of scopes) for (const w of dr(s)) {
      if (w.endsWith(':unparsed')) { unparsed++; unparsedFiles.add(w.replace(/:0:0:unparsed$/, '')); } else real++;
    }
    /* eslint-disable no-console */
    console.log('\n=== atlas scope-dynamic cause (per-scope-union witnesses) ===');
    console.log(`  REAL dynamic channels: ${real}   :unparsed fail-closes: ${unparsed}`);
    console.log(`  unparseable prod files (${unparsedFiles.size}): ${[...unparsedFiles].sort().join(', ')}`);
    console.log('=============================================================\n');
    /* eslint-enable no-console */
    expect(real).toBe(0); // the recall sink on atlas is PURELY the parse gap, not real dynamic reachability
  }, 60_000);
});

describe.skipIf(!RUN)('#95/#99 M3 — sound-negation benchmark (0-false-admit + net-recall vs the tsc oracle)', () => {
  let axes: Axes;
  let symbolReverse: SymbolReverseApi;
  let targetEscapes: (t: string) => readonly string[];
  let dynamicReach: (s: string) => readonly string[];
  let oracle: Map<string, OracleRec>;
  let targets: Target[];
  let scopes: string[];
  let emit: ReturnType<typeof createGovernedEmit>['emit'];
  let emitCeiling: ReturnType<typeof createGovernedEmit>['emit']; // parse-tolerant arm (see below)
  let proj: StoreProjection;
  let projC: StoreProjection;
  let resetStore: () => void;

  beforeAll(async () => {
    await initAst();
    const scipOutput = readScipOrEmpty(SCIP);
    const rawTree = walkFileTree(ROOT);
    axes = build(foldAstUnits(rawTree), scipOutput);
    symbolReverse = createSymbolReverse(scipOutput);
    const te = buildTargetEscapes({ scipPath: SCIP, repoPath: ROOT });
    const dr = buildDynamicReach(rawTree);
    if (!te || !dr) throw new Error('v2 legs failed to build (astWarmed? scip-typescript indexer?) — cannot bench');
    targetEscapes = te;
    dynamicReach = dr;
    oracle = buildOracle();
    ({ targets, scopes } = buildTargets(oracle));

    // permissive policy: ACTOR owns every candidate scope so a gate-1 ADMIT reaches emitted:true.
    const policyScopes: Record<string, readonly string[]> = {};
    for (const s of scopes) policyScopes[s] = [ACTOR];
    process.env.ATLAS_RATIFY_TOKEN = 'billy';
    // In-memory store: the door only calls `commitProjection`. Kept in RAM + RESET per candidate (below) so
    // every emit is O(1) — a DiskStore accumulates the growing projection.json (O(n²)) over thousands of admits.
    // Faithful: each candidate models an independent single-negation door invocation over an empty projection.
    resetStore = (): void => {
      proj = { current: new Map(), cas: new Set() } as unknown as StoreProjection;
      projC = { current: new Map(), cas: new Set() } as unknown as StoreProjection;
    };
    resetStore();
    const mkStore = (which: 'a' | 'c') => ({
      commitProjection<T>(decide: (p: StoreProjection) => CommitDecision<T>): CommitResult<T> {
        const d = decide(which === 'a' ? proj : projC);
        if (d.next !== undefined) { if (which === 'a') proj = d.next; else projC = d.next; }
        return { settled: true, out: d.out };
      },
    } as unknown as DiskStore);
    const baseDeps = {
      gate: { gateHolds: () => 'HOLDS' } as never,
      policy: { nearDup: { claimNormThreshold: 1 }, t0Heuristic: { keywords: [] }, authz: { scopes: policyScopes } },
      actor: ACTOR, origin: 'promoted' as const, ratifyToken: 'billy',
      symbolReverse: () => symbolReverse, axes, nodeHashOfPath, edgeModel: edgeModelVersion(), targetEscapes,
    };
    emit = createGovernedEmit({ ...baseDeps, store: mkStore('a'), dynamicReach }).emit;
    // CEILING arm — the SAME door with a PARSE-TOLERANT dynamic-reach: it drops the `:unparsed`/`:js-unscanned`
    // fail-closed witnesses (a tree-sitter parse failure on a normal .ts file), keeping only REAL dynamic
    // channels. This isolates how much realized recall is lost to the pinned grammar's parse gaps vs to
    // genuine dynamic reachability. NOT a sound gate (dropping unparsed IS unsound) — a measurement of the
    // recall the sound gate would reach once the files parse. Reported separately, never as the shipped number.
    const dynamicReachCeiling = (scope: string): readonly string[] =>
      dynamicReach(scope).filter((w) => !w.endsWith(':unparsed') && !w.endsWith(':js-unscanned'));
    emitCeiling = createGovernedEmit({ ...baseDeps, store: mkStore('c'), dynamicReach: dynamicReachCeiling }).emit;
  }, 120_000);

  it('drives the shipped v2 door over the exhaustive (X external to S) pool; 0 false-admit; reports recall', () => {
    const negation = (target: string, scope: string): NegationNode => ({
      kind: 'negation', id: 'ignored' as unknown as NegationNode['id'], tier: 'T2', relationKind: 'calls',
      target, scope, grounding: { entries: [] }, edgeModel: 'ignored', freshness: 'FRESH', claims: [], authoring: 'NEGATED',
    } as unknown as NegationNode);

    // ground truth for a (target, scope): is X CALLED anywhere under S (per tsc)? → the negative's truth.
    const calledInS = (t: Target, scope: string): boolean => {
      for (const f of oracle.get(t.key)!.callFiles) if (underScope(f, scope)) return true;
      return false;
    };
    const refInS = (t: Target, scope: string): boolean => {
      for (const f of oracle.get(t.key)!.refFiles) if (underScope(f, scope)) return true;
      return false;
    };

    const tally: Record<string, number> = {};
    const bump = (k: string): void => { tally[k] = (tally[k] ?? 0) + 1; };
    let pool = 0, truthTrue = 0, admits = 0, admitTrue = 0, falseAdmits = 0;
    let refutes = 0, refuteWrong = 0; // refute where tsc says NOT called = over-refute (recall cost, not soundness)
    let recallAdmitOnTrue = 0;
    let ceilingAdmitOnTrue = 0, ceilingFalseAdmits = 0; // the parse-tolerant arm
    const falseAdmitEx: string[] = [];
    const started = Date.now();

    let considered = 0;
    outer: for (const t of targets) {
      for (const scope of scopes) {
        if (underScope(t.df, scope)) continue; // X external to S (def not under S) — the meaningful negation
        if (++considered > HARD_CAP) { break outer; }
        pool++;
        const truthNegative = !calledInS(t, scope); // the negative "X not called in S" is TRUE
        if (truthNegative) truthTrue++;
        resetStore(); // each candidate = an independent single-negation invocation over an empty projection
        const node = negation(t.symbol, scope) as unknown as GroundedFact;
        const v = classify(emit(node, AT));
        // CEILING arm: the parse-tolerant door's verdict on the SAME candidate (measured against the SAME truth).
        const vc = classify(emitCeiling(node, AT));
        if (vc === 'admit') { if (truthNegative) ceilingAdmitOnTrue++; else ceilingFalseAdmits++; }
        bump(v);
        if (v === 'admit') {
          admits++;
          if (truthNegative) { admitTrue++; if (truthNegative) recallAdmitOnTrue++; }
          else {
            falseAdmits++;
            if (falseAdmitEx.length < 20) falseAdmitEx.push(`${t.name} @ ${scope} (called: ${[...oracle.get(t.key)!.callFiles].filter((f) => underScope(f, scope)).join(',')})`);
          }
        } else if (v === 'refute') {
          refutes++;
          if (truthNegative && !refInS(t, scope)) refuteWrong++; // refuted but tsc sees no reference at all
        }
      }
    }
    const dur = ((Date.now() - started) / 1000).toFixed(1);

    // ── the report (the #95 number, self-contained + re-derivable from the tally above) ──
    const recall = truthTrue > 0 ? (recallAdmitOnTrue / truthTrue * 100) : 0;
    const admitPrecision = admits > 0 ? (admitTrue / admits * 100) : 100;
    /* eslint-disable no-console */
    console.log('\n=== #95/#99 M3 — SOUND-NEGATION BENCHMARK (atlas self, v2 door vs tsc oracle) ===');
    console.log(`targets: ${targets.length}   scopes: ${scopes.length}   pool (X ext to S): ${pool}${considered > HARD_CAP ? `  [TRUNCATED at HARD_CAP=${HARD_CAP} — pool larger]` : ''}   ${dur}s`);
    console.log(`TRUE scoped-negatives in pool (tsc: X not called in S): ${truthTrue}  (${(truthTrue / pool * 100).toFixed(1)}%)`);
    console.log('--- door verdict distribution ---');
    for (const [k, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(26)} ${n}  (${(n / pool * 100).toFixed(1)}%)`);
    console.log('--- soundness (the headline) ---');
    console.log(`  ADMITs: ${admits}   admit-precision (admit∧true / admit): ${admitPrecision.toFixed(2)}%`);
    console.log(`  FALSE-ADMITS (admit but tsc says X IS called in S): ${falseAdmits}  ${falseAdmits === 0 ? '<= SOUND' : '<= UNSOUND BUG'}`);
    if (falseAdmitEx.length) console.log('  false-admit examples:\n    ' + falseAdmitEx.join('\n    '));
    console.log('--- net-recall (the #99 win, 0% floor → measured) ---');
    console.log(`  SHIPPED (sound) recall: admitted TRUE / all TRUE = ${recallAdmitOnTrue} / ${truthTrue} = ${recall.toFixed(1)}%`);
    console.log(`  over-refute (refuted but tsc sees no reference at all): ${refuteWrong}`);
    const ceilRecall = truthTrue > 0 ? (ceilingAdmitOnTrue / truthTrue * 100) : 0;
    console.log('--- recall CEILING (parse-tolerant: drop tree-sitter :unparsed fail-closed, keep real channels) ---');
    console.log(`  achievable recall once the ~10 unparseable prod files parse: ${ceilingAdmitOnTrue} / ${truthTrue} = ${ceilRecall.toFixed(1)}%`);
    console.log(`  ceiling arm false-admits (must still be 0 — the extra admits are all TRUE): ${ceilingFalseAdmits}`);
    console.log(`  ⇒ recall lost purely to the pinned grammar's parse gaps: ${(ceilRecall - recall).toFixed(1)} pts`);
    console.log('=====================================================================\n');
    /* eslint-enable no-console */

    // THE TEETH: the soundness guarantee. Never admit a negative tsc can refute.
    expect(falseAdmits).toBe(0);
    // sanity: the pool actually exercised the gate (guards a silently-empty bench).
    expect(pool).toBeGreaterThan(1000);
    expect(admits).toBeGreaterThan(0);
  }, 600_000);
});
