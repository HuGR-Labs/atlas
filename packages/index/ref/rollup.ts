// @atlas/index — ref/rollup.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The Merkle rollup core (INDEX-2). `subtreeHash(node) = blake3(concat(sorted(childHashes)))` — the
// determinism law (same children ⇒ same root under any input order) + edit-locality (an edit re-hashes
// exactly the leaf→root path; sibling hashes byte-invariant). `rollup` surfaces a node's dual root
// (rId=structure, rState=state). (atlas-index:40-44, 62-64, 155-156; method-tags-idx:27-31)

import type { SubtreeHash } from '@atlas/contracts';
import type { Axis, IndexNode, Rollup } from './types.js';

export interface RollupApi {
  /** This node's dual Merkle rollup (INDEX-12): `rId` (structure) + `rState` (state). Total.
   *  (atlas-index:211) */
  rollup(axis: Axis, key: string): Rollup;
  /** BLAKE3 over sorted child hashes — the drift oracle root (branded `SubtreeHash`, from contracts).
   *  Order-independent given the sort (INDEX-2). (atlas-index:40, 62; method-tags-idx:31) */
  subtreeHash(node: IndexNode): SubtreeHash;
}
