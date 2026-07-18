// @atlas/memory — ref/template.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Templated-write, fail-closed (MEM-5). Every write fills its per-type template (ProjectMemoryEntry /
// TaskMemoryEntry / PrMemoryEntry / LogbookEntry) or is REJECTED fail-closed — a missing required field
// or over-cap entry NEVER persists (0 free-prose); logbook prose is confined WITHIN its fixed sections
// (mirrors spec A-13). The templates themselves are the four entry types (ref/types.ts) — a fixed field
// skeleton, structured, NEVER a prose blob (the driftless discipline). This file is the per-type
// VALIDATOR + the canonical structured RENDER. Transcribed from method-tags-mem:49-54 (INV-MEM-5
// down-model) + atlas-memory:69-107.

import type { MemoryEntry, MemoryKind } from './types.js';

/**
 * The fail-closed validation verdict (MEM-5). `valid:false` rejects the write — no invalid entry
 * persists.
 *
 * [SIG-TBD — error payload not frozen] the reference freezes "rejected fail-closed on any missing
 * field / over cap / out-of-section prose", not a concrete error shape; `reasons` is the honest minimum
 * (the failed checks), NOT an invented diagnostic record.
 */
export interface TemplateVerdict {
  readonly valid: boolean;
  readonly reasons: readonly string[]; // failed checks (missing field / over cap / out-of-section) — empty iff valid
}

export interface TemplateApi {
  /** Validate a write against its per-type required-field set + section bounds; rejects fail-closed on
   *  any missing field / over cap / out-of-section prose (MEM-5). Pure + total. (method-tags-mem:53) */
  validate(kind: MemoryKind, entry: MemoryEntry): TemplateVerdict;

  /** The canonical STRUCTURED render of a templated entry — never a prose blob, byte-stable for equal
   *  input (the driftless discipline mirrored from the pack/invariant render).
   *
   *  [SIG-TBD — exact render format not frozen] The reference pins "structured, never prose" but freezes
   *  no concrete serialization; transcribed as `string` (a canonical structured line/block), NOT an
   *  invented layout. */
  render(kind: MemoryKind, entry: MemoryEntry): string;
}
