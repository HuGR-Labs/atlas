// @atlas/knowledge — ref/ratify.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The staging / ratifier gate (KNOW-8, spec A-7). Propose ≠ ratify: the explorer MAY write only
// CANDIDATES (staging); ratification is the reconcile/lead's — human for `T0` / contested / predicate,
// the deterministic fast-path (KNOW-18) for grounded low-risk `T2` advisory. The explorer never
// self-commits; `T0` requires billy. Transcribed from atlas-knowledge:58, 197-199 and
// method-tags-knw:67-72.
//
// [PINNED — oracle-pin-map §8] method-tags-knw:70-72 freezes the ROUTING (`candidate → staging →
// ratifier`; explorer writes only to staging; no staged candidate commits without a ratifier token; a
// `T0` candidate requires the billy token) but no concrete gate types. The oracle-pin ratifies the
// minimal honest handle/token records (`Staged`, `RatifyToken`) transcribed from that routing.

import type { Candidate, PredicateNode } from './types.js';

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
   *  [PINNED — oracle-pin-map §8] returns the minimal `Staged` handle. */
  stage(candidate: Candidate): Staged;  // Staged.node carries the staged Candidate (see types below)

  /** The reconcile/lead ratifier gate: a staged candidate commits ONLY with a ratifier token; a `T0`
   *  candidate additionally requires the billy token (method-tags-knw:71). Pure + total.
   *  [PINNED — oracle-pin-map §8] `staged`/`token` pin to the minimal `Staged`/`RatifyToken` records; the
   *  `committed` boolean is the reference-implied return leg (no self-commit assertion). */
  ratify(staged: Staged, token: RatifyToken): { readonly committed: boolean };
}
