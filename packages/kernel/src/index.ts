// @atlas/kernel — barrel
//
// The implementation surface WPs fill in at execution. For the skeleton, the only runtime export is
// the branded-value mint boundary (src/brand.ts) — the sanctioned cast sites for Hash/SubtreeHash/
// NodeKey. Everything else lives frozen in ref/*.ts until a WP implements it.
//
// The barrel re-exports the package's FULL public type surface so consumers can import from the bare
// package root (`import type { Event } from '@atlas/kernel'`). ref/*.ts is type-only, hence
// `export type *`; the brand line below is the sole runtime (value) export.

export type * from '../ref/types.js';
export type * from '../ref/encoder.js';
export type * from '../ref/canonical.js';
export type * from '../ref/store.js';
export type * from '../ref/log.js';
export type * from '../ref/fold.js';
export type * from '../ref/portable.js';

export { asHash, asSubtreeHash, asNodeKey } from './brand.js';

// WP-1.1-a.KERNEL runtime surface: the content-addressed identity primitives.
export { canonicalForm, id } from './canonical.js';
export { defaultEncoder } from './encoder.js';

// WP-1.2-a.KERNEL runtime surface: the single CAS + append-only event log.
export { createStore } from './store.js';
export { createLog } from './log.js';

// WP-1.1-b.KERNEL runtime surface: self-contained open-JSON (OKF) export/import.
export { exportCas, importCas, makePortable } from './portable.js';

// WP-1.2-b.KERNEL runtime surface: fold() reconstruction over the event log.
export { fold } from './fold.js';
