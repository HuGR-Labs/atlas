// @atlas/knowledge — ref/provenance.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The provenance receipt (KNOW-14, spec A-9). Every persisted claim carries a `ClaimProvenance`; an
// UNTRUSTED-sourced claim is marked ADVISORY and EXCLUDED from the gate (0 toward `HOLDS`). Transcribed
// from atlas-knowledge:64, 210-211 and method-tags-knw:109-114.

import type { ClaimProvenance, GroundedFact } from './types.js';

export interface ProvenanceApi {
  /** Attach a provenance receipt to a fact (KNOW-14). Every persisted claim MUST carry a receipt. An
   *  `untrusted` (`prov.trusted === false`) source downgrades the fact to ADVISORY — it never reaches
   *  the truth gate (atlas-knowledge:27, 64). Pure + total.
   *
   *  [FLAG — return shape] Returns the receipted `GroundedFact`; on an untrusted source the returned
   *  fact is the advisory family (the predicate → advisory downgrade). Where the per-claim receipt is
   *  stored on the node is underspecified by the frozen shapes (the claim record is the kernel
   *  `ClaimEntry`, whose relation to `ClaimProvenance` is flagged in ref/types.ts). Flagged. */
  attach(fact: GroundedFact, prov: ClaimProvenance): GroundedFact;
}
