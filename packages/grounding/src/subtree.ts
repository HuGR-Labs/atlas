// @atlas/grounding — src/subtree.ts   (WP-4.10-a.GROUND · GROUND-1 / GROUND-5 / GROUND-10)
//
// The NORMALIZED-AST drift oracle. `subtreeHash(unit)` is the BLAKE3 over the unit's normalized AST
// subtree — reached ONLY through the @atlas/kernel `Encoder` seam (GROUND-10 / KERNEL-2), never a
// locally-inlined hash call, so a blake3↔stub digest swap flows through every anchor (the seam-
// substitution property, SCN-GROUND-10a/10b). A semantically-irrelevant edit (reformat, import-above,
// unrelated rename) leaves this byte-invariant; a real change to the cited unit changes it (GROUND-5).
// Transcribed against the frozen oracle `../ref/subtree.ts` (`SubtreeApi.subtreeHash`).
//
// SEAM: the `unit` is already a NORMALIZED CasObject (its concrete `StructuralNode` shape is owned by the
// lower index layer — `= unknown` at layer 1, per the ref FLAG). This WP does not normalize; it hashes
// the canonical preimage (`canonicalForm`, KERNEL-1) through the injected seam and brands the result as
// the drift-leg `SubtreeHash` (`asSubtreeHash`, the sanctioned mint site). No raw digest is imported here.

import { asSubtreeHash, canonicalForm } from '@atlas/kernel';
import type { CasObject, Encoder } from '@atlas/kernel';
import type { SubtreeHash } from '@atlas/contracts';
import type { SubtreeApi } from '../ref/subtree.js';

/**
 * Build the `subtreeHash` oracle over an INJECTED `Encoder` seam (GROUND-10). Parametrizing the digest
 * keeps it swappable: swapping `encoder` (blake3 ↔ stub) changes ONLY the digest bytes, and every
 * `subtreeHash` in a run follows that swap — no anchor path may inline its own hash (SCN-GROUND-10a).
 * The returned `subtreeHash` conforms EXACTLY to the frozen `SubtreeApi.subtreeHash(unit)` and is pure.
 */
export function bindSubtree(encoder: Encoder): SubtreeApi {
  const subtreeHash = (unit: CasObject): SubtreeHash =>
    asSubtreeHash(encoder.hash(canonicalForm(unit)));
  return { subtreeHash };
}
