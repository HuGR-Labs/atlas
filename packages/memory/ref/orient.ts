// @atlas/memory — ref/orient.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Orientation — "where the project is NOW" (MEM-6). The second injected slab: DERIVED + SHARED, never a
// written memory (so it can never rot). `goal` is assembled from the ratified DEFINE artifact;
// `last/current/state` are a FOLD over the event log (reuses KERNEL-5 `fold.ts`). Byte-identical across
// ALL members, `≤ ~250 tok`. It MUST NOT be a per-member written entry. Transcribed from
// method-tags-mem:56-61 (INV-MEM-6 down-model) + atlas-memory:50-53, spec/memory:73-78.

import type { EventLog } from '@atlas/kernel';

/**
 * The Orientation slab (atlas-memory:50-53). `{ goal, last, current, state }`, each `≤ 1 line`.
 *   - `goal`    — the current MILESTONE (not the enduring mission — that is Awareness). From DEFINE.
 *   - `last`    — the last milestone (fold over the event log).
 *   - `current` — the current milestone (fold).
 *   - `state`   — the moving state (fold).
 * Each transcribed as `string` (a `≤ 1-line` derived line).
 */
export interface Orientation {
  readonly goal: string; // from the ratified DEFINE artifact
  readonly last: string; // fold over the event log
  readonly current: string; // fold over the event log
  readonly state: string; // fold over the event log
}

export interface OrientApi {
  /** Assemble Orientation as a PURE function of (DEFINE artifact, event log): `goal` from DEFINE,
   *  `last/current/state` as a fold over the log — no per-seat input, so byte-identical across members and
   *  never stale (MEM-6). Reuses KERNEL-5 `fold.ts`. (method-tags-mem:60)
   *
   *  [OPAQUE-BY-DESIGN — `define` type] the ratified DEFINE artifact has no frozen type at this layer (it is a
   *  genesis GEN-9 artifact); transcribed as `unknown` rather than invented/imported. Flagged. */
  orient(define: unknown, log: EventLog): Orientation;
}
