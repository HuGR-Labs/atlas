// @atlas/grounding — ref/ground.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The anchor builder + the real-grounding predicate. `ground(node, src)` re-derives the anchor@src,
// dropping unresolvable entries (fail-closed, never throws — GROUND-3). `isGrounded(g)` is the
// real-grounding predicate: ≥1 entry AND every entry carries a non-empty `subtreeHash` (GROUND-2); an
// ungrounded grounding is NEVER FRESH. Both pure + total. (atlas-grounding:128, 130, 79-82;
// method-tags-grd:30-42)

import type { Axes } from '@atlas/index';
import type { Grounding } from './types.js';

export interface GroundApi {
  /** Re-derive the grounding anchor for `node` against source-of-truth `src`; an unresolvable citation
   *  (unit gone, path absent) is DROPPED, never throws — fail-closed (GROUND-3). Pure + total.
   *  (atlas-grounding:128)
   *
   *  [PIN — `src` = built-index `Axes`] Owner DEFINE 2026-07-18 (oracle-pin-map §5). `src` is the
   *  built-index snapshot the anchor is re-derived against, consistent with `driftDetect`.
   *  [SIG-TBD — `node`] the reference (atlas-grounding:128) gives `node` no concrete shape; §5 pinned
   *  ONLY `src`, so `node` stays opaque here — the groundable-unit type is the owning WP's to pin from
   *  its reference, NOT guessed (do not import the upward `GroundedFact` — that inverts the DAG). */
  ground(node: unknown, src: Axes): Grounding;

  /** Real-grounding predicate: `true` iff `g` has ≥1 entry AND every entry's `anchor.subtreeHash` is
   *  non-empty (GROUND-2). An empty/partial grounding fails the predicate and MUST never surface FRESH.
   *  Pure + total. (atlas-grounding:130) */
  isGrounded(g: Grounding): boolean;
}
