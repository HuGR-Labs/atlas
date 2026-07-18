// @atlas/retrieval — ref/own.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The curated, zero-assembly `own` pack (RETR-12). `own_<unit>` returns a curated `OwnPack` composed by
// INDEX READS ALONE (0 LLM, 0 free prose) — the unit's `tier≥T1` invariants + terrain + a bounded
// `relate()` + scoped memory pointers — `≤ ~1.5K` under the pinned cap, byte-identical for equal input.
// A seat receives its `own` WITHOUT choosing a scope. Dedup vs a co-injected pack by `nodeId` (own wins,
// the pack shows a `pull-reachable` pointer — a fact paid for once). An `epic` is NOT a grounded `own`
// unit — it composes from its Orientation goal + the features' `OwnPack`s. Total: a malformed unit
// yields an empty briefing, never a throw (RETR-9). Composed with `ref/pack.ts` / `ref/relate.ts` /
// `ref/caps.ts`. Transcribed from atlas-retrieval:168 + method-tags-ret:98-103.

import type { OwnPack, OwnUnit } from './types.js';

export interface OwnApi {
  /** Scope-unit → its CURATED, mechanically-composed `OwnPack` (the `own_<id>` tool), `≤ ~1.5K` under
   *  the pinned cap, deterministic (0 LLM). Pure + total (miss ⇒ empty briefing, no throw — RETR-9).
   *  (atlas-retrieval:168) */
  own(unit: OwnUnit): OwnPack;
}
