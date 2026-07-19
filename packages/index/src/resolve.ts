// @atlas/index — src/resolve.ts  (INDEX-4/9: covering-node resolve over an axis hierarchy)
//
// `resolve(axis, key)` walks the named axis hierarchy to THE covering node (deepest node matched segment by
// segment). TOTAL: an unknown axis, non-string key, or segment that leaves the tree yields `undefined`,
// never a throw and never a wrong ancestor (INDEX-9). Pure — same forest + key resolves identically
// (INDEX-8); the hierarchy roll-up lives at the retrieval layer, which reuses `coveringPath`.

import type { Axis, IndexNode } from './types.js';

/** Path resolution over an axis hierarchy (INDEX-4/9): `resolve(axis, key)` returns the covering node,
 *  total — a malformed/missing axis or key yields `undefined`, never a throw. */
export interface ResolveApi {
  /** Axis + key → the covering node, total (miss ⇒ `undefined`, no throw — INDEX-9). (atlas-index:210) */
  resolve(axis: Axis, key: string): IndexNode | undefined;
}

/** The multi-axis view the resolver walks: one rooted `IndexNode` per axis (spatial/territory/dependency).
 *  Each root carries its OWN `subtreeHash` rollup — the axes are never collapsed onto a shared root. */
export type AxisForest = Readonly<Record<Axis, IndexNode>>;

const VALID_AXES: readonly Axis[] = ['spatial', 'territory', 'dependency'];

/** Total axis guard — junk (bad token, null, non-string) is not an axis, so it resolves nothing. */
export function isAxis(x: unknown): x is Axis {
  return typeof x === 'string' && (VALID_AXES as readonly string[]).includes(x);
}

/** Split a path into non-empty, trimmed segments. `"a / b //c "` → `['a','b','c']`; `""` → `[]`. Total. */
export function pathSegments(key: string): string[] {
  return key.split('/').map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Descend `root` matching each segment of `key` against a child's `key`; return the node chain
 * `[root, …, coveringNode]`. A segment that matches no child (path leaves the tree) ⇒ `[]` (a total miss,
 * never a partial/wrong-ancestor hit). An empty/whitespace path ⇒ `[]`.
 */
export function coveringPath(root: IndexNode, key: string): readonly IndexNode[] {
  const segs = pathSegments(key);
  if (segs.length === 0) return [];
  const chain: IndexNode[] = [root];
  let current: IndexNode = root;
  for (const seg of segs) {
    const next = current.children.find((c) => c.key === seg);
    if (next === undefined) return []; // the path leaves the tree ⇒ not a covering resolve
    current = next;
    chain.push(current);
  }
  return chain;
}

/** Construct a `ResolveApi` over a fixed axis forest. `resolve` is a pure, total query over it. */
export function createResolve(forest: AxisForest): ResolveApi {
  return {
    resolve(axis: Axis, key: string): IndexNode | undefined {
      if (!isAxis(axis)) return undefined; // unknown axis ⇒ no default-axis fall-through (INDEX-9)
      if (typeof key !== 'string') return undefined;
      const root: IndexNode | undefined = forest[axis];
      if (root === undefined) return undefined;
      const chain = coveringPath(root, key);
      return chain.length === 0 ? undefined : chain[chain.length - 1];
    },
  };
}
