// @atlas/kernel — src/canonical.ts  (canonicalForm + id — content-addressed object identity)
//
// The RFC-8785/JCS-subset preimage (KERNEL-1): keys sorted, strings NFC, one fixed escape, floats
// forbidden. INVARIANT: mutable side-indexes (grounding/status/freshness) are EXCLUDED at every level
// (KERNEL-8), and `id` reaches the digest ONLY through the encoder seam (KERNEL-2a) — no local primitive.

import type { Hash } from '@atlas/contracts';
import type { CasObject } from './types.js';
import { defaultEncoder } from './encoder.js';

/**
 * The canonical-form contract (frozen): the §3.2 RFC-8785/JCS-subset preimage every encoder reproduces
 * byte-for-byte (KERNEL-1); `id = hash(canonicalForm(obj))` is the only sanctioned identity computation.
 */
export interface CanonicalApi {
  /** The RFC-8785/JCS-subset canonical preimage bytes (sorted keys, NFC, no floats). The bytes handed
   *  to the encoder seam; MUST exclude mutable side-indexes (KERNEL-8). (atlas-kernel:39-41) */
  canonicalForm(obj: CasObject): Uint8Array;
  /** `Encoder.hash(canonicalForm(obj))` — content-addressed identity; MUST NOT be hand-rolled
   *  (KERNEL-1). (atlas-kernel:39-41, 98) */
  id(obj: CasObject): Hash;
}

/** Mutable side-indexes excluded from the canonical preimage (KERNEL-8) — recomputed, never a key. */
const SIDE_INDEX: ReadonlySet<string> = new Set(['grounding', 'status', 'freshness']);

const UTF8 = new TextEncoder();

/** Serialize one JSON value into its canonical string form. Recursive; total over JSON except that a
 *  non-integer / non-finite number is a canonical-form violation and throws (floats forbidden). */
function serialize(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  switch (typeof v) {
    case 'boolean':
      return v ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(v) || !Number.isInteger(v)) {
        throw new Error('canonical-form violation: floats forbidden (non-integer/non-finite number)');
      }
      return String(v);
    case 'string':
      // NFC + one fixed escape policy (JSON string escaping).
      return JSON.stringify(v.normalize('NFC'));
    case 'object': {
      if (Array.isArray(v)) return `[${v.map(serialize).join(',')}]`;
      const o = v as Record<string, unknown>;
      const entries = Object.keys(o)
        .filter((k) => !SIDE_INDEX.has(k) && o[k] !== undefined)
        .map((k) => [k.normalize('NFC'), o[k]] as const)
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      return `{${entries.map(([k, val]) => `${JSON.stringify(k)}:${serialize(val)}`).join(',')}}`;
    }
    default:
      // bigint / symbol / function are not JSON — a canonical-form violation.
      throw new Error(`canonical-form violation: unsupported value type ${typeof v}`);
  }
}

/**
 * The RFC-8785/JCS-subset canonical preimage bytes (sorted keys, NFC, floats forbidden, one fixed escape),
 * with the mutable side-indexes excluded (KERNEL-8). These are the exact bytes handed to the encoder seam.
 */
export function canonicalForm(obj: CasObject): Uint8Array {
  return UTF8.encode(serialize(obj));
}

/**
 * Content-addressed identity: `id = Encoder.hash(canonicalForm(obj))` (KERNEL-1), reached only through the
 * encoder seam (KERNEL-2a). Never hand-rolled — a caller-supplied id that ≠ this value is not the object's
 * identity.
 */
export function id(obj: CasObject): Hash {
  return defaultEncoder.hash(canonicalForm(obj));
}
