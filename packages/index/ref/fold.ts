// @atlas/index — ref/fold.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The bounded incremental re-check (INDEX-12) — the "never O(blast-radius)" property. `delta` names
// which axis buckets changed (structure vs state). On the dependency axis: `propagateDirty` sets a
// drift dirty-bit eagerly across the WHOLE reverse closure (a bit, O(1)/node); `rehashState` recomputes
// the `rState` hash LAZILY / on-read, eager re-hash capped at `maxHops=2`, deeper nodes marked
// `state-suspect`. (atlas-index:118-123, 178-184; method-tags-idx:97-102)

import type { Delta } from './types.js';

/** The eager-re-hash cap: on an edit the `rState` re-hash is bounded to nodes within this many hops
 *  of the reverse closure; deeper nodes are `state-suspect`, resolved only on query (INDEX-12).
 *  Reference pins this literal (atlas-index:123, 183-184). */
export type MaxHops = 2;

export interface FoldApi {
  /** Which axis buckets changed, structure (`idChanged`) vs state (`stateChanged`); bounds a re-check
   *  to the named `changedBuckets`, never `N` (INDEX-12). (atlas-index:212)
   *
   *  [SIG-TBD — args underspecified] atlas-index:212 gives `delta(before, after)` with NO concrete
   *  type for the two snapshots (a pre/post rollup or axis snapshot). Transcribed as `unknown` rather
   *  than invented — do not guess `before`/`after` into `Rollup` vs `Axes`. Flagged for the WP. */
  delta(before: unknown, after: unknown): Delta;

  /** Eager drift dirty-bit across the whole reverse closure — a bit per node, O(1)/node, never a hash
   *  (INDEX-12). (method-tags-idx:101; atlas-index:121-122)
   *
   *  [SIG-TBD — args underspecified] The reference (atlas-index surface / method-tags-idx:101) names
   *  `propagateDirty(...)` with NO signature. Transcribed as a variadic `unknown[]` placeholder — not
   *  invented (likely the edited node + the dependency DAG). Flagged. */
  propagateDirty(...args: readonly unknown[]): void;

  /** Lazy / on-read `rState` recompute, eager re-hash capped at `maxHops=2` (`MaxHops`); deeper nodes
   *  stay `state-suspect` until queried (INDEX-12). (method-tags-idx:101; atlas-index:122-123)
   *
   *  [SIG-TBD — args underspecified] `rehashState(...)` is named with NO signature (method-tags-idx:
   *  101). Transcribed as a variadic `unknown[]` placeholder — not invented (likely the node + a hop
   *  budget bounded by `MaxHops`). Flagged. */
  rehashState(...args: readonly unknown[]): void;
}
