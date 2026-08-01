// @atlas/index — src/build.ts  (INDEX-3: the mechanical, $0-LLM axis build)
//
// `build(tree, scipOutput)` derives the three axis-views + depends-on edge ledger purely from the file
// tree + recorded SCIP output — deterministic, 0 model calls, idempotent. An edge it cannot statically
// resolve (incl. every cross-language/FFI boundary) is declared `unresolved` (to: null), never guessed;
// identity is minted ONLY through the sealed kernel seam (no self-rolled hash).

import { id, asSubtreeHash } from '@atlas/kernel';
import type { Hash, SubtreeHash } from '@atlas/contracts';
import { foldNodeHash } from './rollup.js';
import type { Axes, Axis, DepEdge, FileTree, IndexNode, ScipOutput } from './types.js';

/** The mechanical, `$0`-LLM axis build (INDEX-3): derive every axis-view purely from the file tree +
 *  recorded SCIP output; deterministic, idempotent, unresolved edges declared (never guessed). */
export interface BuildApi {
  /** Derive all axis-views from the file tree + recorded SCIP output; deterministic, `$0`-LLM,
   *  idempotent (rebuild twice ⇒ identical trees). The SCIP binary is a black-box input (fixtures),
   *  NOT modeled here (method-tags-idx:38-39). (method-tags-idx:38; atlas-index:157-159) */
  build(tree: FileTree, scipOutput: ScipOutput): Axes;
}

// Level vocabularies (atlas-index:54, 70). The build maps tree DEPTH to the level NAME along each rail;
// a depth past the vocabulary pins to the deepest name (no invented level).
const SPATIAL_LEVELS = ['repo', 'crate', 'module', 'file', 'item', 'block'] as const;
const TERRITORY_LEVELS = ['project', 'territory', 'region'] as const;

/** subtreeHash via the sealed seam. Delegates to `foldNodeHash` — THE single rollup implementation
 *  (src/rollup.ts) — so a rebuild and an incremental re-hash cannot diverge. Every node commits to its OWN
 *  content AND to the NAMES of its children, never to a bare multiset of child hashes (atlas-index:40). */
function rollupHash(node: FileTree, children: readonly IndexNode[]): SubtreeHash {
  return foldNodeHash({ key: node.path, content: node.content, children });
}

/** Build one rooted axis hierarchy from the file tree along a level vocabulary. Deterministic + total. */
function hierarchy(node: FileTree, axis: Axis, levels: readonly string[], depth: number): IndexNode {
  const level = levels[Math.min(depth, levels.length - 1)] ?? levels[levels.length - 1] ?? '';
  const children = node.children.map((c) => hierarchy(c, axis, levels, depth + 1));
  return { axis, level, key: node.path, subtreeHash: rollupHash(node, children), children, objects: [] };
}

/**
 * The ONE path→node-identity minting for a file (atlas-index:105). EXPORTED because it is the index's
 * source of truth for a file node's identity and consumers outside this package must REUSE it rather than
 * restate the formula: the dependency axis keys a file node by `nodeHashOfPath(p)` and carries
 * `subtreeHash = asSubtreeHash(nodeHashOfPath(p))` (see `dependencyAxis` below), which is exactly the leg
 * `genesis`'s `resolveSiteKey` looks a mined `StructRef` up by. A parallel copy of `id({file})` in an
 * adapter is a second source of truth for identity — the class of drift KERNEL-1 exists to forbid.
 */
export const nodeHashOfPath = (relativePath: string): Hash => id({ file: relativePath });

/** A stable per-document node hash (the dependency axis keys structural units by hash, atlas-index:105). */
const docHash = nodeHashOfPath;

/** A canonical, order-independent key for one edge — used for dedup + deterministic sort. */
const edgeKey = (e: DepEdge): string => `${String(e.from)}\0${e.to === null ? '' : String(e.to)}\0${e.kind}`;

/**
 * Derive the depends-on edge ledger from the SCIP occurrences alone. A `reference` whose symbol has an
 * in-index `definition` ⇒ a `resolved` edge to the defining document; a `reference` with NO in-index
 * definition (every cross-language / FFI target — unseeable by a single-language indexer) ⇒ an `unresolved`
 * edge with `to: null`. Edges are deduped + sorted so a rebuild is byte-identical. (SCN-INDEX-3e-1)
 */
function deriveEdges(scip: ScipOutput): DepEdge[] {
  const defs = new Map<string, Hash>();
  for (const doc of scip.documents) {
    const h = docHash(doc.relativePath);
    for (const occ of doc.occurrences) {
      if (occ.role === 'definition' && !defs.has(occ.symbol)) defs.set(occ.symbol, h);
    }
  }
  const seen = new Map<string, DepEdge>();
  for (const doc of scip.documents) {
    const from = docHash(doc.relativePath);
    for (const occ of doc.occurrences) {
      if (occ.role !== 'reference') continue;
      const target = defs.get(occ.symbol);
      const edge: DepEdge =
        target !== undefined ? { from, to: target, kind: 'resolved' } : { from, to: null, kind: 'unresolved' };
      const k = edgeKey(edge);
      if (!seen.has(k)) seen.set(k, edge);
    }
  }
  return [...seen.values()].sort((a, b) => (edgeKey(a) < edgeKey(b) ? -1 : edgeKey(a) > edgeKey(b) ? 1 : 0));
}

/** The dependency axis as a rooted view over the derived edges — one leaf per distinct participating node,
 *  sorted; the root's subtreeHash folds the full edge ledger so a graph change re-keys the root. */
function dependencyAxis(edges: readonly DepEdge[]): IndexNode {
  const nodes = new Set<string>();
  for (const e of edges) {
    nodes.add(String(e.from));
    if (e.to !== null) nodes.add(String(e.to));
  }
  const children: IndexNode[] = [...nodes].sort().map((h) => ({
    axis: 'dependency',
    level: 'unit',
    key: h,
    subtreeHash: asSubtreeHash(h),
    children: [],
    objects: [],
  }));
  const subtreeHash = asSubtreeHash(id({ edges: edges.map(edgeKey), nodes: children.map((c) => c.key).sort() }));
  return { axis: 'dependency', level: 'root', key: 'dependency', subtreeHash, children, objects: [] };
}

/** INDEX-3 build: the three axis-views + the honest edge ledger, $0-LLM and idempotent. */
export function build(tree: FileTree, scipOutput: ScipOutput): Axes {
  const edges = deriveEdges(scipOutput);
  return {
    spatial: hierarchy(tree, 'spatial', SPATIAL_LEVELS, 0),
    territory: hierarchy(tree, 'territory', TERRITORY_LEVELS, 0),
    dependency: dependencyAxis(edges),
    edges,
  };
}

/** The frozen `BuildApi` surface, wired to the pure `build` above. */
export const buildApi: BuildApi = { build };
