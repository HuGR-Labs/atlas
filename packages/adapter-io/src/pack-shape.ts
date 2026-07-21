// @atlas/adapter-io — src/pack-shape.ts  (the ONE fact→PackInvariant shaping, shared by both read projections)
//
// Both read projections — the scope readback (projection-query-index.ts) and the dependency/trigger retrieval
// feed (retrieval-model.ts) — map a `(CurrentNode, GroundedFact)` pair to a `PackInvariant` the SAME way:
// the identity + claim come from the trusted projection `CurrentNode` (recomputed nodeKey + the set-union
// claim set), the tier from the CAS `GroundedFact`. Extracted so the two doors can never drift.

import type { NodeKey, PackInvariant } from '@atlas/contracts';
import type { CurrentNode, GroundedFact } from '@atlas/knowledge';

/** Shape one current node + its CAS fact into a structured `PackInvariant`: `nodeId` = the trusted (recomputed)
 *  projection `nodeKey`, `tier` = the fact's tier, `claim` = the node's set-union claim set joined. */
export function factToInvariant(node: CurrentNode, fact: GroundedFact): PackInvariant {
  return { nodeId: node.nodeKey as NodeKey, tier: fact.tier, claim: node.claims.join('; ') };
}
