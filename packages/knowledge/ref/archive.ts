// @atlas/knowledge — ref/archive.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Nothing dies — git + CAS, no redundant copy (KNOW-12, spec A-16). No fact-history is lost: prior
// versions persist as their OWN content-addressed CAS objects (deduped, never byte-copied). An ADVISORY
// edit-in-place keeps NO lineage pointer (git is the archive); a PREDICATE supersede adds ONLY a
// `supersededBy` POINTER into CAS — a link, not a copy. `get(oldId)` resolves post-supersede; 0 delete
// paths. Reuses the KERNEL CAS ref. Transcribed from atlas-knowledge:62, 97-99, 206-207 and
// method-tags-knw:95-100.
//
// [SIG-TBD — NO concrete signature frozen] method-tags-knw:99 describes "a reference store where
// supersede mints a new CAS object + `supersededBy` link and never removes the old", but freezes no
// concrete signature. The surface below transcribes the reference-DESCRIBED operations; unfrozen legs
// are `unknown`, flagged, NOT invented.

import type { Hash } from '@atlas/contracts';
import type { PredicateNode } from './types.js';

export interface ArchiveApi {
  /** SUPERSEDE a predicate node (KNOW-12, predicate-only): mint the new node, add a `supersededBy`
   *  POINTER into CAS to the old, and RETAIN the old (never remove). Returns the superseding node. Pure.
   *
   *  [FLAG — `supersededBy` absent from the frozen shape] The frozen `PredicateNode` (ref/types.ts) has
   *  NO `supersededBy` field (only `authoring:'…'|'SUPERSEDED'`); KNOW-12 requires the pointer. Modeled
   *  as the `Hash` return-leg pointer below rather than mutated onto the node — flagged for the data
   *  model to surface a `supersededBy?: Hash` field. */
  supersede(old: PredicateNode, next: PredicateNode): { readonly node: PredicateNode; readonly supersededBy: Hash };

  /** Re-spawnable resolve: `get(oldId)` MUST resolve post-supersede — the old bytes persist in CAS as a
   *  content-addressed object (dedup by content-address identity). 0 API deletes (method-tags-knw:99).
   *  [SIG-TBD] the resolved CAS object shape reuses the kernel `CasObject` (= `unknown` at layer 1) — the
   *  concrete archived-node projection is not frozen here → `unknown`. Flagged. */
  resolve(oldId: Hash): unknown;
}
