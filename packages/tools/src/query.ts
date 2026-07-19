// @atlas/tools — src/query.ts   (WP-7.26-b.TOOLS — TOOLS-6, INV-TOOLS-6; guidance INV-TOOLS-4)
//
// `atlas-query` — the read-only discovery entry point + the frozen `QueryApi`. Resolves any scope through an
// injected index port to the MERGED covering bounded `Pack` — `tier≥T1` only, stale-flagged (a stale pack
// is a re-ground SIGNAL, not served truth). Pure + total; the concrete index resolution is @atlas/index.

import type { Hash, Pack, PackInvariant } from '@atlas/contracts';
import type { Guidance, QueryOut } from './types.js';

export interface QueryApi {
  /** Resolve any scope (file/folder/module/crate) → the merged covering bounded `Pack` of `tier≥T1`
   *  invariants (`≤ ~2K`); `stale:true` MUST mean re-ground before trusting (TOOLS-6, §6.1). Pure + total.
   *  (method-tags-tls:58)
   *
   *  [PINNED — `scope` arg] atlas-tools:125 names `atlas-query <scope>`; no `Scope`/`Path` brand is
   *  frozen at this seam (cf retrieval `Path = string`). Pinned to `string`, NOT a brand.
   *  ([NOTE] the `≤ ~2K` token bound is an ADVISORY size bound verified by a size test, not a type
   *  constraint — method-tags-tls:59.) */
  query(scope: string): QueryOut;
}

/**
 * The covering skeleton the index axis resolves a scope to (the raw, pre-governance read). `invariants` is
 * the covering territory's raw invariant set; `stale` is `true` iff any backing grounding drifted. Tools
 * CONSUMES this port — @atlas/index owns the concrete resolution; it is NOT defined here.
 */
export interface QueryIndex {
  /** Resolve a scope to its covering territory skeleton. MAY throw on a malformed (non-string) scope — the
   *  handler wrapper converts that throw to a rejected `Verdict` (TOOLS-2 totality boundary). */
  cover(scope: string): {
    readonly territory: string;
    readonly axisHash: Hash;
    readonly invariants: readonly PackInvariant[];
    readonly stale: boolean;
  };
}

/** The `next + invariant` guidance the query read surface ships on its result envelope (INV-TOOLS-4). The
 *  same intent the handler stamps for `atlas-query`; co-located here so the read surface carries its own. */
export const QUERY_GUIDANCE: Guidance = {
  next: 're-ground a stale pack before trusting it; scope must be a path string (file/folder/module/crate)',
  invariant: 'TOOLS-6: bounded read projection (tier>=T1, stale-flagged) — never a global dump',
};

/** The pack bound: every invariant is `tier≥T1` (T0 or T1); a `T2`/below-T1 node is bounded OUT (TOOLS-6). */
const atLeastT1 = (inv: PackInvariant): boolean => inv.tier !== 'T2';

/** The advisory `≤ ~2K` token estimate — a deterministic char-count proxy over the merged claims. It is an
 *  ADVISORY size bound (verified by a size test), never a correctness oracle (method-tags-tls:158). */
const tokenEstimate = (invariants: readonly PackInvariant[]): number =>
  invariants.reduce((n, inv) => n + inv.claim.length, 0);

/**
 * Build `atlas-query` over an injected structural index port. The returned `query` conforms EXACTLY to the
 * frozen `QueryApi.query(scope)` signature. Pure + total and READ-ONLY: it resolves the scope through the
 * index, BOUNDS the covering invariants to `tier≥T1`, and assembles the merged `Pack` carrying the `stale`
 * flag and the advisory token estimate. It never mutates a store and never opens a write path.
 */
export function createQuery(index: QueryIndex): QueryApi {
  const query = (scope: string): QueryOut => {
    const cover = index.cover(scope); // resolve the scope → its covering territory (may throw on malformed)
    const invariants = cover.invariants.filter(atLeastT1); // tier≥T1 bound — below-T1 noise is dropped
    const pack: Pack = {
      territory: cover.territory,
      axisHash: cover.axisHash,
      invariants,
      tokenEstimate: tokenEstimate(invariants),
      stale: cover.stale, // a stale pack is surfaced, NOT served as fresh truth (TOOLS-6c)
    };
    return pack;
  };
  return { query };
}

// differential-vs-oracle (compile-time): the impl's `query` conforms to the frozen `QueryApi.query(scope)`
// signature (co-located `QueryApi`). The concrete index axis-resolution is a DISTINCT, out-of-facet port.
const _queryConforms: QueryApi = createQuery({
  cover: () => ({ territory: '', axisHash: '' as Hash, invariants: [], stale: false }),
});
void _queryConforms;
