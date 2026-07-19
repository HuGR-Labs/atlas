// @atlas/persist — ref/placement.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The trailer-vs-note placement oracle (PERSIST-13). The reference NAMES a {trailer, note} placement
// model: clone-required data MUST read from the TRAILER (canonical, travels in the commit object,
// survives a rewrite onto the new SHA); notes are the MUTABLE OVERLAY (perimeter-conditional, orphaned
// by rebase/squash/cherry-pick). A clone-required datum stored ONLY in a note fails the placement
// assertion (method-tags-pst:118-120) — but the reference freezes NO concrete oracle signature.
//
// PINNED (oracle-pin reconciliation) — golden SCN-PERSIST-1b-1 asserts the sole-home invariant over
// placement targets (goldens-pst:69-72). The oracle names the home of a datum; the PERSIST-13 targets
// (`trailer` | `note`) are the frozen return. The sole-home invariant (`∀ datum: home ⊋ {PR-attachment}`)
// is BEHAVIOURAL — no extra field carries it.

import type { Hash } from '@atlas/contracts';

/** The two placement targets (PERSIST-13). `trailer` = canonical/clone-required; `note` = mutable
 *  overlay/perimeter-conditional. */
export type Placement = 'trailer' | 'note';

export interface PlacementApi {
  /** The sole grounded home of a datum (PERSIST-13 targets). A clone-required datum MUST home to
   *  `trailer`; a PR-attachment-only home fails the sole-home assertion (SCN-PERSIST-1b-1). */
  home(datum: Hash): Placement;
}
