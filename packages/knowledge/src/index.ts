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
// `router.js` (WP-5.13-a) + `evaluator.js` (WP-5.16) are Campaign-5 — wired at that seal.
