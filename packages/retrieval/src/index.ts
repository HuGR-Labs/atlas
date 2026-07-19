// @atlas/retrieval — barrel
//
// Layer 5: the retrieval harness — bounded packs / OwnPack / poke / injection budget. It decides WHAT
// knowledge reaches a worker and WHEN, with no embeddings and no RAG (A-14): relevance is resolved only
// by the deterministic hashed structural index over scope / dependency / trigger. Retrieval OWNS the
// pack / budget / drop mechanics and does NOT depend on @atlas/memory (the cycle was broken
// memory→retrieval). The implementation surface WPs fill in at execution. The skeleton ships zero
// runtime: every frozen interface lives in ref/*.ts until a WP implements it.
//
// The barrel re-exports the package's FULL public type surface so consumers can import from the bare
// package root (`import type { OwnPack } from '@atlas/retrieval'`). ref/*.ts is type-only, hence
// `export type *`.

export type * from '../ref/types.js';
export type * from '../ref/resolve.js';
export type * from '../ref/pack.js';
export type * from '../ref/rank.js';
export type * from '../ref/own.js';
export type * from '../ref/relate.js';
export type * from '../ref/bound.js';
export type * from '../ref/poke.js';
export type * from '../ref/project.js';
export type * from '../ref/drop.js';
export type * from '../ref/caps.js';
export type * from '../ref/ledger.js';
export type * from '../ref/stale.js';
export type * from '../ref/offatlas.js';

// ── Runtime surface (WP-filled at execution) ───────────────────────────────────────────────────────
export * from './relate.js';   // WP-2.8-b.RETR — partitioned, deterministic relate() over the index axes
export * from './pack.js';     // WP-6.19.RETR — the bounded pack (relevance-from-index, ~2K cap, T0-then-T1-by-rank)
export * from './own.js';      // WP-6.20.RETR — OwnPack (mechanical own_<unit>, capped, D1 content-free availability-manifest)
export * from './poke.js';     // WP-6.21.RETR — debounced once-per-scope poke (N=2 settle) + covering-set tool projection (pack-grain announce, X1)
export * from './drop.js';     // WP-6.22.RETR — injection-ceiling drop-order (ledger hitRate, 2 pins never drop) + stale-not-trusted
