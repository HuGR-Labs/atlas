// @atlas/tools — barrel
//
// Layer 7: the PUBLIC tool / OKF surface — the Atlas's whole read/write API. The GOVERNANCE (write)
// surface is EXACTLY four tools — `atlas-init`, `atlas-query`, `atlas-emit`, `atlas-reconcile` — and the
// ONLY write path is `atlas-emit` (TOOLS-1, structurally enforced by the single-write-door guard,
// TOOLS-15). `atlas-diff` (TOOLS-16), `atlas doctor` (TOOLS-12), and the per-node projections (TOOLS-10)
// are READ-ONLY views of the same store, carrying NO write authority — NOT a fifth governance tool. tools
// is the composition-neighbor: it imports downward (contracts / persist / knowledge / retrieval) and is
// imported by no lower layer. The implementation surface WPs fill in at execution — the skeleton ships
// zero runtime: every frozen interface lives in ref/*.ts until a WP implements it.
//
// The barrel re-exports the package's FULL public type surface so consumers can import from the bare
// package root (`import type { Verdict } from '@atlas/tools'`). ref/*.ts is type-only, hence
// `export type *`.

export type * from '../ref/types.js';
export type * from '../ref/init.js';
export type * from '../ref/query.js';
export type * from '../ref/emit.js';
export type * from '../ref/reconcile.js';
export type * from '../ref/diff.js';
export type * from '../ref/doctor.js';
export type * from '../ref/node.js';
export type * from '../ref/handler.js';
export type * from '../ref/transport.js';
export type * from '../ref/guard.js';

// ── Runtime surface (Campaign-4) ───────────────────────────────────────────────────────────────────
export * from './emit.js';        // WP-4.11-a.TOOLS — atlas-emit re-derives citation at source@sha, fail-closed reject
export * from './reconcile.js';   // WP-4.12-a.TOOLS — atlas-reconcile: classify drift into a reviewable DriftItem[] (exit 2 on semantic)
// Campaign-8:
export * from './init.js';        // WP-8.27.TOOLS — atlas-init move-in: $0-LLM structural skeleton + blast radius + T0-candidate flags
// ── Campaign-7 runtime surface (the governed tool / OKF public surface) ──────────────────────────────
export * from './guard.js';       // WP-7.26-a.TOOLS — single governed write-door + append-only/permissioned store
export * from './handler.js';     // WP-7.26-a/-b/-c.TOOLS — one pure+total handler (surface==4, write==atlas-emit) + schema + resolveNode
export * from './query.js';       // WP-7.26-b.TOOLS — atlas-query read projection
export * from './doctor.js';      // WP-7.26-b.TOOLS — read/advisory-only doctor (persists nothing; reground → plan via atlas-emit)
export * from './transport.js';   // WP-7.26-c.TOOLS — tri-transport addressability + spawn ladder (one contract across MCP/poke/CLI, CLI-floor)
export * from './diff.js';        // WP-7.32.TOOLS — atlas-diff read-only version-delta projection (CLI≡MCP, not a 5th tool)
