// @atlas/adapter-io — src/wire.ts  (WIRE-1: the ONE shared handler assembly)
//
// The single composition seam shared by every entrypoint (CLI, MCP): assemble the four governance legs
// (atlas-init / atlas-query / atlas-emit / atlas-reconcile) over the raw adapters and hand them to the one
// frozen `createHandler`. Co-located with the adapters it composes (D2: the shared `wire` module lives in
// @atlas/adapter-io, not a separate package). SKELETON — the signature + the import graph are frozen here;
// the composition is deferred to the WIRE WP (WP-9.1.1-a.WIRE). The imports below make the DAG edges real
// and tsc-checked.

import { createHandler } from '@atlas/tools';
import type { ToolLegs, NodeSource } from '@atlas/tools';
import type { CasPath } from './store.js';
import { walkFileTree } from './fs.js';
import { readScip } from './scip.js';
import { foldAstUnits } from './ast.js';
import { createDiskStore } from './store.js';
import { createDriftSource, createForge, createHistorySource } from './git.js';
import { createSiteProposer } from './llm.js';

/** The one wired handler — the exact return of the frozen `createHandler` (@atlas/tools). */
export type WiredHandler = ReturnType<typeof createHandler>;

/** The legs the assembler composes (frozen, referenced to pin the edge). */
type _Legs = ToolLegs;
/** The read-only per-node projection the handler optionally binds (frozen, referenced to pin the edge). */
type _Nodes = NodeSource;

/** What the assembler needs to stand up the runtime (ring shape). */
export interface WireConfig {
  readonly repoPath: string;
  readonly casPath: CasPath;
}

/**
 * Assemble THE one shared handler over the four legs built from the raw adapters. STUB — only the
 * signature + the adapter/tools import edges are frozen; the WIRE WP composes the legs and calls
 * `createHandler`. The adapters are referenced so the dependency edges are real at runtime.
 */
export function assembleHandler(config: WireConfig): WiredHandler {
  void config;
  void [
    walkFileTree,
    readScip,
    foldAstUnits,
    createDiskStore,
    createDriftSource,
    createForge,
    createHistorySource,
    createSiteProposer,
    createHandler,
  ];
  throw new Error('unimplemented: WIRE-1 — assemble the one shared handler over the four legs');
}
