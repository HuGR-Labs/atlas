// @atlas/retrieval — ref/stale.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Fail-closed staleness (RETR-3). `stale` ⇔ ANY grounding backing the pack drifted (never a guess); a
// `stale` pack MUST NOT be trusted as-is — it MUST be re-grounded before use. The reference `stale` =
// OR over the backings' drifted-bit read from the index drift-oracle (INDEX-5 seam), NOT a heuristic.
// Transcribed from atlas-retrieval:77-78 / method-tags-ret:35-40.

export interface StaleApi {
  /** Pack staleness (RETR-3): `= OR(backings.drifted)` — `true` iff any backing grounding drifted.
   *  Pure + deterministic (reads the index drift-oracle's drifted bit, never a guess).
   *
   *  [FLAG — `backings` type] The reference freezes the EXPRESSION `OR(backings.drifted)` but not a
   *  backing record; transcribed as the exact frozen expression's shape — a list of `{ drifted:
   *  boolean }` (the drift bit per backing). NOT widened beyond the reference; the owning WP pins the
   *  fuller backing record. (method-tags-ret:40) */
  isStale(backings: readonly { readonly drifted: boolean }[]): boolean;
}
