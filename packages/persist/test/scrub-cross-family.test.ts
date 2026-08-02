// @atlas/persist — test/scrub-cross-family.test.ts  (WP-3.5-a.PERSIST · PERSIST-10a — CROSS-FAMILY GATE)
//
// The adjacency fix gave the credential body a negative lookahead so it could not swallow the family prefix
// of the credential written immediately after it. That lookahead blocked the shape's OWN prefix — and with
// exactly one family declared, nothing could tell that apart from blocking ALL of them. The moment a second
// family exists the difference is a live secret leak:
//
//     ghp_<body>xoxb-<body>   own-family lookahead ->  [REDACTED]-<body>    (second body in the clear)
//                             union lookahead      ->  [REDACTED][REDACTED]
//
// Every byte-exact expectation below carries its own MUTANT: the checker is first shown to THROW on the
// un-redacted form, so it cannot rot into a check that passes because it can no longer fail.
//
// FIXTURES are obviously-synthetic and carry NOTAREAL markers. Nothing here is or resembles a real
// credential: `ghp_SYNTHETICNOTAREALTOKEN01`, `xoxb-NOTAREAL-SLACKTOKEN-000`.

import { describe, it, expect } from 'vitest';
import { scrub, admitToBuffer } from '../src/scrub.js';
import { FAMILIES, SHAPES, ANY_FAMILY_PREFIX } from '../src/scrub-shapes.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Obviously-synthetic, shape-matching fixtures (never a real credential). */
const GH = 'ghp_SYNTHETICNOTAREALTOKEN01';
const GH2 = 'gho_NOTAREALSECRET0987654321';
const SL = 'xoxb-NOTAREAL-SLACKTOKEN-000';
const SL2 = 'xoxp-NOTAREAL-SECOND-TOKEN-1';

/** BYTE-level occurrence count — a decoded-substring check can be satisfied by the wrong string. */
function byteOccurrences(hay: Uint8Array, needle: string): number {
  const n = enc.encode(needle);
  let hits = 0;
  outer: for (let i = 0; i + n.length <= hay.length; i++) {
    for (let j = 0; j < n.length; j++) if (hay[i + j] !== n[j]) continue outer;
    hits++;
  }
  return hits;
}

/** EXACT-BYTE equality against an expected literal — factored out so its teeth can be tested. */
function assertExactBytes(actual: Uint8Array, expectedText: string): void {
  const want = enc.encode(expectedText);
  if (actual.length !== want.length) {
    throw new Error(`length ${actual.length} !== expected ${want.length}: ${JSON.stringify(dec.decode(actual))}`);
  }
  for (let i = 0; i < want.length; i++) {
    if (actual[i] !== want[i]) throw new Error(`byte ${i}: ${String(actual[i])} !== ${String(want[i])}`);
  }
}

/** Fails if any run of >= `minRun` consecutive bytes of `secret` survives anywhere in `buf`. */
function assertNoSecretRun(buf: Uint8Array, secret: string, minRun = 6): void {
  for (let i = 0; i + minRun <= secret.length; i++) {
    for (let j = i + minRun; j <= secret.length; j++) {
      const run = secret.slice(i, j);
      if (byteOccurrences(buf, run) !== 0) {
        throw new Error(`secret run "${run}" (len ${run.length}) survived in the buffer`);
      }
    }
  }
}

function admitAll(parts: readonly string[]): Uint8Array {
  let buf = new Uint8Array(0);
  for (const p of parts) buf = admitToBuffer(buf, enc.encode(p));
  return buf;
}

const scrubText = (s: string): string => dec.decode(scrub(enc.encode(s)));

/** Every chunking discipline the seam has to survive, applied to one text. */
function everyChunking(text: string): { label: string; parts: readonly string[] }[] {
  const out: { label: string; parts: readonly string[] }[] = [];
  out.push({ label: 'byte-at-a-time', parts: text.split('') });
  for (let off = 1; off < text.length; off++) {
    out.push({ label: `split@${off}`, parts: [text.slice(0, off), text.slice(off)] });
  }
  for (const size of [1, 2, 3, 5, 7, 11, 13]) {
    const parts: string[] = [];
    for (let p = 0; p < text.length; p += size) parts.push(text.slice(p, p + size));
    out.push({ label: `size-${size}`, parts });
  }
  return out;
}

// ── the assertions' own teeth ────────────────────────────────────────────────────────────────────────

describe('PERSIST-10a cross-family — the checkers can fail', () => {
  it('assertExactBytes and assertNoSecretRun THROW on the un-redacted form (mutant)', () => {
    const raw = enc.encode(`token=${GH}${SL} end`);
    expect(() => assertExactBytes(raw, 'token=[REDACTED][REDACTED] end')).toThrow();
    expect(() => assertNoSecretRun(raw, GH)).toThrow(/survived in the buffer/);
    expect(() => assertNoSecretRun(raw, SL)).toThrow(/survived in the buffer/);
    // and they PASS on the correct form, so they are not simply always-throwing
    const done = scrub(raw);
    expect(() => assertExactBytes(done, 'token=[REDACTED][REDACTED] end')).not.toThrow();
    expect(() => assertNoSecretRun(done, GH)).not.toThrow();
    expect(() => assertNoSecretRun(done, SL)).not.toThrow();
  });

  it('the leaked FORM the own-family lookahead produces is caught by these checkers (mutant)', () => {
    // `[REDACTED]-NOTAREAL-SLACKTOKEN-000` — the placeholder is present, so a naive "is there a placeholder"
    // check would pass it. The body check does not.
    const leaked = enc.encode(`token=[REDACTED]-NOTAREAL-SLACKTOKEN-000 end`);
    expect(() => assertNoSecretRun(leaked, SL)).toThrow(/survived in the buffer/);
    expect(() => assertExactBytes(leaked, 'token=[REDACTED][REDACTED] end')).toThrow();
  });
});

// ── the declaration itself ───────────────────────────────────────────────────────────────────────────

describe('PERSIST-10a cross-family — the lookahead is the UNION of all declared families', () => {
  it('every shape blocks every family prefix, not just its own', () => {
    expect(FAMILIES.map((f) => f.name)).toEqual(['github-token', 'slack-token']);
    expect(ANY_FAMILY_PREFIX).toBe('(?:gh[pousr]_|xox[baprs]-)');
    for (const shape of SHAPES) {
      // teeth (breaks-on "the body lookahead names only the shape's own family prefix"):
      expect(shape.full.source).toContain(ANY_FAMILY_PREFIX);
      for (const f of FAMILIES) expect(shape.cont.source).toContain(f.prefix.map((p) => (p.length === 1 ? p : `[${p}]`)).join(''));
    }
  });

  it('NO declared family may carry a non-body character before its last prefix position', () => {
    // THE PRECONDITION THE SEAM DEPENDS ON, made mechanical. `maxContingent` is derived as
    // |prefix| + (floor-1) + maxAmbiguous, where maxAmbiguous is measured over STRICT family prefixes
    // spelled in body characters. That derivation is only sound while every strict prefix of every family
    // is spellable inside another family's body — i.e. while the only non-alphanumeric character in a
    // prefix is its FINAL separator.
    //
    // `github_pat_` violates it (a `_` at position 7). The consequence is not a smaller bound, it is a
    // seam state that cannot be represented: `ghp_AAAAAAgithub_` is a COMPLETE match that no longer touches
    // the end of the stream while its ambiguity still reaches into it, so the redaction boundary is
    // provisional AND already emitted — and `raw`/`back` (emitted, rewritable) and `swallow`/`pending`
    // (not emitted, inside a redaction) are mutually exclusive. MEASURED: with that family declared and the
    // union lookahead in place, byte-at-a-time `ghp_AAAAAAgithub_pat_BBBBBB` -> `[REDACTED]_pat_BBBBBB`
    // while whole-buffer -> `[REDACTED][REDACTED]`. Declaring such a family is a silent streaming leak, so
    // it fails HERE instead.
    for (const f of FAMILIES) {
      f.prefix.forEach((set, i) => {
        const last = i === f.prefix.length - 1;
        for (const ch of set) {
          if (last) continue; // the separator may be anything
          expect(/^[A-Za-z0-9]$/.test(ch)).toBe(true);
        }
      });
    }
    // teeth: the rejected family really is rejected by this predicate
    const githubPat = ['g', 'i', 't', 'h', 'u', 'b', '_', 'p', 'a', 't', '_'];
    const offending = githubPat.slice(0, -1).filter((set) => ![...set].every((c) => /[A-Za-z0-9]/.test(c)));
    expect(offending).toEqual(['_']);
  });

  it('the derived bounds are arithmetic on the declaration, and self-consistent', () => {
    for (const shape of SHAPES) {
      expect(shape.maxPartial).toBe(shape.minFull - 1);
      expect(shape.maxContingent).toBeGreaterThanOrEqual(shape.maxPartial);
    }
    // github-token: |gh?_| 4 + floor 6 = 10 ; slack-token: |xox?-| 5 + floor 6 = 11
    expect(SHAPES.map((s) => s.minFull)).toEqual([10, 11]);
    expect(SHAPES.map((s) => s.maxContingent)).toEqual([13, 14]);
  });
});

// ── the gate ─────────────────────────────────────────────────────────────────────────────────────────

describe('PERSIST-10a cross-family — adjacent credentials of DIFFERENT families', () => {
  const CASES: readonly { readonly name: string; readonly text: string; readonly want: string; readonly secrets: readonly string[] }[] = [
    { name: 'github then slack', text: `${GH}${SL}`, want: '[REDACTED][REDACTED]', secrets: [GH, SL] },
    { name: 'slack then github', text: `${SL}${GH}`, want: '[REDACTED][REDACTED]', secrets: [SL, GH] },
    { name: 'github slack github', text: `${GH}${SL}${GH2}`, want: '[REDACTED][REDACTED][REDACTED]', secrets: [GH, SL, GH2] },
    { name: 'slack github slack', text: `${SL}${GH}${SL2}`, want: '[REDACTED][REDACTED][REDACTED]', secrets: [SL, GH, SL2] },
    { name: 'framed', text: `log: ${GH}${SL} written`, want: 'log: [REDACTED][REDACTED] written', secrets: [GH, SL] },
    { name: 'separated by _', text: `${GH}_${SL}`, want: '[REDACTED]_[REDACTED]', secrets: [GH, SL] },
  ];

  for (const c of CASES) {
    it(`${c.name}: whole-buffer redacts BOTH, byte-exactly`, () => {
      const got = scrub(enc.encode(c.text));
      // teeth (breaks-on "the first body swallows the second family's prefix, so the second ships as
      // `[REDACTED]-<body>`"):
      assertExactBytes(got, c.want);
      for (const s of c.secrets) {
        expect(byteOccurrences(got, s)).toBe(0);
        assertNoSecretRun(got, s);
      }
    });

    it(`${c.name}: EVERY chunking folds to the identical bytes`, () => {
      const reference = enc.encode(c.want);
      for (const { label, parts } of everyChunking(c.text)) {
        const got = admitAll(parts);
        // teeth (breaks-on "the union lookahead cannot see across a chunk seam, so a streaming caller
        // still admits the second credential's body"):
        try {
          assertExactBytes(got, c.want);
        } catch (e) {
          throw new Error(`${label}: ${(e as Error).message}`);
        }
        expect(Array.from(got)).toEqual(Array.from(reference));
        for (const s of c.secrets) assertNoSecretRun(got, s);
      }
    });

    it(`${c.name}: the invariant holds at EVERY PREFIX, not only at the end`, () => {
      for (const size of [1, 2, 3, 5, 7, 11, 13]) {
        let buf = new Uint8Array(0);
        let acc = '';
        for (let p = 0; p < c.text.length; p += size) {
          const part = c.text.slice(p, p + size);
          buf = admitToBuffer(buf, enc.encode(part));
          acc += part;
          expect(dec.decode(buf)).toBe(scrubText(acc));
        }
      }
    });
  }
});

describe('PERSIST-10a cross-family — the contingent tail, across families', () => {
  it('a github body ending in `xoxb` is a credential only until the `-` arrives', () => {
    // `ghp_ABCDExoxb` is a complete github-token match ONLY while `xoxb` counts as body; drop those four
    // bytes and the body is five characters, one short of the floor. One more byte decides it.
    const stem = 'ghp_ABCDExoxb';
    expect(scrubText(stem)).toBe('[REDACTED]'); // alone, it IS a credential
    // ...and the `-` un-makes it, promoting `xoxb-` to the head of a SLACK credential
    expect(scrubText(`${stem}-ABCDEF`)).toBe('ghp_ABCDE[REDACTED]');
    // the streaming path must agree at every split, including the one placed inside the ambiguity
    for (const { label, parts } of everyChunking(`${stem}-ABCDEF`)) {
      const got = dec.decode(admitAll(parts));
      if (got !== 'ghp_ABCDE[REDACTED]') throw new Error(`${label}: ${JSON.stringify(got)}`);
    }
    // mid-stream the buffer holds the SCRUBBED reading, never the raw candidate
    const partial = admitToBuffer(new Uint8Array(0), enc.encode(stem));
    assertExactBytes(partial, '[REDACTED]');
    assertExactBytes(admitToBuffer(partial, enc.encode('-ABCDEF')), 'ghp_ABCDE[REDACTED]');
  });

  it('a slack body ending in `ghp` is a credential only until the `_` arrives', () => {
    const stem = 'xoxb-ABCDEghp';
    expect(scrubText(stem)).toBe('[REDACTED]');
    expect(scrubText(`${stem}_ABCDEF`)).toBe('xoxb-ABCDE[REDACTED]');
    for (const { label, parts } of everyChunking(`${stem}_ABCDEF`)) {
      const got = dec.decode(admitAll(parts));
      if (got !== 'xoxb-ABCDE[REDACTED]') throw new Error(`${label}: ${JSON.stringify(got)}`);
    }
  });
});

describe('PERSIST-10a cross-family — the DECLARED Slack over-redaction', () => {
  // `-` is both the Slack segment separator and, necessarily, a Slack body character: a real token is
  // `xoxb-<id>-<id>-<secret>`, so excluding `-` would match only the first segment and ship the trailing
  // entropy-bearing segment in the clear. The cost is that hyphen-joined NON-secret text immediately after
  // a Slack token is absorbed. This test pins that cost so it can never be discovered by surprise.
  it('hyphen-joined text after a Slack token IS absorbed — the accepted cost, pinned', () => {
    expect(scrubText('xoxb-A1B2C3-not-part-of-token')).toBe('[REDACTED]');
    // it stops at the first non-body byte, so the damage is bounded and never reaches the next line
    expect(scrubText('xoxb-A1B2C3-not-part-of-token end of line')).toBe('[REDACTED] end of line');
    expect(scrubText('xoxb-A1B2C3-not-part\nnext line')).toBe('[REDACTED]\nnext line');
    expect(scrubText('xoxb-A1B2C3-not="quoted"')).toBe('[REDACTED]="quoted"');
    // and the streaming path over-redacts identically — the cost does not depend on chunking
    for (const { parts } of everyChunking('xoxb-A1B2C3-not-part-of-token end of line')) {
      expect(dec.decode(admitAll(parts))).toBe('[REDACTED] end of line');
    }
  });

  it('the GitHub family is NOT affected — `-` and `_` terminate its body', () => {
    expect(scrubText('ghp_A1B2C3D4-not-part-of-token')).toBe('[REDACTED]-not-part-of-token');
    expect(scrubText('ghp_A1B2C3D4_prod')).toBe('[REDACTED]_prod');
  });

  it('the KNOWN pre-existing absorption of trailing alphanumerics is unchanged by this seat', () => {
    // Not introduced here and not fixed here: `{6,}` is unbounded, so trailing token characters are eaten.
    expect(scrubText('ghp_A1B2C3D4foo')).toBe('[REDACTED]');
    expect(scrubText('xoxb-A1B2C3D4foo')).toBe('[REDACTED]');
  });
});

describe('PERSIST-10a cross-family — an undeclared shape is NOT redacted, and says so', () => {
  it('only the declared families are covered — everything else passes through verbatim', () => {
    // The honest scope. These are all real credential shapes; none is declared, so none is redacted.
    for (const undeclared of [
      'github_pat_11ABCDEFG0abcdefghij_KLMNOPQRSTUVWXYZ012345', // fine-grained PAT (see scrub-shapes.ts)
      'AKIAIOSFODNN7EXAMPLE', // AWS access key id
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.NOTAREALSIGNATURE', // JWT
      '-----BEGIN PRIVATE KEY-----NOTAREAL-----END PRIVATE KEY-----', // PEM
    ]) {
      expect(scrubText(undeclared)).toBe(undeclared);
    }
  });
});
