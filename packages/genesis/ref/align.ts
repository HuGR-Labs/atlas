// @atlas/genesis — ref/align.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// S3 — align with the user (batched, ranked ratification). Transcribed from atlas-genesis §S3 (lines
// 86-93) + §Surface (line 189) + INV-GEN-5 (method-tags-gen:44-49). What S1+S2 cannot resolve — territory
// `owner`/`tier`, a `T0` assignment, a contested invariant, intentional-or-bug — is batched into a SHORT,
// RANKED ratification interview (highest blast×tier first, NEVER one question at a time), capped at the
// top 20 Q/session; the remainder defers to the next session or defaults to `T0-strict deny` (the
// uncovered-path rule). GEN-5: genesis writes only CANDIDATES; a `T0` / contested fact reaches `ratified`
// ONLY through this interview — never auto-promoted. Human answers become `human-ratified` facts (KNOW-8).

import type { OpenQ, Ratified } from './types.js';

export interface AlignApi {
  /** S3 batched, ranked ratification (GEN-5). Consumes the OPEN questions (ranked by blast×tier) and
   *  returns the human-RATIFIED facts (KNOW-8). The ONLY edge candidate→ratified for a `T0` / contested
   *  fact passes THROUGH here — no auto-promote path exists; the batch is served together (size > 1),
   *  never one question at a time. Capped at the top 20 Q/session; the tail defers or defaults to
   *  `T0-strict deny`. */
  interview(open: readonly OpenQ[]): readonly Ratified[];
}
