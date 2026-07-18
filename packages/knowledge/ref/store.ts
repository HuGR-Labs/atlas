// @atlas/knowledge — ref/store.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Advisory-standalone operability (KNOW-9, spec §3.2). Both node families ship day-one, but with NO
// evaluator wired the store is FULLY operable on advisory nodes alone (emit / query / reconcile all
// succeed); the predicate family is present day-one, NOT deferred. Transcribed from atlas-knowledge:36,
// 59, 200-201 and method-tags-knw:74-79.
//
// [SIG-TBD — NO concrete signature frozen] method-tags-knw:78 describes "a reference store PARAMETRIZED
// by `evaluator?=none`" that runs the full emit→query→reconcile cycle on advisory nodes with a null
// evaluator, but freezes NO concrete store signature. The one FROZEN structural fact — the evaluator is
// OPTIONAL — is transcribed below; the rest is flagged, NOT invented. (method-tags-knw:79 also carries a
// "weak-homing — confirm/exempt" register flag, surfaced here for cold review, tag retained.)

import type { EvaluatorApi } from './evaluator.js';

export interface StoreApi {
  /** The predicate-check evaluator seam — OPTIONAL (KNOW-9). Absent (`evaluator?=none`) ⇒ the store
   *  operates on advisory nodes alone; a code path that HARD-REQUIRES an evaluator to operate on advisory
   *  fails the standalone cycle (method-tags-knw:79). Under `exactOptionalPropertyTypes`, genuinely
   *  absent-or-present.
   *
   *  [SIG-TBD] The full emit→query→reconcile operating surface is composed from the sibling facets
   *  (`ref/emit.ts`, `ref/reconcile.ts`, the query pack) — the aggregate store signature is not frozen;
   *  only the optional-evaluator parametrization is transcribed. Flagged. */
  readonly evaluator?: EvaluatorApi;
}
