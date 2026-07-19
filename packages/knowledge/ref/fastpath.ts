// @atlas/knowledge — ref/fastpath.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The confidence fast-path (KNOW-18, spec A-6/A-7). Human review is spent on RISK, not rubber-stamp: a
// candidate that is grounded ∧ low-risk ∧ `T2` ∧ advisory AUTO-ACCEPTS (no human); a `T0`, CONTESTED
// (reviewer veto / conflicting node), or ANY PREDICATE candidate routes to FULL human ratification. The
// fast-path is backstopped by the KNOW-17 hits-decay — anything it over-admits decays out. Shares the
// KNOW-8 ratifier gate (`ref/ratify.ts`). Transcribed from atlas-knowledge:68, 228-230 and
// method-tags-knw:138-143.

import type { Candidate } from './types.js';

/**
 * [R3 reconciliation — owner-authorized 2026-07-19] The two store/threshold-derived verdicts the ratifier
 * decides UPSTREAM (against store state + the KNOW-17 door-2 threshold) and hands to `route`. NEITHER is a
 * `Candidate` field — `contested` (KNOW-18b: reviewer veto / conflicting node) is store-decided at ratify
 * time; `lowRisk` (KNOW-18a/17b) is the door-2 threshold verdict whose THRESHOLD VALUE stays OPEN-DEFINE in
 * `ref/hits.ts` (not invented here). This mirrors the ratified `writeDecision(candidate, cfg)` precedent —
 * `route` stays pure + total over its inputs; the candidate-intrinsic conjuncts (grounded/T2/advisory) it
 * still computes itself. Discharges the former [FLAG — contested] + [FLAG — lowRisk seam].
 */
export interface RatifyContext {
  readonly contested: boolean; // KNOW-18b — reviewer veto / conflicting node (store-state verdict)
  readonly lowRisk: boolean; // KNOW-18a/17b — door-2 threshold verdict (threshold value = OPEN-DEFINE, ref/hits.ts)
}

export interface FastpathApi {
  /** Route a candidate (KNOW-18): auto-accept iff `grounded ∧ lowRisk ∧ T2 ∧ advisory`; predicate / `T0` /
   *  contested ALL route to `full-ratify` (method-tags-knw:142). `route` computes the candidate-intrinsic
   *  conjuncts (grounded/T2/advisory) itself; `ctx` supplies the store/threshold-derived `contested` +
   *  `lowRisk` verdicts. Pure + total over (candidate, ctx). */
  route(candidate: Candidate, ctx: RatifyContext): 'auto-accept' | 'full-ratify';
}
