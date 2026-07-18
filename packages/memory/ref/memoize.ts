// @atlas/memory — ref/memoize.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Memoized assembly (MEM-12) — can't-rot ≠ cheap-to-assemble. "Byte-stable" makes Awareness un-rottable,
// NOT free to assemble: re-rolling five facets + drift-checking each `node@sha` per seat per turn is real
// work. So each Awareness facet is CACHED keyed on ITS OWN source's subtree hash (constitution set /
// territory-axis top / `CONVENTIONS.md@sha`) — NOT the root `rId‖rState` (which moves whenever ANYTHING
// moves ⇒ ~always-miss on a busy repo); a facet re-rolls only when ITS source moves. Awareness is
// assembled ONCE per root-state, SHARED across seats (0 per-seat re-roll). On an unchanged `rId‖rState`
// turn: 0 facet re-rolls + 0 per-`node@sha` drift-checks (cache hit). Orientation is an INCREMENTAL FOLD
// over only the newly-appended event-log tail, never a full replay. Checked by an instrumented
// re-roll/drift-check COUNTER (0 on cache hit), NOT by timing (latency is Refuse-to-model). Transcribed
// from method-tags-mem:98-103 (INV-MEM-12 down-model) + atlas-memory:60-66, 126.
//
// The composed-briefing memo is keyed by CONTENT HASH (`Hash`, contracts); the per-facet cache is keyed by
// the source's `SubtreeHash` (contracts) — the fine key that avoids the always-miss root key.

import type { Hash } from '@atlas/contracts';
import type { EventLog, Node } from '@atlas/kernel';
import type { Awareness } from './awareness.js';
import type { Orientation } from './orient.js';

/**
 * The instrumented assembly receipt (MEM-12) — the correctness oracle. On a cache hit BOTH counters are
 * `0`; a re-roll increments ONLY for the moved facet. This is a call-counter correctness check (NOT a
 * timing/latency measure — Refuse-to-model).
 */
export interface AssemblyReceipt {
  readonly key: Hash; // the memo key — the composed briefing's content hash
  readonly reRolls: number; // facet re-rolls performed (0 on a cache hit)
  readonly driftChecks: number; // per-node@sha drift-checks performed (0 on a cache hit)
}

/** A memoized assembly = the byte-stable output + its instrumented receipt. */
export interface Memoized<T> {
  readonly value: T;
  readonly receipt: AssemblyReceipt;
}

export interface MemoizeApi {
  /** Assemble Awareness ONCE per root-state, shared across seats, with each facet cached on ITS OWN
   *  source subtree hash — 0 re-rolls + 0 drift-checks on an unchanged root (cache hit), a re-roll only
   *  for a moved facet (MEM-12). (method-tags-mem:102) */
  assembleAwareness(root: Node): Memoized<Awareness>;

  /** Fold Orientation INCREMENTALLY over only the newly-appended event-log `tail`, never a whole-log
   *  replay (MEM-12). Pure. (method-tags-mem:102) */
  foldOrientation(prev: Orientation, tail: EventLog): Orientation;
}
