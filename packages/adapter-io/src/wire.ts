// @atlas/adapter-io — src/wire.ts  (WIRE-1: the ONE shared handler assembly)
//
// The single composition seam shared by every entrypoint (CLI, MCP): assemble the five governance legs
// (atlas-init / atlas-query / atlas-emit / atlas-reconcile / atlas-link) over the raw adapters and hand them to the one
// frozen `createHandler`. Co-located with the adapters it composes (D2: the shared `wire` module lives in
// @atlas/adapter-io, not a separate package). This module is the SOLE assembly point — every entrypoint
// imports THIS `assembleHandler`, so CLI and MCP are contract-identical by construction, not by copy
// (WIRE-1). The five legs are built from the raw adapters; the seams that have NO adapter (the T0
// heuristic, the truth-gate, the KNOW-5 classifier, the drifted-fact set, and the anchor resolver) are
// INJECTED via `WireConfig.seams`, so the assembly is testable with fakes/stubs.

import { createHandler, createInit, createQuery, createReconcile } from '@atlas/tools';
import type { ToolLegs, ToolLeg, NodeSource } from '@atlas/tools';
import { build, createResolve, createDepgraph, nodeHashOfPath } from '@atlas/index';
import type { Axes } from '@atlas/index';
import { currentNodes, deriveSameAs, deriveSubsumes } from '@atlas/knowledge';
import type { GroundedFact } from '@atlas/knowledge';
import type { Hash } from '@atlas/contracts';
import { retrievalPack } from './retrieval-model.js';
import type { CasPath } from './store.js';
import { walkFileTree } from './fs.js';
import { readScipOrEmpty } from './scip.js';
import { createIndexAdapter } from './index-adapter.js';
import { createProjectionQueryIndex, underScope } from './projection-query-index.js';
import { createDriftSource } from './git-drift.js';
import { headSha } from './run-git.js';
import { createGovernedEmit } from './governed-emit.js';
import { createGovernedLink } from './governed-link.js';
import { loadPolicy } from './policy.js';
import { createDiskStore, rehydrateProjection } from './store.js';
import type { SidecarTrust } from './store-provenance.js';
import { refuseUntrustedRead } from './read-provenance.js';
// DAG-pin imports — referenced (not wired as legs) to keep the frozen skeleton's dependency edges real.
import { foldAstUnits } from './ast.js';
import { createForge } from './git-forge.js';
import { createHistorySource } from './git-history.js';
import { createSiteProposer } from './llm.js';

/** The one wired handler — the exact return of the frozen `createHandler` (@atlas/tools). */
export type WiredHandler = ReturnType<typeof createHandler>;

/** The legs the assembler composes (frozen, referenced to pin the edge). */
type _Legs = ToolLegs;
/** The read-only per-node projection the handler optionally binds (frozen, referenced to pin the edge). */
type _Nodes = NodeSource;

/**
 * The seams the assembler injects because NO adapter backs them at this WIRE slice — passed in via config
 * so the assembly is testable with fakes/stubs (the five legs are exercised for ASSEMBLY, not behaviour).
 *
 * [SEAM-CORRECTION — the classifier type] the pre-decided design named `import('@atlas/tools').Know5Classifier`;
 * that symbol is NOT exported from @atlas/tools — it is a LOCAL alias inside tools/reconcile.ts of the
 * @atlas/knowledge `ReconcileApi` (the KNOW-5 mechanical/semantic split, `createReconcile`'s `classifier`
 * param). Wired to the real exported type: `import('@atlas/knowledge').ReconcileApi`.
 */
export interface WireSeams {
  /** T0-candidate keyword heuristic for `createInit` (@atlas/tools). */
  readonly heuristic: import('@atlas/tools').T0Heuristic;
  /** The GROUND truth-gate for `createEmit` (@atlas/tools). */
  readonly gate: import('@atlas/tools').TruthGate;
  /** The KNOW-5 mechanical/semantic classifier for `createReconcile` (@atlas/knowledge `ReconcileApi`). */
  readonly classifier: import('@atlas/knowledge').ReconcileApi;
  /** The grounded facts whose anchors the drift-source diffs across the merge base. */
  readonly driftFacts: readonly import('@atlas/knowledge').GroundedFact[];
  /** GROUND-owned anchor resolution at a rev (createDriftSource dep, git-drift.ts:24). */
  readonly resolveAnchorAt: (rev: string, qp: string) => import('@atlas/contracts').StructRef | undefined;
  /** N10 — GROUND-owned CONTENT-addressed resolution at a rev: the recorded `subtreeHash` re-located to its
   *  new qualifiedPath (or `undefined` if the content is gone). Feeds `createDriftSource`'s pure-rename
   *  widening (git-drift.ts). OPTIONAL — a bare WIRE fake that omits it simply never surfaces a rename. */
  readonly resolveBySubtreeAt?: (
    rev: string,
    subtreeHash: string,
  ) => import('@atlas/contracts').StructRef | undefined;
}

/** What the assembler needs to stand up the runtime (ring shape). */
export interface WireConfig {
  readonly repoPath: string;
  readonly casPath: CasPath;
  /** The `.scip` dump `readScip` decodes for the index adapter. */
  readonly scipPath: string;
  /** The injected seams that have no adapter (tests pass fakes/stubs). */
  readonly seams: WireSeams;
  /** The KNOW-11 write actor (owner-scoped authz). Resolved by the composition root from the environment /
   *  local machine ONLY (never from a fact/payload); ABSENT ⇒ `''` ⇒ fail-closed (every write denied). */
  readonly actor?: string;
  /** The KNOW-8 ratify token (`by`) for a full-ratify (T0/predicate/contested) commit. Resolved by the
   *  composition root from the environment ONLY (`ATLAS_RATIFY_TOKEN`, never a fact/payload); ABSENT ⇒ a
   *  full-ratify fact fails closed, a T0 fact needs `billy`. Fast-pathed (auto-accept) facts ignore it. */
  readonly ratifyToken?: string;
  /** The built structural axes the CLOSED three-mode retrieval surface reads (N2 — `atlas query --by
   *  dependency|trigger`). Supplied by the composition root (`composeRuntime` builds the SAME axes the index
   *  adapter rides); the fact-dependent read model is rebuilt PER QUERY from the live store over these axes,
   *  so dependency/trigger are as fresh as scope. ABSENT for the bare WIRE assembly (wire-only fake tests
   *  exercise `--by scope` only), where the non-scope modes fail closed. */
  readonly axes?: Axes;
  /** The PROVENANCE seam (`store-provenance.ts`) for the ONE durable store below — "did this store arrive
   *  through a door, or by a COMMIT". Resolved by the composition root (git lives there, `store.ts` is
   *  deliberately git-ignorant). ABSENT ⇒ never consulted ⇒ behaviour unchanged, which is the shape every
   *  wire-only fake test relies on. It MUST be threaded here and not only onto compose's own store: THIS is
   *  the store both user-facing doors ride, and a seam applied only to compose's drift/doctor store would
   *  leave `atlas query` serving a committed projection while every test of the seam passed. */
  readonly trusted?: SidecarTrust;
}

/**
 * Assemble THE one shared handler over the five legs built from the raw adapters (WIRE-1). ONE handler,
 * no per-entrypoint copy: every entrypoint imports THIS factory and calls it — the single assembly point.
 *
 * Each leg wraps the frozen leg-constructor's one method (`init`/`query`/`emit`/`reconcile`/`link`); a leg backed
 * by a still-stubbed adapter or a throwing seam is SAFE, because `handle` catches a missing OR throwing leg
 * and returns a rejected `Verdict`, never a throw (TOOLS-2). The `args:unknown` boundary is cast at each
 * leg — the frozen per-tool signatures name the fields (`init(path)`/`query(scope)`/`emit(node,at)`/
 * `reconcile(mergeBase, options)`/`link(a,b)`).
 */
export function assembleHandler(config: WireConfig): WiredHandler {
  // The index-backing adapter (satisfies both frozen tools ports: MoveInIndex + QueryIndex) over the
  // frozen FS + SCIP outputs, driving @atlas/index. `nodeHashOfPath` is the sealed-kernel path→node keying
  // (= build's keying, `id({file})`) — the exact IndexAdapterDeps shape (cf s01 / index-adapter.test).
  // Fold sub-file AST item/block units onto the spatial FileTree BEFORE `build` (F1): `build` keys every
  // index node by `node.path` (build.ts `key: node.path`), so the folded `::`-chained unit paths become
  // resolvable index node keys — a symbol grounding re-derives FRESH and its `::` primaryAnchor lets
  // `deriveSubsumes` fire (module ⊃ function). `foldAstUnits` is SYNC and reads the module-level grammar
  // singletons; when the composition root has awaited `initAst()` (the bins do, before composeRuntime) it
  // folds real units, otherwise it is a safe additive NO-OP (file/dir nodes only) — so wire tests that never
  // warm up keep their exact prior behavior.
  const fileTree = foldAstUnits(walkFileTree(config.repoPath));
  // DEGRADE gracefully on a fresh repo: a MISSING `.scip` dump (no `.atlas/index.scip` yet) is an empty
  // files-only index, never a throw. `readScipOrEmpty` is the ONE shared missing-file guard (scip.ts) — the
  // twin of the one `compose.ts` applies for the Axes build (COMPOSE-B).
  const scipOutput = readScipOrEmpty(config.scipPath);
  const index = createIndexAdapter({
    fileTree,
    scipOutput,
    build,
    createResolve,
    createDepgraph,
    nodeHashOfPath, // THE index's own minting, imported — never a local copy of `id({file:p})` (KERNEL-1)
  });

  // GOVERNED DURABLE EMIT (COMPOSE-A): the emit leg persists through the governed path — the GROUND
  // truth-gate, the KNOW-11 owner-scoped authz gate (actor supplied by the composition root, fail-closed
  // to `''` when absent ⇒ every write denied), the KNOW-15 `upsert` write-decision, and durable persistence
  // (the projection sidecar + the whole fact into CAS) — over the DURABLE `createDiskStore(config.casPath)`,
  // not a throwaway in-memory map. This closes the former store-bridge TODO: the durable store is the real
  // one now. The actor is passed in via `config.actor` (resolved from env/git-config by compose.ts) — this
  // module NEVER reads `process.env` or a fact/payload for the actor (the spoof-guard boundary).
  // The ONE durable disk store this assembly rides — shared by the governed emit leg (the write side) AND
  // the projection query-readback (the read side), so `atlas query` reads back the very facts `atlas emit`
  // persists (WIRE-LOOP: emit→query is a closed loop over ONE store, never two divergent instances).
  // N11: inject the freshness-watermark seam — a cheap `git rev-parse HEAD` (no worktree). The store stamps
  // `builtAt` at each persist; the query index (below) compares it to live HEAD to flag a behind-HEAD read.
  const currentHead = (): string | undefined => headSha(config.repoPath);
  // PROVENANCE: threaded from the composition root onto the ONE store both doors ride (see `WireConfig`).
  const store = createDiskStore(config.casPath, currentHead, config.trusted);

  const governedEmit = createGovernedEmit({
    store,
    gate: config.seams.gate,
    policy: loadPolicy(config.repoPath),
    actor: config.actor ?? '',
    // The ratify token rides the SAME env-sourced, payload-free channel as the actor. Conditional spread
    // keeps it ABSENT (not `undefined`) when unset — `exactOptionalPropertyTypes`, so the door defaults to ''.
    ...(config.ratifyToken !== undefined ? { ratifyToken: config.ratifyToken } : {}),
  });

  // GOVERNED sameAs LINK (WP-SAMEAS): the second governed write door — asserts a human `a ≡ b` equivalence
  // over the SAME durable disk store + admin policy + env-sourced actor/ratifyToken channels as emit. Four
  // fail-closed gates (distinct → both-known → authz-on-both → ratifier) before it persists a symmetric edge;
  // NON-destructive (never a merge). The projection it mutates is the SAME `store` the query readback rides,
  // so a linked edge surfaces on the very next `atlas query` (the WIRE-LOOP holds for link→query too).
  const governedLink = createGovernedLink({
    store,
    policy: loadPolicy(config.repoPath),
    actor: config.actor ?? '',
    ...(config.ratifyToken !== undefined ? { ratifyToken: config.ratifyToken } : {}),
  });

  // Seam-1: wrap the pure structural index-adapter with the durable projection readback, so a scope resolves
  // to its covering territory skeleton (from @atlas/index) FOLDED with the emitted facts under it (from CAS).
  const queryIndex = createProjectionQueryIndex(index, store, currentHead);

  const legs: ToolLegs = {
    'atlas-init': ((args) =>
      createInit(index, config.seams.heuristic).init((args as { path: string }).path)) satisfies ToolLeg,
    // Seam-3: the query leg's `Verdict.data` is the `{ pack, subsumes }` observability envelope. `subsumes`
    // is `deriveSubsumes` (its FIRST production call site — DP-2 resolution-at-read) filtered to the edges
    // whose BOTH endpoints are current nodes UNDER the covering scope, already deterministically sorted.
    'atlas-query': ((args) => {
      // PROVENANCE, BEFORE ANY MODE SPLIT. The tripwire already made a committed store read as EMPTY; what it
      // did not do was SAY SO, and `ok:true` + an empty pack is indistinguishable from "no knowledge yet" —
      // the silent-disappearance failure this product treats as the worst one available. Refusing here (a
      // throw the frozen handler converts into a structured rejected `Verdict`, TOOLS-2) covers EVERY read
      // mode from one line: putting it inside the `--by scope` branch would have left `--by dependency`
      // serving the same committed rows with no refusal, which is exactly how the seam was missed the first
      // time (`WireConfig.trusted` records the twin of this mistake for the store instance itself).
      refuseUntrustedRead(config.trusted);
      const a = args as { scope: string; by?: string };
      // N2: `--by dependency|trigger` routes THROUGH the designed three-mode `createRetrieval` surface (INDEX-6),
      // NOT re-implemented here. `scope` (the default, and every MCP/wire-fake call) stays the byte-identical
      // pre-existing projection path below. The mode is marshal-validated ∈ {scope,dependency,trigger} (CLI).
      const by = a.by;
      if (by === 'dependency' || by === 'trigger') {
        if (config.axes === undefined) {
          // No structural axes wired at this seam (bare WIRE fake assembly) — fail closed; the handler wraps
          // this throw into a structured rejected Verdict (TOOLS-2), never a raw throw at the user door.
          throw new Error('atlas query --by dependency|trigger needs the composition-root axes');
        }
        // retrievalPack rebuilds the read model FRESH from the live store each call — freshness parity w/ scope.
        return retrievalPack(config.axes, by, a.scope, store);
      }
      const scope = a.scope;
      const pack = createQuery(queryIndex).query(scope);
      const proj = rehydrateProjection(store);
      const underKeys = new Set(
        currentNodes(proj)
          .filter((n) => n.primaryAnchor !== undefined && underScope(n.primaryAnchor, scope))
          .map((n) => n.nodeKey),
      );
      const subsumes = deriveSubsumes(proj).filter(
        (s) => underKeys.has(s.broader) && underKeys.has(s.narrower),
      );
      // WP-SAMEAS: the derived human equivalence edges, scoped EXACTLY like `subsumes` — both endpoints must
      // be current nodes UNDER the covering scope. `deriveSameAs` is transitive (union-find) + pre-sorted.
      const sameAs = deriveSameAs(proj).filter(
        (e) => underKeys.has(e.a) && underKeys.has(e.b),
      );
      return { pack, subsumes, sameAs };
    }) satisfies ToolLeg,
    'atlas-emit': ((args) =>
      governedEmit.emit(
        (args as { node: import('@atlas/knowledge').GroundedFact }).node,
        (args as { at: import('@atlas/contracts').Hash }).at,
      )) satisfies ToolLeg,
    // WP-SAMEAS: the governed sameAs link leg — routes through the ONE handler like every other tool. Reads
    // the two nodeKeys off the marshalled `{a,b}` arg shape (CLI marshal.ts / MCP inputSchema both supply it).
    // [A-D3 / task #83] `retract` selects the MODE on the SAME leg and the SAME tool — no sixth tool, no
    // second leg, so CLI and MCP reach retraction through one code path and cannot diverge. Compared to the
    // literal `true`: the published schema declares `retract` as a boolean, so anything else is refused as
    // `malformed-args` at the door BEFORE this line, and the CLI marshaller hands over a real boolean.
    'atlas-link': ((args) =>
      governedLink.link(
        (args as { a: string }).a,
        (args as { b: string }).b,
        (args as { retract?: unknown }).retract === true,
      )) satisfies ToolLeg,
    'atlas-reconcile': ((args) =>
      createReconcile(
        createDriftSource({
          repoPath: config.repoPath,
          resolveAnchorAt: config.seams.resolveAnchorAt,
          // N10 — thread the content-addressed resolver so `driftAt` surfaces a pure rename (spread keeps it
          // ABSENT, not `undefined`, when a fake omits it — exactOptionalPropertyTypes).
          ...(config.seams.resolveBySubtreeAt !== undefined
            ? { resolveBySubtreeAt: config.seams.resolveBySubtreeAt }
            : {}),
          facts: config.seams.driftFacts,
        }),
        config.seams.classifier,
      ).reconcile(
        (args as { mergeBase: import('@atlas/contracts').Hash }).mergeBase,
        (args as { options?: import('@atlas/tools').ReconcileOptions }).options,
      )) satisfies ToolLeg,
  };

  // The DAG-pin references NOT wired as handler legs (frozen skeleton edges): the git-forge / history /
  // site-proposer seams. (The AST fold is now REALLY wired — the index FileTree pipeline above; the durable
  // disk store is REALLY wired — the emit leg.)
  void [createForge, createHistorySource, createSiteProposer];

  // N6: the READ-ONLY per-node projection source (TOOLS-10). `resolveNode(addr)` reads the whole fact back
  // from CAS by its CONTENT ADDRESS — the SAME durable store the query readback + governed emit ride (the CAS
  // bytes ARE the fact). READ-ONLY: it opens NO write path (writes funnel through the governed doors `atlas-emit`/`atlas-link`, TOOLS-1);
  // a miss ⇒ `undefined` (the handler renders a structured "no grounded node" rejection, never a throw).
  const nodes: NodeSource = {
    resolve: (nodeAddr) => {
      // PROVENANCE — the leg that goes AROUND `loadProjection`. Everything else on the read side rehydrates
      // the sidecar, where the tripwire lives; this one reads CAS by content address DIRECTLY, and `.atlas/cas/**`
      // is committed by the same `git add -f` that lands the sidecar (`isDurableStorePath` covers both). So a
      // committed blob came back WHOLE over `atlas node <addr>` with `ok:true`, with every write door denying.
      // It USED to return `undefined` here — fail-closed but indistinguishable from an ordinary miss —
      // because the frozen `resolveNode` did not wrap this call in a try/catch, so a throw would have escaped
      // as a raw exception at the user door. `resolveNode` now catches and attributes (packages/tools/src/
      // fault.ts), so the refusal can travel the channel `ToolLeg` already uses and reach EVERY transport
      // with its own discriminant instead of being flattened into "no grounded node at <addr>". The CLI
      // still refuses one frame up with the same reason; this is the backstop for every other caller.
      refuseUntrustedRead(config.trusted);
      // SECURITY (billy PoC): `nodeAddr` is attacker-controllable over MCP/poke. A CAS content address is
      // EXACTLY 64 lowercase hex; anything else (a `../` traversal to an unbounded file like /dev/zero) is a
      // MISS — rejected BEFORE any filesystem read, so it can never hang/OOM. Defense-in-depth: `store.get`
      // re-applies the same charset + sandbox guard (store.ts). READ-ONLY: no write path (TOOLS-1).
      const addr = String(nodeAddr);
      if (!/^[0-9a-f]{64}$/.test(addr)) return undefined;
      return store.get(addr as unknown as Hash) as GroundedFact | undefined;
    },
  };

  // ONE handler over the five legs + the read-only per-node source — no per-entrypoint copy (WIRE-1).
  return createHandler(legs, nodes);
}
