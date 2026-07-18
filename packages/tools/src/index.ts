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
