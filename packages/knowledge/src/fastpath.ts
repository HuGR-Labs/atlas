// @atlas/knowledge — src/fastpath.ts  (WP-5.15.KNOW · EPIC-15)
//
// The confidence fast-path (KNOW-18). Human review is spent on RISK, not rubber-stamp: a candidate that
// is grounded ∧ low-risk ∧ `T2` ∧ advisory AUTO-ACCEPTS (no human); a `T0`, CONTESTED (reviewer veto /
// conflicting node), or ANY PREDICATE candidate routes to FULL human ratification. Over-admission is
// backstopped by the KNOW-17 hits-decay. Binds the FROZEN `FastpathApi` (ref/fastpath.ts):
// `route(candidate, ctx: RatifyContext): 'auto-accept' | 'full-ratify'`.
//
// FACET BOUNDARY (BIND — resolved vs FROZEN oracle ref/fastpath.ts):
//  • [R3 reconciliation] `ctx` supplies the two verdicts the ratifier decides UPSTREAM: `contested`
//    (store-state — reviewer veto / conflicting node, KNOW-18b) and `lowRisk` (the KNOW-17 door-2
//    THRESHOLD verdict, KNOW-18a). The lowRisk THRESHOLD VALUE stays OPEN-DEFINE in ref/hits.ts — this
//    facet consumes the BOOLEAN and does NOT pin the threshold.
//  • The candidate-intrinsic conjuncts are computed HERE: `grounded` (GROUND-2 real-grounding — ≥1 entry,
//    each a non-empty `subtreeHash`; no raw hashing, the branded value is read), `T2` (the proposed tier),
//    and `advisory` (a candidate carries a `check` iff predicate — so advisory ⟺ no `check`).

import type { Candidate } from '../ref/types.js';
import type { RatifyContext, FastpathApi } from '../ref/fastpath.js';
import type { Grounding } from '@atlas/grounding';

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
