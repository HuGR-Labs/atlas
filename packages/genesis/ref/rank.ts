// @atlas/genesis — ref/rank.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The PPR-frontier ranking — the DETERMINISM LAW (GEN-11, method-tags-gen:86-91, the sole `PBT` tag in
// Block GEN). Transcribed from atlas-genesis §S1 "Rank" (lines 56-59) + GEN-3 (importance-surface) +
// GEN-11 (reproducible ranking). Ranking is a PERSONALIZED PageRank over the def→ref graph (the Aider
// repo-map technique): nodes = symbols/files, edge `referencing → defining`, weighted by identifier
// salience; the personalization vector is the union of the hotspot / SZZ / coupling frontiers. It carries
// NO model and NO randomness, has PINNED damping + seed, breaks numeric ties with a stable total order,
// and reproduces BYTE-IDENTICALLY across runs and machines (GEN-11). Cost tracks the frontier, never
// file/line count (GEN-3). No embedding / vector store / ANN anywhere (GEN-10 / A-14).

import type { StructRef } from '@atlas/contracts';
import type { Candidate } from './types.js';
import type { Skeleton } from './scan.js';

// [ratified constants — values TBD by WP] the PPR `damping` factor and the deterministic tie-break `seed`
// are PINNED (GEN-11): re-running with the same pins on the same rev ⇒ an identical ranking. The concrete
// numeric values are a WP concern and are NOT invented here.

export interface RankApi {
  /** DETERMINISTIC personalized-PageRank ranking (GEN-11). Pure function of the def→ref graph (carried by
   *  the S0 `Skeleton`'s dependency axis) + the personalization vector (the union of the hotspot / SZZ /
   *  coupling frontier SITES). Returns the ranked `Candidate[]` with `ppr`/`rank` filled — a stable total
   *  order (numeric ties broken deterministically), byte-identical across runs. NEVER facts (GEN-6).
   *
   *  [FLAG — arg carriers] the surface folds ranking INTO `mine` (no standalone `rank(...)` line), so the
   *  arg carriers are reference-attributed, NOT frozen literals: `graph` transcribed as the S0 `Skeleton`
   *  (which carries the def→ref dependency axis); `personalization` as the frontier `StructRef[]` (the
   *  "union of the hotspot / SZZ / coupling frontiers", atlas-genesis:58). On a GEN-15 history-thin repo
   *  the personalization vector is the STRUCTURAL + type/API-surface set instead (same signature). */
  rank(graph: Skeleton, personalization: readonly StructRef[]): readonly Candidate[];
}
