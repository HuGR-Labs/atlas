// @atlas/kernel — src/encoder.ts  (the digest SEAM — the ONLY site that mints a Hash from bytes)
//
// KERNEL-2: the default encoder resolves to BLAKE3, and correctness MUST NOT depend on the chosen digest
// function — swapping it changes only the digest bytes (the id strings), never any other contract. This is
// the sole place a raw digest primitive is imported; every id in the Atlas is produced through `hash(bytes)`
// (KERNEL-2a). The interface shape (`Encoder`) is owned upstream in @atlas/contracts; the kernel only
// supplies the concrete default instance behind the seam.

import { blake3 } from '@noble/hashes/blake3';
import { bytesToHex } from '@noble/hashes/utils';
import type { Encoder, Hash } from '@atlas/contracts';
import { asHash } from './brand.js';

/**
 * The kernel's default encoder: a lower-hex BLAKE3 digest of the canonical preimage bytes. `asHash` is the
 * sanctioned mint site for the branded `Hash` (src/brand.ts). No configuration switch is exposed here — the
 * seam is swappable by substituting a different `Encoder` at the call boundary, per PROP-KERNEL-2.
 */
export const defaultEncoder: Encoder = {
  hash(bytes: Uint8Array): Hash {
    return asHash(bytesToHex(blake3(bytes)));
  },
};
