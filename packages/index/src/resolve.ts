// @atlas/index — src/resolve.ts  (INDEX-4/9: covering-node resolve over an axis hierarchy)
//
// `resolve(axis, key)` walks the named axis hierarchy and returns THE covering node for the path `key` —
// the deepest node reached by matching each `/`-segment against a child key (atlas-index:164-165, 210). It
// is TOTAL: an unknown axis, a non-string key, or a segment that leaves the tree yields `undefined`, never a
// throw and never a wrong ancestor (INDEX-9). The hierarchy roll-up (a file query surfacing its module's +
// crate's invariants, INDEX-4b) happens at the retrieval layer (`retrieval.ts`), which reuses `coveringPath`.
// Pure: no clock, no network, no mutable cache — the same forest + key always resolves identically (INDEX-8).

import type { Axis, IndexNode } from '../ref/types.js';
import type { ResolveApi } from '../ref/resolve.js';

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
