#!/usr/bin/env node
// harness/probes/a4-pool.mjs — the A4 (recall) POOLING driver: `docs/design/95a-recall-a4-methodology.md`
// §3, made runnable.
//
// Runs N miners over an identical, frozen corpus (Atlas + `baseline-lister.mjs` + `comment-extractor.mjs`),
// pools the union, SEMANTIC-dedups it (paraphrase is the norm — two miners phrasing the same fact must count
// once), TRUTH-adjudicates every pooled candidate by REUSING the existing `adjudicate/` instrument (its
// `callJudge`/`parseVerdict`/category vocabulary — never rebuilt here), discards the false candidates, and
// computes `recall@pool(system) = |true facts that system emitted| / |true facts in the pool|`, stratified
// by fact shape.
//
// THE CAVEAT TRAVELS WITH THE NUMBER, ALWAYS (design doc §3): pooled recall can only OVER-state absolute
// recall — a fact no miner in the pool found is invisible and silently excluded from the denominator. Every
// report this driver emits carries that sentence; nothing here or downstream may report it as bare "recall".
//
// ATLAS AS A POOL MEMBER. `atlas mine` writes only to STAGING (ADR-0008); this driver reads that sidecar,
// never `projection`, and never calls `atlas promote`. The Atlas CLI invocation is a plain subprocess shell-
// out (`--atlas-cmd`/`--atlas-args`) — this file does not depend on the parallel bench-driver WP and does not
// reimplement `atlas mine`'s own machinery. `--skip-atlas-run` lets a caller point this driver at a store a
// run already populated (or, for the deterministic pipeline proof below, a hand-built fixture store).
//
// Harness invariant (harness/README.md): no `@atlas/*` import. This reads the store from the OUTSIDE via
// `atlas-store-read.mjs`, the same posture `genesis-output-probe.mjs` takes.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { readSidecar } from './atlas-store-read.mjs';
import { callJudge } from './adjudicate/adjudicate.mjs';
import { CATEGORIES, majority } from './adjudicate/fleiss.mjs';
import { extractComments } from './comment-extractor.mjs';
import { listFacts } from './baseline-lister.mjs';

export const RECALL_CAVEAT =
  'recall@pool(N systems): recall RELATIVE to the union this pool found, never absolute. Adding more/diverse ' +
  'miners to the pool can only ever LOWER every system\'s score (never raise it), which is the honest ' +
  'direction. A fact no miner in the pool found is invisible and silently excluded from the denominator — ' +
  'report as "recall@pool(N)", never as bare "recall".';

// ── 1) ATLAS pool member — shell out, then read the store from the outside ─────────────────────────────

/** Shell out to `atlas mine` over `repo`. A plain subprocess call; this file does not read its stdout —
 *  the facts it produced are read back from the STAGING sidecar afterward, the same durable source every
 *  other reader of a mine run uses (`atlas-store-read.mjs`). */
export function runAtlasMine({ repo, cmd, args = [], timeoutMs = 300_000 }) {
  const r = spawnSync(cmd, args, { cwd: repo, timeout: timeoutMs, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status ?? null, err: String(r.error?.message ?? r.stderr ?? ''), stdout: r.stdout ?? '' };
}

/**
 * Read Atlas's candidate facts for `files` back off the STAGING sidecar. One candidate per `(nodeKey,
 * claim)` — `CurrentNode.claims` is itself a dedup'd claimNorm set (`projection-types.ts`), so no further
 * dedup happens here; `row.slot` (the product's typed `PredicateSlot`) is carried through UNCHANGED — this
 * is the one miner in the pool whose shape axis is the real product vocabulary, not the heuristic classifier
 * `comment-extractor.mjs`/`baseline-lister.mjs` fall back to.
 * @param {string} repo
 * @param {string[]} files  paths (relative to `repo`) the pool is restricted to.
 */
export function atlasFactsFor(repo, files) {
  const { entries } = readSidecar(repo, 'staging');
  const out = [];
  let n = 0;
  for (const [nodeKey, row] of entries) {
    const anchor = row && typeof row.primaryAnchor === 'string' ? row.primaryAnchor : undefined;
    if (anchor === undefined) continue;
    const file = files.find((f) => anchor === f || anchor.startsWith(`${f}#`) || anchor.startsWith(`${f}:`));
    if (file === undefined) continue;
    const claims = Array.isArray(row.claims) ? row.claims : [];
    for (const claim of claims) {
      n += 1;
      out.push({
        id: `ATLAS-${nodeKey}-${n}`,
        anchor,
        text: claim,
        shape: typeof row.slot === 'string' ? row.slot : 'unknown',
        source: 'atlas',
      });
    }
  }
  return out;
}

// ── 2) semantic dedup — LLM-adjudicated, never string-matched (paraphrase is the norm) ─────────────────

function renderDedupPrompt(a, b) {
  return `Do FACT A and FACT B assert the SAME underlying fact about the code (allowing paraphrase, different wording, different emphasis), or DIFFERENT facts?

FACT A: ${a}

FACT B: ${b}

Answer with exactly one token on the LAST line: SAME or DIFFERENT.`;
}

/** One dedup-judge call. Unparseable/failed ⇒ DIFFERENT — a dedup step that cannot decide must never
 *  silently MERGE two candidates (that would delete a fact from the pool), so it fails closed. */
function callDedupJudge(judge, a, b, timeoutMs) {
  const r = spawnSync(judge.cmd, judge.args, {
    input: renderDedupPrompt(a, b),
    timeout: timeoutMs,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.status !== 0) return 'DIFFERENT';
  const lines = String(r.stdout ?? '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const last = (lines[lines.length - 1] ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  return last === 'SAME' ? 'SAME' : 'DIFFERENT';
}

/** The file (from `files`) a pooled candidate's anchor belongs to — longest-prefix match, since a comment
 *  anchor carries a `:line-range` suffix and an Atlas anchor may carry a `#symbol`/`:block` suffix. */
function fileOfAnchor(anchor, files) {
  const hits = files.filter((f) => anchor === f || anchor.startsWith(f));
  if (hits.length === 0) return undefined;
  return hits.reduce((best, f) => (f.length > best.length ? f : best));
}

/**
 * Union-find semantic dedup, restricted to pairs from the SAME FILE (not the same raw anchor string — three
 * miners anchor at three different granularities by construction: Atlas at symbol/block, the comment
 * extractor at a line range, the raw-LLM lister at the whole file. Grouping by exact anchor would compare
 * nothing across miners, which is exactly where the paraphrase duplicates the design doc (§3 step 3) is
 * about are. Grouping by file keeps the judge-call count O(pool-per-file²) instead of O(pool²).
 * @param {Array<{id:string, anchor:string, text:string, shape:string, source:string}>} candidates
 * @param {{cmd:string, args:string[]}} judge
 * @param {string[]} files
 * @param {number} [timeoutMs]
 * @returns {{deduped: Array<{id:string, anchor:string, text:string, shape:string, sources:string[], members:object[]}>, pairCalls: object[]}}
 */
export function semanticDedup(candidates, judge, files, timeoutMs = 60_000) {
  const parent = candidates.map((_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const byFile = new Map();
  candidates.forEach((c, i) => {
    const f = fileOfAnchor(c.anchor, files) ?? c.anchor;
    if (!byFile.has(f)) byFile.set(f, []);
    byFile.get(f).push(i);
  });

  const pairCalls = [];
  for (const idxs of byFile.values()) {
    for (let i = 0; i < idxs.length; i++) {
      for (let j = i + 1; j < idxs.length; j++) {
        const a = idxs[i];
        const b = idxs[j];
        if (find(a) === find(b)) continue; // already merged transitively — save the call
        const verdict = callDedupJudge(judge, candidates[a].text, candidates[b].text, timeoutMs);
        pairCalls.push({ a: candidates[a].id, b: candidates[b].id, verdict });
        if (verdict === 'SAME') union(a, b);
      }
    }
  }

  const clusters = new Map();
  candidates.forEach((c, i) => {
    const r = find(i);
    if (!clusters.has(r)) clusters.set(r, []);
    clusters.get(r).push(c);
  });

  const deduped = [...clusters.values()].map((members) => ({
    id: members[0].id,
    anchor: members[0].anchor,
    text: members[0].text, // one representative wording; every member's text is kept in `members`
    shape: members[0].shape,
    sources: [...new Set(members.map((m) => m.source))],
    members: members.map((m) => ({ id: m.id, source: m.source, text: m.text, shape: m.shape })),
  }));

  return { deduped, pairCalls };
}

// ── 3) truth adjudication — REUSES adjudicate/ (callJudge + the CATEGORIES vocabulary), never rebuilt ───

/** Same structure as `adjudicate/fixtures.mjs` `renderPrompt`, generalized off a labeled Fixture to a bare
 *  pooled candidate (no known label — that is exactly what adjudication is deciding). */
function renderTruthPrompt({ anchor, code, fact }) {
  return `You are adjudicating whether a mined FACT is a true statement about the CODE it is anchored to.

A fact is GROUNDED_TRUE only if it is BOTH about this code AND a true statement about what this code actually does.
A fact is HALLUCINATED if it is about this code but asserts something the code does NOT do (wrong constant, wrong callee, inverted condition, a behaviour the code lacks, or a stale comment reported as current behaviour).
If you genuinely cannot decide from the code shown, answer ABSTAIN.

ANCHOR: ${anchor}

CODE:
${code}

FACT:
${fact}

Think briefly, then output your verdict as the LAST line, exactly one of these tokens and nothing else on that line:
GROUNDED_TRUE
HALLUCINATED
ABSTAIN`;
}

/**
 * Adjudicate every deduped candidate for TRUTH, `passes` times each, majority vote decides. Reuses
 * `adjudicate.mjs`'s `callJudge` (same judge-command contract, same `CATEGORIES` vocabulary) so a pooled
 * candidate is scored by literally the same instrument A1 uses — never a second truth-scorer.
 * @param {Array<{id:string, anchor:string, text:string, shape:string, sources:string[]}>} deduped
 * @param {Record<string,string>} codeByFile
 * @param {string[]} files
 * @param {{cmd:string, args:string[]}} judge
 * @param {{passes?:number, timeoutMs?:number}} [opts]
 */
export function truthAdjudicate(deduped, codeByFile, files, judge, opts = {}) {
  const passes = opts.passes ?? 1;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  return deduped.map((cand) => {
    const file = fileOfAnchor(cand.anchor, files);
    const code = file !== undefined ? (codeByFile[file] ?? '') : '';
    const prompt = renderTruthPrompt({ anchor: cand.anchor, code, fact: cand.text });
    const verdicts = [];
    for (let p = 0; p < passes; p++) {
      const { verdict } = callJudge(judge, prompt, timeoutMs, { ATLAS_JUDGE_PASS: String(p) });
      verdicts.push(verdict);
    }
    const counts = new Array(CATEGORIES.length).fill(0);
    for (const v of verdicts) {
      const j = CATEGORIES.indexOf(v);
      if (j >= 0) counts[j] += 1;
    }
    const decision = majority(counts);
    return { ...cand, verdicts, decision, isTrue: decision === 'GROUNDED_TRUE' };
  });
}

// ── 4) recall@pool — stratified by fact shape ──────────────────────────────────────────────────────────

/**
 * `recall@pool(system) = |true facts that system emitted| / |true facts in the pool|`, plus the same ratio
 * stratified by `shape`. `pooled` is the truth-adjudicated, deduped candidate list from `truthAdjudicate`.
 */
export function recallAtPool(pooled) {
  const truePool = pooled.filter((f) => f.isTrue);
  const poolTotal = truePool.length;

  const bySystem = {};
  const bySystemShape = {};
  const poolByShape = {};
  for (const f of truePool) {
    poolByShape[f.shape] = (poolByShape[f.shape] ?? 0) + 1;
    for (const src of f.sources) {
      bySystem[src] = (bySystem[src] ?? 0) + 1;
      bySystemShape[src] = bySystemShape[src] ?? {};
      bySystemShape[src][f.shape] = (bySystemShape[src][f.shape] ?? 0) + 1;
    }
  }

  const allSystems = [...new Set(pooled.flatMap((f) => f.sources))];

  const recall = {};
  for (const sys of allSystems) {
    const n = bySystem[sys] ?? 0;
    recall[sys] = { poolTrue: poolTotal, systemTrue: n, recallAtPool: poolTotal === 0 ? null : n / poolTotal };
  }

  const recallByShape = {};
  for (const shape of Object.keys(poolByShape)) {
    recallByShape[shape] = {};
    for (const sys of allSystems) {
      const n = bySystemShape[sys]?.[shape] ?? 0;
      const denom = poolByShape[shape];
      recallByShape[shape][sys] = { poolTrue: denom, systemTrue: n, recallAtPool: denom === 0 ? null : n / denom };
    }
  }

  return { poolTotal, recall, recallByShape, caveat: RECALL_CAVEAT };
}

// ── 5) the end-to-end driver ────────────────────────────────────────────────────────────────────────────

/**
 * Run the full A4 pool over `files`, source read from `codeByFile`.
 * @param {{
 *   repo: string,
 *   files: string[],
 *   codeByFile: Record<string,string>,
 *   mode: 'fake'|'live',
 *   atlas: {skip?:boolean, cmd?:string, args?:string[]},
 *   lister: {cmd:string, args:string[]},
 *   listerModel: {cmd:string, args:string[]},
 *   judge: {cmd:string, args:string[]},
 *   dedupJudge: {cmd:string, args:string[]},
 *   passes?: number,
 * }} opts
 */
export function runA4Pool(opts) {
  const { repo, files, codeByFile } = opts;

  // Atlas leg
  let atlasRun = { status: null, err: '', stdout: '', ran: false };
  if (!opts.atlas?.skip) {
    atlasRun = { ...runAtlasMine({ repo, cmd: opts.atlas.cmd, args: opts.atlas.args ?? [] }), ran: true };
  }
  const atlasFacts = atlasFactsFor(repo, files);

  // baseline-lister leg — reuses `listFacts` (the pure export), never that file's own CLI entry point.
  const listerFacts = [];
  for (const f of files) {
    const r = listFacts(f, codeByFile[f] ?? '', opts.listerModel);
    listerFacts.push(...r.facts);
  }

  // comment-extractor leg — reuses `extractComments` directly, no model call, no CLI entry point.
  const commentFacts = [];
  for (const f of files) commentFacts.push(...extractComments(f, codeByFile[f] ?? ''));

  const pool = [...atlasFacts, ...listerFacts, ...commentFacts];

  const { deduped, pairCalls } = semanticDedup(pool, opts.dedupJudge, files);
  const adjudicated = truthAdjudicate(deduped, codeByFile, files, opts.judge, { passes: opts.passes ?? 1 });
  const recall = recallAtPool(adjudicated);

  return {
    mode: opts.mode,
    modeNote:
      opts.mode === 'fake'
        ? 'PIPELINE PROOF (fake model + fake judge). Proves pool→dedup→adjudicate→recall math is wired ' +
          'correctly. This is NOT a real recall@pool number — a live metered run is PENDING.'
        : 'live judge/model run.',
    files,
    counts: { atlas: atlasFacts.length, lister: listerFacts.length, comment: commentFacts.length, pooled: pool.length, deduped: deduped.length },
    atlasRun,
    pairCalls,
    adjudicated,
    recall,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────────────

// A flag name -> out-field table, so adding a flag is one row, not a switch arm.
const STR_FLAGS = {
  '--repo': 'repo', '--mode': 'mode', '--atlas-cmd': 'atlasCmd', '--lister-cmd': 'listerCmd',
  '--judge-cmd': 'judgeCmd', '--dedup-cmd': 'dedupCmd', '--out': 'out',
};
const JSON_FLAGS = {
  '--atlas-args': 'atlasArgs', '--lister-args': 'listerArgs', '--judge-args': 'judgeArgs', '--dedup-args': 'dedupArgs',
};

function parseArgs(argv) {
  const out = { files: [], passes: 1 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--files') { out.files = argv[++i].split(',').filter(Boolean); continue; }
    if (a === '--skip-atlas-run') { out.skipAtlas = true; continue; }
    if (a === '--passes') { out.passes = Number(argv[++i]); continue; }
    if (STR_FLAGS[a]) { out[STR_FLAGS[a]] = argv[++i]; continue; }
    if (JSON_FLAGS[a]) { out[JSON_FLAGS[a]] = JSON.parse(argv[++i]); continue; }
    throw new Error(`a4-pool: unknown argument ${a}`);
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.repo || args.files.length === 0 || !args.mode || !args.judgeCmd || !args.dedupCmd || !args.listerCmd) {
    process.stderr.write(
      'usage: node a4-pool.mjs --repo <dir> --files <f1,f2> --mode fake|live ' +
        '--lister-cmd <cmd> [--lister-args <json>] --judge-cmd <cmd> [--judge-args <json>] ' +
        '--dedup-cmd <cmd> [--dedup-args <json>] [--skip-atlas-run | --atlas-cmd <cmd> [--atlas-args <json>]] ' +
        '[--passes N] [--out <file>]\n',
    );
    process.exit(2);
  }
  const codeByFile = {};
  for (const f of args.files) {
    codeByFile[f] = readFileSync(`${args.repo}/${f}`, 'utf8');
  }
  const result = runA4Pool({
    repo: args.repo,
    files: args.files,
    codeByFile,
    mode: args.mode,
    atlas: args.skipAtlas ? { skip: true } : { cmd: args.atlasCmd, args: args.atlasArgs ?? [] },
    listerModel: { cmd: args.listerCmd, args: args.listerArgs ?? [] },
    judge: { cmd: args.judgeCmd, args: args.judgeArgs ?? [] },
    dedupJudge: { cmd: args.dedupCmd, args: args.dedupArgs ?? [] },
    passes: args.passes,
  });
  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (args.out) writeFileSync(args.out, text);
  process.stdout.write(text);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
