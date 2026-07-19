// @atlas/index — barrel
//
// The implementation surface WPs fill in at execution. The skeleton ships zero runtime: every frozen
// interface lives in ref/*.ts until a WP implements it.
//
// The barrel re-exports the package's FULL public type surface so consumers can import from the bare
// package root (`import type { IndexNode } from '@atlas/index'`). ref/*.ts is type-only, hence
// `export type *`. NOTE `../ref/index.js` is the FACET file (the single-index umbrella surface),
// distinct from this runtime barrel `src/index.ts` — it is re-exported too.

export type * from '../ref/types.js';
export type * from '../ref/index.js';
export type * from '../ref/build.js';
export type * from '../ref/cas.js';
export type * from '../ref/coverage.js';
export type * from '../ref/depgraph.js';
export type * from '../ref/fold.js';
export type * from '../ref/ownership.js';
export type * from '../ref/resolve.js';
export type * from '../ref/retrieval.js';
export type * from '../ref/rollup.js';
export type * from '../ref/territory.js';

// ── Runtime surface (Campaign-2 index facets, WP-filled at execution) ──────────────────────────────
// Each facet's public runtime exports, wired at SEAL by the lead. `src/cas.ts` (WP-4.10-a.INDEX,
// Campaign-4) is intentionally NOT wired here — it is exported at the Campaign-4 seal.
export * from './build.js';        // WP-2.6.INDEX   — mechanical $0-LLM axis build
export * from './depgraph.js';     // WP-2.6/2.8-b   — dependency axis + honest-edge reverse closure
export * from './rollup.js';       // WP-2.7-a.INDEX — structural rollup (leaf→root re-hash)
export * from './fold.js';         // WP-2.7-a/2.7-b — delta + drift (dirty-bit, lazy rState, maxHops)
export * from './resolve.js';      // WP-2.8-a.INDEX — three-mode resolve
export * from './retrieval.js';    // WP-2.8-a.INDEX — read-model retrieval
export * from './territory.js';    // WP-2.9-a.INDEX — territory assignment
export * from './ownership.js';    // WP-2.9-a.INDEX — ownership reconcile
export * from './coverage.js';     // WP-2.9-b.INDEX — per-territory unresolved-ratio gate
