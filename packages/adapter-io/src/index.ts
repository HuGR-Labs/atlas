// @atlas/adapter-io — barrel
//
// The raw adapters (constitution D2: "fs · scip · ast · store · git · llm") + the ring types they introduce
// (LangId / IndexerPlan / CasPath / DiskStore). The `git` seam is split into its three separately-anchored
// WP files (git-history · git-drift · git-forge) so ADAPT-GIT-1/2/3 stay disjoint per the frozen WP cards.
// One-way DAG leaf: nothing in the core imports this.

export { walkFileTree } from './fs.js';
export { readScip, planIndexers } from './scip.js';
export type { LangId, IndexerPlan } from './scip.js';
export { foldAstUnits, initAst } from './ast.js';
export { createDiskStore, rehydrateProjection } from './store.js';
export type { CasPath, DiskStore } from './store.js';
export { createHistorySource } from './git-history.js';
export { createDriftSource } from './git-drift.js';
export { createForge } from './git-forge.js';
// The cheap `headSha` freshness-watermark reader (N11, no worktree) — the ONLY member of the shared no-shell
// git seam (#74, `run-git.ts`) that crosses the package boundary (the mine driver injects it). `runGit` + the
// error classifier/backoff primitives stay module-internal, consumed intra-package via relative import.
export { headSha } from './run-git.js';
export { createSiteProposer } from './llm.js';
export { createIndexAdapter } from './index-adapter.js';
export type { IndexAdapterDeps } from './index-adapter.js';
export { materializePoke, pokeFilePath, POKE_FILE_EXT } from './poke-file.js';

// The standalone arbitrary-rev code index (COMPOSE-C) — builds `Axes` at any git rev via a memoized,
// self-cleaning temp worktree so `atlas-reconcile` can detect real (non-HEAD) drift. Wiring is separate.
export { createRevIndex, type RevIndex } from './rev-index.js';

// The PRODUCTION genesis S0 seam (GEN-1): the frozen `SkeletonSource` satisfied by COMPOSING walkFileTree +
// readScipOrEmpty + @atlas/index `build` + the index-adapter/`atlas-init` territory move-in. Consumed by the
// `atlas mine` driver, which previously injected a hand-built empty skeleton (⇒ 0 seeds, 0 sites, 0 calls).
export { createSkeletonSource } from './skeleton-source.js';
export type { SkeletonSourceDeps } from './skeleton-source.js';

// The ONE shared handler assembly (constitution WIRE-1) — consumed by every entrypoint (CLI, MCP).
export { assembleHandler } from './wire.js';
export type { WireConfig, WiredHandler, WireSeams } from './wire.js';

// The governed durable emit leg (COMPOSE-A) + the runtime composition root that supplies the real seams.
export { createGovernedEmit } from './governed-emit.js';
export type { GovernedEmitDeps } from './governed-emit.js';
// The governed sameAs link leg (WP-SAMEAS) — the second governed write door (authz + ratifier). `LinkOut` is
// re-exported FROM @atlas/tools (its owner) so consumers can pull the whole door surface from this barrel.
export { createGovernedLink } from './governed-link.js';
export type { GovernedLinkDeps } from './governed-link.js';
export type { LinkOut } from '@atlas/tools';
export { composeRuntime, buildHeuristic, buildGate } from './compose.js';
export type { ComposedRuntime } from './compose.js';
export { createDoctorSource, regroundTemplate, retireTemplate } from './doctor-source.js';

// The versioned governance policy (WP-POLICY): declarative `.atlas/policy.json` + fail-closed loader. The
// WP name says "admin-locked"; the file is NOT locked by any live mechanism (see policy.ts) — the loader is.
export { loadPolicy, defaultPolicy, actorInScope, nearDupConfig } from './policy.js';
export type { AtlasPolicy, NearDupPolicy, T0HeuristicPolicy, AuthzPolicy } from './policy.js';
