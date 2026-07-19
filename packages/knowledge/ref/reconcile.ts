// @atlas/knowledge — ref/reconcile.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The merge-time drift bisection (KNOW-5, spec A-3/A-4) — the machine behind `atlas-reconcile` (shared
// with TOOLS-8). Only SEMANTIC rot blocks; a moved anchor doesn't. The `DRIFTED` subset partitions
// EXACTLY into: MECHANICAL (the anchor moved but the claim still re-derives at the new `@sha` ⇒
// auto-re-grounded, no human, no block, exit 0) and SEMANTIC (the claim no longer re-derives ⇒ flips
// `BROKEN`, blocks, exit 2). Human re-author count MUST equal `|semantic|`, never `|DRIFTED|`, never `N`.
// Transcribed from atlas-knowledge:80, 191-193 and method-tags-knw:46-51.

import type { Hash } from '@atlas/contracts';
import type { GroundedFact } from './types.js';

/**
 * A drifted fact paired with the NEW `@sha` its claim must re-derive against (KNOW-5). [PINNED —
 * oracle-pin-map §11] the minimal threading of the `reDerives(claim, newSha)` context method-tags-knw
 * INV-KNOW-5 consumes — no invented fields beyond the fact + its new-sha re-derivation anchor.
 */
export interface DriftedFact {
  readonly fact: GroundedFact;
  readonly newSha: Hash;
}

export interface ReconcileApi {
  /** Partition the `DRIFTED` subset by `reDerives(claim, newSha)` (KNOW-5). Pure + total; the re-check
   *  is a pure re-hash at the grounding `subtreeHash` — no clock, no IO (atlas-knowledge:95-96).
   *
   *  Returns:
   *   - `mechanical`   — the auto-re-grounded subset (claim re-derives at the new `@sha`); exit 0.
   *   - `semantic`     — the `BROKEN` subset (claim no longer re-derives); blocks.
   *   - `reauthorCount`— MUST equal `|semantic|` (never `|DRIFTED|`, never `N`) — method-tags-knw:50.
   *   - `exitCode`     — 0 when `semantic` is empty; 2 to block the merge on ANY semantic flip
   *                      (atlas-knowledge:80, 193). Reference names only exits {0, 2}.
   *
   *  [PINNED — oracle-pin-map §11] The reference names `reconcile(drifted[])` partitioning by
   *  `reDerives(claim, newSha)`; the per-element NEW-`@sha` re-derivation context is threaded as the
   *  minimal `DriftedFact` pair (fact ‖ newSha). The `mechanical`/`semantic` returns stay the partitioned
   *  `GroundedFact` subsets (cardinality is `.length`).
   *
   *  [FLAG — `mechanical`/`semantic` as subsets vs counts] The reference uses cardinalities `|mechanical|`
   *  / `|semantic|`. Transcribed as the partitioned SUBSET arrays (the richer surface — cardinality is
   *  `.length`); flagged for the WP to confirm subsets vs bare counts. */
  reconcile(drifted: readonly DriftedFact[]): {
    readonly mechanical: readonly GroundedFact[];
    readonly semantic: readonly GroundedFact[];
    readonly reauthorCount: number;
    readonly exitCode: number; // reference names only {0, 2}
  };
}
