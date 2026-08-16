// harness/probes/a4-pool.test.mjs — proves the A4 pooling PIPELINE (pool → semantic-dedup → truth-adjudicate
// → recall@pool) end to end, deterministically, with ZERO real model calls.
//
// Three legs are exercised as real subprocesses (never in-memory simulation — the same reasoning
// `concurrency-report.test.mjs` gives for why a shim must be watched succeed as a process, not a function
// call): the baseline-lister model call, the semantic-dedup judge call, and the truth-adjudication judge
// call. All three point at deterministic zero-cost stand-ins:
//
//   • `fake-model.mjs` (the repo's existing zero-cost model stand-in) drives `baseline-lister.listFacts`.
//   • the existing `adjudicate/fake-judge.mjs` is proven, directly, to answer from its FIXTURE_ID contract
//     through `callJudge`/`parseVerdict` — the exact primitives `a4-pool.mjs` truth-adjudication reuses.
//   • the full pipeline test (dedup + truth over a tiny two-file fixture corpus) uses small inline stub
//     judges, because dedup/truth need FILE- and CONTENT-aware answers that `fake-judge.mjs`'s
//     FIXTURE_ID-keyed contract (built for the labeled calibration fixtures, not bare pooled candidates)
//     does not address — nothing about `adjudicate.mjs`'s driver contract (prompt on stdin → verdict token
//     on the last line) changes; only the answering process differs from `judge.mjs`'s real `claude` call.
//
// The recall numbers this file computes are a PIPELINE PROOF, not a calibration and not a real recall@pool
// — `runA4Pool`'s own `modeNote` says so when `mode: 'fake'`, and this file never claims otherwise. A live
// metered run (`mode: 'live'`, real judges, a real `atlas mine`) is PENDING and out of this WP's scope.

import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractComments, classifyShape } from './comment-extractor.mjs';
import { listFacts } from './baseline-lister.mjs';
import { runA4Pool, semanticDedup, truthAdjudicate, recallAtPool, atlasFactsFor, RECALL_CAVEAT } from './a4-pool.mjs';
import { callJudge } from './adjudicate/adjudicate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FAKE_MODEL = join(HERE, 'fake-model.mjs');
const FAKE_JUDGE = join(HERE, 'adjudicate', 'fake-judge.mjs');
const NODE = process.execPath;

// ── inline zero-cost stand-ins for dedup / truth judges ─────────────────────────────────────────────────
// These are NOT a rebuild of adjudicate/'s judge: they honour the exact same contract adjudicate.mjs's
// `callJudge` expects (prompt on stdin, verdict token on the LAST line, non-zero exit ⇒ ABSTAIN), and
// `a4-pool.mjs` calls them through that same driver. They exist because this test's dedup/truth decisions
// must be FILE- and CONTENT-aware (fake-judge.mjs's FIXTURE_ID keying does not fit un-labeled pool
// candidates) — swapping in a real `claude` judge later is a `--judge-cmd` change, nothing here.

/** SAME iff both facts mention all four of lo/hi/min/max — the shared vocabulary of the clamp-shaped facts
 *  this fixture plants, and specific enough that the WRONGFACT fact (which mentions none of them) never
 *  merges into that cluster. */
const DEDUP_STUB = `
const fs = require('fs');
const raw = fs.readFileSync(0, 'utf8');
const ma = raw.match(/FACT A: ([^\\n]*)/);
const mb = raw.match(/FACT B: ([^\\n]*)/);
const a = (ma ? ma[1] : '').toLowerCase();
const b = (mb ? mb[1] : '').toLowerCase();
const toks = ['lo', 'hi', 'min', 'max'];
const hasAll = (s) => toks.every((t) => s.includes(t));
process.stdout.write(hasAll(a) && hasAll(b) ? 'SAME\\n' : 'DIFFERENT\\n');
`;

/** HALLUCINATED iff the fact text contains the planted marker "WRONGFACT"; GROUNDED_TRUE otherwise. */
const TRUTH_STUB = `
const fs = require('fs');
const raw = fs.readFileSync(0, 'utf8');
process.stdout.write(raw.includes('WRONGFACT') ? 'HALLUCINATED\\n' : 'GROUNDED_TRUE\\n');
`;

/** A file-aware fake lister: answers a fixed multi-line list keyed on the `FILE: <path>` line the real
 *  `renderListerPrompt` always emits. */
const LISTER_STUB = `
const fs = require('fs');
const raw = fs.readFileSync(0, 'utf8');
if (raw.includes('FILE: src/util.js')) {
  process.stdout.write(
    'clamp bounds the number to the range [lo, hi] using Math.min and Math.max together.\\n' +
    'WRONGFACT: clamp always returns zero regardless of arguments.\\n'
  );
} else if (raw.includes('FILE: src/format.js')) {
  process.stdout.write('toSlug lowercases, trims, and replaces whitespace runs with a hyphen.\\n');
} else {
  process.stdout.write('');
}
`;

// ── fixture corpus ──────────────────────────────────────────────────────────────────────────────────────

const UTIL_JS = `// util.js — small numeric helpers.

/**
 * Clamps x into [lo, hi] via Math.min and Math.max.
 */
function clamp(x, lo, hi) {
  return Math.min(Math.max(x, lo), hi);
}

module.exports = { clamp };
`;

const FORMAT_JS = `// format.js — string helpers.
function toSlug(s) {
  return s.toLowerCase().trim().replace(/\\s+/g, '-');
}
module.exports = { toSlug };
`;

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'a4-pool-'));
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, '.atlas'), { recursive: true });
  writeFileSync(join(dir, 'src/util.js'), UTIL_JS);
  writeFileSync(join(dir, 'src/format.js'), FORMAT_JS);
  // Atlas mined exactly ONE fact (about clamp) — `atlas mine` writes only to STAGING (ADR-0008), so the
  // fixture is the staging mirror, never `projection`. format.js is left with NO atlas fact on purpose: it
  // is the miss that makes Atlas's recall@pool < 1 in this fixture.
  const staging = {
    current: [
      [
        'nk-clamp',
        {
          nodeKey: 'nk-clamp',
          family: 'advisory',
          contentHash: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
          claims: ['clamp bounds x to the [lo, hi] interval via Math.min and Math.max.'],
          primaryAnchor: 'src/util.js#clamp',
          slot: 'contract',
        },
      ],
    ],
    cas: [],
  };
  writeFileSync(join(dir, '.atlas/staging.json'), JSON.stringify(staging));
  return dir;
}

describe('comment-extractor: extractComments (no model, no grounding door)', () => {
  it('extracts a line-comment run and a JSDoc block as separate candidates, anchored by line span', () => {
    const cands = extractComments('src/util.js', UTIL_JS);
    expect(cands.length).toBe(2);
    expect(cands[0].anchor).toBe('src/util.js:1');
    expect(cands[0].text).toContain('numeric helpers');
    expect(cands[1].anchor).toBe('src/util.js:3-5');
    expect(cands[1].text).toContain('Math.min');
    expect(cands[1].text).toContain('Math.max');
    for (const c of cands) expect(c.source).toBe('comment-extractor');
  });

  it('drops pure-separator and too-short runs as noise', () => {
    const cands = extractComments('x.js', '// ---------------\n// ok\n');
    expect(cands.every((c) => c.text !== '---------------')).toBe(true);
  });

  it('classifyShape gives a comparable, if approximate, shape axis to non-Atlas miners', () => {
    expect(classifyShape('this never happens when the flag is unset')).toBe('negation');
    expect(classifyShape('runs when the queue is non-empty')).toBe('relation');
    expect(classifyShape('always returns a Promise and throws on timeout')).toBe('predicate');
    expect(classifyShape('a small helper module')).toBe('advisory');
  });
});

describe('baseline-lister: listFacts (subprocess model call, fake-model.mjs)', () => {
  it('turns the fake model’s multi-line answer into one candidate fact per line, no grounding door', () => {
    const prev = process.env.ATLAS_FAKE_MODEL_CLAIM;
    process.env.ATLAS_FAKE_MODEL_CLAIM = 'first fake fact\nsecond fake fact';
    try {
      const { facts, status } = listFacts('src/util.js', UTIL_JS, { cmd: NODE, args: [FAKE_MODEL] });
      expect(status).toBe(0);
      expect(facts.length).toBe(2);
      expect(facts[0].source).toBe('baseline-lister');
      expect(facts[0].anchor).toBe('src/util.js');
      expect(facts[0].text).toBe('first fake fact');
      expect(facts[1].text).toBe('second fake fact');
    } finally {
      if (prev === undefined) delete process.env.ATLAS_FAKE_MODEL_CLAIM;
      else process.env.ATLAS_FAKE_MODEL_CLAIM = prev;
    }
  });

  it('propagates a non-zero model exit as a failed call, never a silent empty answer read as facts', () => {
    const prev = process.env.ATLAS_FAKE_MODEL_EXIT;
    process.env.ATLAS_FAKE_MODEL_EXIT = '3';
    try {
      const { status, facts, err } = listFacts('src/util.js', UTIL_JS, { cmd: NODE, args: [FAKE_MODEL] });
      expect(status).toBe(3);
      expect(facts).toEqual([]);
      expect(err).toBe('');
    } finally {
      if (prev === undefined) delete process.env.ATLAS_FAKE_MODEL_EXIT;
      else process.env.ATLAS_FAKE_MODEL_EXIT = prev;
    }
  });
});

describe('adjudicate/fake-judge.mjs reused AS-IS through callJudge/parseVerdict (not rebuilt)', () => {
  it('answers the known-correct verdict for a T-fixture id under FAKE_JUDGE_MODE=oracle', () => {
    const prompt = 'FIXTURE_ID: T01\nsome adjudication prompt text\nGROUNDED_TRUE\nHALLUCINATED\nABSTAIN';
    const { verdict } = callJudge({ cmd: NODE, args: [FAKE_JUDGE] }, prompt, 5_000, { FAKE_JUDGE_MODE: 'oracle' });
    expect(verdict).toBe('GROUNDED_TRUE');
  });

  it('answers HALLUCINATED for an F-fixture id under FAKE_JUDGE_MODE=oracle', () => {
    const prompt = 'FIXTURE_ID: F03\nsome adjudication prompt text\nGROUNDED_TRUE\nHALLUCINATED\nABSTAIN';
    const { verdict } = callJudge({ cmd: NODE, args: [FAKE_JUDGE] }, prompt, 5_000, { FAKE_JUDGE_MODE: 'oracle' });
    expect(verdict).toBe('HALLUCINATED');
  });
});

describe('a4-pool: pool → semantic-dedup → truth-adjudicate → recall@pool, on a tiny fixture corpus', () => {
  it('is proven deterministically end to end with fake legs, no real tokens', () => {
    const dir = makeRepo();
    try {
      const files = ['src/util.js', 'src/format.js'];
      const codeByFile = { 'src/util.js': UTIL_JS, 'src/format.js': FORMAT_JS };

      const result = runA4Pool({
        repo: dir,
        files,
        codeByFile,
        mode: 'fake',
        atlas: { skip: true }, // store already carries the fixture staging sidecar
        listerModel: { cmd: NODE, args: ['-e', LISTER_STUB] },
        judge: { cmd: NODE, args: ['-e', TRUTH_STUB] },
        dedupJudge: { cmd: NODE, args: ['-e', DEDUP_STUB] },
        passes: 1,
      });

      expect(result.mode).toBe('fake');
      expect(result.modeNote).toMatch(/PIPELINE PROOF/);
      expect(result.modeNote).toMatch(/PENDING/);

      // pool composition, pre-dedup: atlas=1, lister=3 (2 for util.js + 1 for format.js), comment=3
      // (2 for util.js + 1 for format.js)
      expect(result.counts.atlas).toBe(1);
      expect(result.counts.lister).toBe(3);
      expect(result.counts.comment).toBe(3);
      expect(result.counts.pooled).toBe(7);

      // semantic dedup merges exactly the three clamp-shaped facts (atlas + comment-block + lister-true)
      // into one cluster spanning all three sources; the WRONGFACT fact, the util.js file-header comment,
      // the format.js file-header comment, and the toSlug lister fact each stay singleton clusters.
      // 7 candidates -> 5 clusters (1 merged triple + 4 singletons).
      expect(result.counts.deduped).toBe(5);
      const clampCluster = result.adjudicated.find((c) => c.sources.length === 3);
      expect(clampCluster).toBeDefined();
      expect([...clampCluster.sources].sort()).toEqual(['atlas', 'baseline-lister', 'comment-extractor']);
      expect(clampCluster.isTrue).toBe(true);

      // the planted false candidate is caught and EXCLUDED from the true pool
      const wrongCluster = result.adjudicated.find((c) => c.text.includes('WRONGFACT'));
      expect(wrongCluster).toBeDefined();
      expect(wrongCluster.isTrue).toBe(false);
      expect(wrongCluster.decision).toBe('HALLUCINATED');

      // recall@pool: 4 true facts in the pool (clamp-cluster, the util.js file-header comment, the
      // format.js file-header comment, the toSlug lister fact). Atlas contributed only the clamp cluster.
      expect(result.recall.poolTotal).toBe(4);
      expect(result.recall.recall.atlas.recallAtPool).toBeCloseTo(1 / 4, 10);
      expect(result.recall.recall['comment-extractor'].recallAtPool).toBeCloseTo(3 / 4, 10);
      expect(result.recall.recall['baseline-lister'].recallAtPool).toBeCloseTo(2 / 4, 10);
      expect(result.recall.caveat).toBe(RECALL_CAVEAT);
      expect(result.recall.caveat).toMatch(/never absolute/);

      // Atlas's own leg, read straight off the STAGING sidecar (ADR-0008) — never `projection`.
      const atlasFacts = atlasFactsFor(dir, files);
      expect(atlasFacts.length).toBe(1);
      expect(atlasFacts[0].anchor).toBe('src/util.js#clamp');
      expect(atlasFacts[0].shape).toBe('contract'); // the product's own typed PredicateSlot, carried through
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('semanticDedup fails CLOSED on an unparseable/failed dedup judge (never silently merges)', () => {
    const candidates = [
      { id: 'a', anchor: 'f.js', text: 'fact one about lo hi min max', shape: 'advisory', source: 'x' },
      { id: 'b', anchor: 'f.js', text: 'fact two about lo hi min max', shape: 'advisory', source: 'y' },
    ];
    const { deduped, pairCalls } = semanticDedup(candidates, { cmd: NODE, args: ['-e', 'process.exit(1)'] }, ['f.js']);
    expect(deduped.length).toBe(2); // a broken judge must never delete a candidate by merging it away
    expect(pairCalls[0].verdict).toBe('DIFFERENT');
  });

  it('recallAtPool reports null (not a division-by-zero NaN or a false 0) when the true pool is empty', () => {
    const adjudicated = [{ id: 'a', sources: ['atlas'], shape: 'advisory', isTrue: false }];
    const r = recallAtPool(adjudicated);
    expect(r.poolTotal).toBe(0);
    expect(r.recall.atlas.recallAtPool).toBeNull();
  });

  it('truthAdjudicate majority-votes across passes and records every verdict, not just the decision', () => {
    // A judge that alternates GROUNDED_TRUE/HALLUCINATED by ATLAS_JUDGE_PASS, so passes DISAGREE.
    const flip = `
const p = Number(process.env.ATLAS_JUDGE_PASS || '0');
process.stdout.write(p % 2 === 0 ? 'GROUNDED_TRUE\\n' : 'HALLUCINATED\\n');
`;
    const deduped = [{ id: 'c1', anchor: 'f.js', text: 'some fact', shape: 'advisory', sources: ['x'] }];
    const out = truthAdjudicate(deduped, { 'f.js': 'code' }, ['f.js'], { cmd: NODE, args: ['-e', flip] }, { passes: 3 });
    expect(out[0].verdicts).toEqual(['GROUNDED_TRUE', 'HALLUCINATED', 'GROUNDED_TRUE']);
    expect(out[0].decision).toBe('GROUNDED_TRUE'); // 2 of 3
    expect(out[0].isTrue).toBe(true);
  });
});
