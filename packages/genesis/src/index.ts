// @atlas/genesis — barrel
//
// Layer 8: the one-time BOOTSTRAP / composition root. Genesis seeds the Atlas onto an already-existing
// (brownfield) repo — DETERMINISTIC skeleton (S0/S1 `$0`-LLM, GEN-1/11), RATIONED intelligence (S2 the
// ONLY LLM entry, GEN-2), the HUMAN ratifies only the contested (S3, GEN-5) — then HANDS OFF to
// born-from-work (S4, GEN-7) and never remains a sweeper. As the composition root it imports DOWNWARD
// only (contracts / index / knowledge / memory) and is imported by no lower layer. The implementation
// surface WPs fill in at execution — the skeleton ships ZERO runtime: every frozen interface lives in
// ref/*.ts until a WP implements it.
//
// GEN-6 is structural in these types: `mine`/`rank` return `Candidate[]` (a ranked SITE, NEVER a fact);
// GEN-2 is structural too: `extract` is the sole facet whose signature admits the LLM. The barrel
// re-exports the package's FULL public type surface so consumers can import from the bare package root
// (`import type { GenesisReport } from '@atlas/genesis'`). ref/*.ts is type-only, hence `export type *`.

export type * from '../ref/types.js';
export type * from '../ref/scan.js';
export type * from '../ref/mine.js';
export type * from '../ref/rank.js';
export type * from '../ref/extract.js';
export type * from '../ref/predicate.js';
export type * from '../ref/align.js';
export type * from '../ref/handoff.js';
export type * from '../ref/seed.js';
export type * from '../ref/budget.js';
export type * from '../ref/resume.js';
