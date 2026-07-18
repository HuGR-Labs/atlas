// @atlas/grounding — ref/subtree.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The NORMALIZED-AST oracle, shared with atlas-knowledge KNOW-3. `subtreeHash(unit)` is BLAKE3 over
// the unit's NORMALIZED AST subtree (whitespace, comments-if-configured, De-Bruijn / param-name /
// lifetime noise erased) — NOT line numbers, NOT the file byte-hash. The digest MUST be reached
// through the @atlas/kernel `Encoder` seam (KERNEL-2 / GROUND-10), never a locally-inlined hash call,
// so the function stays swappable. (atlas-grounding:52-58, 95-96; method-tags-grd:56, 86-91)

import type { SubtreeHash } from '@atlas/contracts';
import type { CasObject, Encoder } from '@atlas/kernel';

/**
 * The GROUND-10 seam contract. A reference to @atlas/contracts/@atlas/kernel's `Encoder` (KERNEL-2) —
 * NOT a redefinition. `subtreeHash` MUST route through THIS seam so a blake3↔stub digest swap flows
 * through every anchor (the seam-substitution property, method-tags-grd:89-91); a locally-inlined
 * `blake3(...)` call would diverge from the swapped seam and break the substitution test.
 */
export type SubtreeSeam = Encoder;

export interface SubtreeApi {
  /** BLAKE3 over the unit's normalized AST subtree — the drift oracle (branded `SubtreeHash`, from
   *  contracts). Computed through the `Encoder` seam (GROUND-10). A semantically-irrelevant edit
   *  (reformat, import added above, unrelated rename) leaves this byte-invariant; a real change to the
   *  cited unit changes it (GROUND-5). (method-tags-grd:56)
   *
   *  [FLAG — `unit` arg, downward-owned] The reference names `subtreeHash(unit)` without a concrete
   *  arg type; the "unit" is a structural node whose concrete `StructuralNode` shape is owned by the
   *  lower index layer. Transcribed as the kernel `CasObject` (`= unknown` at layer 1 — a stored CAS
   *  object, DAG-safe: index/kernel are BELOW grounding) rather than invented. Flagged for the index
   *  layer to surface the concrete node shape. */
  subtreeHash(unit: CasObject): SubtreeHash;
}
