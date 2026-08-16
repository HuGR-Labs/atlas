// @atlas/adapter-io — verify-validated-ensemble.ts
//
// ADR-0017 #196b Wave 2 — the VALIDATED ensemble fold. Turns N independent rater votes into the
// `verifyValidated` port's verdict. It is PURE: it makes no model call. The orchestrator dispatches the raters
// (fresh sonnet, adversarial, the frozen rater prompt) and materializes the per-proposal vote map; THIS module
// only folds that data. The default policy is deliberately CONSERVATIVE (~0 false-positive is the ADR-0017
// posture): a fact is `validated` only on UNANIMOUS `GROUNDED_TRUE` across ≥3 raters with ZERO `HALLUCINATED`
// vote — a single "this is false" vetoes, and too-few raters is not an ensemble. The benchmark SWEEPS the
// policy to MEASURE the recall/false-rate tradeoff; the seal's honesty rides on that measured number.

import type { PredicateProposal } from '@atlas/genesis';

/** One independent rater's verdict on a proposed typed fact (the #226 adjudication contract). */
export type RaterVerdict = 'GROUNDED_TRUE' | 'HALLUCINATED' | 'ABSTAIN';

/** The fold policy. Conservative defaults; the bench varies these to trace the false-rate/recall curve. */
export interface EnsemblePolicy {
  readonly minRaters: number;       // fewer votes than this is not an ensemble ⇒ abstain
  readonly minTrueFraction: number; // fraction of votes that must be GROUNDED_TRUE (1.0 = unanimous)
  readonly maxHallucinated: number; // a HALLUCINATED count above this vetoes ⇒ abstain
}

/** The ~0-FP default: unanimous GROUNDED_TRUE across ≥3 raters, a single HALLUCINATED vetoes. */
export const CONSERVATIVE_POLICY: EnsemblePolicy = { minRaters: 3, minTrueFraction: 1.0, maxHallucinated: 0 };

/**
 * Fold rater votes to the port verdict. Pure + total. Never `validated` on too-few raters or empty input, and
 * a HALLUCINATED count over `maxHallucinated` vetoes BEFORE the agreement check (an explicit "false" is a
 * stronger signal than a majority "true"). Abstentions dilute the true-fraction, so any non-true vote breaks
 * the unanimous default — honest by construction.
 */
export function foldEnsembleVotes(
  votes: readonly RaterVerdict[],
  policy: EnsemblePolicy = CONSERVATIVE_POLICY,
): 'validated' | 'abstain' {
  const n = votes.length;
  // `Math.max(1, …)`: an ensemble NEVER validates on zero votes, whatever the policy sweeps to — the "no
  // evidence ⇒ never validated" promise is a property of the primitive, not of a caller-supplied minRaters.
  if (n < Math.max(1, policy.minRaters)) return 'abstain';
  const hallucinated = votes.filter((v) => v === 'HALLUCINATED').length;
  if (hallucinated > policy.maxHallucinated) return 'abstain';
  const groundedTrue = votes.filter((v) => v === 'GROUNDED_TRUE').length;
  // `- 1e-9` before ceil: `minTrueFraction * n` can float-drift a hair ABOVE an exact integer (0.28*50 =
  // 14.000000000000002 → ceil 15 instead of 14), which would silently demand one extra true vote and skew the
  // bench's fractional-policy recall curve. The epsilon (≫ the ~1e-15 drift, ≪ any real 1-vote gap) cancels it.
  if (groundedTrue < Math.ceil(policy.minTrueFraction * n - 1e-9)) return 'abstain';
  return 'validated';
}

/**
 * Adapt a precomputed per-proposal vote map into the `AdmitDeps.verifyValidated` port. The map is keyed by the
 * proposal's `nodeKey` (its minted identity) — the orchestrator builds it by dispatching the rater ensemble per
 * proposed fact. This adapter only LOOKS UP + FOLDS; it makes no model call. A proposal with no verdict in the
 * map FAILS CLOSED to `abstain` (never `validated` on absent evidence).
 */
export function makeEnsemblePort(
  votesByNodeKey: ReadonlyMap<string, readonly RaterVerdict[]>,
  policy: EnsemblePolicy = CONSERVATIVE_POLICY,
): (p: PredicateProposal) => 'validated' | 'abstain' {
  return (p) => {
    const votes = votesByNodeKey.get(p.nodeKey);
    return votes === undefined ? 'abstain' : foldEnsembleVotes(votes, policy);
  };
}
