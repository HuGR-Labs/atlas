// @atlas/adapter-io — src/index-adapter.ts  (ADAPT-INDEX-1: the index-backing adapter)
//
// Satisfies the two frozen `@atlas/tools` ports — `MoveInIndex` (→ tools/init.ts) and `QueryIndex`
// (→ tools/query.ts) — by driving `@atlas/index` (`build`/`resolve`/depgraph reverse-closure) over the
// frozen FS + SCIP outputs. PURE DELEGATION: it introduces NO ranking, NO resolution, NO caching of its own.
// The ONLY non-delegated values are the `owner:''`/`globs` projection on a raw territory (init's move-in
// shape). Every resolve / reverse-closure runs PER call — never memoized — so the resolution spy (SCN-5b)
// proves every resolution originated inside `@atlas/index`, 0 computed here (SCN-5a/5b teeth).

import type { Hash, NodeKey } from '@atlas/contracts';
import type { MoveInIndex, QueryIndex } from '@atlas/tools';
import type { Axes, AxisForest, DepEdge, DepgraphApi, FileTree, ResolveApi, ScipOutput } from '@atlas/index';

/**
 * The injected drive surface (PRE-DECIDED — exact, for SCN-5b spyability). Every `@atlas/index` entry point
 * the adapter drives is injected so a test can wrap `createResolve` with a call-spy. `nodeHashOfPath` is the
 * sealed-kernel path→node hash `(p) => id({ file: p })` — the SAME keying `build` uses (build.ts:42).
 */
export interface IndexAdapterDeps {
  readonly fileTree: FileTree;
  readonly scipOutput: ScipOutput;
  readonly build: (t: FileTree, s: ScipOutput) => Axes;
  readonly createResolve: (forest: AxisForest) => ResolveApi; // ← SCN-5b spy target
  readonly createDepgraph: (edges: readonly DepEdge[]) => DepgraphApi;
  readonly nodeHashOfPath: (path: string) => Hash; // = (p) => id({ file: p })
}

/** The one explicit cast helper: `Hash` and `NodeKey` are same-string DISTINCT brands (contracts/hash.ts).
 *  The reverse closure is keyed by `Hash`; the blast-radius port is keyed by `NodeKey` — one cast, applied
 *  identically on both the adapter side and the in-test oracle side (SCN-5a-1). */
const asNodeKeys = (hs: readonly Hash[]): readonly NodeKey[] => hs as unknown as readonly NodeKey[];

/**
 * Build the index-backing adapter over the injected drive surface. `Axes` is built ONCE at construction
 * (the structural build is $0-LLM + idempotent); resolve / reverse-closure run PER call and are NEVER
 * memoized (the 5a/5b teeth). Returns the union of the two frozen ports.
 */
export function createIndexAdapter(deps: IndexAdapterDeps): MoveInIndex & QueryIndex {
  const axes = deps.build(deps.fileTree, deps.scipOutput);

  return {
    // MoveInIndex — the raw territories structurally derived from the territory axis. The move-in shape is
    // `{name, owner, globs}`; the tier is assigned LATER by init.ts (never carried here). owner:'' + a
    // single glob per territory key are the ONLY non-delegated projection.
    territories(_path: string) {
      void _path;
      return axes.territory.children.map((node) => ({
        name: node.key,
        owner: '',
        globs: [`${node.key}/**`],
      }));
    },

    // MoveInIndex — the reverse-dep reachability set (blast radius). A FRESH depgraph closure every call:
    // the closure originates entirely in `@atlas/index`, cast Hash[] → NodeKey[] at the sealed seam.
    blastRadius(path: string) {
      const closure = deps.createDepgraph(axes.edges).reverseClosure(deps.nodeHashOfPath(path)).closure;
      return asNodeKeys(closure);
    },

    // QueryIndex — resolve a scope to its covering territory skeleton through `@atlas/index`. A FRESH
    // `createResolve(...).resolve(...)` every call (SCN-5b teeth). Fail-closed on a miss (query.ts:29): the
    // handler wrapper converts the throw to a rejected Verdict. invariants/stale are the raw pre-governance
    // read — the tier≥T1 bound + drift live in tools/query.ts, not here.
    cover(scope: string) {
      const forest: AxisForest = {
        spatial: axes.spatial,
        territory: axes.territory,
        dependency: axes.dependency,
      };
      const node = deps.createResolve(forest).resolve('territory', scope);
      if (node === undefined) throw new Error(`cover: no covering territory for scope ${scope}`);
      return {
        territory: node.key,
        axisHash: node.subtreeHash as unknown as Hash,
        invariants: [],
        stale: false,
      };
    },
  };
}
