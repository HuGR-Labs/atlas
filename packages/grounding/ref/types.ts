// @atlas/grounding — ref/types.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The trust primitive's data model: a content-addressed receipt that anchors a fact to a structural
// unit of code. Transcribed EXACTLY from `docs/reference/atlas-grounding.md` §Data model (lines 38-43).
// `StructRef` (the anchor), `Freshness`, and `Status` are the CANONICAL layer-0 vocabulary owned by
// @atlas/contracts — imported, NEVER redefined here.

import type { StructRef } from '@atlas/contracts';

/**
 * The content-addressed grounding receipt. Transcribed EXACTLY from atlas-grounding:38:
 *   `Grounding = { entries: GroundingEntry[] }`  — sorted by anchor.
 * A `Grounding` is real iff it has ≥1 entry and every entry carries a non-empty `subtreeHash`
 * (GROUND-2); an ungrounded grounding MUST NOT ever be FRESH.
 */
export interface Grounding {
  readonly entries: readonly GroundingEntry[];
}

/**
 * One anchor in a grounding receipt. Transcribed EXACTLY from atlas-grounding:39-43:
 *   - `anchor`       — THE DRIFT ORACLE: a `StructRef` whose `subtreeHash` is the hash of the
 *     normalized structural unit (GROUND-1). Owned by @atlas/contracts.
 *   - `path`         — repo-relative, for humans/navigation.
 *   - `displayLines?`— OPTIONAL nav hint ("42-50") — NEVER the drift oracle (GROUND-1). Under
 *     `exactOptionalPropertyTypes` the field is genuinely absent-or-string, never `undefined`.
 */
export interface GroundingEntry {
  readonly anchor: StructRef;
  readonly path: string;
  readonly displayLines?: string;
}
