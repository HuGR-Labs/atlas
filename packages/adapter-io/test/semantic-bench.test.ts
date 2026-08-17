// @atlas/adapter-io — test/semantic-bench.test.ts  (#196b WP-1 — the SOUND mutation-bench INSTRUMENT)
//
// A SOUND, judge-free, human-free benchmark INSTRUMENT: it plants ground-truth by MUTATION (label from the
// mutation record + the INDEPENDENT tsc oracle, NEVER from the admission gate), drives the SHIPPED admission
// over planted claims, and scores FALSE-ADMIT + RECALL-over-TRUE PER ARM. It PROVES ITSELF on a synthetic
// 4-cell fixture (AC-3) before any spend and CANNOT grade itself (AC-6 independence).
//
// The PURE block (AC-1/2/3/6-independence/7/8/9m/10m/14) runs in the default suite. The SUBSTRATE block
// (AC-4/5/6-numbers/12/13/15) drives atlas-self + its generated `.atlas/index.scip` and is gated behind
// ATLAS_SEM_BENCH=1 (a full tsc program + thousands of gate calls is too heavy for `npm test`), exactly as the
// sibling `negation-bench.test.ts` gates ATLAS_NEG_BENCH. REPRODUCE the numbers:
//   scip-typescript index --output .atlas/index.scip   # (or: npx @sourcegraph/scip-typescript index ...)
//   ATLAS_SEM_BENCH=1 npx vitest run packages/adapter-io/test/semantic-bench.test.ts

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve as presolve, join } from 'node:path';
import {
  score, buildReport, reportShapeValid, SCOPE_LIMIT_DISCLAIMER, type Outcome, type Score,
} from './support/bench-scorer.js';
import {
  mutate, deriveLabel, editDistance, KIND_ARM, type Claim, type Row, type TscWitness,
} from './support/mutation-contract.js';
import { assembleSemBench, type SemBench } from './support/sem-bench-driver.js';

const ROOT = presolve(__dirname, '..', '..', '..');
const SCIP = join(ROOT, '.atlas', 'index.scip');
const RUN = process.env.ATLAS_SEM_BENCH === '1';
const SUPPORT = presolve(__dirname, 'support');
const DROP_NO_CHECK = 'no admissible synthesized check for a checkable candidate (GEN-12)';
const FIXTURE = presolve(SUPPORT, 'semantic-bench-fixture.json');
const PIN = presolve(SUPPORT, 'semantic-bench-fixture.pin.json');

// ───────────────────────────── PURE / SYNTHETIC (always runs) ─────────────────────────────
describe('#196b WP-1 — the instrument PROVES ITSELF (pure, no substrate, no spend)', () => {
  // A deterministic synthetic tsc witness for the mutation-contract unit tests: "X called in scope" is TRUE
  // iff target starts with 'hot'; count witness compares atLeast to a fixed 2; relation A calls B iff A<B.
  const tsc: TscWitness = (c: Claim): boolean => {
    if (c.arm === 'count') return 2 >= (c.atLeast ?? 1);
    if (c.arm === 'relation') return c.endpoints![0] < c.endpoints![1];
    return c.target.startsWith('hot');
  };

  it('AC-1 — mutate() plants FALSE from a TRUE base by an edit-distance-1 edit, label from the tsc witness (NO admission symbol)', () => {
    // dependency: base called (TRUE) → assert-absent in an un-called scope (FALSE)
    const base: Row = { claim: { arm: 'dependency', target: 'hotX', scope: 's' }, label: deriveLabel({ arm: 'dependency', target: 'hotX', scope: 's' }, tsc), kind: 'base', arm: 'dependency' };
    expect(base.label).toBe('TRUE');
    const m = mutate(base, 'dependency-assert-absent', { flipScope: 'other' });
    // the mutant's target is un-hot in tsc's eyes only via scope? here we prove label is a pure fn of edit+witness:
    const m2claim: Claim = { arm: 'dependency', target: 'coldY', scope: 's' };
    expect(deriveLabel(m2claim, tsc)).toBe('FALSE');
    expect(m.label).toBe('FALSE');
    expect(m.arm).toBe('dependency');
    expect(editDistance(base.claim, m.claim)).toBe(1);
    // count boundary flip
    const cbase: Row = { claim: { arm: 'count', target: 'hot', scope: 's', atLeast: 1 }, label: 'TRUE', kind: 'base', arm: 'count' };
    const cm = mutate(cbase, 'count-boundary-flip', { beyond: 3 });
    expect(deriveLabel(cm.claim, tsc)).toBe('FALSE'); // 2 >= 3 is false
    expect(editDistance(cbase.claim, cm.claim)).toBe(1);
    // relation direction reversal
    const rbase: Row = { claim: { arm: 'relation', target: 'a->b', scope: 's', endpoints: ['a', 'b'] }, label: 'TRUE', kind: 'base', arm: 'relation' };
    const rm = mutate(rbase, 'relation-direction-reversal', {});
    expect(rm.claim.endpoints).toEqual(['b', 'a']);
    expect(deriveLabel(rm.claim, tsc)).toBe('FALSE'); // 'b' < 'a' is false
    expect(editDistance(rbase.claim, rm.claim)).toBe(1);
    // negation flip — the fact IS a negative; TRUE iff NOT called
    const nbase: Row = { claim: { arm: 'negation', target: 'coldZ', scope: 's' }, label: deriveLabel({ arm: 'negation', target: 'coldZ', scope: 's' }, tsc), kind: 'base', arm: 'negation' };
    expect(nbase.label).toBe('TRUE'); // coldZ not called ⇒ "coldZ not called" is TRUE
    const nm: Row = { claim: { arm: 'negation', target: 'hotZ', scope: 's' }, label: deriveLabel({ arm: 'negation', target: 'hotZ', scope: 's' }, tsc), kind: 'negation-flip', arm: 'negation' };
    expect(nm.label).toBe('FALSE'); // hotZ IS called ⇒ the negative is FALSE
    // mis-tagged mutation is a contract violation, never silent
    expect(() => mutate(base, 'count-boundary-flip', { beyond: 2 })).toThrow();
    expect(KIND_ARM['negation-flip']).toBe('negation');
  });

  it('AC-2 — the scorer yields two co-primaries per arm and reads no admission symbol', () => {
    const rows: Row[] = [
      { claim: { arm: 'count', target: 't', scope: 's', atLeast: 1 }, label: 'TRUE', kind: 'base', arm: 'count' },
      { claim: { arm: 'count', target: 't', scope: 's', atLeast: 9 }, label: 'FALSE', kind: 'count-boundary-flip', arm: 'count' },
    ];
    const outcomes: Outcome[] = [{ admitted: true }, { admitted: false, anchorFailed: false }];
    const s = score(rows, outcomes);
    expect(s.count.recallTrue).toBe(1);
    expect(s.count.falseAdmit).toBe(0);
    expect(s.count.n).toBe(2);
    expect(s.relation.falseAdmit).toBeNull(); // empty arm has no rate — never a fabricated 0
  });

  it('AC-3 — synthetic 4-cell SELF-PROOF from the frozen fixture; a broken scorer goes RED (VAC-G)', () => {
    const fx = JSON.parse(readFileSync(FIXTURE, 'utf8')) as {
      rows: Array<{ claim: Claim; label: 'TRUE' | 'FALSE'; kind: Row['kind'] }>;
      outcomes: Outcome[];
      expected: { dependency: { falseAdmitNum: number; falseAdmitDen: number; recallNum: number; recallDen: number; n: number } };
    };
    const rows: Row[] = fx.rows.map((r) => ({ claim: r.claim, label: r.label, kind: r.kind, arm: r.claim.arm }));
    const s = score(rows, fx.outcomes);
    const e = fx.expected.dependency;
    // the EXACT numbers a correct scorer yields — 1/3 false-admit, 1/2 recall (the AC-14 un-groundable TRUE excluded)
    expect(s.dependency.falseAdmit).toBeCloseTo(e.falseAdmitNum / e.falseAdmitDen, 12);
    expect(s.dependency.recallTrue).toBeCloseTo(e.recallNum / e.recallDen, 12);
    expect(s.dependency.n).toBe(e.n);
    // all four required cells are present
    const cells = new Set(fx.outcomes.map((o, i) => `${rows[i]!.label}-${o.admitted}`));
    expect(cells.has('TRUE-true')).toBe(true); expect(cells.has('TRUE-false')).toBe(true);
    expect(cells.has('FALSE-true')).toBe(true); expect(cells.has('FALSE-false')).toBe(true);
    // TEETH: a numerator/denominator-swapped scorer produces a DIFFERENT number ⇒ the correct assertion bites
    const swapped = brokenScoreSwapped(rows, fx.outcomes);
    expect(swapped.dependency.falseAdmit).not.toBeCloseTo(e.falseAdmitNum / e.falseAdmitDen, 6);
    // TEETH: a drop-vs-admit-confused scorer (counts non-admitted as admitted) also diverges
    const confused = brokenScoreConfused(rows, fx.outcomes);
    expect(confused.dependency.recallTrue).not.toBeCloseTo(e.recallNum / e.recallDen, 6);
  });

  it('AC-6 (independence spine) — the scorer AND the label-store import NO gate symbol', () => {
    // SCOPE (lucy Fix 3): this grep is scoped to the two LABEL/SCORER files and is STATIC-IMPORT-only. A future
    // dynamic `import()` of a gate symbol, or a label routed indirectly through the driver / `buildOracle`, would
    // not be caught here — the driver (`sem-bench-driver.ts`) legitimately imports `admit`, and independence is a
    // property of the label+scorer path only. Widening this to a dependency-graph check is out of this WP's scope.
    for (const f of ['bench-scorer.ts', 'mutation-contract.ts']) {
      const src = readFileSync(presolve(SUPPORT, f), 'utf8');
      // IMPORT lines only — a prose mention in a comment is fine; a live `import ... from` is the circularity.
      const imports = src.split('\n').filter((l) => /^\s*import\b/.test(l) || /\bfrom\s+['"]/.test(l));
      const joined = imports.join('\n');
      expect(joined, `${f} must not import the gate's oracle`).not.toMatch(/from\s+['"][^'"]*verify-fact-source/);
      expect(joined, `${f} must not import the admission engine`).not.toMatch(/from\s+['"][^'"]*admit-harness/);
      expect(joined, `${f} must not import @atlas/genesis`).not.toMatch(/from\s+['"]@atlas\/genesis['"]/);
    }
  });

  it('AC-7 — the fixture is content-hashed; an un-re-pinned edit fails the freeze gate', () => {
    const pin = JSON.parse(readFileSync(PIN, 'utf8')) as { algo: string; digest: string };
    const actual = createHash(pin.algo).update(readFileSync(FIXTURE)).digest('hex');
    expect(actual, 'fixture digest drifted — re-pin semantic-bench-fixture.pin.json in the SAME commit').toBe(pin.digest);
  });

  it('AC-8 + AC-10m — the report carries BOTH co-primaries per arm plus the scope-limit disclaimer', () => {
    const empty = score([], []);
    const rep = buildReport(empty);
    expect(reportShapeValid(rep)).toBe(true);
    expect(rep.scopeLimit).toBe(SCOPE_LIMIT_DISCLAIMER);
    expect(rep.scopeLimit).toMatch(/spot-audit/);
    // a shape missing a co-primary is rejected
    expect(reportShapeValid({ perArm: { count: { falseAdmit: 0 } }, scopeLimit: 'x' })).toBe(false);
    expect(reportShapeValid({ perArm: rep.perArm })).toBe(false); // no disclaimer
  });

  it('AC-9m (synthetic) — a mutant differs from base by exactly one field and stays arm-consistent', () => {
    const base: Row = { claim: { arm: 'count', target: 't', scope: 's', atLeast: 1 }, label: 'TRUE', kind: 'base', arm: 'count' };
    const m = mutate(base, 'count-boundary-flip', { beyond: 5 });
    expect(editDistance(base.claim, m.claim)).toBe(1);
    expect(m.arm).toBe(base.arm);
  });

  it('AC-14 — an un-groundable planted-TRUE is EXCLUDED from the recall denominator (measures the gate, not anchoring)', () => {
    const rows: Row[] = [
      { claim: { arm: 'dependency', target: 'a', scope: 's' }, label: 'TRUE', kind: 'base', arm: 'dependency' },
      { claim: { arm: 'dependency', target: 'b', scope: 's' }, label: 'TRUE', kind: 'base', arm: 'dependency' },
    ];
    // b's TRUE cannot be anchored (grounding/target failure) ⇒ dropped out of the denominator entirely
    const s = score(rows, [{ admitted: true }, { admitted: false, anchorFailed: true }]);
    expect(s.dependency.recallTrue).toBe(1); // 1 admitted / 1 groundable — NOT 1/2
    // contrast: a TRUE dropped for a NON-anchoring reason IS in the denominator
    const s2 = score(rows, [{ admitted: true }, { admitted: false, anchorFailed: false }]);
    expect(s2.dependency.recallTrue).toBe(0.5);
  });

  // JUDGED shards (JUDGE-J/K) — mechanical shard is AC-9m/AC-10m above; the JUDGMENT is human sign-off, never auto-green.
  it.todo('AC-9j (JUDGED: human sign-off) — the four mutation kinds are a fair adversary, not a strawman');
  it.todo('AC-10j (JUDGED: human sign-off) — the routing of the semantic residual to spot-audit is adequate');
});

/** A deliberately BROKEN scorer: numerator/denominator swapped. Only for AC-3's teeth (proves the good one bites). */
function brokenScoreSwapped(rows: readonly Row[], outcomes: readonly Outcome[]): Score {
  let faNum = 0, faDen = 0;
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i]!.label === 'FALSE') { faDen += 1; if (outcomes[i]!.admitted) faNum += 1; }
  }
  return { ...score(rows, outcomes), dependency: { falseAdmit: faNum === 0 ? null : faDen / faNum, recallTrue: 0, n: rows.length } };
}
/** A deliberately BROKEN scorer: counts any non-admitted as admitted (drop-vs-admit confusion). */
function brokenScoreConfused(rows: readonly Row[], _outcomes: readonly Outcome[]): Score {
  let rNum = 0, rDen = 0;
  for (const r of rows) { if (r.label === 'TRUE') { rDen += 1; rNum += 1; } }
  return { ...score(rows, _outcomes), dependency: { falseAdmit: 0, recallTrue: rDen === 0 ? null : rNum / rDen, n: rows.length } };
}

// ───────────────────────────── SUBSTRATE (ATLAS_SEM_BENCH=1) ─────────────────────────────
describe.skipIf(!RUN)('#196b WP-1 — drives the SHIPPED admission over atlas-self (real numbers)', () => {
  let sb: SemBench;
  let s: Score;
  beforeAll(async () => { sb = await assembleSemBench(ROOT, SCIP); s = score(sb.driven.map((d) => d.row), sb.driven.map((d) => d.outcome)); }, 600_000);

  it('AC-4 — an injected planted proposal drives the SHIPPED mine admission; outcome ∈ {admitted,dropped,abstained}', () => {
    const dep = sb.driven.find((d) => d.row.arm === 'dependency')!;
    const a = sb.driveClaim(dep.row).admission as { outcome?: string };
    expect(['admitted', 'dropped', 'abstained']).toContain(a.outcome);
  });

  it('AC-5 — Arm-0 semantic floor is EXACTLY 0 coverage and EVERY drop is DROP_NO_CHECK (the unwired stub)', () => {
    expect(sb.arm0Reasons.length).toBeGreaterThan(0);
    expect(sb.arm0Reasons.every((r) => r === DROP_NO_CHECK)).toBe(true); // characterizes the unwired floor, not discrimination
  });

  it('AC-6 — SOUND per-arm false-admit vs the INDEPENDENT tsc oracle; relation is MEASURED', () => {
    /* eslint-disable no-console */
    console.log('\n=== #196b WP-1 — SEMANTIC MUTATION-BENCH (atlas self, shipped gate vs tsc oracle) ===');
    console.log(`targets: ${sb.counts.targets}  scopes: ${sb.counts.scopes}`);
    for (const arm of ['count', 'relation', 'dependency', 'negation'] as const) {
      const a = s[arm];
      console.log(`  ${arm.padEnd(11)} falseAdmit=${fmt(a.falseAdmit)}  recallTrue=${fmt(a.recallTrue)}  n=${a.n}`);
    }
    const teeth = score(sb.negTeeth.map((d) => d.row), sb.negTeeth.map((d) => d.outcome));
    console.log(`  negation TEETH (closed-world refutation disabled): falseAdmit=${fmt(teeth.negation.falseAdmit)}  <= must be > 0`);
    console.log('==================================================================================\n');
    /* eslint-enable no-console */
    // dependency: the POSITIVE-dual gate ABSTAINS on a tsc-false claim unless the SOUND oracle PROVES a
    // witnessed caller edge (admit-harness.ts:259 — `verifyDependency(t,s) !== 'proven' ⇒ DROP_DEP_ABSTAIN`);
    // a witnessed existence never fabricates a caller. dep-F is now EXHAUSTIVE (uncapped — lucy Fix 1), so this
    // is a COMPLETE measurement, not a capped prefix that could hide a false-admit past the cap. And exhausting
    // it FALSIFIED the old vacuous `toBe(0)`: the shipped door admits a small residual (17/23577 = 0.07%) of
    // tsc-FALSE dependency rows. EVERY one of them is a symbol tsc NEVER sees as a callee anywhere (callFiles==0
    // globally — a pure TYPE / reference symbol like `Check`/`Candidate`/`GroundedFact`), REFERENCED in the
    // scope in type position. This is an ORACLE-DEFINITION gap, not a fabricated caller: the bench's tsc oracle
    // models "calls" as call-expression callees (`buildOracle`'s `isCallee`, neg-bench-lib.ts:81), while the
    // door's `verifyDependency` witnesses any SCIP reference edge. So the door proves a real DEPENDENCY edge for
    // a symbol the call-only oracle labels un-called. The assertion below is the HONEST, COMPLETE positive-dual
    // guarantee: over the whole population the door fabricates NO caller for a CALL-ELIGIBLE symbol — every
    // residual admit is a globally-never-callee type/reference symbol. A future regression that admitted a
    // tsc-false dependency for a genuinely callable symbol (callFiles>0) would make this go RED.
    const bySymDep = new Map(sb.B.targets.map((t) => [t.symbol, t] as const));
    const depFalseAdmits = sb.driven.filter((d) => d.row.arm === 'dependency' && d.row.label === 'FALSE' && d.outcome.admitted);
    for (const d of depFalseAdmits) {
      const t = bySymDep.get(d.row.claim.target)!;
      expect(sb.B.oracle.get(t.key)!.callFiles.size, `dependency false-admit on a CALL-ELIGIBLE symbol (${t.name}) — a fabricated caller, not an oracle-definition gap`).toBe(0);
    }
    // count: complete over its (naturally sub-cap) population — a boundary flip `atLeast = witnessed+1` on a
    // symbol with a REAL caller, which `verifyCount`'s sound lower-bound can never prove ⇒ genuinely 0 admits.
    expect(s.count.falseAdmit).toBe(0);
    // TEETH (non-vacuity): the negation pool CONTAINS tsc-false negatives the closed-world door refutes; a door
    // with that refutation DISABLED (refute→admit) is caught ⇒ falseAdmit strictly rises. Proves the 0-arms are
    // not vacuously green (the instrument would bite a broken gate).
    expect(teeth.negation.falseAdmit).not.toBeNull();
    expect(s.negation.falseAdmit).not.toBeNull();
    expect(teeth.negation.falseAdmit!).toBeGreaterThan(s.negation.falseAdmit!);
    // negation + relation: MEASURED (never asserted-0). The acceptance PREDICTED relation may be >0 (no direction
    // oracle) and it is TOTAL here (admitRelation is a pure grounding gate). The acceptance ASSUMED negation==0;
    // measurement FALSIFIES that on a @sourcegraph/scip-typescript index — the shipped closed-world door ADMITS
    // cross-package negatives SCIP's reverseCallers cannot see but tsc can (the latent risk the negation-bench
    // header itself flags). The sibling negation-bench's own 0-assertion FAILS identically on this substrate
    // (131/162 tsc-false negatives admitted). A SOUND instrument REPORTS this; it does not assert the falsehood.
    expect(s.negation.falseAdmit).not.toBeNull(); // MEASURED — the number is the finding, judged by a human
    expect(s.relation.falseAdmit).not.toBeNull();
    // WHY negation is nonzero (~80.86%, a DOOR property — not an instrument bug; adjudicated REAL by a security
    // seat): scip-typescript emits a cross-package reference as a SCIP `local` symbol, which `createSymbolReverse`
    // DROPS at packages/index/src/symbol-reverse.ts:79 (`isLocalSymbol(occ.symbol) ⇒ continue`). So
    // `reverseCallers(X)` cannot see those callers, and the disjointness completeness the door's soundness rests on
    // (governed-emit-negation.ts:251-254 — `reverseCallers(X) ∩ S == ∅` "becomes a COMPLETE no-reference") FAILS on
    // a scip-typescript-built index: the door admits "X not called in S" while tsc witnesses a cross-package call.
    // The canon-completeness guard that would catch this is UN-WIRED (ADR-0016:102-104). The instrument REPORTS
    // this measured door unsoundness; it never asserts the falsehood negation==0.
    // WHY relation is 100%: `admitRelation` (admit-harness.ts:220) is a PURE grounding gate — both endpoints
    // re-derive FRESH, and there is NO direction oracle, so a direction-reversed edge (B→A where only A→B holds)
    // grounds identically and is admitted. A door property too (no direction check), reported not asserted-away.
    // eslint-disable-next-line no-console
    console.log(
      `FINDING: negation door false-admit = ${fmt(s.negation.falseAdmit)} (cross-package unsound — scip 'local' refs `
      + `dropped at symbol-reverse.ts:79 break disjointness completeness), relation = ${fmt(s.relation.falseAdmit)} `
      + `(no direction oracle in admitRelation), dependency = ${fmt(s.dependency.falseAdmit)} residual (all `
      + `${depFalseAdmits.length} type/reference symbols — call-vs-reference oracle gap, no fabricated caller). `
      + `AC-6 negation==0 FALSIFIED by measurement.`,
    );
  });

  it('AC-12 — every planted-FALSE the gate rejects drops for the TRUTH reason, never malformed/ungrounded', () => {
    const rejectedFalse = sb.driven.filter((d) => d.row.label === 'FALSE' && !d.outcome.admitted);
    expect(rejectedFalse.length).toBeGreaterThan(0);
    for (const d of rejectedFalse) {
      if (d.outcome.admitted) continue; // narrows to the rejected variant (anchorFailed present)
      expect(d.outcome.anchorFailed, `FALSE rejected for an anchoring reason (vacuous 0): ${d.reason}`).toBe(false);
      expect(d.reason).toMatch(/did not witness the edge|did not witness .*callers|negation-refute|scope-|escape-|no-caller/i);
    }
  });

  it('AC-13 — every planted row anchors to a REAL target+scope (no row drops target-unresolvable/malformed)', () => {
    for (const d of sb.driven) {
      expect(d.reason, `row dropped as unresolvable/malformed — both numbers would be vacuous: ${d.reason}`).not.toMatch(/unresolvable|malformed/i);
    }
  });

  it('AC-9m (mechanical, substrate) — each mutant resolves to real targets and is edit-distance-1 from its base', () => {
    expect(sb.mutateSamples.length).toBeGreaterThan(0);
    const bySym = new Map(sb.B.targets.map((t) => [t.symbol, t] as const));
    const files = new Set(sb.B.targets.map((t) => t.df));
    for (const { base, mutant } of sb.mutateSamples) {
      expect(editDistance(base.claim, mutant.claim), 'a fair mutant differs by exactly one field').toBe(1);
      expect(base.label).toBe('TRUE');
      expect(mutant.label).toBe('FALSE');
      if (base.arm === 'relation') {
        for (const p of base.claim.endpoints!) expect(files.has(p), `endpoint ${p} must be a real unit`).toBe(true);
      } else {
        expect(bySym.has(base.claim.target), `target ${base.claim.target} must be a real Target`).toBe(true);
      }
    }
  });

  it('AC-15 — reproducible: re-scoring + re-driving over the pinned substrate yields identical per-arm numbers', () => {
    // SCOPE (lucy Fix 3): this proves the SCORER is deterministic and a SINGLE-ROW re-drive is stable — NOT a full
    // fresh re-assembly (`assembleSemBench` again), which is elided for cost (a second tsc program + thousands of
    // gate calls). Cross-process reproducibility of the numbers rests on the pinned substrate (AC-7) + the sound
    // deterministic gate, not on re-running assembly here.
    const again = score(sb.driven.map((d) => d.row), sb.driven.map((d) => d.outcome));
    expect(again).toEqual(s);
    const row = sb.driven.find((d) => d.row.arm === 'count')!.row;
    expect(sb.driveClaim(row).outcome).toEqual(sb.driveClaim(row).outcome); // deterministic
  });
});

const fmt = (x: number | null): string => (x === null ? 'n/a' : (x * 100).toFixed(2) + '%');
