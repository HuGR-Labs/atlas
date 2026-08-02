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

import type { Hash, PackInvariant } from '@atlas/contracts';
import type { QueryIndex } from '@atlas/tools';
import { currentNodes } from '@atlas/knowledge';
import type { GroundedFact } from '@atlas/knowledge';
import { underScope } from './anchor-scope.js';
import { factToInvariant } from './pack-shape.js';
import type { DiskStore } from './store.js';
import { rehydrateProjection } from './store.js';

// `underScope` MOVED to `./anchor-scope.js` (a leaf), so the WRITE door's authz can be bound to the very
// predicate the READ projection scopes on rather than to a second copy of it (ADR-0010 open item 3). It is
// RE-EXPORTED from here unchanged: this module is where every existing consumer and test imports it from,
// and moving a symbol out from under its importers is how a mechanical extraction becomes a behaviour change.
export { underScope } from './anchor-scope.js';

/**
 * Wrap the pure structural `QueryIndex` with the durable projection readback. `cover(scope)` delegates the
 * territory/axisHash resolution to `structural.cover` (unchanged — SCN-5b invariant), then folds in every
 * emitted fact whose `primaryAnchor` is under the covering `scope`:
 *   - `PackInvariant { nodeId: node.nodeKey, tier: fact.tier, claim: node.claims.join('; ') }`
 *   - `invariants` SORTED by `nodeId` ascending (deterministic);
 *   - `stale = true` iff ANY under-scope fact has `freshness === 'DRIFTED'` OR the view is BEHIND HEAD (N11).
 * A node with no `primaryAnchor`, or whose CAS bytes are absent (`store.get` ⇒ undefined), is SKIPPED. Pure
 * + total — the only throw is the one `structural.cover` itself raises on a malformed scope (fail-closed).
 *
 * N11 — the HONEST freshness watermark. `stale` (TOOLS-6: "MUST mean re-ground before trusting") previously
 * fired ONLY on stored per-fact drift, which reconcile writes back — so between a code change at HEAD and the
 * next reconcile the read silently claimed FRESH. `headSha` (OPTIONAL, injected by the composition root — a
 * cheap `git rev-parse HEAD`, NO worktree, so it never touches the reconcile oracle's `.git/worktrees`
 * contention surface) lets the reader compare the projection's persist-time `builtAt` to live HEAD: when BOTH
 * are known AND differ, the view is BEHIND HEAD ⇒ its freshness is unverified ⇒ honestly `stale`. This is the
 * read-model watermark pattern — NOT a live re-derivation on read (that would duplicate reconcile and put git
 * I/O on every query); the authoritative drift oracle stays `atlas reconcile`/`doctor`. Conservative on the
 * unknown: if `builtAt` or live HEAD is absent (old sidecar / non-git / mine-bootstrapped projection), the
 * reader does NOT flag behind-HEAD — it only asserts staleness it can PROVE, never a false alarm.
 */
export function createProjectionQueryIndex(
  structural: QueryIndex,
  store: DiskStore,
  headSha?: () => string | undefined,
): QueryIndex {
  return {
    cover(scope: string) {
      const base = structural.cover(scope); // territory resolution STAYS in the pure @atlas/index adapter
      const proj = rehydrateProjection(store);
      const invariants: PackInvariant[] = [];
      // N11: the view is BEHIND HEAD iff both the persist-time watermark and live HEAD are known AND differ.
      const head = headSha?.();
      let stale = proj.builtAt !== undefined && head !== undefined && proj.builtAt !== head;
      for (const node of currentNodes(proj)) {
        if (node.primaryAnchor === undefined) continue; // anchorless ⇒ not locatable under a scope
        if (!underScope(node.primaryAnchor, scope)) continue; // out-of-scope facts never leak into the pack
        const fact = store.get(node.contentHash as Hash) as GroundedFact | undefined;
        if (fact === undefined) continue; // the CAS bytes ARE the fact; a miss ⇒ skip (never a throw)
        invariants.push(factToInvariant(node, fact)); // the ONE shared shaping (shared with retrieval-model.ts)
        if (fact.freshness === 'DRIFTED') stale = true; // any drifted backing grounding ⇒ re-ground signal
      }
      invariants.sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));
      return { territory: base.territory, axisHash: base.axisHash, invariants, stale };
    },
  };
}
