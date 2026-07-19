// @atlas/tools — src/query.ts   (WP-7.26-b.TOOLS — TOOLS-6, INV-TOOLS-6; guidance INV-TOOLS-4)
//
// `atlas-query` — the discovery entry point + one of the EXACTLY-FOUR governance tools (TOOLS-1). This is a
// READ surface: it opens NO write path and carries NO write authority. It resolves ANY scope (file / folder
// / module / crate) through an injected index port to the covering territory, and returns the MERGED
// covering bounded `Pack` — `tier≥T1` only (the below-T1 noise is bounded out), stale-flagged, within the
// `≤ ~2K` advisory token budget. A `stale:true` pack is a SIGNAL to re-ground, NOT a served truth. Pure +
// total: no clock, no IO, no write, no throw of its own (the injected port MAY throw on a malformed scope;
// the handler wrapper converts that to a rejected `Verdict`, TOOLS-2). Transcribed against the frozen oracle
// `../ref/query.ts` (`QueryApi.query`) + `../ref/types.ts` (`QueryOut = Pack`).
//
// SCOPE (this facet): the governance shaping of the read — the `tier≥T1` bound + the merged-pack assembly +
// the stale flag + the shipped guidance envelope. EXCLUDED — the concrete index axis-resolution (the walk
// that maps a scope to its covering territory + raw invariant set) is an @atlas/index port, CONSUMED here as
// `QueryIndex`, never computed here; identity/hashing stays behind the sealed @atlas/kernel seam.

import type { Hash, Pack, PackInvariant } from '@atlas/contracts';
import type { QueryApi } from '../ref/query.js';
import type { Guidance, QueryOut } from '../ref/types.js';

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
// signature (../ref/query.ts). The concrete index axis-resolution is a DISTINCT, out-of-facet port.
const _queryConforms: QueryApi = createQuery({
  cover: () => ({ territory: '', axisHash: '' as Hash, invariants: [], stale: false }),
});
void _queryConforms;
