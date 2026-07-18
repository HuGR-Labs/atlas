// @atlas/index — ref/index.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// THE SINGLE-INDEX reference (INV-INDEX-1, method-tags-idx:25). ONE content-addressed index backs BOTH
// drift detection AND discovery across every axis — there is NO separate discovery structure and NO
// separate staleness pass (auxiliary-structure count == 0). It exposes ≥3 axes, each cross-indexing an
// object stored ONCE (INDEX-10). This is the FACET file `index/ref/index.ts` named by the WP's
// interface_contract — DISTINCT from the runtime barrel `src/index.ts` (which stays empty).
//
// `IndexApi` is the umbrella surface of atlas-index:209-216 (resolve / rollup / delta / byScope /
// byDependency / byTrigger / put), composed from the facet interfaces WITHOUT redefining any signature.

import type { CasIndexApi } from './cas.js';
import type { FoldApi } from './fold.js';
import type { ResolveApi } from './resolve.js';
import type { RetrievalApi } from './retrieval.js';
import type { RollupApi } from './rollup.js';
import type { Axis, IndexNode } from './types.js';

// Re-export the single-node record so consumers of the single-index surface get it from here too
// (the WP inventory pairs `index/ref/index.ts` with `IndexNode`, method-tags-idx:25). Owned by
// ref/types.ts — re-exported, NOT redefined.
export type { IndexNode };

/**
 * The one content-addressed index (INDEX-1). Composes the public surface (atlas-index:209-216) from the
 * facets — `resolve`/`rollup` (RollupApi)/`put` (CasIndexApi)/`byScope`+`byDependency`+`byTrigger`
 * (RetrievalApi) — and pulls `delta` from `FoldApi` by its frozen signature (no redefinition). Exposes
 * the ≥3 axes it indexes on (INDEX-10). No `search()`/free-text entry point exists (INDEX-6).
 */
export interface IndexApi extends ResolveApi, RollupApi, CasIndexApi, RetrievalApi {
  /** The axes this single index cross-indexes on — ≥3 (`spatial`, `territory`, `dependency`),
   *  each object stored once (INDEX-10). (atlas-index:174-175) */
  readonly axes: readonly Axis[];
  /** Which axis buckets changed, structure vs state (INDEX-12). Reused verbatim from `FoldApi`.
   *  (atlas-index:212) */
  delta: FoldApi['delta'];
}
