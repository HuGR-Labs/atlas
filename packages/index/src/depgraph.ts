// @atlas/index — src/depgraph.ts  (INDEX-13: the `dependency` axis — reverse closure = blast radius)
//
// `reverseClosure(node)` is the transpose closure over the depends-on DAG the build derives: every unit
// that (transitively) depends on `node` = its blast radius. Honest under-approximation: if any
// `unresolved`/`dynamic` edge sources from a node in scope, the result is flagged `underApprox: true`, and
// ONLY then is the correlational `coChanged` git-history band unioned in — labeled correlational (a separate
// field), never presented as a static edge, never omitted, never a fabricated target. The closure is a
// sorted `Hash[]` so a rebuild is byte-identical. (atlas-index:103-125, 185-191; method-tags-idx:104-109)

import type { Hash } from '@atlas/contracts';
import type { DepEdge } from '../ref/types.js';
import type { DepgraphApi, ReverseClosure } from '../ref/depgraph.js';

/**
 * Build a `DepgraphApi` over a fixed edge ledger + an optional correlational `coChanged` band map. The graph
 * is captured once; `reverseClosure` is a pure query over it (deterministic, no I/O, no clock).
 *   - reverse adjacency: `to → [from…]` over the `resolved` edges (who depends on the target).
 *   - unresolved sources: the set of nodes with an outgoing `unresolved`/`dynamic` edge (honest holes).
 */
export function createDepgraph(
  edges: readonly DepEdge[],
  coChanged: ReadonlyMap<Hash, readonly Hash[]> = new Map(),
): DepgraphApi {
  const reverse = new Map<string, Hash[]>();
  const unresolvedSources = new Set<string>();
  for (const e of edges) {
    if (e.kind === 'resolved' && e.to !== null) {
      const k = String(e.to);
      const bucket = reverse.get(k) ?? [];
      bucket.push(e.from);
      reverse.set(k, bucket);
    } else {
      unresolvedSources.add(String(e.from)); // `unresolved` / `dynamic` — a statically-incomplete hole
    }
  }

  return {
    reverseClosure(node: Hash): ReverseClosure {
      // BFS over reverse edges; the origin is never part of its own blast radius.
      const seen = new Set<string>();
      const queue: string[] = [String(node)];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        for (const dep of reverse.get(cur) ?? []) {
          const k = String(dep);
          if (!seen.has(k)) {
            seen.add(k);
            queue.push(k);
          }
        }
      }
      seen.delete(String(node)); // a node is never part of its own blast radius (even under a cycle)
      // scope = the origin + everything in its closure; an unresolved edge sourcing from ANY of these makes
      // the closure honestly under-approximate.
      const scope = new Set<string>([String(node), ...seen]);
      let underApprox = false;
      const band = new Set<string>();
      for (const s of scope) {
        if (!unresolvedSources.has(s)) continue;
        underApprox = true;
        for (const h of coChanged.get(s as Hash) ?? []) band.add(String(h));
      }
      const closure = [...seen].sort() as unknown as Hash[];
      // coChanged rides in ONLY when underApprox (labeled correlational via its own field), else empty.
      const coChangedOut = (underApprox ? [...band].sort() : []) as unknown as Hash[];
      return { closure, underApprox, coChanged: coChangedOut };
    },
  };
}
