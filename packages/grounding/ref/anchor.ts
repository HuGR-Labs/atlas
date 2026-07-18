// @atlas/grounding — ref/anchor.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The structural anchor resolver — block-vs-file granularity (GROUND-1, GROUND-12). Resolves a
// grounding entry to its `StructRef`, whose `subtreeHash` is the sole drift oracle; `displayLines`
// and line-ranges NEVER participate. For a parseable policy artifact a repo/project rule keys on the
// heading/section BLOCK `subtreeHash` (a block-level CAS node), reserving the whole-file byte-hash for
// genuinely non-parseable files (GROUND-12). (atlas-grounding:44, 105-115; method-tags-grd:26-28, 100-105)

import type { StructRef } from '@atlas/contracts';
import type { GroundingEntry } from './types.js';

export interface AnchorApi {
  /** Resolve a grounding entry to its structural anchor. The drift oracle is `anchor.subtreeHash`
   *  alone — `displayLines`/line-ranges are ignored, a line-range-only ref is rejected as invalid
   *  (GROUND-1). Block-vs-file granularity for policy artifacts (GROUND-12). (atlas-grounding:44)
   *
   *  [FLAG — reference tension, return type] The task inventory pins `resolveAnchor(entry): StructRef`
   *  (transcribed here). The method-tags-grd:27 DOWN reference-model instead names
   *  `resolveAnchor(entry)=entry.anchor.subtreeHash` (a bare `SubtreeHash`). Transcribed to the task's
   *  `StructRef` return (the richer surface — the `subtreeHash` is reachable as `.subtreeHash`); flagged
   *  for the two sources to reconcile whether the resolver returns the `StructRef` or just its oracle. */
  resolveAnchor(entry: GroundingEntry): StructRef;
}
