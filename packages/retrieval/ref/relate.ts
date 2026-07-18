// @atlas/retrieval — ref/relate.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Deterministic partitioned closure (RETR-10). `relate(unit)` = the EXACT related-node set computed
// purely from the index's three axes (spatial roll-up + `depends-on` forward & reverse closure +
// territory), PARTITIONED by relation kind (`enclosing` / `dependents` / `dependencies` / `governing` /
// optional `coChanged`), byte-identical for equal input, 0 LLM — the model supplies only the touched
// unit; the closure is the index's job. `coChanged` is git-history-derived (deterministic but
// correlational), opt-in + labeled, NEVER mixed into the structural bands. The `dependents` band is
// bounded, ranked, and honestly truncated (RETR-11, via `ref/bound.ts`). Total: a malformed unit yields
// an empty set, never a throw (RETR-9). Transcribed from atlas-retrieval:169 + method-tags-ret:84-89.

import type { Path, RelationSet } from './types.js';

export interface RelateApi {
  /** Touched unit (path) → ALL nodes related to it, PARTITIONED by relation kind (RETR-10). Consumes
   *  the index's three axes; deterministic (byte-identical for equal input), 0 LLM. Pure + total (miss
   *  ⇒ empty RelationSet, no throw — RETR-9). (atlas-retrieval:169) */
  relate(unit: Path): RelationSet;
}
