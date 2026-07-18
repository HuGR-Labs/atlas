// @atlas/knowledge — ref/hits.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Usefulness is a-posteriori — the hit-ledger + decay (KNOW-17, spec A-10/A-16). A served fact accrues a
// logged `hit` each time it governs a decision (a seat/cold-reviewer cites its node-id as "fact
// applied"). A served fact with 0 hits across the decay window DECAYS out of the served/pack set
// (archived to CAS, never deleted — KNOW-12) and MAY re-enter on a later hit. Door-2's admission
// threshold is a function of OBSERVED hits, never the proposer's self-score. Spans the KNOW-17 ↔ MEM-7
// substrate seam (DP-9). Transcribed from atlas-knowledge:67, 224-227 and method-tags-knw:131-136.
//
// [SIG-TBD — NO concrete signature frozen] method-tags-knw:135 describes "a reference hit-ledger + decay:
// decays a fact iff `hits-in-window==0`, archives to CAS, re-admits on a later hit; `threshold==f(hits)`",
// but freezes no concrete ledger signature. Unfrozen legs are `unknown`, flagged, NOT invented.

import type { NodeKey } from '@atlas/contracts';

/**
 * [OPEN DEFINE — parametric, threshold UNPINNED] The KNOW-17 decay window + the door-2 admission
 * threshold as a FUNCTION of observed hits (`threshold==f(hits)`, method-tags-knw:135; atlas-knowledge:
 * 158). This is the SECOND OPEN-DEFINE constant: per the task directive it MUST be PARAMETRIC — a config
 * the decay pass takes, never a baked-in constant. The value is NOT frozen (calibrates on observed
 * downstream hits, not the proposer's score). Flagged for DEFINE to pin.
 *
 * [SIG-TBD — `window` unit] The decay-window unit (waves / time / event count) is not frozen → `unknown`.
 */
export interface DecayConfig {
  readonly window: unknown; // [SIG-TBD] decay-window unit not frozen
  readonly threshold: number; // [OPEN DEFINE] door-2 threshold == f(hits) — parametric, value unpinned
}

export interface HitsApi {
  /** Log a `hit` citing a served fact's node-id (a fact governed a decision — KNOW-17). Append-only
   *  ledger event. [SIG-TBD] the updated-ledger return is not frozen → `unknown`. */
  logHit(nodeId: NodeKey): unknown;

  /** Decay pass (parametric — `cfg`): a fact with 0 hits in the window is archived to CAS (never
   *  deleted — KNOW-12) and may re-enter on a later hit. `0-hit ⇒ archived ∧ re-spawnable`; the door-2
   *  threshold is `f(hits)`, never a self-score (method-tags-knw:135). Pure + total.
   *  [SIG-TBD] the decay-result shape (the decayed/retained node-id sets) is not frozen → `unknown`. */
  decay(cfg: DecayConfig): unknown;
}
