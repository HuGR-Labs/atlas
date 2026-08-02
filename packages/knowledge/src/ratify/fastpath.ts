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

import type { Tier } from '@atlas/contracts';
import type { Candidate } from '../types.js';
import type { Grounding } from '@atlas/grounding';
import { strictestTier } from './tier.js';

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

  /**
   * [ARCH-9 · ADR-0010] The governance class the DOOR DERIVED for this write's target — the class the author
   * could not choose. Supplying it is what makes the ratification route a decision about the RESOURCE rather
   * than a decision the payload announces about itself.
   *
   * WHY THIS FIELD EXISTS. `route` selected the ratification gate from `candidate.tier`, an author-supplied
   * payload field, and `nodeKey = hash(primaryAnchorId ‖ slot[‖ check])` contains no tier — so WHICH node a
   * write lands on and WHICH gate it must clear were decided by two different things, the second of them by
   * the author. Declaring `tier:'T2'` + advisory made this function answer `auto-accept`, the KNOW-8 token
   * was never consulted, and the write landed on whatever node that identity resolved to. That is the
   * confused deputy, and ARCH-9's remedy is stated as a single requirement, not a choice: a field that
   * selects a gate is DERIVED by the door, never chosen by the request.
   *
   * THE JOIN IS ONE-WAY, ON PURPOSE. The governing class is `strictestTier(derived, declared)`, so a payload
   * may only ever make its own gate HARDER (declaring `T0` still buys a full ratification) and never softer.
   * `strictestTier` is TOTAL over `unknown` and joins garbage to `T0`, so an off-lattice derived value fails
   * CLOSED — a door that computes nonsense pins the gate shut, not open.
   *
   * ABSENT MEANS THE DOOR DID NOT SPEAK, AND THAT IS STILL THE OPEN HOLE. With no derived class the declared
   * one stands, which is exactly the pre-ADR-0010 behaviour: this field is the SEAM ARCH-9 needs, and it is
   * only closed for a caller that actually fills it. `adapter-io/governed-emit.ts` does not yet — closing the
   * UPDATE leg there is one line (the incumbent's own class), while the CREATE leg has no incumbent to derive
   * from at all and is ARCH-D3b, an OPEN owner DEFINE. Optional rather than required for the same reason: a
   * required field would have forced every existing caller to invent a value, and an invented derivation
   * ("a constant that pins the gate open") is the one thing ARCH-9 names as NOT satisfying the clause.
   */
  readonly derivedTier?: Tier;
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
  // ARCH-9 — the gate-selecting class. A door-DERIVED class overrides the payload's self-declaration; the
  // lattice JOIN makes that override one-way (harder only) and fail-closed on anything off-lattice. Absent
  // ⇒ the declared class stands, the ARCH-D3b hole, documented on `RatifyContext.derivedTier`.
  const governingTier = ctx.derivedTier === undefined ? candidate.tier : strictestTier(ctx.derivedTier, candidate.tier);
  const t2 = governingTier === 'T2';
  const advisory = isAdvisory(candidate);
  const fastPath = grounded && ctx.lowRisk && t2 && advisory && !ctx.contested;
  return fastPath ? 'auto-accept' : 'full-ratify';
}

/** The frozen-`FastpathApi` binding (conformance handle). */
export const fastpath: FastpathApi = { route };
