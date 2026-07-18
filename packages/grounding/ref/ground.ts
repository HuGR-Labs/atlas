// @atlas/grounding — ref/ground.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The anchor builder + the real-grounding predicate. `ground(node, src)` re-derives the anchor@src,
// dropping unresolvable entries (fail-closed, never throws — GROUND-3). `isGrounded(g)` is the
// real-grounding predicate: ≥1 entry AND every entry carries a non-empty `subtreeHash` (GROUND-2); an
// ungrounded grounding is NEVER FRESH. Both pure + total. (atlas-grounding:128, 130, 79-82;
// method-tags-grd:30-42)

import type { Grounding } from './types.js';

export interface GroundApi {
  /** Re-derive the grounding anchor for `node` against source-of-truth `src`; an unresolvable citation
   *  (unit gone, path absent) is DROPPED, never throws — fail-closed (GROUND-3). Pure + total.
   *  (atlas-grounding:128)
   *
   *  [SIG-TBD — args underspecified] The reference names `ground(node, src)` with NO concrete type for
   *  either the cited `node` or the `src` source-of-truth snapshot. `node` (the thing being grounded)
   *  and `src` (the current tree/index it is resolved against) are transcribed as `unknown` rather than
   *  invented — do not guess a node schema or an `src` snapshot shape. Flagged for the owning WP. */
  ground(node: unknown, src: unknown): Grounding;

  /** Real-grounding predicate: `true` iff `g` has ≥1 entry AND every entry's `anchor.subtreeHash` is
   *  non-empty (GROUND-2). An empty/partial grounding fails the predicate and MUST never surface FRESH.
   *  Pure + total. (atlas-grounding:130) */
  isGrounded(g: Grounding): boolean;
}
