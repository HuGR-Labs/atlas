// @atlas/persist — test/adjacency-oracle.ts  (WP-3.5-a.PERSIST · PERSIST-10a — fuzz ground truth)
//
// Shared, INDEPENDENT machinery for the adjacency fuzz. Nothing here imports the product: the credential
// scanner below is a hand-written character walk (no regex at all), so a mistake in the shipped regex cannot
// be reproduced here and cancel itself out in the differential.
//
// The rule it encodes is the shipped SHAPE rule, stated once, in prose:
//   a credential is `gh[pousr]_` followed by >= 6 characters of [A-Za-z0-9],
//   and that body STOPS at the start of the next `gh[pousr]_` — a credential body never swallows the
//   family prefix of the credential that follows it (which is exactly how `ghp_AAAAAAghp_BBBBBB` used to
//   collapse into one match and ship the second body in the clear).
// Matches are leftmost, and scanning resumes after a match (never inside it).

const FAMILY = 'pousr';

/** Is `s[i]` a token-body character? charCode walk — deliberately not a regex. */
export function isBodyChar(s: string, i: number): boolean {
  const c = s.charCodeAt(i);
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

/** Does a complete family prefix `gh[pousr]_` start at `i`? */
export function blockerAt(s: string, i: number): boolean {
  return (
    s[i] === 'g' && s[i + 1] === 'h' && s[i + 2] !== undefined && FAMILY.includes(s[i + 2] as string) && s[i + 3] === '_'
  );
}

/** Every credential occurrence in `s`, as half-open [start,end) spans, leftmost-first and non-overlapping. */
export function credentialSpans(s: string): readonly { readonly start: number; readonly end: number }[] {
  const spans: { start: number; end: number }[] = [];
  let i = 0;
  while (i < s.length) {
    if (blockerAt(s, i)) {
      let j = i + 4;
      while (j < s.length && isBodyChar(s, j) && !blockerAt(s, j)) j++;
      if (j - (i + 4) >= 6) {
        spans.push({ start: i, end: j });
        i = j;
        continue;
      }
    }
    i++;
  }
  return spans;
}

/** True if `s` still contains a whole credential shape (the residual-shape post-condition). */
export function hasCredentialShape(s: string): boolean {
  return credentialSpans(s).length > 0;
}

/** The reference redaction: every credential span replaced, every other byte kept. */
export function referenceScrub(s: string, redaction = '[REDACTED]'): string {
  let out = '';
  let at = 0;
  for (const { start, end } of credentialSpans(s)) {
    out += s.slice(at, start) + redaction;
    at = end;
  }
  return out + s.slice(at);
}

/** Deterministic LCG — same generator the shipped sweep uses, so cases are reproducible from the seed. */
export function lcg(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

const BODY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** CLEAN filler. EVERY piece starts with a character that is NOT a body character, so no piece can ever be
 *  absorbed into the body of a credential that precedes it — that is what makes the expected output below
 *  exactly computable, and what makes a missing piece unambiguously OVER-redaction. Several pieces are
 *  near-misses (short body, wrong family, a literal placeholder, an `_suffix`) so the generator probes the
 *  boundary rather than only the easy middle. */
export const CLEAN_PIECES: readonly string[] = [
  ' ',
  ' token=',
  '\n',
  ' [REDACTED] ',
  ' ghp_ABCDE', // five body chars: below the floor, NOT a credential — and no trailing separator
  ' gha_ABCDEFGH', // not a family member
  '_prod', // the `_suffix` bytes the widen-the-body-class variant eats
  ' gho_',
  '=',
  '!',
  ' end of line',
  '.',
  ' 09:14 UTC ',
  '_suffix.log',
  ' gh',
  ':',
];

export interface FuzzCase {
  /** The generated stream. */
  readonly text: string;
  /** The exactly-correct redaction, computed from the construction (not from any implementation). */
  readonly expected: string;
  /** The entropy-bearing bodies of the injected credentials — none may survive in the output. */
  readonly bodies: readonly string[];
  /** The clean pieces, in order — every one must survive verbatim. */
  readonly clean: readonly string[];
}

/**
 * Build one fuzz case: clean filler interleaved with RUNS of credentials, where a run is 1..3 credentials
 * with NO separator between them (the class the shipped sweep could never reach — it injected exactly one
 * token per case) or joined by a single `_`.
 */
export function makeCase(rnd: () => number, opts: { readonly minRun: number; readonly maxRun: number }): FuzzCase {
  const bodies: string[] = [];
  const clean: string[] = [];
  let text = '';
  let expected = '';
  const items = 1 + Math.floor(rnd() * 4);
  for (let k = 0; k < items; k++) {
    if (rnd() < 0.45) {
      const piece = CLEAN_PIECES[Math.floor(rnd() * CLEAN_PIECES.length)] as string;
      clean.push(piece);
      text += piece;
      expected += piece;
      continue;
    }
    const run = opts.minRun + Math.floor(rnd() * (opts.maxRun - opts.minRun + 1));
    const glue = rnd() < 0.5 ? '' : '_'; // ADJACENT, or separated by a single `_`
    for (let t = 0; t < run; t++) {
      const fam = FAMILY[Math.floor(rnd() * FAMILY.length)] as string;
      const len = 6 + Math.floor(rnd() * 10);
      let body = '';
      for (let i = 0; i < len; i++) body += BODY_ALPHABET[Math.floor(rnd() * BODY_ALPHABET.length)] as string;
      bodies.push(body);
      text += (t === 0 ? '' : glue) + `gh${fam}_${body}`;
      expected += (t === 0 ? '' : glue) + '[REDACTED]';
    }
  }
  return { text, expected, bodies, clean };
}

/** Cut `s` into random chunks of 1..maxLen characters. */
export function chunkRandomly(s: string, rnd: () => number, maxLen = 5): readonly string[] {
  const parts: string[] = [];
  let p = 0;
  while (p < s.length) {
    const len = 1 + Math.floor(rnd() * maxLen);
    parts.push(s.slice(p, p + len));
    p += len;
  }
  return parts;
}
