// @atlas/memory — ref/respawn.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Recall fires at re-spawn (MEM-13) — a PUSH at spawn, not a discretionary pull. A re-spawned seat
// AUTO-receives its OWN prior `task` / `pr` closing fold (`attempted / failedWith / stoppedAt / lesson`)
// for the unit it is RESUMING, AT SPAWN — deterministic, ledger-driven off the unit's ARCHIVED fold. It is
// scoped to the seat's OWN fold for the RESUMED unit (never general consultable auto-injection — MEM-4
// still bars that on a running turn). A closing fold that no re-spawn ever recalls is DEAD WEIGHT — this
// makes the fold load-bearing. Reuses MEM-10's versioned-record archive as its source. Transcribed from
// method-tags-mem:105-110 (INV-MEM-13 down-model) + atlas-memory:127.

import type { MemberId, TaskMemoryEntry } from './types.js';

/**
 * The closing fold auto-recalled at re-spawn (MEM-13) — the retry-relevant subset of a `task` entry.
 * Transcribed as the `{ attempted, failedWith, stoppedAt, lesson }` projection of `TaskMemoryEntry`
 * (atlas-memory:19, 127). (`pr` folds carry the analogous decisions/outcomes subset of `PrMemoryEntry`.)
 */
export type ClosingFold = Pick<TaskMemoryEntry, 'attempted' | 'failedWith' | 'stoppedAt' | 'lesson'>;

/**
 * The unit a seat is resuming (a `task` / `pr` it previously touched — MEM-13).
 *
 * [PINNED — unit identity type] the reference names "the unit it is resuming" with no frozen id type;
 * transcribed as `{ kind, id }` over the two resumable kinds — `id` is `string`, NOT invented as a brand.
 */
export interface ResumeUnit {
  readonly kind: 'task' | 'pr'; // the resumable Memory kinds (project/logbook are not resumed folds)
  readonly id: string; // [PINNED] taskId / prId — no frozen brand
}

export interface RespawnApi {
  /** Push the seat's OWN archived closing fold for the resumed unit, ONCE at spawn — deterministic off
   *  the archived record, scoped to own + resumed only, fires at SPAWN (not on a running turn — MEM-13).
   *  Reuses MEM-10's versioned archive. Pure + deterministic. (method-tags-mem:109) */
  spawnRecall(seat: MemberId, unit: ResumeUnit): ClosingFold;
}
