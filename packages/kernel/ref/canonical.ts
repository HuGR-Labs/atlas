// @atlas/kernel — ref/canonical.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The canonical-form contract: the §3.2 RFC-8785 / JCS subset preimage (sorted keys, Unicode NFC,
// floats forbidden, one fixed escape policy) that every encoder reproduces byte-for-byte (KERNEL-1).
// `id` = `hash(canonicalForm(obj))` — the only sanctioned way to compute an object's identity
// (atlas-kernel:39-41, 98). Grounding/status/freshness are OUT of the preimage (KERNEL-8).

import type { Hash } from '@atlas/contracts';
import type { CasObject } from './types.js';

export interface CanonicalApi {
  /** The RFC-8785/JCS-subset canonical preimage bytes (sorted keys, NFC, no floats). The bytes handed
   *  to the encoder seam; MUST exclude mutable side-indexes (KERNEL-8). (atlas-kernel:39-41) */
  canonicalForm(obj: CasObject): Uint8Array;
  /** `Encoder.hash(canonicalForm(obj))` — content-addressed identity; MUST NOT be hand-rolled
   *  (KERNEL-1). (atlas-kernel:39-41, 98) */
  id(obj: CasObject): Hash;
}
