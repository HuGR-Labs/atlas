// @atlas/grounding — barrel
//
// Layer 3: the truth-gate / drift-oracle / two-door admission. The implementation surface WPs fill in
// at execution. The skeleton ships zero runtime: every frozen interface lives in ref/*.ts until a WP
// implements it.
//
// The barrel re-exports the package's FULL public type surface so consumers can import from the bare
// package root (`import type { Grounding } from '@atlas/grounding'`). ref/*.ts is type-only, hence
// `export type *`.

export type * from '../ref/types.js';
export type * from '../ref/anchor.js';
export type * from '../ref/subtree.js';
export type * from '../ref/ground.js';
export type * from '../ref/drift.js';
export type * from '../ref/gate.js';
export type * from '../ref/admit.js';
