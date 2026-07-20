// @atlas/adapter-io — src/projection-query-index.ts  (WIRE-LOOP Seam-1: emit→query projection readback)
//
// The composition DECORATOR that closes the emit→query loop (GAP-C). The pure `@atlas/index` index-adapter
// resolves a scope to its covering territory SKELETON (territory + axisHash) but hardcodes `invariants: []`
// — it cannot read back emitted facts (that would violate its SCN-5b purity: territory resolution STAYS in
// `@atlas/index`, which is BELOW knowledge in the DAG and cannot see a `nodeKey`). This decorator wraps that
// skeleton and folds in the projection readback: for every current node whose grounding anchor is UNDER the
// covering scope, it reads the whole fact back from CAS (`store.get(contentHash)` — "the CAS bytes ARE the
// fact") and maps it to a `PackInvariant`. Pure + total: no clock/nonce/paths, no throw beyond `cover`'s.
//
// The wrapped index-adapter is NOT modified — its purity/spy invariant is preserved; this readback is a
// strictly additive composition layer over it.

import type { Hash, NodeKey, PackInvariant } from '@atlas/contracts';
import type { QueryIndex } from '@atlas/tools';
import { currentNodes } from '@atlas/knowledge';
import type { GroundedFact } from '@atlas/knowledge';
import type { DiskStore } from './store.js';
import { rehydrateProjection } from './store.js';

/**
 * `true` iff `anchor` lies UNDER `scope` — a SEGMENT-WISE prefix test on the anchor's FILE-PATH portion (the
 * text before the first `::`, `/`-split), NOT a raw `startsWith` (so scope `src` covers `src/foo::bar` but
 * scope `sr` does NOT). Mirrors the `read/anchor-match.ts` `isPrefix` discipline. Total: an empty scope (no
 * segments) trivially covers every anchor; an anchorless node is filtered by the caller before this runs.
 */
export function underScope(anchor: string, scope: string): boolean {
  const filePath = anchor.split('::')[0] ?? anchor; // the file-path portion — ancestry after the first `::`
  const anchorSegs = filePath.split('/');
  const scopeSegs = scope.split('/');
  if (scopeSegs.length > anchorSegs.length) return false;
  for (let i = 0; i < scopeSegs.length; i++) if (scopeSegs[i] !== anchorSegs[i]) return false;
  return true;
}

/**
 * Wrap the pure structural `QueryIndex` with the durable projection readback. `cover(scope)` delegates the
 * territory/axisHash resolution to `structural.cover` (unchanged — SCN-5b invariant), then folds in every
 * emitted fact whose `primaryAnchor` is under the covering `scope`:
 *   - `PackInvariant { nodeId: node.nodeKey, tier: fact.tier, claim: node.claims.join('; ') }`
 *   - `invariants` SORTED by `nodeId` ascending (deterministic);
 *   - `stale = true` iff ANY under-scope fact has `freshness === 'DRIFTED'`.
 * A node with no `primaryAnchor`, or whose CAS bytes are absent (`store.get` ⇒ undefined), is SKIPPED. Pure
 * + total — the only throw is the one `structural.cover` itself raises on a malformed scope (fail-closed).
 */
export function createProjectionQueryIndex(structural: QueryIndex, store: DiskStore): QueryIndex {
  return {
    cover(scope: string) {
      const base = structural.cover(scope); // territory resolution STAYS in the pure @atlas/index adapter
      const proj = rehydrateProjection(store);
      const invariants: PackInvariant[] = [];
      let stale = false;
      for (const node of currentNodes(proj)) {
        if (node.primaryAnchor === undefined) continue; // anchorless ⇒ not locatable under a scope
        if (!underScope(node.primaryAnchor, scope)) continue; // out-of-scope facts never leak into the pack
        const fact = store.get(node.contentHash as Hash) as GroundedFact | undefined;
        if (fact === undefined) continue; // the CAS bytes ARE the fact; a miss ⇒ skip (never a throw)
        invariants.push({
          nodeId: node.nodeKey as NodeKey,
          tier: fact.tier,
          claim: node.claims.join('; '),
        });
        if (fact.freshness === 'DRIFTED') stale = true; // any drifted backing grounding ⇒ re-ground signal
      }
      invariants.sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));
      return { territory: base.territory, axisHash: base.axisHash, invariants, stale };
    },
  };
}
