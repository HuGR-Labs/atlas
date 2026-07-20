// @atlas/adapter-io — src/wire.ts  (WIRE-1: the ONE shared handler assembly)
//
// The single composition seam shared by every entrypoint (CLI, MCP): assemble the four governance legs
// (atlas-init / atlas-query / atlas-emit / atlas-reconcile) over the raw adapters and hand them to the one
// frozen `createHandler`. Co-located with the adapters it composes (D2: the shared `wire` module lives in
// @atlas/adapter-io, not a separate package). This module is the SOLE assembly point — every entrypoint
// imports THIS `assembleHandler`, so CLI and MCP are contract-identical by construction, not by copy
// (WIRE-1). The four legs are built from the raw adapters; the seams that have NO adapter (the T0
// heuristic, the truth-gate, the KNOW-5 classifier, the drifted-fact set, and the anchor resolver) are
// INJECTED via `WireConfig.seams`, so the assembly is testable with fakes/stubs.

import { createHandler, createInit, createQuery, createEmit, createReconcile } from '@atlas/tools';
import type { ToolLegs, ToolLeg, NodeSource } from '@atlas/tools';
import type { Cas } from '@atlas/kernel';
import { id } from '@atlas/kernel';
import { build, createResolve, createDepgraph } from '@atlas/index';
import type { CasPath } from './store.js';
import { walkFileTree } from './fs.js';
import { readScip } from './scip.js';
import { createIndexAdapter } from './index-adapter.js';
import { createDriftSource } from './git-drift.js';
// DAG-pin imports — referenced (not wired as legs) to keep the frozen skeleton's dependency edges real.
import { foldAstUnits } from './ast.js';
import { createDiskStore } from './store.js';
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
 * so the assembly is testable with fakes/stubs (the four legs are exercised for ASSEMBLY, not behaviour).
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
}

/** What the assembler needs to stand up the runtime (ring shape). */
export interface WireConfig {
  readonly repoPath: string;
  readonly casPath: CasPath;
  /** The `.scip` dump `readScip` decodes for the index adapter. */
  readonly scipPath: string;
  /** The injected seams that have no adapter (tests pass fakes/stubs). */
  readonly seams: WireSeams;
}

/**
 * Assemble THE one shared handler over the four legs built from the raw adapters (WIRE-1). ONE handler,
 * no per-entrypoint copy: every entrypoint imports THIS factory and calls it — the single assembly point.
 *
 * Each leg wraps the frozen leg-constructor's one method (`init`/`query`/`emit`/`reconcile`); a leg backed
 * by a still-stubbed adapter or a throwing seam is SAFE, because `handle` catches a missing OR throwing leg
 * and returns a rejected `Verdict`, never a throw (TOOLS-2). The `args:unknown` boundary is cast at each
 * leg — the frozen per-tool signatures name the fields (`init(path)`/`query(scope)`/`emit(node,at)`/
 * `reconcile(mergeBase, options)`).
 */
export function assembleHandler(config: WireConfig): WiredHandler {
  // The index-backing adapter (satisfies both frozen tools ports: MoveInIndex + QueryIndex) over the
  // frozen FS + SCIP outputs, driving @atlas/index. `nodeHashOfPath` is the sealed-kernel path→node keying
  // (= build's keying, `id({file})`) — the exact IndexAdapterDeps shape (cf s01 / index-adapter.test).
  const fileTree = walkFileTree(config.repoPath);
  const scipOutput = readScip(config.scipPath);
  const index = createIndexAdapter({
    fileTree,
    scipOutput,
    build,
    createResolve,
    createDepgraph,
    nodeHashOfPath: (p: string) => id({ file: p }),
  });

  // STORE BRIDGE (KEY): the frozen `createEmit(store: Cas, gate)` takes the kernel `Cas`
  // (`Map<Hash, CasObject>`) — the durable `createDiskStore` (put/get) does NOT structurally fit that
  // signature. For THIS WIRE slice, satisfy the frozen signature with a fresh in-memory `Cas`.
  // TODO(durability): emit writes to an in-memory Cas; durable-store wiring is a follow-on (createEmit
  // takes a Map; bridging to DiskStore.put is a separate WP — createEmit is NOT changed here).
  const emitStore: Cas = new Map();

  const legs: ToolLegs = {
    'atlas-init': ((args) =>
      createInit(index, config.seams.heuristic).init((args as { path: string }).path)) satisfies ToolLeg,
    'atlas-query': ((args) =>
      createQuery(index).query((args as { scope: string }).scope)) satisfies ToolLeg,
    'atlas-emit': ((args) =>
      createEmit(emitStore, config.seams.gate).emit(
        (args as { node: import('@atlas/knowledge').GroundedFact }).node,
        (args as { at: import('@atlas/contracts').Hash }).at,
      )) satisfies ToolLeg,
    'atlas-reconcile': ((args) =>
      createReconcile(
        createDriftSource({
          repoPath: config.repoPath,
          resolveAnchorAt: config.seams.resolveAnchorAt,
          facts: config.seams.driftFacts,
        }),
        config.seams.classifier,
      ).reconcile(
        (args as { mergeBase: import('@atlas/contracts').Hash }).mergeBase,
        (args as { options?: import('@atlas/tools').ReconcileOptions }).options,
      )) satisfies ToolLeg,
  };

  // The DAG-pin references NOT wired as handler legs (frozen skeleton edges): the AST fold, the durable
  // disk store (deferred by the store bridge above), and the git-forge / history / site-proposer seams.
  void [foldAstUnits, createDiskStore, createForge, createHistorySource, createSiteProposer, config.casPath];

  // ONE handler over the four legs — no per-entrypoint copy (WIRE-1).
  return createHandler(legs);
}
