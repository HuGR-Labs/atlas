// @atlas/knowledge — ref/status.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The truth-gate side-index recomputer (KNOW-1, spec A-1). A fact NEVER self-declares true: served
// `Status` is a RECOMPUTED side-index (out of identity — atlas-knowledge:16, 28), never a value the fact
// asserts about itself. The recomputer DROPS any node-declared `status` and derives it from {grounding,
// drift, evaluator-verdict}. Transcribed from atlas-knowledge:28, 51, 186 and method-tags-knw:18-23.

import type { Status } from '@atlas/contracts';
import type { GroundedFact } from './types.js';

export interface StatusApi {
  /** Recompute the served `Status` for a node (KNOW-1), IGNORING any `status` the node carries — a
   *  candidate-declared `HOLDS` is dropped; the served status is the recomputed one (method-tags-knw:22).
   *  Pure + total; `Status` is out of identity (never in the `nodeKey`).
   *
   *  [SIG-TBD — inputs underspecified] The task inventory pins `recompute(node)`, but the reference model
   *  (method-tags-knw:22) recomputes from {grounding, drift, evaluator-verdict} — the drift verdict
   *  (`ref/reconcile.ts` / grounding) and the evaluator verdict (`ref/evaluator.ts`) are ADDITIONAL
   *  inputs NOT present in the 1-arg signature. Transcribed to the frozen `recompute(node)` surface; the
   *  extra drift/evaluator inputs are flagged as underspecified — NOT invented as parameters here. */
  recompute(node: GroundedFact): Status;
}
