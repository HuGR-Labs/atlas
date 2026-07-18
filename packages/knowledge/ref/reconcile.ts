// @atlas/knowledge — ref/reconcile.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The merge-time drift bisection (KNOW-5, spec A-3/A-4) — the machine behind `atlas-reconcile` (shared
// with TOOLS-8). Only SEMANTIC rot blocks; a moved anchor doesn't. The `DRIFTED` subset partitions
// EXACTLY into: MECHANICAL (the anchor moved but the claim still re-derives at the new `@sha` ⇒
// auto-re-grounded, no human, no block, exit 0) and SEMANTIC (the claim no longer re-derives ⇒ flips
// `BROKEN`, blocks, exit 2). Human re-author count MUST equal `|semantic|`, never `|DRIFTED|`, never `N`.
// Transcribed from atlas-knowledge:80, 191-193 and method-tags-knw:46-51.

import type { GroundedFact } from './types.js';

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
   *  [SIG-TBD — `drifted` element context] The reference names `reconcile(drifted[])`; each element is a
   *  drifted fact, but the per-element NEW-`@sha` re-derivation context that `reDerives(claim, newSha)`
   *  consumes is NOT frozen as a field. Transcribed as `readonly GroundedFact[]` (the drifted facts);
   *  the `newSha` carrier is flagged as underspecified, NOT invented.
   *
   *  [FLAG — `mechanical`/`semantic` as subsets vs counts] The reference uses cardinalities `|mechanical|`
   *  / `|semantic|`. Transcribed as the partitioned SUBSET arrays (the richer surface — cardinality is
   *  `.length`); flagged for the WP to confirm subsets vs bare counts. */
  reconcile(drifted: readonly GroundedFact[]): {
    readonly mechanical: readonly GroundedFact[];
    readonly semantic: readonly GroundedFact[];
    readonly reauthorCount: number;
    readonly exitCode: number; // reference names only {0, 2}
  };
}
