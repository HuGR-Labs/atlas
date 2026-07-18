// @atlas/tools — ref/emit.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// `atlas-emit` — the ONLY write path (TOOLS-1, TOOLS-7, spec A-2/A-12/A-13). One of the EXACTLY-FOUR
// governance tools. It re-derives the citation at `source@sha`; a node whose grounding does NOT re-derive
// is REJECTED (`emitted:false`, nothing persisted) — fail-closed. Writes are TEMPLATED (A-13) and UPSERTS
// (A-12): idempotent on unchanged, supersede on changed, never a blind insert. TOOLS-9: the wave-close
// write is driven by `ResultCard.absorb`, not a separate authoring ritual. Pure + total. Transcribed from
// atlas-tools:48-50, 56-58, 126, 146-147 + method-tags-tls:61-66, 75-80.
//
// [TOOLS-1 SACRED] This is the SINGLE write door. Every other write (TOOLS-9 absorb, TOOLS-13 mechanical
// re-ground, doctor's re-ground plan) routes THROUGH this admission — none bypasses the fail-closed check.

import type { Hash } from '@atlas/contracts';
import type { GroundedFact } from '@atlas/knowledge';
import type { EmitOut } from './types.js';

export interface EmitApi {
  /** Fail-closed grounded write (TOOLS-7, A-2). Re-derives the citation at `source@sha`; on failure ⇒
   *  `{emitted:false}`, nothing persisted; on success upserts (idempotent-on-unchanged,
   *  supersede-on-changed — 0 dup, A-12). Pure + total (method-tags-tls:65).
   *
   *  [FLAG — `at` = `Hash`] atlas-tools:126 names `atlas-emit <node> --at <sha>`; the `@sha` source anchor
   *  is transcribed as `Hash` (mirrors @atlas/persist `diff(shaA,shaB)` typing the commit sha as `Hash`).
   *  `node` is the templated candidate fact — typed to the @atlas/knowledge `GroundedFact` the grounded
   *  admission consumes (mirrors knowledge `EmitApi.admit(node: GroundedFact)`). */
  emit(node: GroundedFact, at: Hash): EmitOut;

  /** Absorb-driven write at wave-close (TOOLS-9, A-10). Routes `ResultCard.absorb` THROUGH the same
   *  fail-closed `emit` path — a sealing wave MUST feed the Atlas or emit a grounded why-not; a seal with
   *  neither records a probe violation (method-tags-tls:78-80).
   *
   *  [SIG-TBD — `ResultCard.absorb` shape] the reference names `ResultCard.absorb` (an orchestration
   *  artifact owned upward, not frozen at this layer). Transcribed as `unknown`, NOT invented; flagged. */
  absorb(card: unknown): EmitOut;
}
