// @atlas/persist — src/reinvoke.ts  (WP-3.5-b.PERSIST)
//
// Re-invoke = idempotent redispatch + faithful replay — NEVER deterministic resume (PERSIST-7 / 10b).
// `redispatch(record)` reproduces the seat PURELY from the versioned git record (same brief → same seat,
// A-18): it is a total, deterministic function of its input alone, so it reads ZERO non-git state — no
// clock, entropy, host env, local cache, network, or live model (REQ-PERSIST-7-a / 7-b / 10b-b).
// `replay(checkpoint)` re-feeds the RECORDED LLM/tool I/O straight from the structured `Checkpoint`
// substrate — a faithful audit re-feed, never a live re-invocation (REQ-PERSIST-10b-c). The substrate is
// the `Checkpoint` (seatBrief + llmOutputs + toolIO), DISTINCT from the raw transcript large object
// (REQ-PERSIST-10b-d). No member named/typed as a deterministic `resume`-from-where-it-stopped exists on
// this surface (REQ-PERSIST-10b-a).
//
// The seat identity is the content hash of the seat brief over the SEALED @atlas/kernel `id` seam — never a
// hand-rolled digest (KERNEL-1). The `Seat` and the input `record` are ORCHESTRATOR-owned (a higher layer),
// so they stay `unknown` at this boundary — no upward import / DAG inversion. No hash, clock, network, or
// live model is read here.

import { id } from '@atlas/kernel';
import type { Hash } from '@atlas/contracts';
import type { Checkpoint } from '../ref/types.js';
import type { ReinvokeApi } from '../ref/reinvoke.js';

// ── idempotent redispatch (REQ-PERSIST-7-a / 10b-b) ─────────────────────────────────────────────────────

/** The canonical seat brief extracted from a git-versioned record: the record's own `seatBrief` when it
 *  carries one, a bare string brief as-is, else the whole record. Pure over its input — no external read. */
function briefOf(record: unknown): unknown {
  if (typeof record === 'string') return record;
  if (typeof record === 'object' && record !== null && 'seatBrief' in record) {
    return (record as { seatBrief: unknown }).seatBrief;
  }
  return record;
}

/**
 * Idempotent redispatch: the seat identity is the content hash of the brief over the SEALED kernel `id`
 * seam — the same brief maps to the same seat (A-18) on any machine / user / clone / fork, from git-tracked
 * state ALONE. Deterministic over the record ⇒ 0 non-git state is read. The returned `Seat` is
 * orchestrator-owned, so the surface keeps it `unknown` (ref/reinvoke.ts). This is NOT a deterministic
 * resume — nothing here continues an agent from where it stopped. (REQ-PERSIST-7-a / 10b-b)
 */
export function redispatch(record: unknown): unknown {
  const seatId: Hash = id({ kind: 'Seat', brief: briefOf(record) });
  return { kind: 'Seat', seatId };
}

// ── faithful replay (REQ-PERSIST-10b-c / 10b-d) ─────────────────────────────────────────────────────────

/**
 * The audit view produced by replaying a recorded `Checkpoint` (PERSIST-10b, atlas-persist:106). PINNED
 * from THIS WP's acceptance — the ref deliberately delegates the shape to the owning WP (ref/reinvoke.ts
 * §SIG-TBD/OWNER-DEFINE), and SCN-PERSIST-10b-c-1 grounds it: the view re-feeds the RECORDED seat brief +
 * LLM outputs + tool I/O faithfully. `source: 'recording'` witnesses the I/O was re-fed from the checkpoint,
 * NEVER re-invoked from the live model (the golden's teeth). Assignable to the ref's opaque
 * `TranscriptView = unknown` — the frozen interface is consumed, never widened.
 */
export interface ReplayView {
  readonly source: 'recording';
  readonly seatBrief: string;
  readonly llmOutputs: readonly string[];
  readonly toolIO: readonly string[];
}

/**
 * Faithful replay: re-feed the recorded LLM/tool I/O straight from the structured `Checkpoint` substrate —
 * the replay reproduces the record, never consulting the live model (REQ-PERSIST-10b-c). The substrate is
 * the `Checkpoint` (seatBrief + llmOutputs + toolIO), DISTINCT from the raw transcript large object
 * (REQ-PERSIST-10b-d). Pure over its input ⇒ reads 0 non-git state (REQ-PERSIST-7-b).
 */
export function replay(cp: Checkpoint): ReplayView {
  return {
    source: 'recording',
    seatBrief: cp.seatBrief,
    llmOutputs: [...cp.llmOutputs],
    toolIO: [...cp.toolIO],
  };
}

// differential-vs-oracle (compile-time): the impl conforms to the frozen `ReinvokeApi` (ref/reinvoke.ts) —
// `redispatch(record: unknown): unknown` matches exactly, and `replay`'s `ReplayView` is assignable to the
// ref's opaque `TranscriptView` (`unknown`). No `resume` member exists on the surface (PERSIST-10b-a).
const _apiCheck: ReinvokeApi = { redispatch, replay };
void _apiCheck;
