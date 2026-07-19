// @atlas/persist — src/scrub.ts  (WP-3.5-a.PERSIST · PERSIST-10a)
//
// Redact-at-source — the PRIMARY credential control (atlas-persist:132-140). Because the transcript object
// is immutable + content-addressed, a captured secret would be permanent and hash-referenced, so no raw
// credential may enter it. `scrub(buffer)` drops known credential SHAPES BEFORE the body is stored, and the
// write-time gate `admitToBuffer` scrubs a chunk BEFORE it is admitted, so the raw credential never enters
// the transcript buffer in the first place (not a post-persistence scan). The scrub redacts secrets WITHOUT
// otherwise abridging the record — every non-secret byte is preserved (0 over-redaction).
//
// The ≥2-engine scanner (client + server-side pre-receive) is a BACKSTOP and is billy's FR-12 security
// domain (REQ-PERSIST-10a-c / 10a-d) — NOT modeled here.

import type { ScrubApi } from '../ref/scrub.js';

// Known credential SHAPES, matched by shape (never by a hard-coded secret literal) so an unseen secret of
// the same family is caught too. GitHub token family: ghp_/gho_/ghu_/ghs_/ghr_ + ≥6 token chars.
const CREDENTIAL_SHAPES: readonly RegExp[] = [/gh[pousr]_[A-Za-z0-9]{6,}/g];

/** The redaction placeholder written in place of a matched secret (redaction, not deletion of the line). */
const REDACTION = '[REDACTED]';

// Byte-preserving latin1 view: each byte ↔ exactly one char (1:1, reversible). Scanning/replacing on this
// view leaves every NON-matching byte byte-identical — no UTF-8 normalization, no over-redaction of the
// bytes adjacent to a secret.
function toLatin1(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return s;
}

function fromLatin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

/**
 * Redact known credential shapes from a transcript buffer at source (PERSIST-10a). Every non-secret byte is
 * preserved — only a matched secret is replaced by the redaction placeholder (0 over-redaction).
 */
export function scrub(buffer: Uint8Array): Uint8Array {
  let s = toLatin1(buffer);
  for (const re of CREDENTIAL_SHAPES) s = s.replace(re, REDACTION);
  return fromLatin1(s);
}

/**
 * The redact-at-source WRITE gate: scrub a chunk BEFORE admitting it to the transcript buffer, so the raw
 * credential never enters the buffer in the first place (the primary control, not a post-hoc scan). Returns
 * the buffer with the scrubbed chunk appended.
 */
export function admitToBuffer(existing: Uint8Array, chunk: Uint8Array): Uint8Array {
  const clean = scrub(chunk);
  const out = new Uint8Array(existing.length + clean.length);
  out.set(existing, 0);
  out.set(clean, existing.length);
  return out;
}

// differential-vs-oracle (compile-time): `scrub` conforms to the frozen ScrubApi (ref/scrub.ts).
const _api: ScrubApi = { scrub };
void _api;
