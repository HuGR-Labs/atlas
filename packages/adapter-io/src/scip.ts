// @atlas/adapter-io — src/scip.ts  (ADAPT-SCIP-1/2: read a SCIP dump + plan the per-language indexers)
//
// The raw scip adapter: read an external `scip.proto` dump into the frozen `ScipOutput` projection
// (@atlas/index) and plan which indexer to run per language. SKELETON — signatures frozen, bodies deferred.

import type { ScipOutput } from '@atlas/index';

/** The languages the indexer planner knows about (ring shape — constitution D2). */
export type LangId = 'ts' | 'py' | 'go' | 'java' | 'rust';

/** One planned per-language SCIP indexer invocation (ring shape — constitution D2). */
export interface IndexerPlan {
  readonly lang: LangId;
  readonly tool: string;
  readonly args: readonly string[];
}

/** Read a per-language SCIP indexer dump into the minimal frozen `ScipOutput` projection (ADAPT-SCIP-1). */
export function readScip(scipPath: string): ScipOutput {
  void scipPath;
  throw new Error('unimplemented: ADAPT-SCIP-1 — read a scip.proto dump into ScipOutput');
}

/** Plan which indexer to run for each requested language (ADAPT-SCIP-2). */
export function planIndexers(langs: LangId[]): IndexerPlan[] {
  void langs;
  throw new Error('unimplemented: ADAPT-SCIP-2 — plan the per-language SCIP indexers');
}
