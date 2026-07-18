// @atlas/retrieval — ref/rank.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// THE shared within-tier comparator reused by the packer (RETR-2) and the bounder (RETR-11). The rank is
// the total, deterministic, antisymmetric order `(hits-desc, ppr-desc, nodeKey-asc)` (atlas-retrieval:70;
// method-tags-ret:32-33): the scarce budget goes first to observed-useful facts (the `hits` ledger,
// RETR-8), ties broken by precomputed PPR importance (GEN-11), then by `nodeKey`.
//
// [LEAD-RATIFIED] `ppr` is a STORED numeric field read here for ranking — NOT a call into genesis.

export interface RankApi {
  /** The shared within-tier comparator — a total order `(hits-desc, ppr-desc, nodeKey-asc)`. Returns a
   *  negative / zero / positive number (a standard comparator), deterministic + antisymmetric.
   *
   *  [SIG-TBD — ranked-item type] The reference does not freeze the compared record's shape; it names
   *  only the three sort keys the item must carry: `hits: number` (RETR-8 ledger), `ppr: number`
   *  ([LEAD-RATIFIED] stored field, GEN-11), `nodeKey` (identity, ascending). Transcribed as `unknown`
   *  rather than invented; the owning WP pins the ranked-item shape (a ranked pack item / `RelatedFact`).
   *  (atlas-retrieval:70; method-tags-ret:32-33) */
  compare(a: unknown, b: unknown): number;
}
