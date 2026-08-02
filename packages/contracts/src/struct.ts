// @atlas/contracts — struct.ts
//
// The grounding anchor. A StructRef points at a structural unit; its `subtreeHash` is THE drift
// oracle (BLAKE3 of the unit's source slice), never line numbers. NOT "the normalized subtree" — no
// normalizer exists in this product, so a reformat OF the cited unit drifts. REQ-GROUND-5b / KNOW-3
// were amended 2026-08-02; `@atlas/grounding` `src/subtree.ts` carries the reason.

import type { SubtreeHash } from './hash.js';

/** A grounding anchor into the structural tree. `subtreeHash` is the drift oracle (never line
 *  numbers). 'repo'/'project' anchors a global rule to a policy artifact's heading/section BLOCK
 *  subtreeHash, never anchorless (GROUND-12). (atlas-grounding line 44; atlas-index line 56) */
export interface StructRef {
  readonly kind: 'symbol' | 'block' | 'file' | 'repo' | 'project';
  readonly qualifiedPath: string;
  readonly subtreeHash: SubtreeHash;
}
