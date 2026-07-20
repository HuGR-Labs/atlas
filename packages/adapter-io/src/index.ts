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
export { createSiteProposer } from './llm.js';
export { createIndexAdapter } from './index-adapter.js';
export type { IndexAdapterDeps } from './index-adapter.js';
export { materializePoke, pokeFilePath, POKE_FILE_EXT } from './poke-file.js';

// The ONE shared handler assembly (constitution WIRE-1) — consumed by every entrypoint (CLI, MCP).
export { assembleHandler } from './wire.js';
export type { WireConfig, WiredHandler } from './wire.js';
