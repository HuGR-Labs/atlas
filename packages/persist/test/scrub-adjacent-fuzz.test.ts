// @atlas/persist — test/scrub-adjacent-fuzz.test.ts  (WP-3.5-a.PERSIST · PERSIST-10a — ADJACENCY FUZZ)
//
// WHY THIS FILE EXISTS. The shipped differential sweep injects EXACTLY ONE token per case, so two
// credentials with nothing between them are never generated and the whole ADJACENCY class is unreachable
// by it. A generator that cannot reach the failing region is indistinguishable from a passing test — and
// that is precisely how `ghp_AAAAAAghp_BBBBBB` -> `[REDACTED]_BBBBBB` survived a green suite: the greedy
// body of the first credential swallowed the second one's four-character family prefix and shipped its
// entropy-bearing body in the clear.
//
// The generator here injects RUNS of 1..3 credentials with NO separator (and, separately, joined by a
// single `_`), and it carries its own GROUND TRUTH from the construction — not from the implementation:
//   * every injected body must be absent from the output          (LEAK)
//   * every clean piece must survive verbatim                     (OVER-REDACTION)
//   * the output must equal the constructed expectation           (EXACT)
//   * an independent, regex-free scanner must agree with it       (the generator itself is checked)
//
// FIXTURES are obviously-synthetic: every token body is randomly generated from the seeded LCG and the
// fixed near-miss pieces are hand-written markers. Nothing here is or resembles a real credential.

import { describe, it, expect } from 'vitest';
import { scrub, admitToBuffer } from '../src/scrub.js';
import {
  CLEAN_PIECES,
  chunkRandomly,
  credentialSpans,
  hasCredentialShape,
  lcg,
  makeCase,
  referenceScrub,
} from './adjacency-oracle.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

const scrubText = (s: string): string => dec.decode(scrub(enc.encode(s)));

function admitAll(parts: readonly string[]): string {
  let buf = new Uint8Array(0);
  for (const p of parts) buf = admitToBuffer(buf, enc.encode(p));
  return dec.decode(buf);
}

function occurrences(hay: string, needle: string): number {
  let n = 0;
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) n++;
  return n;
}

interface Tally {
  cases: number;
  leak: number;
  over: number;
  residual: number;
  mismatch: number;
  generator: number;
}

const blank = (): Tally => ({ cases: 0, leak: 0, over: 0, residual: 0, mismatch: 0, generator: 0 });

/** Score one produced output against the construction's ground truth. */
function score(
  t: Tally,
  c: { text: string; expected: string; bodies: readonly string[]; clean: readonly string[] },
  actual: string,
): void {
  t.cases++;
  // the generator itself is under test: the construction and the independent regex-free scanner must agree
  if (referenceScrub(c.text) !== c.expected) t.generator++;
  if (actual !== c.expected) t.mismatch++;
  // LEAK — an injected body survives in the clear although the correct output does not contain it
  for (const body of c.bodies) {
    if (occurrences(actual, body) > occurrences(c.expected, body)) {
      t.leak++;
      break;
    }
  }
  // OVER-REDACTION — a non-secret piece the correct output keeps is missing from the actual output
  for (const piece of new Set(c.clean)) {
    if (occurrences(actual, piece) < occurrences(c.expected, piece)) {
      t.over++;
      break;
    }
  }
  if (hasCredentialShape(actual)) t.residual++;
}

// ── the generator's own teeth ────────────────────────────────────────────────────────────────────────

describe('PERSIST-10a adjacency — the GENERATOR reaches the failing region', () => {
  it('the shipped sweep alphabet can inject only ONE token — this one injects runs of 2+ adjacent', () => {
    const rnd = lcg(20260801);
    let withAdjacentPair = 0;
    let maxRun = 0;
    for (let i = 0; i < 5000; i++) {
      const c = makeCase(rnd, { minRun: 2, maxRun: 3 });
      // an adjacent pair is literally two family prefixes with only body characters between them
      const spans = credentialSpans(c.text);
      for (let k = 1; k < spans.length; k++) {
        if (spans[k]!.start === spans[k - 1]!.end) {
          withAdjacentPair++;
          break;
        }
      }
      maxRun = Math.max(maxRun, spans.length);
    }
    // teeth (breaks-on "the generator still emits at most one token per case, so adjacency is unreachable"):
    expect(withAdjacentPair).toBeGreaterThan(1000);
    expect(maxRun).toBeGreaterThanOrEqual(2);
  });

  it('the construction and the independent regex-free scanner agree on every case', () => {
    const rnd = lcg(777);
    for (let i = 0; i < 20000; i++) {
      const c = makeCase(rnd, { minRun: 1, maxRun: 3 });
      // teeth (breaks-on "the expected output is derived from the implementation, so it cannot disagree"):
      expect(referenceScrub(c.text)).toBe(c.expected);
    }
  });

  it('the scanner has teeth: it SEES a credential, and it is not blinded by the placeholder', () => {
    expect(hasCredentialShape('x ghp_ABCDEFGH y')).toBe(true);
    expect(hasCredentialShape('x ghp_ABCDE y')).toBe(false); // five body chars: below the floor
    expect(hasCredentialShape('x gha_ABCDEFGH y')).toBe(false); // not a family member
    expect(hasCredentialShape('[REDACTED]_BBBBBB')).toBe(false); // the leaked FORM is shapeless, hence the body check
    expect(credentialSpans('ghp_AAAAAAghp_BBBBBB').length).toBe(2);
    expect(referenceScrub('ghp_AAAAAAghp_BBBBBB')).toBe('[REDACTED][REDACTED]');
    expect(referenceScrub('ghp_ABCDEF_prod')).toBe('[REDACTED]_prod'); // the `_suffix` bytes are NOT secret
  });

  it('every clean piece starts with a NON-body character (why a missing piece is unambiguous)', () => {
    for (const piece of CLEAN_PIECES) {
      expect(/^[A-Za-z0-9]/.test(piece)).toBe(false);
      expect(hasCredentialShape(piece)).toBe(false);
    }
  });
});

// ── the measurement ──────────────────────────────────────────────────────────────────────────────────

const N_WHOLE = 200_000;
const N_FOLD = 40_000;

describe('PERSIST-10a adjacency — WHOLE-BUFFER scrub, 200k adjacency cases', () => {
  it('0 leaks, 0 over-redactions, 0 residual shapes, 0 exact mismatches', () => {
    const rnd = lcg(20260801);
    const t = blank();
    for (let i = 0; i < N_WHOLE; i++) {
      const c = makeCase(rnd, { minRun: 1, maxRun: 3 });
      score(t, c, scrubText(c.text));
    }
    // teeth (breaks-on "a credential body swallows the family prefix of the credential that follows it,
    // so the second body ships in the clear as `[REDACTED]_BBBBBB`"):
    expect(t).toEqual({ cases: N_WHOLE, leak: 0, over: 0, residual: 0, mismatch: 0, generator: 0 });
  });

  it('the metric has teeth: the KNOWN-BAD greedy shape scores as a leak on the same cases', () => {
    // The shipped-before-the-fix regex, inlined so the measurement can be shown to be capable of failing.
    const bad = (s: string): string => s.replace(/gh[pousr]_[A-Za-z0-9]{6,}/g, '[REDACTED]');
    const rnd = lcg(20260801);
    const t = blank();
    for (let i = 0; i < 20_000; i++) {
      const c = makeCase(rnd, { minRun: 2, maxRun: 3 });
      score(t, c, bad(c.text));
    }
    expect(t.leak).toBeGreaterThan(5_000); // the class the shipped sweep could not reach
    expect(t.generator).toBe(0);
  });
});

describe('PERSIST-10a adjacency — CHUNK INDEPENDENCE, 40k adjacency cases', () => {
  it('a random chunking folds to exactly the whole-buffer result, and to the ground truth', () => {
    const rnd = lcg(31337);
    const t = blank();
    let foldDiff = 0;
    for (let i = 0; i < N_FOLD; i++) {
      const c = makeCase(rnd, { minRun: 1, maxRun: 3 });
      const folded = admitAll(chunkRandomly(c.text, rnd));
      if (folded !== scrubText(c.text)) foldDiff++;
      score(t, c, folded);
    }
    // teeth (breaks-on "the lookahead cannot reach across a chunk seam, so a streaming caller still
    // admits `[REDACTED]_BBBBBB`"):
    expect(foldDiff).toBe(0);
    expect(t).toEqual({ cases: N_FOLD, leak: 0, over: 0, residual: 0, mismatch: 0, generator: 0 });
  });

  it('BYTE-AT-A-TIME (the realistic streaming case) over 4k adjacency cases', () => {
    const rnd = lcg(4242);
    const t = blank();
    for (let i = 0; i < 4_000; i++) {
      const c = makeCase(rnd, { minRun: 2, maxRun: 3 });
      score(t, c, admitAll(c.text.split('')));
    }
    expect(t).toEqual({ cases: 4_000, leak: 0, over: 0, residual: 0, mismatch: 0, generator: 0 });
  });

  it('EVERY split offset of an adjacent pair folds to the whole-buffer result', () => {
    const rnd = lcg(99);
    for (let i = 0; i < 200; i++) {
      const c = makeCase(rnd, { minRun: 2, maxRun: 2 });
      const reference = scrubText(c.text);
      for (let off = 1; off < c.text.length; off++) {
        expect(admitAll([c.text.slice(0, off), c.text.slice(off)])).toBe(reference);
      }
      expect(reference).toBe(c.expected);
    }
  });

  it('fixed chunk sizes 1/2/3/5/7/11/13 agree at EVERY prefix, not only at the end', () => {
    const rnd = lcg(1234);
    for (let i = 0; i < 200; i++) {
      const c = makeCase(rnd, { minRun: 2, maxRun: 3 });
      for (const size of [1, 2, 3, 5, 7, 11, 13]) {
        let buf = new Uint8Array(0);
        let acc = '';
        for (let p = 0; p < c.text.length; p += size) {
          const part = c.text.slice(p, p + size);
          buf = admitToBuffer(buf, enc.encode(part));
          acc += part;
          // the invariant holds at EVERY prefix — there is no deferred flush
          expect(dec.decode(buf)).toBe(scrubText(acc));
        }
        expect(dec.decode(buf)).toBe(c.expected);
      }
    }
  });
});
