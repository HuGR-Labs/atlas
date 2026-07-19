// @atlas/memory — barrel
//
// Layer 6: the per-member (per-seat + orchestrator) Memory kind — the member's own craft of DOING the
// work. Memory shares the ONE Atlas with Knowledge (same hashed index, grounding primitive, templated
// write, portable export) but is a DISTINCT kind, never conflated (MEM-2). Memory IMPORTS @atlas/retrieval
// (the allowed memory→retrieval edge that broke the RET⟷MEM cycle); retrieval NEVER imports memory. The
// implementation surface WPs fill in at execution — the skeleton ships zero runtime: every frozen
// interface lives in ref/*.ts until a WP implements it.
//
// The barrel re-exports the package's FULL public type surface so consumers can import from the bare
// package root (`import type { TurnHeader } from '@atlas/memory'`). ref/*.ts is type-only, hence
// `export type *`.

export type * from '../ref/types.js';
export type * from '../ref/kinds.js';
export type * from '../ref/cap.js';
export type * from '../ref/template.js';
export type * from '../ref/inject.js';
export type * from '../ref/orient.js';
export type * from '../ref/awareness.js';
export type * from '../ref/frecency.js';
export type * from '../ref/logbook.js';
export type * from '../ref/memoize.js';
export type * from '../ref/respawn.js';
export type * from '../ref/portable.js';

// Campaign-3 runtime surface: WP-3.5-a.MEM (memory-export + pre-write named-scanner gate) +
// WP-3.5-b.MEM (every memory type versioned & travels + recall pushed at re-spawn). `src/awareness.ts`
// (WP-6.24-a.MEM) is Campaign-6 — wired at that seal.
export * from './portable.js';
export * from './respawn.js';

// Campaign-6 runtime surface (serve — inject/scope + the three turn-header slabs):
export * from './inject.js';     // WP-6.23.MEM  — inject only own Memory; scoping-not-access-control; recall (CLI-floor)
export * from './kinds.js';      // WP-6.23.MEM  — Memory≠Knowledge partition gate (fail-closed on conflation)
export * from './awareness.js';  // WP-6.24-a.MEM — Awareness slab (root-assembled, per-facet grounded, UN-SEEDED sentinel)
export * from './orient.js';     // WP-6.24-b.MEM — Orientation slab (goal from DEFINE, event-log fold, never-written)
export * from './rules.js';      // WP-6.25-a.MEM — project Rules-slab (capped, top-12 frecency, evict-never-delete)
export * from './template.js';   // WP-6.25-b.MEM — MEM-5 fail-closed templated-write gate (validate/render)
export * from './logbook.js';    // WP-6.25-b.MEM — MEM-8 orchestrator-only append-only logbook (consultable-never-injected, supersede-by-link)
