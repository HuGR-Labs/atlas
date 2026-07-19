// @atlas/index — ref/fold.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The bounded incremental re-check (INDEX-12) — the "never O(blast-radius)" property. `delta` names
// which axis buckets changed (structure vs state). On the dependency axis: `propagateDirty` sets a
// drift dirty-bit eagerly across the WHOLE reverse closure (a bit, O(1)/node); `rehashState` recomputes
// the `rState` hash LAZILY / on-read, eager re-hash capped at `maxHops=2`, deeper nodes marked
// `state-suspect`. (atlas-index:118-123, 178-184; method-tags-idx:97-102)

import type { Axes, Delta, IndexNode } from './types.js';

/** The eager-re-hash cap: on an edit the `rState` re-hash is bounded to nodes within this many hops
 *  of the reverse closure; deeper nodes are `state-suspect`, resolved only on query (INDEX-12).
 *  Reference pins this literal (atlas-index:123, 183-184). */
export type MaxHops = 2;

export interface FoldApi {
  /** Which axis buckets changed, structure (`idChanged`) vs state (`stateChanged`); bounds a re-check
   *  to the named `changedBuckets`, never `N` (INDEX-12). The two compared snapshots are whole built
   *  index states — the frozen `Axes` (the return of `build`, ref/types.ts) — so a rebuild/edit diffs
   *  `before`→`after` into the changed buckets. (atlas-index:212) */
  delta(before: Axes, after: Axes): Delta;

  /** Eager drift dirty-bit across the whole reverse closure — a bit per node, O(1)/node, never a hash
   *  (INDEX-12). The edited node is the frozen `IndexNode`; the traversal reads the dependency edge set
   *  (`Axes.edges`) and is bounded structurally by `MaxHops` — neither is a further method arg, the
   *  reference names none. (method-tags-idx:101; atlas-index:121-122) */
  propagateDirty(node: IndexNode): void;

  /** Lazy / on-read `rState` recompute over the edited `IndexNode`'s subtree (leaf→root), eager re-hash
   *  capped at `maxHops=2` (`MaxHops`); deeper nodes stay `state-suspect` until queried (INDEX-12). The
   *  `maxHops` cap is the module constant `MaxHops`, not a param. (method-tags-idx:101; atlas-index:122-123) */
  rehashState(node: IndexNode): void;
}
