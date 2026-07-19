// @atlas/knowledge — barrel
//
// Layer 4: the write-decision / lifecycle / ratification / check-engine — the Knowledge kind of the
// Atlas (the shared, grounded, project-level truth). Re-exports the package's FULL public surface so
// consumers import from the bare package root (`import type { GroundedFact } from '@atlas/knowledge'`).
// Each frozen interface is co-located with its impl; the shared/multi-consumer ones (EvaluatorApi /
// StoreApi) live in types.ts beside the data model.

// The frozen data model + the co-located EvaluatorApi / StoreApi interfaces consumed by ≥2 src files.
// Every other frozen interface now lives beside its impl and is re-exported by `export *` below.
export type * from './types.js';

// ── Runtime surface ────────────────────────────────────────────────────────────────────────────────
export * from './lifecycle/freshness.js';   // WP-4.10-a.KNOW — knowledge drift oracle binds to the grounding subtreeHash (Campaign-4)
export * from './lifecycle/emit.js';        // WP-4.11-a.KNOW — grounded emit: a fact is truth only if grounded (fail-closed)
export * from './lifecycle/status.js';      // WP-4.11-a.KNOW — status recompute drops the node-declared verdict (never self-declared)
export * from './lifecycle/reconcile.js';   // WP-4.12-a.KNOW — drift split: mechanical auto-reground, semantic block, reauthor==|semantic|
// Campaign-5 (knowledge lifecycle) runtime surface:
export * from './write/router.js';      // WP-5.13-a.KNOW — write-routing: every write an upsert (exhaustive over the KNOW-4 cells)
export * from './lifecycle/evaluator.js';   // WP-5.16.KNOW  — predicate check-engine: deterministic index-query, no code execution
export * from './lifecycle/produce.js';     // WP-5.17.KNOW  — production-moments: writes fire only at the 3 moments; sealing fed-or-why-not
// WP-5.14.KNOW (fact lifecycle) — unblocked by the R3 data-model reconciliation (ADR-0001):
export * from './write/template.js';    // KNOW-10 — required-field ∧ ≤512B cap ∧ closed-12-slot template validate
export * from './write/authz.js';       // KNOW-11 — inScope(actor, fact.scope) write-gate, fail-closed (reads the R3 scope field)
export * from './write/archive.js';     // KNOW-12 — supersede via CAS dedup, supersededBy as a Hash return-leg
// WP-5.15.KNOW (tier-routed ratification + confidence fast-path) — unblocked by R3 RatifyContext:
export * from './ratify/init.js';        // KNOW-6  — $0-LLM territory classify (tier=T2, T0-candidate flag)
export * from './ratify/tier.js';        // KNOW-7  — tier routing
export * from './ratify/ratify.js';      // KNOW-8  — T0 → human+billy (never auto), staged/token
export * from './ratify/fastpath.js';    // KNOW-18 — auto-accept ONLY grounded∧lowRisk∧T2∧advisory∧¬contested (route(candidate, ctx))
// Campaign-6:
export * from './lifecycle/hits.js';        // WP-6.18.KNOW — served-fact hits ledger + door-2 threshold calibration + decay/re-entry
