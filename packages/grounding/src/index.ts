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

// ── Runtime surface (Campaign-4) ───────────────────────────────────────────────────────────────────
export * from './gate.js';        // WP-4.11-a.GROUND — truth-gate: HOLDS only when grounded ∧ FRESH (fail-closed)
export * from './emit-guard.js';  // WP-4.11-a.GROUND — GROUND-6 truth-door + GROUND-9 structured-template validate
export * from './subtree.js';     // WP-4.10-a.GROUND — subtreeHash via the sealed kernel Encoder (seam-swappable)
export * from './drift.js';       // WP-4.10-a.GROUND — driftDetect + isGrounded (local subtreeHash-equality oracle)
export * from './freshness.js';   // WP-4.10-b.GROUND — transitive freshness fold (own hash + closure interface)
export * from './ground.js';      // WP-4.10-c.GROUND — ground() anchor builder: re-derive anchor@src, fail-closed drop unresolvable (GROUND-3); node-type pinned from the frozen anchor model (StructRef minus the re-derived subtreeHash)
