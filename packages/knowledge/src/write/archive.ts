// @atlas/knowledge — src/archive.ts  (WP-5.14.KNOW · KNOW-12: nothing dies — git + CAS, no redundant copy)
//
// Implements the FROZEN `ArchiveApi` (co-located below): a predicate SUPERSEDE mints the superseding node and
// adds ONLY a `supersededBy` POINTER into CAS to the prior (a link, not a byte-copy); the prior is RETAINED
// and `resolve(oldId)` re-spawns it post-supersede; 0 delete paths (atlas-knowledge:62, 97-99, 206-207;
// method-tags-knw:95-100). Prior versions are their OWN content-addressed CAS objects — identical priors
// DEDUP to one address (never byte-copied).
//
// SEAM (sealed @atlas/kernel CAS — no raw hashing): the pointer is minted by `StoreApi.put` (content-
// address → dedup, idempotent) and re-resolved by `StoreApi.get`. This facet never hashes; it reuses the
// KERNEL CAS ref, per the card. The `supersededBy` pointer is the frozen RETURN-LEG (`Hash`) — R3 did NOT
// surface a `supersededBy` field on `PredicateNode`, so it is NOT mutated onto the node (no old bytes are
// inlined into the superseder), exactly as the archive.ts FLAG models it.

import type { Hash } from '@atlas/contracts';
import type { CasObject, StoreApi } from '@atlas/kernel';
import type { PredicateNode } from '../types.js';

// ── frozen ArchiveApi surface, co-located here (was ref/archive.ts) ───────────────────────────────────

export interface ArchiveApi {
  /** SUPERSEDE a predicate node (KNOW-12, predicate-only): mint the new node, add a `supersededBy`
   *  POINTER into CAS to the old, and RETAIN the old (never remove). Returns the superseding node. Pure.
   *  The pointer is modeled as the `Hash` return-leg (the frozen `PredicateNode` has no `supersededBy`
   *  field — flagged for the data model to surface `supersededBy?: Hash`). */
  supersede(old: PredicateNode, next: PredicateNode): { readonly node: PredicateNode; readonly supersededBy: Hash };

  /** Re-spawnable resolve: `get(oldId)` MUST resolve post-supersede — the old bytes persist in CAS as a
   *  content-addressed object (dedup by content-address identity). 0 API deletes (method-tags-knw:99).
   *  The resolved shape reuses the kernel `CasObject`. */
  resolve(oldId: Hash): CasObject;
}

/** Bind the CAS-retention archive over the sealed kernel store (`createStore()`). The store is the single
 *  content-addressed CAS — priors live there (the git/CAS archive), never in the hot working set. */
export function bindArchive(store: StoreApi): ArchiveApi {
  return {
    /** SUPERSEDE (predicate-only): content-address the prior into CAS (dedup, idempotent — identical priors
     *  collapse to one address), RETAIN it, and return the superseder + the `supersededBy` pointer. The
     *  superseder is `next` UNCHANGED — the prior's bytes are never inlined (only the pointer links them). */
    supersede(old: PredicateNode, next: PredicateNode): { readonly node: PredicateNode; readonly supersededBy: Hash } {
      const supersededBy = store.put(old); // sealed CAS: content-address → dedup, never byte-copy
      return { node: next, supersededBy };
    },
    /** Re-spawnable resolve: the prior persists in CAS as a content-addressed object; `get(oldId)` resolves
     *  it post-supersede. 0 API deletes — nothing dies. */
    resolve(oldId: Hash): CasObject {
      return store.get(oldId);
    },
  };
}
