// @atlas/knowledge — ref/ratify.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The staging / ratifier gate (KNOW-8, spec A-7). Propose ≠ ratify: the explorer MAY write only
// CANDIDATES (staging); ratification is the reconcile/lead's — human for `T0` / contested / predicate,
// the deterministic fast-path (KNOW-18) for grounded low-risk `T2` advisory. The explorer never
// self-commits; `T0` requires billy. Transcribed from atlas-knowledge:58, 197-199 and
// method-tags-knw:67-72.
//
// [SIG-TBD — NO concrete signature frozen] method-tags-knw:70-72 describes the ROUTING (`candidate →
// staging → ratifier`; the explorer surface can write only to staging; no staged candidate is committed
// without a ratifier token; a `T0` candidate requires the billy token), but freezes NO concrete
// arg/return types for the gate. The surface below transcribes the reference-DESCRIBED operations with
// `unknown` for every unfrozen leg — flagged, NOT invented.

import type { Candidate } from './types.js';

export interface RatifyApi {
  /** The explorer's ONLY write path — stage a candidate (never commit directly, KNOW-8). Pure + total.
   *  [SIG-TBD] the staged-handle return type is not frozen → `unknown`. */
  stage(candidate: Candidate): unknown;

  /** The reconcile/lead ratifier gate: a staged candidate commits ONLY with a ratifier token; a `T0`
   *  candidate additionally requires the billy token (method-tags-knw:71). Pure + total.
   *  [SIG-TBD] the `staged` handle and the ratifier/billy `token` shapes are not frozen → `unknown`; the
   *  `committed` boolean is the one reference-implied return leg (no self-commit assertion). Flagged. */
  ratify(staged: unknown, token: unknown): { readonly committed: boolean };
}
