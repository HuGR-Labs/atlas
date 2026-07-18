// @atlas/index — ref/retrieval.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The CLOSED retrieval surface (INDEX-6): relevance resolves by EXACTLY three deterministic modes —
// scope (spatial), dependency (blast radius), trigger (tag/pattern). No fourth mode, no free-text /
// similarity `search()`, no embeddings (INDEX-7). Every entry point is total: an unresolvable
// path/tag returns empty, never a throw (INDEX-9). Two identical queries ⇒ byte-identical results
// (INDEX-8). (atlas-index:213-215, 219-220; method-tags-idx:55-74)

// [UPWARD-TYPE — knowledge-owned, do NOT import upward] `Fact` (a `GroundedFact`, atlas-index:21, 59)
// is owned by a HIGHER layer (@atlas/knowledge). Importing it here would invert the layer DAG, so it
// is transcribed as `unknown` and flagged — NOT redefined as an index-local type. The retrieval
// surface returns whatever the knowledge layer's `Fact` is; the index only addresses + orders it.
export type Fact = unknown;

export interface RetrievalApi {
  /** Mode 1 — scope: spatial resolve + hierarchy roll-up ("what's known here and above"). Total.
   *  (atlas-index:213) */
  byScope(path: string): readonly Fact[];
  /** Mode 2 — dependency: follow `depends-on` / blast radius (reverse closure). Total. (atlas-index:214) */
  byDependency(path: string): readonly Fact[];
  /** Mode 3 — trigger: cross-cutting rules attached by tag/pattern match. Total. (atlas-index:215) */
  byTrigger(tag: string): readonly Fact[];
}
