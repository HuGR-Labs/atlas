// @atlas/adapter-io — src/retrieval-model.ts  (N2: the composition-root feed for the CLOSED three-mode retrieval)
//
// The designed three-mode `RetrievalApi` (@atlas/index retrieval.ts, `createRetrieval(model)`) resolves
// relevance by EXACTLY `byScope`/`byDependency`/`byTrigger` (INDEX-6) but had ZERO production callers. This
// module is its composition-root feed: it materializes the `RetrievalModel` the surface serves (over the
// SAME durable CAS + built axes the rest of the runtime rides) and shapes a mode's `readonly Fact[]` into the
// user-facing `{ pack, subsumes }` envelope the CLI renderer already understands. Pure + total, no clock/random.

import { id } from '@atlas/kernel';
import type { CasObject } from '@atlas/kernel';
import type { Hash, NodeKey, Pack, PackInvariant } from '@atlas/contracts';
import { createDepgraph, createRetrieval } from '@atlas/index';
import type { Axes, AxisForest, Fact, RetrievalModel } from '@atlas/index';
import { currentNodes } from '@atlas/knowledge';
import type { GroundedFact } from '@atlas/knowledge';
import { rehydrateProjection } from './store.js';
import type { DiskStore } from './store.js';

/** The two NON-scope modes this feed serves through the designed surface. `scope` stays the pre-existing
 *  byte-identical projection path in wire.ts and never routes here. */
export type RetrievalMode = 'dependency' | 'trigger';

/**
 * Materialize the `RetrievalModel` the CLOSED three-mode surface serves, over the built `axes` + the durable
 * projection read back from `store`:
 *   - `forest`      — the already-built axis hierarchies (surfaced, NOT rebuilt — INDEX-10c one store).
 *   - `store`       — `contentHash → Fact`: every current node's whole fact read back from CAS (the readback
 *                     pattern compose.ts already uses; the CAS bytes ARE the fact).
 *   - `blastRadius` — `anchor path → dependency-reachable fact CAS hashes`: the EXISTING depgraph reverse
 *                     closure (blast radius) over `axes.edges`, keyed by each current node's `primaryAnchor`.
 *                     The closure returns index NodeKeys (`id({file: path})`); each is bridged to a fact's
 *                     `contentHash` through the current-anchor set (`id({file: anchor}) → contentHash`).
 *   - `triggers`    — EMPTY (`new Map()`). DOCUMENTED NON-BEHAVIOR: no trigger-axis producer exists anywhere
 *                     in the monorepo, so `byTrigger` is a declared-but-unpopulated mode that returns `[]` for
 *                     every tag. Populating it (fact-level trigger tags) is a SEPARATE future feature — NOT
 *                     this wiring (see docs/design/adr-retrieval-node-doors.md).
 */
export function buildRetrievalModel(axes: Axes, store: DiskStore): RetrievalModel {
  const nodes = currentNodes(rehydrateProjection(store));

  // store: contentHash → the whole fact read back from CAS.
  const factStore = new Map<Hash, Fact>();
  // bridge: the index-node key of an anchor (`id({file: anchor})`) → the fact's CAS contentHash.
  const anchorKeyToContentHash = new Map<string, Hash>();
  for (const n of nodes) {
    const contentHash = n.contentHash as Hash;
    const fact = store.get(contentHash);
    if (fact !== undefined) factStore.set(contentHash, fact);
    if (n.primaryAnchor !== undefined) {
      anchorKeyToContentHash.set(String(id({ file: n.primaryAnchor })), contentHash);
    }
  }

  // blastRadius: anchor path → reachable fact CAS hashes (reverse closure of the anchor's index node).
  const depgraph = createDepgraph(axes.edges);
  const blastRadius = new Map<string, readonly Hash[]>();
  for (const n of nodes) {
    if (n.primaryAnchor === undefined) continue;
    const closure = depgraph.reverseClosure(id({ file: n.primaryAnchor }) as Hash).closure;
    const hashes: Hash[] = [];
    for (const nodeKey of closure) {
      const ch = anchorKeyToContentHash.get(String(nodeKey));
      if (ch !== undefined) hashes.push(ch);
    }
    blastRadius.set(n.primaryAnchor, hashes);
  }

  const forest: AxisForest = { spatial: axes.spatial, territory: axes.territory, dependency: axes.dependency };
  // triggers EMPTY — documented dormant mode (no producer exists; byTrigger returns [] for every tag).
  return { forest, store: factStore, triggers: new Map<string, readonly Hash[]>(), blastRadius };
}

/**
 * Drive a NON-scope mode through the designed `createRetrieval(model)` surface and shape the returned
 * `readonly Fact[]` into the `{ pack, subsumes }` envelope the CLI renderer understands. Each fact is shaped
 * into a `PackInvariant` EXACTLY as projection-query-index.ts does — `{ nodeId: node.nodeKey, tier: fact.tier,
 * claim: node.claims.join('; ') }` — recovering the projection `CurrentNode` for a returned fact by its CAS
 * contentHash (`id(fact)`), so the trusted (recomputed) nodeKey + claim set are used, not the untrusted
 * author payload. Invariants sorted by `nodeId`; `subsumes` is `[]` (a scope-only coverage relation);
 * `stale: false` (the non-scope modes carry no drift flag). Pure + total.
 */
export function retrievalPack(
  model: RetrievalModel,
  mode: RetrievalMode,
  target: string,
  store: DiskStore,
): { readonly pack: Pack; readonly subsumes: readonly never[] } {
  const api = createRetrieval(model);
  const facts = (mode === 'dependency' ? api.byDependency(target) : api.byTrigger(target)) as readonly GroundedFact[];

  const nodeByContentHash = new Map(currentNodes(rehydrateProjection(store)).map((n) => [n.contentHash, n] as const));
  const invariants: PackInvariant[] = [];
  for (const fact of facts) {
    const node = nodeByContentHash.get(String(id(fact as unknown as CasObject)));
    if (node === undefined) continue; // a fact with no current-node projection is not locatable — skip (total)
    invariants.push({ nodeId: node.nodeKey as NodeKey, tier: fact.tier, claim: node.claims.join('; ') });
  }
  invariants.sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));

  const tokenEstimate = invariants.reduce((sum, i) => sum + i.claim.length, 0);
  // the model's axis hash — the spatial axis root identity of the snapshot the pack was built from.
  const axisHash = model.forest.spatial.subtreeHash as unknown as Hash;
  const pack: Pack = { territory: target, axisHash, invariants, tokenEstimate, stale: false };
  return { pack, subsumes: [] };
}
