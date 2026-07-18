// @atlas/persist — ref/placement.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The trailer-vs-note placement oracle (PERSIST-13). The reference NAMES a {trailer, note} placement
// model: clone-required data MUST read from the TRAILER (canonical, travels in the commit object,
// survives a rewrite onto the new SHA); notes are the MUTABLE OVERLAY (perimeter-conditional, orphaned
// by rebase/squash/cherry-pick). A clone-required datum stored ONLY in a note fails the placement
// assertion (method-tags-pst:118-120) — but the reference freezes NO concrete oracle signature.
//
// [SIG-TBD] The placement TARGETS (`trailer` | `note`) are grounded; the oracle's method signature is
// NOT frozen — flagged and NOT invented.

/** The two placement targets (PERSIST-13). `trailer` = canonical/clone-required; `note` = mutable
 *  overlay/perimeter-conditional. */
export type Placement = 'trailer' | 'note';

export interface PlacementApi {
  // [SIG-TBD] — placement-oracle signature intentionally empty pending a frozen signature; do not invent.
}
