// @atlas/knowledge — ref/init.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The `$0`-LLM structural move-in (KNOW-6, spec A-5) — the machine behind `atlas-init`. Knowledge starts
// UN-AUTHORED: the output carries ZERO invariants; 100% of territories ship the `T2/advisory` default by
// construction — nothing authored, nothing promoted. Transcribed from atlas-knowledge:77, 194 and
// method-tags-knw:53-58.

import type { TerritoryView } from './types.js';

export interface InitApi {
  /** Structural move-in over a tree (KNOW-6). Emits the territory skeleton + blast radius, every
   *  territory at `tier=T2` / advisory family with `invariants=[]` — auto-promotes nothing (KNOW-7).
   *  Pure + total.
   *
   *  [SIG-TBD — `tree` arg, downward-owned] The reference names `init(tree)` with no concrete type for
   *  the structural tree snapshot. The tree is a LOWER-layer artifact (index/kernel are below knowledge);
   *  the task reserves the `IndexNode` import for the evaluator's index-query, so `tree` is transcribed
   *  as `unknown` rather than pinned to a concrete index type. Flagged for the WP.
   *
   *  [FLAG — return carries no `invariants`] KNOW-6 requires the output carry ZERO invariants, but
   *  `TerritoryView` (ref/types.ts) has no `invariants` field — the zero-invariant property is a
   *  by-construction guarantee of the emitter, not a field on the returned view. Flagged. */
  init(tree: unknown): readonly TerritoryView[];
}
