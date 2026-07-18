// @atlas/genesis — ref/handoff.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// S4 — handoff to self-hosting (GEN-7, method-tags-gen:58-63). Transcribed from atlas-genesis §S4 (lines
// 96-99) + §Surface (line 190) + acceptance 7. Genesis TERMINATES by handing control to born-from-work
// (KNOW-13) — it is NOT a standing sweeper. A re-run is INCREMENTAL + IDEMPOTENT: SCIP / stack-graphs
// re-index ONLY changed files, a query-based recompute (Salsa / rust-analyzer / Bazel) touches only
// affected nodes, and already-grounded facts UPSERT (KNOW-15), never a second sweep — `genesis∘genesis ≡
// genesis` on the grounded set (0 duplicates).

import type { Delta } from '@atlas/index';
import type { GenesisReport } from './types.js';
import type { Skeleton } from './scan.js';

export interface HandoffApi {
  /** S4 one-time handoff (GEN-7). Ends the one-time seeding and hands control to born-from-work (KNOW-13).
   *  NOT a standing sweeper. Total — never throws. */
  handoff(): void;

  /** The bounded change set since a `prior` skeleton (INDEX-12 / GEN-7). Re-indexes ONLY the changed
   *  buckets, never `N` — the `Delta` (`{idChanged, stateChanged, changedBuckets}`) reused verbatim from
   *  @atlas/index. Bounds the incremental re-run below. */
  changed(prior: Skeleton, rev: string): Delta;

  /** INCREMENTAL idempotent re-run (GEN-7). Re-indexes only the changed files (via `changed`) and UPSERTS
   *  already-grounded facts by id (0 duplicates, KNOW-15); a second run over an unchanged rev is a no-op
   *  on the grounded set. Total — a malformed rev ⇒ a partial report, never a throw (GEN-8). */
  rerun(repo: string, rev: string, prior: Skeleton): GenesisReport;
}
