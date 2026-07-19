// @atlas/knowledge — src/ratify.ts  (WP-5.15.KNOW · EPIC-15)
//
// The staging / ratifier gate (KNOW-8). Propose ≠ ratify: the explorer MAY write only CANDIDATES
// (staging); ratification is the reconcile/lead's. The explorer never self-commits; a `T0` candidate
// requires billy. Binds the FROZEN, PINNED `RatifyApi` (co-located below): `stage(candidate): Staged` and
// `ratify(staged, token): { committed: boolean }`, over the minimal `Staged`/`RatifyToken` records.
//
// FACET BOUNDARY (BIND — resolved vs the frozen RatifyApi, co-located below):
//  • [PINNED — oracle-pin-map §8] the gate types (`Staged{node}`, `RatifyToken{by}`) are frozen; this
//    facet supplies ONLY the routing method-tags-knw:70-72 freezes: `candidate → staging → ratifier`,
//    the explorer writes only to staging, no staged candidate commits without a ratifier token, and a
//    `T0` candidate requires the billy token. The single-`by` token models "requires billy" as a token
//    whose ratifier IS billy (the frozen signature carries one token — the honest binding).

import type { Candidate } from './types.js';

// ── frozen RatifyApi surface, co-located here (was ref/ratify.ts) ─────────────────────────────────────

/**
 * The staged-handle a candidate becomes on the explorer's write path (KNOW-8). [PINNED —
 * oracle-pin-map §8] minimal honest record: the node held in staging, un-committed until ratified.
 */
export interface Staged {
  readonly node: Candidate;
}

/**
 * The ratifier/billy token that authorizes a commit (method-tags-knw:70-72). [PINNED — oracle-pin-map §8]
 * minimal honest record: `by` names the ratifier (human for T0 / contested / predicate).
 */
export interface RatifyToken {
  readonly by: string;
}

export interface RatifyApi {
  /** The explorer's ONLY write path — stage a candidate (never commit directly, KNOW-8). Pure + total.
   *  Returns the minimal `Staged` handle. */
  stage(candidate: Candidate): Staged;

  /** The reconcile/lead ratifier gate: a staged candidate commits ONLY with a ratifier token; a `T0`
   *  candidate additionally requires the billy token (method-tags-knw:71). Pure + total. The `committed`
   *  boolean is the reference-implied return leg (no self-commit assertion). */
  ratify(staged: Staged, token: RatifyToken): { readonly committed: boolean };
}

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
