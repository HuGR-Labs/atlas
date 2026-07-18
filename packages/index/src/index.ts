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
