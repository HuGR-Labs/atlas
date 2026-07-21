// @atlas/tools — barrel
//
// Layer 7: the PUBLIC tool / OKF surface — the Atlas's whole read/write API. The GOVERNANCE surface is
// EXACTLY five tools — `atlas-init`, `atlas-query`, `atlas-emit`, `atlas-reconcile`, `atlas-link` — and
// every write flows through one of the TWO governed write doors, `atlas-emit` (grounded facts) or
// `atlas-link` (sameAs edges) (TOOLS-1 / ADR-0003; grounded-row integrity structurally enforced by the
// governed-store guard, TOOLS-15). `atlas-diff` (TOOLS-16), `atlas doctor` (TOOLS-12), and the per-node
// projections (TOOLS-10) are READ-ONLY views of the same store, carrying NO write authority — NOT
// governance tools.
// Re-exports the package's FULL public surface so consumers import from the bare package root
// (`import type { Verdict } from '@atlas/tools'`). Each frozen interface is co-located with its impl; the
// shared (handler) and impl-less (node) ones live in types.ts.

// The frozen data model + the co-located API interfaces no single impl owns (ToolData / Transport /
// HandlerApi, consumed by ≥2 src files; NodeApi, which no src file re-exports). Every other frozen
// interface now lives beside its impl and is re-exported by `export *` from the runtime files below.
export type * from './types.js';

// ── Runtime surface (the governed tool / OKF public surface) ─────────────────────────────────────────
export * from './emit.js';        // WP-4.11-a.TOOLS — atlas-emit re-derives citation at source@sha, fail-closed reject
export * from './reconcile.js';   // WP-4.12-a.TOOLS — atlas-reconcile: classify drift into a reviewable DriftItem[] (exit 2 on semantic)
export * from './init.js';        // WP-8.27.TOOLS — atlas-init move-in: $0-LLM structural skeleton + blast radius + T0-candidate flags
export * from './guard.js';       // WP-7.26-a.TOOLS — single governed write-door + append-only/permissioned store
export * from './handler.js';     // WP-7.26-a/-b/-c.TOOLS — one pure+total handler (surface==4, write==atlas-emit) + schema + resolveNode
export * from './query.js';       // WP-7.26-b.TOOLS — atlas-query read projection
export * from './doctor.js';      // WP-7.26-b.TOOLS — read/advisory-only doctor (persists nothing; reground → plan via atlas-emit)
export * from './transport.js';   // WP-7.26-c.TOOLS — tri-transport addressability + spawn ladder (one contract across MCP/poke/CLI, CLI-floor)
export * from './diff.js';        // WP-7.32.TOOLS — atlas-diff read-only version-delta projection (CLI≡MCP, not a 5th tool)
export * from './push.js';        // WP-6.22.TOOLS — TOOLS-14 phase-transition auto-inject (push-no-grant, mid-task pull non-load-bearing)
