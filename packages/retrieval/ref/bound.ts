// @atlas/retrieval — ref/bound.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Bounded, ranked, deterministic truncation of the reverse closure (RETR-11). For a hub node the naive
// reverse closure is most of the repo, so `dependents` MUST be: (a) cut at max hop-distance
// `maxHops = 2`; (b) ordered by the total rank `(tier-desc, ppr-desc, distance-asc, nodeKey-asc)` — a
// high-`ppr` hub 2 hops out outranks a low-`ppr` leaf 1 hop in, distance demoted to a tiebreak; and
// (c) capped at a hard count `K = 8`, truncated AFTER ranking with honest `BoundMeta` (`total` /
// `returned` / `truncated`). Forward `dependencies` use the same `K = 8`. Reuses RETR-10's closure +
// the shared `ref/rank.ts` comparator. Transcribed from atlas-retrieval:44 / 127-138 +
// method-tags-ret:91-96.

import type { IndexNode } from '@atlas/index';
import type { BoundMeta, RelatedFact } from './types.js';

export interface BoundApi {
  /** Reverse closure of `node`, bounded: `closure(maxHops) → stable-sort-by-rank → take(K)` with honest
   *  meta (RETR-11). Defaults per the reference: `maxHops = 2`, `K = 8`. Pure + deterministic +
   *  truncate-after-rank (the returned set is a rank-prefix). (atlas-retrieval:44; method-tags-ret:95)
   *
   *  [FLAG — `node` type] The reference names `node` with no concrete type — the unit's node in the
   *  index dependency axis. Transcribed as the index-provided `IndexNode` (@atlas/index), the honest
   *  input the closure walks; NOT invented. Flagged for the reference to freeze the parameter. */
  boundedClosure(
    node: IndexNode,
    maxHops: number,
    K: number,
  ): { readonly closure: readonly RelatedFact[]; readonly meta: BoundMeta };
}
