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
import { rowBehindHead } from './freshness-watermark.js';
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
 *   - `stale = true` iff ANY fact IN THIS PACK has `freshness === 'DRIFTED'` OR carries a watermark BEHIND
 *     live HEAD (N11). Both legs are per-ROW and both are scoped to the pack — see below.
 * A node with no `primaryAnchor`, or whose CAS bytes are absent (`store.get` ⇒ undefined), is SKIPPED. Pure
 * + total — the only throw is the one `structural.cover` itself raises on a malformed scope (fail-closed).
 *
 * N11 — the HONEST freshness watermark. `stale` (TOOLS-6: "MUST mean re-ground before trusting") once fired
 * ONLY on stored per-fact drift, which reconcile writes back — so between a code change at HEAD and the next
 * reconcile the read silently claimed FRESH. `headSha` (OPTIONAL, injected by the composition root — a cheap
 * `git rev-parse HEAD`, NO worktree, so it never touches the reconcile oracle's `.git/worktrees` contention
 * surface) lets the reader compare a stored watermark against live HEAD: known, and different ⇒ that row's
 * freshness is unverified at HEAD ⇒ honestly `stale`. Still the read-model watermark pattern — NOT a live
 * re-derivation on read (that would duplicate reconcile and put git I/O on every query); the authoritative
 * drift oracle stays `atlas reconcile`/`doctor`.
 *
 * THE WATERMARK IS COMPARED PER ROW, and this file used to compare it per PROJECTION — one `proj.builtAt`
 * against HEAD, before the loop. That field is re-stamped by EVERY publication, so any write laundered it for
 * every fact in the store: emit an unrelated fact and a read that had honestly said `stale: true` said
 * `stale: false` again, while `atlas doctor why` still printed the drift. Measured through the built CLI (e2e
 * story S26); the rule and the fallback for an unstamped row live in `freshness-watermark.ts`.
 *
 * TWO CONSEQUENCES WORTH NAMING. Staleness is now PER-SCOPE accurate — a drifted fact under `src/app` no
 * longer poisons a query for `src/lib` — which one projection-wide flag could not express. And a scope whose
 * pack is EMPTY is not flagged: there is no fact in it to re-ground, so a flag would be an alarm about
 * nothing. Conservative on the unknown throughout: absent live HEAD, or a row with neither its own stamp nor
 * a projection-level `builtAt` behind it (old sidecar / non-git / mine-bootstrapped), is NOT flagged — this
 * reader asserts only staleness it can PROVE, never a false alarm.
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
      // N11: live HEAD, read ONCE for the whole cover (one `git rev-parse`, never one per row).
      const head = headSha?.();
      let stale = false;
      for (const node of currentNodes(proj)) {
        if (node.primaryAnchor === undefined) continue; // anchorless ⇒ not locatable under a scope
        if (!underScope(node.primaryAnchor, scope)) continue; // out-of-scope facts never leak into the pack
        const fact = store.get(node.contentHash as Hash) as GroundedFact | undefined;
        if (fact === undefined) continue; // the CAS bytes ARE the fact; a miss ⇒ skip (never a throw)
        invariants.push(factToInvariant(node, fact)); // the ONE shared shaping (shared with retrieval-model.ts)
        if (fact.freshness === 'DRIFTED') stale = true; // any drifted backing grounding ⇒ re-ground signal
        // N11 per-ROW: this row's own stamp (falling back to the projection watermark for an unstamped row)
        // against live HEAD. Placed beside the DRIFTED leg deliberately — both answer "must this PACK be
        // re-grounded before it is trusted", so both are decided over exactly the rows the pack serves.
        if (rowBehindHead(node, proj.builtAt, head)) stale = true;
      }
      invariants.sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));
      return { territory: base.territory, axisHash: base.axisHash, invariants, stale };
    },
  };
}
