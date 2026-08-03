// @atlas/genesis — src/seeds.ts  (WP-8.27.GEN · GEN-11 / GEN-15c — identity correspondence + seed frontier)
//
// Split out of `rank.ts` at the 400-LOC ceiling, and cohesive on its own: everything here answers ONE
// question — how a dep-graph NODE IDENTITY, a CONTENT subtreeHash and a repo-relative PATH refer to the
// same node. `rank.ts` keeps the PPR law and the S0/S1 drivers; this file keeps the identity bridges and
// the GEN-15c structural frontier they feed.

import { asSubtreeHash } from '@atlas/kernel';
import type { StructRef } from '@atlas/contracts';
import { nodeHashOfPath, unescapeKeyComponent } from '@atlas/index';
import type { IndexNode } from '@atlas/index';
import type { Skeleton } from './types.js';

/** The one string order used by every sort here — sorted pairs + first-wins makes each map below a
 *  function of the SET of nodes, never of the walk order (GEN-1 byte-identity). */
export const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// ── node-identity ↔ subtreeHash correspondence (the F1/F2 bridge) ─────────────────────────────────────
// The dep-graph keys edge endpoints by NODE IDENTITY (`DepEdge.from/to: Hash` = `IndexNode.key`, the
// reconciliation pinned in @atlas/index src/fold.ts:116-122). A mined frontier site joins by its CONTENT
// `StructRef.subtreeHash: SubtreeHash` — a DELIBERATELY ORTHOGONAL identity space (contracts/hash.ts:5,
// 22-25; KNOW-15: conflating them is how an Atlas rots). The two legs CANNOT be compared as raw strings.
// But every `IndexNode` carries BOTH legs (`key` + `subtreeHash`), so the frozen `Skeleton.axes` already
// exposes the bridge: match a frontier site's subtreeHash to a node's subtreeHash (SAME brand — legit),
// then read that node's identity `key` (the edge-endpoint space). This resolver builds both directions
// deterministically (min-key tie-break, walk-order-independent) — no invented port, no fabricated map.
export function correspondence(graph: Skeleton): {
  readonly keyOfSubtree: ReadonlyMap<string, string>; // subtreeHash → node-identity key (edge space)
  readonly subtreeOfKey: ReadonlyMap<string, string>; // node-identity key → subtreeHash (StructRef leg)
} {
  const pairs: Array<readonly [string, string]> = []; // [subtreeHash, key]
  const collect = (n: IndexNode): void => {
    pairs.push([n.subtreeHash, n.key]);
    n.children.forEach(collect);
  };
  collect(graph.axes.dependency);
  collect(graph.axes.spatial);
  collect(graph.axes.territory);
  const keyOfSubtree = new Map<string, string>();
  for (const [st, key] of [...pairs].sort((a, b) => cmp(a[0], b[0]) || cmp(a[1], b[1])))
    if (!keyOfSubtree.has(st)) keyOfSubtree.set(st, key);
  const subtreeOfKey = new Map<string, string>();
  for (const [st, key] of [...pairs].sort((a, b) => cmp(a[1], b[1]) || cmp(a[0], b[0])))
    if (!subtreeOfKey.has(key)) subtreeOfKey.set(key, st);
  return { keyOfSubtree, subtreeOfKey };
}

/** Resolve a frontier site's CONTENT subtreeHash to its NODE-IDENTITY key (the edge-endpoint space) via
 *  the index correspondence. A site with NO node in the index stays a disconnected island under its own
 *  synthetic identity — NEVER brand-laundered into the node space by a raw-string coincidence. */
export const resolveSiteKey = (keyOfSubtree: ReadonlyMap<string, string>, site: StructRef): string =>
  keyOfSubtree.get(site.subtreeHash) ?? `unresolved:${site.subtreeHash}`;

/** The repo-relative PATH a spatial node addresses. `build.ts` mints a spatial key by joining the ESCAPED
 *  `/`-components of `node.path` (`escapeKeyComponent`), so the raw path is recovered by the exact inverse
 *  — the identity function for any path containing neither `:` nor `%`. */
const pathOfNode = (n: IndexNode): string => n.key.split('/').map(unescapeKeyComponent).join('/');

/**
 * subtreeHash → repo-relative PATH, walking the SPATIAL AXIS **ONLY**.
 *
 * WHY SPATIAL-ONLY, and why NOT `correspondence.keyOfSubtree`: that map collects across all three axes and
 * keeps the MINIMUM key per subtreeHash, so for a node present on both axes it returns the dependency
 * HASH (hex sorts before most paths), not the path. The path leg has to come from the axis that HAS paths:
 * resolve.ts:9 — the spatial hierarchy "keys every node `key: node.path`" while the dependency axis is
 * hash-keyed. The path was always in the skeleton; it was simply never consulted.
 *
 * A spatial node is reachable under EITHER of the two identities it is addressable by, so both are keys of
 * the same map (one walk, one order, one first-wins rule):
 *   (1) `n.subtreeHash` — for a skeleton whose axes share ONE identity space (the transcribed goldens, and
 *       every hand-built fixture: resolve.ts:82 names the same case for the descent).
 *   (2) `nodeHashOfPath(path)` — the PRODUCTION bridge, and the load-bearing one. MEASURED on a real
 *       indexed repo: a spatial node's `subtreeHash` is a CONTENT fold (`foldNodeHash`), while a dependency
 *       leaf's is `asSubtreeHash(nodeHashOfPath(path))` — its own key, a constant of the PATH (build.ts
 *       `dependencyAxis`, "NOT A FRESHNESS ORACLE"). The two never collide, so leg (1) alone resolves
 *       NOTHING on a real repo and every seed would be dropped. `nodeHashOfPath` is @atlas/index's exported
 *       single source of truth for a file node's identity — REUSED here exactly as `git-history.ts fileRef`
 *       reuses it, never restated, so the two frontier producers cannot drift apart.
 */
function pathOfSubtree(graph: Skeleton): ReadonlyMap<string, string> {
  const pairs: Array<readonly [string, string]> = []; // [subtreeHash-or-node-identity, path]
  const collect = (n: IndexNode): void => {
    const path = pathOfNode(n);
    pairs.push([n.subtreeHash, path]);
    pairs.push([String(nodeHashOfPath(path)), path]);
    n.children.forEach(collect);
  };
  collect(graph.axes.spatial); // SPATIAL ONLY — the other two axes carry no path
  const out = new Map<string, string>();
  for (const [k, path] of [...pairs].sort((a, b) => cmp(a[0], b[0]) || cmp(a[1], b[1])))
    if (!out.has(k)) out.set(k, path);
  return out;
}

/**
 * The GEN-15c structural frontier plus the count of dep-graph nodes it had to DROP.
 *
 * A dependency node with no spatial counterpart has no path (INDEX-13 cross-language/FFI targets, and any
 * SCIP document that is not in the tracked tree). Such a seed is DROPPED: a site with no resolvable path
 * cannot be prompted at all — `createFileSourceReader` would return `null` and the prompt factory would
 * refuse — so keeping it only reproduces the failure one layer down. The count rides out BESIDE the seeds
 * because a bounded set that is silently truncated reads as "we covered everything" (#130).
 */
export interface StructuralFrontier {
  readonly seeds: readonly StructRef[];
  readonly droppedNoPath: number; // dep-graph nodes with no spatial counterpart ⇒ no path ⇒ not promptable
}

/** The STRUCTURAL personalization vector (GEN-15c): the def→ref graph's structurally-central sites (highest
 *  degree = type/API-surface density), ordered deterministically. Used when history is thin OR absent — a
 *  non-uniform, non-random frontier, NEVER rank noise. */
export function structuralFrontier(graph: Skeleton): StructuralFrontier {
  // `h` iterates over dep-graph NODE-IDENTITY keys (edge endpoints), and BOTH legs of the emitted
  // `StructRef` are resolved back out of that space, never re-branded from it (KNOW-15):
  //   • `subtreeHash` — the CONTENT leg (F2): the node's real subtreeHash via the index correspondence,
  //     rather than a node-identity Hash wearing a SubtreeHash brand.
  //   • `qualifiedPath` — a repo-relative PATH, THE SAME KIND OF VALUE `adapter-io/src/git-history.ts:74`
  //     `fileRef` puts there. That agreement is the point: `qualifiedPath` used to carry a node-identity
  //     key here and a path there, so every consumer — `createFileSourceReader`, `filePathOf`, `bucketOf` —
  //     read a hash as a path and `build()` threw `source-unreadable` at EVERY site of a thin-history repo.
  //     There is no union to teach consumers about; the producer conforms.
  const { subtreeOfKey } = correspondence(graph);
  const pathOf = pathOfSubtree(graph);
  const degree = new Map<string, number>();
  const bump = (h: string): void => {
    degree.set(h, (degree.get(h) ?? 0) + 1);
  };
  for (const e of graph.axes.edges) {
    bump(e.from);
    if (e.to !== null) bump(e.to);
  }
  const ids = [...degree.entries()].filter(([, d]) => d > 0).map(([h]) => h);
  const ranked = (ids.length > 0 ? ids : [...degree.keys()]).sort(
    (a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0) || cmp(a, b),
  );
  const seeds: StructRef[] = [];
  let droppedNoPath = 0;
  for (const h of ranked) {
    const st = subtreeOfKey.get(h) ?? h;
    const path = pathOf.get(st);
    if (path === undefined) {
      droppedNoPath += 1; //  no spatial counterpart ⇒ no path ⇒ nothing to show a model
      continue;
    }
    seeds.push({ kind: 'file', qualifiedPath: path, subtreeHash: asSubtreeHash(st) });
  }
  return { seeds, droppedNoPath };
}

/** The seeds alone — the shape every existing caller and oracle uses. */
export function structuralSeeds(graph: Skeleton): readonly StructRef[] {
  return structuralFrontier(graph).seeds;
}
