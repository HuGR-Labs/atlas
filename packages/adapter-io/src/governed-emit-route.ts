// @atlas/adapter-io — src/governed-emit-route.ts  (WHICH ratification gate a write must clear — ARCH-9)
//
// EXTRACTED from `governed-emit.ts` at the 400-LOC ceiling, along the seam ADR-0010 drew: everything here
// answers "which gate does this write owe", while the door answers "does this write clear it". That is one
// question with a long enough answer to have pushed the door over the ceiling — the ARCH-9 rationale, the
// measurement showing what the derivation does and does NOT change at this door, and the statement of the
// CREATE leg that is deliberately left open.
//
// PURE: no store, no policy, no clock. It takes a class the CALLER derived and returns a `RatifyContext`.

import type { Tier } from '@atlas/contracts';
import type { RatifyContext } from '@atlas/knowledge';

/** The KNOW-18 fast-path CONTEXT the door hands to `route`. `lowRisk` (the KNOW-17 door-2 threshold verdict)
 *  and `contested` (the KNOW-18b store-veto) are BOTH store/threshold-derived UPSTREAM and are NOT wired
 *  into this write door in v1 — defaulted CONSERVATIVELY to preserve the common T2-advisory auto-accept:
 *  `contested:false` (no reviewer veto asserted at the door) and `lowRisk:true` (a grounded fact that already
 *  passed the truth-door is treated as low-risk). This matches s05's intended `route(clean,{lowRisk:true,
 *  contested:false}) === 'auto-accept'`; wiring the real hits-ledger/veto verdicts here is a later WP. The
 *  T0/predicate governance teeth do NOT depend on these defaults — they route to full-ratify by their
 *  candidate-intrinsic tier/check, independent of `lowRisk`/`contested`. */
const DOOR_RATIFY_CTX: RatifyContext = { contested: false, lowRisk: true };

/**
 * ARCH-9 (ADR-0010) — the ratification context for ONE write, with the DERIVED governance class joined in.
 *
 * `route` selected the ratification gate from `candidate.tier`, an author-supplied payload field, while the
 * routing `nodeKey` carries no class at all: WHICH node a write lands on and WHICH gate it must clear were
 * decided by two different things, and the author controlled the second. `RatifyContext.derivedTier` is the
 * seam ADR-0010 opened for that, and until now NO CALLER FILLED IT — so end to end the gate was still
 * selected by the request. This function is that caller.
 *
 * THE JOIN IS ONE-WAY (`strictestTier` inside `route`): a payload may only ever make its own gate HARDER.
 *
 * MEASURED, NOT ASSERTED — and this is the part a reviewer should not take on trust. At THIS door, on an
 * UPDATE, supplying the derived class changes no outcome today: ARCH-10's incumbent guard above has already
 * refused any write declaring a class WEAKER than the incumbent's, so by the time `route` runs the declared
 * class is provably ⊒ the derived one and `strictestTier(derived, declared) === declared`. What this closes
 * is therefore not a live bypass but a DEPENDENCE: the safety of a ratified node stops being a property of
 * this file's gate ORDER and becomes a property of the routing decision itself. Delete the downgrade branch
 * in `governed-emit-incumbent.ts` and the T2-over-T0 takeover is STILL refused — by `unratified`, because
 * the derived `T0` sends the write to full ratification. That mutant is the test
 * (`test/arch9-door-derivation.test.ts`), because no non-mutant input can distinguish the two.
 *
 * ARCH-D3b — THE CREATE LEG — IS NOT CLOSED HERE, AND IS NOT GUESSED AT. On a write that MINTS a node there
 * is no incumbent, so there is nothing to derive a class FROM, and `derivedTier` is deliberately ABSENT: the
 * declared class stands, exactly as before. Two answers were available and both are refused as inventions:
 * a constant is what ARCH-9 explicitly names as NOT satisfying the clause, and pinning every CREATE to `T0`
 * would make every first write to a node require the billy token — a policy decision with product-wide
 * consequences that belongs to the owner, not to this door. It is recorded as OPEN in the architecture
 * decision table and in ADR-0010 §"What the owner still has to ratify" item 2, and it is pinned as an open
 * hole by a test so it cannot later be mistaken for coverage.
 */
export function ratifyCtxFor(derivedTier: Tier | undefined): RatifyContext {
  return derivedTier === undefined ? DOOR_RATIFY_CTX : { ...DOOR_RATIFY_CTX, derivedTier };
}
