// @atlas/retrieval — ref/rank.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// THE shared within-tier comparator reused by the packer (RETR-2) and the bounder (RETR-11). The rank is
// the total, deterministic, antisymmetric order `(hits-desc, ppr-desc, nodeKey-asc)` (atlas-retrieval:70;
// method-tags-ret:32-33): the scarce budget goes first to observed-useful facts (the `hits` ledger,
// RETR-8), ties broken by precomputed PPR importance (GEN-11), then by `nodeKey`.
//
// [LEAD-RATIFIED] `ppr` is a STORED numeric field read here for ranking — NOT a call into genesis.

import type { NodeKey } from '@atlas/contracts';

/**
 * The minimal ranked item — carries EXACTLY the three sort keys the comparator reads (atlas-retrieval:70;
 * method-tags-ret:32-33): `hits` (RETR-8 ledger), `ppr` ([LEAD-RATIFIED] stored field, GEN-11), `nodeKey`
 * (identity). Pinned per the oracle-pin map: no existing record carries all three, so this is the minimal
 * join over the ranked pack item / `RelatedFact` inputs.
 */
export interface RankItem {
  readonly nodeKey: NodeKey;
  readonly ppr: number;
  readonly hits: number;
}

export interface RankApi {
  /** The shared within-tier comparator — a total order `(hits-desc, ppr-desc, nodeKey-asc)`. Returns a
   *  negative / zero / positive number (a standard comparator), deterministic + antisymmetric.
   *
   *  [PINNED — ranked-item type] `RankItem` — the minimal join carrying the three sort keys.
   *  (atlas-retrieval:70; method-tags-ret:32-33) */
  compare(a: RankItem, b: RankItem): number;
}
