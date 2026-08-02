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

/** Redact-at-source surface (PERSIST-10a): `scrub(buffer)` drops known credential shapes BEFORE the body
 *  is stored; every non-secret byte preserved (no over-redaction). (method-tags-pst:91-92) */
export interface ScrubApi {
  scrub(buffer: Uint8Array): Uint8Array;
}

/**
 * A credential SHAPE, described completely enough to be recognised ACROSS a chunk boundary. `full` alone is
 * not enough: to decide the tail of a chunk you must also know what a not-yet-complete prefix looks like
 * (`partial`) and which bytes a complete match would keep absorbing (`cont`). Declaring a shape without
 * those two is what let a split secret through, so they are part of the shape, not of the algorithm.
 */
interface CredentialShape {
  /** g-flagged; matches a COMPLETE credential. The single source of truth for what `scrub` redacts. */
  readonly full: RegExp;
  /** Anchored; matches a STRICT prefix — not a credential yet, but one more byte could make it one. */
  readonly partial: RegExp;
  /** Anchored; the run of bytes a COMPLETE match keeps absorbing greedily (its body character class). */
  readonly cont: RegExp;
  /** The longest string `partial` can match — the per-shape bound on how much may be carried over a seam. */
  readonly maxPartial: number;
}

// Known credential SHAPES, matched by shape (never by a hard-coded secret literal) so an unseen secret of
// the same family is caught too. GitHub token family: ghp_/gho_/ghu_/ghs_/ghr_ + >=6 token chars.
const SHAPES: readonly CredentialShape[] = [
  {
    full: /gh[pousr]_[A-Za-z0-9]{6,}/g,
    partial: /^(?:g|gh|gh[pousr]|gh[pousr]_[A-Za-z0-9]{0,5})$/,
    cont: /^[A-Za-z0-9]*/,
    // 'g' 'h' family '_' + five token chars = 9: one short of the {6,} floor, so nine bytes is the most
    // that can ever be undecided. This is the memory bound; it is asserted, not assumed (MAX_SEAM_CARRY).
    maxPartial: 9,
  },
];

const CREDENTIAL_SHAPES: readonly RegExp[] = SHAPES.map((s) => s.full);

/** The redaction placeholder written in place of a matched secret (redaction, not deletion of the line). */
const REDACTION = '[REDACTED]';

/**
 * The hard ceiling on bytes an in-progress stream may hold undecided at a chunk seam. A caller streaming
 * 100MB cannot make the scrubber retain it: a COMPLETE match is redacted immediately and its greedy tail is
 * absorbed byte-by-byte, so only a strictly-INCOMPLETE prefix is ever carried, and that is bounded by the
 * shape itself. State per buffer is O(1); nothing accumulates.
 */
export const MAX_SEAM_CARRY = SHAPES.reduce((n, s) => Math.max(n, s.maxPartial), 0);

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

/** What a buffer still owes the next admit: `carry` trailing bytes of it are PROVISIONAL (an incomplete
 *  credential prefix, re-examined next time), and `swallow` names the shape whose greedy body is still
 *  being absorbed (-1 = none). `carry` and `swallow` are mutually exclusive by construction. */
interface SeamState {
  readonly carry: number;
  readonly swallow: number;
}

const FRESH: SeamState = { carry: 0, swallow: -1 };

// State is keyed on the IDENTITY of the buffer this module returned, so the published `admitToBuffer`
// signature is unchanged and the ordinary `buffer = admitToBuffer(buffer, chunk)` fold carries it for free.
// A buffer we did not produce (a caller-built `new Uint8Array(0)`, a fetched body) starts a FRESH stream —
// the conservative reading, since we cannot know what preceded it. WeakMap so nothing is retained.
const SEAM = new WeakMap<Uint8Array, SeamState>();

/** How many trailing bytes of `buffer` are still provisional — always <= {@link MAX_SEAM_CARRY}. Those
 *  bytes are, by construction, an INCOMPLETE credential prefix: never a credential. */
export function seamCarryOf(buffer: Uint8Array): number {
  return (SEAM.get(asBytes(buffer)) ?? FRESH).carry;
}

/** For one shape: where does the UNDECIDED tail of `s` begin, and is it already a complete credential?
 *  Walks `s` exactly the way a global `replace` walks it, so completed matches are skipped rather than
 *  re-entered, and only a candidate that survives to the end of `s` is undecided. */
function undecided(s: string, shape: CredentialShape): { cut: number; complete: boolean } {
  const re = new RegExp(shape.full.source, 'g');
  let after = 0;
  for (let m = re.exec(s); m !== null; m = re.exec(s)) {
    const end = m.index + m[0].length;
    // A match touching the end can still GROW with the next chunk — it is the undecided tail.
    if (end === s.length) return { cut: m.index, complete: true };
    after = end;
    re.lastIndex = m[0].length === 0 ? end + 1 : end; // total: a zero-width shape cannot spin here
  }
  // No match reaches the end. Only the last `maxPartial` positions can host an incomplete prefix, so this
  // costs O(1) per chunk rather than rescanning the whole chunk.
  for (let j = Math.max(after, s.length - shape.maxPartial); j < s.length; j++) {
    if (shape.partial.test(s.slice(j))) return { cut: j, complete: false };
  }
  return { cut: s.length, complete: false };
}

/**
 * Decide as much of `s` as can be decided without seeing the next chunk, and say what must be remembered.
 *
 * The shape of the fix is DECIDE-AND-ABSORB rather than buffer-until-excluded: a match is redacted the
 * moment it is complete, and the greedy remainder of its body is then absorbed from the following chunks.
 * That is what keeps the bound at nine bytes — buffering until a pattern can be excluded would mean holding
 * an unbounded token body, since the shape's `{6,}` has no upper length, which is a memory DoS from
 * ordinary use. Only a strictly-INCOMPLETE prefix is ever held back, and it is held IN the returned buffer
 * (it is not a credential, so it is safe to show) and rewritten on the next admit. Hence: no flush step.
 */
function seam(input: string, swallowIn: number): { emit: string; state: SeamState } {
  let s = input;
  if (swallowIn >= 0) {
    const shape = SHAPES[swallowIn];
    const run = shape === undefined ? '' : (shape.cont.exec(s)?.[0] ?? '');
    // Still inside the greedy body of an already-redacted match: those bytes belong to the secret.
    if (run.length === s.length) return { emit: '', state: { carry: 0, swallow: swallowIn } };
    s = s.slice(run.length);
  }

  let cut = s.length;
  let complete = false;
  let shapeIdx = -1;
  for (let i = 0; i < SHAPES.length; i++) {
    const c = undecided(s, SHAPES[i]!);
    if (c.cut < cut || (c.cut === cut && c.complete && !complete)) {
      cut = c.cut;
      complete = c.complete;
      shapeIdx = i;
    }
  }

  const head = scrubString(s.slice(0, cut));
  const tail = s.slice(cut);
  if (complete) return { emit: head + REDACTION, state: { carry: 0, swallow: shapeIdx } };

  // FAIL-CLOSED backstop, independent of the analysis above: bytes are only handed to the buffer verbatim
  // if `scrub` itself agrees they hold no credential, and only if they fit the declared bound. If a future
  // shape ever breaks the cut analysis, the failure is a missed JOIN across the seam — never a raw
  // credential in an immutable, undeletable record.
  const scrubbedTail = scrubString(tail);
  if (scrubbedTail !== tail || tail.length > MAX_SEAM_CARRY) {
    return { emit: head + scrubbedTail, state: FRESH };
  }
  return { emit: head + tail, state: { carry: tail.length, swallow: -1 } };
}

/**
 * The redact-at-source WRITE gate: scrub a chunk BEFORE admitting it to the transcript buffer, so the raw
 * credential never enters the buffer in the first place (the primary control, not a post-hoc scan). Returns
 * the buffer with the scrubbed chunk appended, RE-EXAMINING the seam so a credential split across two calls
 * is caught. Total: never throws, for any input.
 */
export function admitToBuffer(existing: Uint8Array, chunk: Uint8Array): Uint8Array {
  const prev = asBytes(existing);
  const known = SEAM.get(prev);
  const st = known ?? FRESH;
  // For a buffer we did not produce (resumed from a fetched body, rebuilt by a caller) there is no state to
  // read, so re-examine the widest window a split credential could occupy rather than assuming the seam is
  // clean. For our own buffers this is a no-op: their decided tail is already known to host no candidate.
  const window = known === undefined ? MAX_SEAM_CARRY : st.carry;
  const keep = prev.length - Math.min(window, prev.length);
  const { emit, state } = seam(toLatin1(prev.subarray(keep)) + toLatin1(asBytes(chunk)), st.swallow);

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
