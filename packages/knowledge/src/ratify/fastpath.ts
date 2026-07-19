// @atlas/knowledge — src/fastpath.ts  (WP-5.15.KNOW · EPIC-15)
//
// The confidence fast-path (KNOW-18). Human review is spent on RISK, not rubber-stamp: a candidate that
// is grounded ∧ low-risk ∧ `T2` ∧ advisory AUTO-ACCEPTS (no human); a `T0`, CONTESTED (reviewer veto /
// conflicting node), or ANY PREDICATE candidate routes to FULL human ratification. Over-admission is
// backstopped by the KNOW-17 hits-decay. Binds the FROZEN `FastpathApi` (co-located below):
// `route(candidate, ctx: RatifyContext): 'auto-accept' | 'full-ratify'`.
//
// FACET BOUNDARY (BIND — resolved vs the frozen FastpathApi, co-located below):
//  • [R3 reconciliation] `ctx` supplies the two verdicts the ratifier decides UPSTREAM: `contested`
//    (store-state — reviewer veto / conflicting node, KNOW-18b) and `lowRisk` (the KNOW-17 door-2
//    THRESHOLD verdict, KNOW-18a). The lowRisk THRESHOLD VALUE stays OPEN-DEFINE in hits.ts — this
//    facet consumes the BOOLEAN and does NOT pin the threshold.
//  • The candidate-intrinsic conjuncts are computed HERE: `grounded` (GROUND-2 real-grounding — ≥1 entry,
//    each a non-empty `subtreeHash`; no raw hashing, the branded value is read), `T2` (the proposed tier),
//    and `advisory` (a candidate carries a `check` iff predicate — so advisory ⟺ no `check`).

import type { Candidate } from '../types.js';
import type { Grounding } from '@atlas/grounding';

// ── frozen FastpathApi surface, co-located here (was ref/fastpath.ts) ─────────────────────────────────

/**
 * [R3 reconciliation — owner-authorized 2026-07-19] The two store/threshold-derived verdicts the ratifier
 * decides UPSTREAM (against store state + the KNOW-17 door-2 threshold) and hands to `route`. NEITHER is a
 * `Candidate` field — `contested` (KNOW-18b: reviewer veto / conflicting node) is store-decided at ratify
 * time; `lowRisk` (KNOW-18a/17b) is the door-2 threshold verdict whose THRESHOLD VALUE stays OPEN-DEFINE in
 * hits.ts (not invented here).
 */
export interface RatifyContext {
  readonly contested: boolean; // KNOW-18b — reviewer veto / conflicting node (store-state verdict)
  readonly lowRisk: boolean; // KNOW-18a/17b — door-2 threshold verdict (threshold value = OPEN-DEFINE, hits.ts)
}

export interface FastpathApi {
  /** Route a candidate (KNOW-18): auto-accept iff `grounded ∧ lowRisk ∧ T2 ∧ advisory`; predicate / `T0` /
   *  contested ALL route to `full-ratify` (method-tags-knw:142). `route` computes the candidate-intrinsic
   *  conjuncts (grounded/T2/advisory) itself; `ctx` supplies the store/threshold-derived `contested` +
   *  `lowRisk` verdicts. Pure + total over (candidate, ctx). */
  route(candidate: Candidate, ctx: RatifyContext): 'auto-accept' | 'full-ratify';
}

export type FastpathRoute = 'auto-accept' | 'full-ratify';

/** GROUND-2 real grounding: ≥1 entry, each carrying a non-empty `subtreeHash`. Fail-closed. */
export function isGrounded(grounding: Grounding): boolean {
  return (
    grounding.entries.length > 0 &&
    grounding.entries.every((e) => String(e.anchor.subtreeHash).length > 0)
  );
}

/** A candidate is advisory iff it carries NO `check` — the predicate family is the checkable one. */
export function isAdvisory(candidate: Candidate): boolean {
  return candidate.check === undefined;
}

/**
 * Route a candidate (KNOW-18): auto-accept iff `grounded ∧ lowRisk ∧ T2 ∧ advisory`; predicate / `T0` /
 * contested ALL route to `full-ratify`. Pure + total over (candidate, ctx).
 */
export function route(candidate: Candidate, ctx: RatifyContext): FastpathRoute {
  const grounded = isGrounded(candidate.grounding);
  const t2 = candidate.tier === 'T2';
  const advisory = isAdvisory(candidate);
  const fastPath = grounded && ctx.lowRisk && t2 && advisory && !ctx.contested;
  return fastPath ? 'auto-accept' : 'full-ratify';
}

/** The frozen-`FastpathApi` binding (conformance handle). */
export const fastpath: FastpathApi = { route };
