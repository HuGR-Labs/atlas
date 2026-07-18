// @atlas/persist — ref/reinvoke.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Re-invoke = idempotent redispatch + faithful replay — NOT deterministic resume (PERSIST-7 /
// PERSIST-10b). `redispatch` reproduces the seat from versioned git state (same brief → same seat);
// `replay` re-feeds the recorded `Checkpoint` I/O for audit. No API named/typed as a deterministic
// `resume` exists (method-tags-pst:98). (atlas-persist:105-106)

import type { Checkpoint } from './types.js';

/**
 * The audit view produced by replaying a recorded `Checkpoint`.
 * [SIG-TBD] The reference names `replay(checkpoint): TranscriptView` (atlas-persist:106) but freezes no
 * field shape for the view; kept opaque, flagged, not invented. (Distinct from the raw `Transcript`
 * body in `ref/transcript-store.ts`.)
 */
export type TranscriptView = unknown;

export interface ReinvokeApi {
  /** Idempotent redispatch from versioned git state (same brief → same seat) — NOT deterministic
   *  resume (PERSIST-10b). Returns a `Seat`, which is ORCHESTRATOR-owned (a higher layer), so the
   *  return + `record` arg are kept `unknown` [upward-type → unknown]. (atlas-persist:105) */
  redispatch(record: unknown): unknown;
  /** Faithful replay of the recorded LLM/tool I/O for audit. (atlas-persist:106) */
  replay(cp: Checkpoint): TranscriptView;
}
