// @atlas/knowledge — barrel
//
// Layer 4: the write-decision / lifecycle / ratification / check-engine — the Knowledge kind of the
// Atlas (the shared, grounded, project-level truth). The implementation surface WPs fill in at
// execution. The skeleton ships zero runtime: every frozen interface lives in ref/*.ts until a WP
// implements it.
//
// The barrel re-exports the package's FULL public type surface so consumers can import from the bare
// package root (`import type { GroundedFact } from '@atlas/knowledge'`). ref/*.ts is type-only, hence
// `export type *`.

export type * from '../ref/types.js';
export type * from '../ref/router.js';
export type * from '../ref/template.js';
export type * from '../ref/emit.js';
export type * from '../ref/reconcile.js';
export type * from '../ref/init.js';
export type * from '../ref/tier.js';
export type * from '../ref/evaluator.js';
export type * from '../ref/authz.js';
export type * from '../ref/provenance.js';
export type * from '../ref/fastpath.js';
export type * from '../ref/status.js';
export type * from '../ref/ratify.js';
export type * from '../ref/store.js';
export type * from '../ref/archive.js';
export type * from '../ref/hits.js';
export type * from '../ref/produce.js';

// ── Runtime surface ────────────────────────────────────────────────────────────────────────────────
export * from './freshness.js';   // WP-4.10-a.KNOW — knowledge drift oracle binds to the grounding subtreeHash (Campaign-4)
export * from './emit.js';        // WP-4.11-a.KNOW — grounded emit: a fact is truth only if grounded (fail-closed)
export * from './status.js';      // WP-4.11-a.KNOW — status recompute drops the node-declared verdict (never self-declared)
export * from './reconcile.js';   // WP-4.12-a.KNOW — drift split: mechanical auto-reground, semantic block, reauthor==|semantic|
// Campaign-5 (knowledge lifecycle) runtime surface:
export * from './router.js';      // WP-5.13-a.KNOW — write-routing: every write an upsert (exhaustive over the KNOW-4 cells)
export * from './evaluator.js';   // WP-5.16.KNOW  — predicate check-engine: deterministic index-query, no code execution
export * from './produce.js';     // WP-5.17.KNOW  — production-moments: writes fire only at the 3 moments; sealing fed-or-why-not
// WP-5.14.KNOW (fact lifecycle) — unblocked by the R3 data-model reconciliation (ADR-0001):
export * from './template.js';    // KNOW-10 — required-field ∧ ≤512B cap ∧ closed-12-slot template validate
export * from './authz.js';       // KNOW-11 — inScope(actor, fact.scope) write-gate, fail-closed (reads the R3 scope field)
export * from './archive.js';     // KNOW-12 — supersede via CAS dedup, supersededBy as a Hash return-leg
// WP-5.15.KNOW (tier-routed ratification + confidence fast-path) — unblocked by R3 RatifyContext:
export * from './init.js';        // KNOW-6  — $0-LLM territory classify (tier=T2, T0-candidate flag)
export * from './tier.js';        // KNOW-7  — tier routing
export * from './ratify.js';      // KNOW-8  — T0 → human+billy (never auto), staged/token
export * from './fastpath.js';    // KNOW-18 — auto-accept ONLY grounded∧lowRisk∧T2∧advisory∧¬contested (route(candidate, ctx))
