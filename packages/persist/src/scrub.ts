// @atlas/persist — src/scrub.ts  (WP-3.5-a.PERSIST · PERSIST-10a)
//
// Redact-at-source — the PRIMARY credential control. `scrub` drops known credential SHAPES and the write
// gate `admitToBuffer` scrubs a chunk BEFORE it enters the immutable content-addressed buffer (not a post-hoc
// scan). Secrets are redacted WITHOUT abridging the record — every non-secret byte is preserved (0 over-redaction).
//
// ── THE SEAM INVARIANT (why this file carries state) ─────────────────────────────────────────────────
// A credential does not arrive aligned to a caller's chunk boundary. Scrubbing each chunk in ISOLATION
// therefore admits a secret that straddles two admits: `ghp_ABCDEF|GHIJ` is two non-matching halves, and
// `TranscriptStoreApi` is put/fetch only, so a secret admitted once can never be removed. The invariant
// this file now enforces is CHUNK INDEPENDENCE:
//
//     for every way a byte stream is cut into chunks,
//         chunks.reduce(admitToBuffer, empty)  ===  scrub(whole stream)
//
// It holds at EVERY prefix, not just at the end: the buffer after N admits equals `scrub` of the first N
// chunks concatenated. There is no flush step and no deferred tail — see `seam` for how that is achieved.
//
// ── ADJACENCY (why the body class carries a lookahead) ───────────────────────────────────────────────
// `[A-Za-z0-9]{6,}` is GREEDY over characters that also spell a family prefix, so two credentials written
// back to back merged into ONE match: `ghp_AAAAAAghp_BBBBBB` matched through `…AAAAAAghp` and left
// `[REDACTED]_BBBBBB` — the second credential's entropy-bearing body shipped in the clear, and the
// non-secret bytes of a near-miss like `ghp_ABCDE` immediately before a real token were eaten with it.
// A credential body therefore STOPS at the start of the next family prefix (`BODY` below). That is a
// property of the SHAPE, so it must hold across a chunk seam too, where a lookahead cannot see: the seam
// machinery below decides a candidate only once the bytes the lookahead needs have actually arrived.

/** Redact-at-source surface (PERSIST-10a): `scrub(buffer)` drops known credential shapes BEFORE the body
 *  is stored; every non-secret byte preserved (no over-redaction). (method-tags-pst:91-92) */
export interface ScrubApi {
  scrub(buffer: Uint8Array): Uint8Array;
}

/**
 * A credential SHAPE, described completely enough to be recognised ACROSS a chunk boundary. `full` alone is
 * not enough: to decide the tail of a chunk you must also know what a not-yet-complete prefix looks like
 * (`partial`), which bytes a complete match would keep absorbing (`cont`), and which trailing bytes are
 * still AMBIGUOUS because one more byte would turn them into the family prefix of the NEXT credential
 * (`blockPrefix`). Declaring a shape without those is what let a split — and then an adjacent — secret
 * through, so they are part of the shape, not of the algorithm.
 */
interface CredentialShape {
  /** g-flagged; matches a COMPLETE credential. The single source of truth for what `scrub` redacts. */
  readonly full: RegExp;
  /** Anchored; matches a STRICT prefix — not a credential yet, but one more byte could make it one. */
  readonly partial: RegExp;
  /** Anchored; the run of bytes a COMPLETE match keeps absorbing greedily (its body character class). */
  readonly cont: RegExp;
  /** End-anchored; the longest trailing run that is a STRICT prefix of this shape's family prefix. Those
   *  bytes cannot be classified until the next byte arrives: they are either body, or the head of the
   *  credential that follows. Never longer than the family prefix minus one. */
  readonly blockPrefix: RegExp;
  /** The shortest string `full` can match — the floor a candidate must clear WITHOUT its ambiguous tail. */
  readonly minFull: number;
  /** The longest string `partial` can match. */
  readonly maxPartial: number;
  /** The longest COMPLETE match whose completeness still depends on its ambiguous tail (see `seam`). */
  readonly maxContingent: number;
}

// The GitHub token family: `gh[pousr]_` + >= 6 token chars. Matched by shape (never by a hard-coded secret
// literal) so an unseen secret of the same family is caught too. `BODY` is a token character that does NOT
// open the next family prefix — that single lookahead is what stops one credential from swallowing the one
// written immediately after it.
const FAMILY_PREFIX = 'gh[pousr]_';
const BODY = `(?:(?!${FAMILY_PREFIX})[A-Za-z0-9])`;

const SHAPES: readonly CredentialShape[] = [
  {
    full: new RegExp(`${FAMILY_PREFIX}${BODY}{6,}`, 'g'),
    partial: /^(?:g|gh|gh[pousr]|gh[pousr]_[A-Za-z0-9]{0,5})$/,
    cont: new RegExp(`^${BODY}*`),
    blockPrefix: /(?:gh[pousr]|gh|g)$/,
    minFull: 10, // 'gh' + family + '_' + the six-character floor
    // 'g' 'h' family '_' + five token chars = 9: one short of the {6,} floor.
    maxPartial: 9,
    // A complete match is CONTINGENT while dropping its ambiguous tail (<= 3 bytes: 'g' / 'gh' / 'ghX')
    // would drop it back below the floor. The longest such match is 'gh'+fam+'_' + five body + 'ghX' = 12.
    maxContingent: 12,
  },
];

const CREDENTIAL_SHAPES: readonly RegExp[] = SHAPES.map((s) => s.full);

/** The redaction placeholder written in place of a matched secret (redaction, not deletion of the line). */
const REDACTION = '[REDACTED]';

/**
 * The hard ceiling on bytes an in-progress stream may hold undecided at a chunk seam. A caller streaming
 * 100MB cannot make the scrubber retain it: a COMPLETE match is redacted immediately and its greedy tail is
 * absorbed byte-by-byte, so only a candidate that is still strictly-incomplete — or whose completeness is
 * contingent on bytes that have not arrived — is ever carried, and that is bounded by the shape itself.
 * State per buffer is O(1); nothing accumulates.
 */
export const MAX_SEAM_CARRY = SHAPES.reduce((n, s) => Math.max(n, s.maxPartial, s.maxContingent), 0);

// Byte-preserving latin1 view: each byte <-> exactly one char (1:1, reversible). Scanning/replacing on this
// view leaves every NON-matching byte byte-identical — no UTF-8 normalization, no over-redaction of the
// bytes adjacent to a secret.
function toLatin1(bytes: Uint8Array): string {
  let s = '';
  // Batched so a multi-megabyte stream does not pay quadratic string building; each byte still maps to
  // exactly one char, so the result is identical to a byte-at-a-time build.
  for (let i = 0; i < bytes.length; i += 4096) {
    s += String.fromCharCode(...bytes.subarray(i, i + 4096));
  }
  return s;
}

function fromLatin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

/** TOTAL input coercion. An input whose bytes cannot be read is WITHHELD (treated as empty) rather than
 *  passed through unscrubbed — a scrubber that throws, or that forwards what it could not inspect, is a
 *  scrubber that fails open. Nothing in this module throws on any input. */
function asBytes(v: unknown): Uint8Array {
  if (v instanceof Uint8Array) return v;
  if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  return new Uint8Array(0);
}

function scrubString(s: string): string {
  let out = s;
  for (const re of CREDENTIAL_SHAPES) out = out.replace(re, REDACTION);
  return out;
}

/**
 * Redact known credential shapes from a transcript buffer at source (PERSIST-10a). Every non-secret byte is
 * preserved — only a matched secret is replaced by the redaction placeholder (0 over-redaction).
 */
export function scrub(buffer: Uint8Array): Uint8Array {
  return fromLatin1(scrubString(toLatin1(asBytes(buffer))));
}

// ── the seam machinery ──────────────────────────────────────────────────────────────────────────────

/**
 * What a buffer still owes the next admit.
 *
 *  - `back`    how many trailing bytes of the EMITTED buffer are provisional and will be rewritten.
 *  - `raw`     what those provisional bytes really were. They are emitted ALREADY SCRUBBED, so a candidate
 *              whose fate is still contingent shows up as a placeholder rather than as a raw credential;
 *              `raw` is what gets re-decided once the deciding bytes arrive. For a stream with nothing
 *              contingent, `raw` is byte-identical to what was emitted.
 *  - `swallow` the shape whose greedy body is still being absorbed (-1 = none).
 *  - `pending` bytes that were NOT emitted because they are inside a redaction already written, but which
 *              one more byte could reveal to be the family prefix of the NEXT credential. Bounded by the
 *              family prefix length minus one (3).
 *
 * `raw`/`back` and `swallow`/`pending` are mutually exclusive by construction.
 */
interface SeamState {
  readonly back: number;
  readonly raw: string;
  readonly swallow: number;
  readonly pending: string;
}

const FRESH: SeamState = { back: 0, raw: '', swallow: -1, pending: '' };

// State is keyed on the IDENTITY of the buffer this module returned, so the published `admitToBuffer`
// signature is unchanged and the ordinary `buffer = admitToBuffer(buffer, chunk)` fold carries it for free.
// A buffer we did not produce (a caller-built `new Uint8Array(0)`, a fetched body) starts a FRESH stream —
// the conservative reading, since we cannot know what preceded it. WeakMap so nothing is retained.
const SEAM = new WeakMap<Uint8Array, SeamState>();

/** How many trailing bytes of `buffer` are still provisional — always <= {@link MAX_SEAM_CARRY}. Those
 *  bytes are never a raw credential: they are `scrub` of the bytes they stand for. */
export function seamCarryOf(buffer: Uint8Array): number {
  return (SEAM.get(asBytes(buffer)) ?? FRESH).back;
}

/** The trailing bytes of `s` that are a strict prefix of the shape's family prefix — undecidable until the
 *  next byte arrives, because they are either body characters or the head of the NEXT credential. */
function ambiguousTail(shape: CredentialShape, s: string): string {
  return shape.blockPrefix.exec(s)?.[0] ?? '';
}

/** For one shape: where does the UNDECIDED tail of `s` begin, is it already a complete credential, and
 *  which of its trailing bytes stay ambiguous? Walks `s` exactly the way a global `replace` walks it, so
 *  completed matches are skipped rather than re-entered, and only a candidate that survives to the end of
 *  `s` is undecided. */
function undecided(s: string, shape: CredentialShape): { cut: number; complete: boolean; absorbed: string } {
  const re = new RegExp(shape.full.source, 'g');
  let after = 0;
  for (let m = re.exec(s); m !== null; m = re.exec(s)) {
    const end = m.index + m[0].length;
    // A match touching the end can still GROW with the next chunk — it is the undecided tail.
    if (end === s.length) {
      const amb = ambiguousTail(shape, m[0]);
      // Clears the floor even WITHOUT its ambiguous tail: it is a credential either way, so redact now and
      // re-offer those trailing bytes to the next chunk (they may open the credential that follows).
      if (m[0].length - amb.length >= shape.minFull) return { cut: m.index, complete: true, absorbed: amb };
      // CONTINGENT: it is a match only while those bytes are read as body. One more byte decides it, so the
      // whole candidate is carried (emitted scrubbed) rather than committed to.
      return { cut: m.index, complete: false, absorbed: '' };
    }
    after = end;
    re.lastIndex = m[0].length === 0 ? end + 1 : end; // total: a zero-width shape cannot spin here
  }
  // No match reaches the end. Only the last `maxPartial` positions can host an incomplete prefix, so this
  // costs O(1) per chunk rather than rescanning the whole chunk.
  for (let j = Math.max(after, s.length - shape.maxPartial); j < s.length; j++) {
    if (shape.partial.test(s.slice(j))) return { cut: j, complete: false, absorbed: '' };
  }
  return { cut: s.length, complete: false, absorbed: '' };
}

/**
 * Decide as much of `s` as can be decided without seeing the next chunk, and say what must be remembered.
 *
 * The shape of the fix is DECIDE-AND-ABSORB rather than buffer-until-excluded: a match is redacted the
 * moment it is complete, and the greedy remainder of its body is then absorbed from the following chunks.
 * That is what keeps the bound at twelve bytes — buffering until a pattern can be excluded would mean
 * holding an unbounded token body, since the shape's `{6,}` has no upper length, which is a memory DoS from
 * ordinary use. Only a candidate that is still incomplete, or whose completeness is CONTINGENT on bytes
 * that have not arrived, is ever held back — and it is held in the returned buffer in its SCRUBBED form,
 * so what the caller can read is always exactly `scrub` of what it has written so far. Hence: no flush step,
 * and no window in which the buffer holds a raw credential.
 */
function seam(prev: SeamState, input: string): { emit: string; state: SeamState } {
  let s = prev.raw + prev.pending + input;
  const shape = SHAPES[prev.swallow];
  if (shape !== undefined) {
    const run = shape.cont.exec(s)?.[0] ?? '';
    // Still inside the greedy body of an already-redacted match: those bytes belong to the secret. Only the
    // ambiguous tail is held back — it may turn out to open the NEXT credential instead.
    if (run.length === s.length) {
      return { emit: '', state: { back: 0, raw: '', swallow: prev.swallow, pending: ambiguousTail(shape, run) } };
    }
    s = s.slice(run.length);
  }

  let cut = s.length;
  let complete = false;
  let shapeIdx = -1;
  let absorbed = '';
  for (let i = 0; i < SHAPES.length; i++) {
    const c = undecided(s, SHAPES[i]!);
    if (c.cut < cut || (c.cut === cut && c.complete && !complete)) {
      cut = c.cut;
      complete = c.complete;
      shapeIdx = i;
      absorbed = c.absorbed;
    }
  }

  const head = scrubString(s.slice(0, cut));
  const tail = s.slice(cut);
  if (complete) return { emit: head + REDACTION, state: { back: 0, raw: '', swallow: shapeIdx, pending: absorbed } };

  // FAIL-CLOSED, unconditionally: the provisional tail enters the buffer only as `scrub` of itself. If a
  // future shape ever breaks the cut analysis, the failure is a missed JOIN across the seam — never a raw
  // credential in an immutable, undeletable record. The declared bound is enforced here too: a tail that
  // exceeds it is decided now rather than carried.
  const provisional = scrubString(tail);
  if (tail.length > MAX_SEAM_CARRY) return { emit: head + provisional, state: FRESH };
  return { emit: head + provisional, state: { back: provisional.length, raw: tail, swallow: -1, pending: '' } };
}

/**
 * The redact-at-source WRITE gate: scrub a chunk BEFORE admitting it to the transcript buffer, so the raw
 * credential never enters the buffer in the first place (the primary control, not a post-hoc scan). Returns
 * the buffer with the scrubbed chunk appended, RE-EXAMINING the seam so a credential split across two calls
 * — or written immediately after another one — is caught. Total: never throws, for any input.
 */
export function admitToBuffer(existing: Uint8Array, chunk: Uint8Array): Uint8Array {
  const prev = asBytes(existing);
  const known = SEAM.get(prev);
  const st = known ?? FRESH;
  // For a buffer we did not produce (resumed from a fetched body, rebuilt by a caller) there is no state to
  // read, so re-examine the widest window a split credential could occupy rather than assuming the seam is
  // clean. For our own buffers this is exactly the provisional region recorded when it was written.
  const back = Math.min(known === undefined ? MAX_SEAM_CARRY : st.back, prev.length);
  const keep = prev.length - back;
  const raw = known === undefined ? toLatin1(prev.subarray(keep)) : st.raw;
  const { emit, state } = seam({ ...st, back, raw }, toLatin1(asBytes(chunk)));

  const emitted = fromLatin1(emit);
  const out = new Uint8Array(keep + emitted.length);
  out.set(prev.subarray(0, keep), 0);
  out.set(emitted, keep);
  SEAM.set(out, state);
  return out;
}

// differential-vs-oracle (compile-time): `scrub` conforms to the co-located frozen ScrubApi.
const _api: ScrubApi = { scrub };
void _api;
