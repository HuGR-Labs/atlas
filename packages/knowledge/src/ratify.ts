// @atlas/knowledge — src/ratify.ts  (WP-5.15.KNOW · EPIC-15)
//
// The staging / ratifier gate (KNOW-8). Propose ≠ ratify: the explorer MAY write only CANDIDATES
// (staging); ratification is the reconcile/lead's. The explorer never self-commits; a `T0` candidate
// requires billy. Binds the FROZEN, PINNED `RatifyApi` (ref/ratify.ts): `stage(candidate): Staged` and
// `ratify(staged, token): { committed: boolean }`, over the minimal `Staged`/`RatifyToken` records.
//
// FACET BOUNDARY (BIND — resolved vs FROZEN oracle ref/ratify.ts):
//  • [PINNED — oracle-pin-map §8] the gate types (`Staged{node}`, `RatifyToken{by}`) are frozen; this
//    facet supplies ONLY the routing method-tags-knw:70-72 freezes: `candidate → staging → ratifier`,
//    the explorer writes only to staging, no staged candidate commits without a ratifier token, and a
//    `T0` candidate requires the billy token. The single-`by` token models "requires billy" as a token
//    whose ratifier IS billy (the frozen signature carries one token — the honest binding).

import type { Candidate } from '../ref/types.js';
import type { Staged, RatifyToken, RatifyApi } from '../ref/ratify.js';

/** The security-gate ratifier a `T0` commit requires (method-tags-knw:71). */
export const BILLY = 'billy';

/**
 * The explorer's ONLY write path — stage a candidate (never commit directly, KNOW-8). Pure + total; the
 * node is held in staging, un-committed until the reconcile/lead ratifies.
 */
export function stage(candidate: Candidate): Staged {
  return { node: candidate };
}

/**
 * The reconcile/lead ratifier gate (KNOW-8): a staged candidate commits ONLY with a ratifier token; a
 * `T0` candidate additionally requires the billy token. Pure + total.
 *  - no ratifier token (empty `by`)  ⇒ not committed (propose/ratify separation holds);
 *  - a `T0` staged node with a non-billy ratifier ⇒ refused (the T0 gate is not bypassed);
 *  - otherwise ⇒ committed.
 */
export function ratify(staged: Staged, token: RatifyToken): { readonly committed: boolean } {
  if (token.by.length === 0) return { committed: false }; // no ratifier token
  if (staged.node.tier === 'T0' && token.by !== BILLY) return { committed: false }; // T0 requires billy
  return { committed: true };
}

/** The frozen-`RatifyApi` binding (conformance handle). */
export const ratifier: RatifyApi = { stage, ratify };
