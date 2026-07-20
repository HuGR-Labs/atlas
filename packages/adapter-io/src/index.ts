// @atlas/adapter-io — barrel
//
// The 6 raw adapters (constitution D2: "fs · scip · ast · store · git · llm, one file each") + the ring
// types they introduce (LangId / IndexerPlan / CasPath). One-way DAG leaf: nothing in the core imports this.

export { walkFileTree } from './fs.js';
export { readScip, planIndexers } from './scip.js';
export type { LangId, IndexerPlan } from './scip.js';
export { foldAstUnits } from './ast.js';
export { createDiskStore, rehydrateProjection } from './store.js';
export type { CasPath } from './store.js';
export { createHistorySource, createDriftSource, createForge } from './git.js';
export { createSiteProposer } from './llm.js';
export { createIndexAdapter } from './index-adapter.js';
export type { IndexAdapterDeps } from './index-adapter.js';

// The ONE shared handler assembly (constitution WIRE-1) — consumed by every entrypoint (CLI, MCP).
export { assembleHandler } from './wire.js';
export type { WireConfig, WiredHandler } from './wire.js';
