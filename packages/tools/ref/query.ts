// @atlas/tools — ref/query.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// `atlas-query` — the discovery entry point (TOOLS-6, spec §6.1). One of the EXACTLY-FOUR governance
// tools (TOOLS-1). It accepts ANY scope (file / folder / module / crate), resolves it through the index
// to the covering territory/-ies, and returns the MERGED covering bounded `Pack` (`≤ ~2K`, `tier≥T1`,
// stale-flagged). The SAME call backs the proactive poke/hook (atlas-retrieval). A `stale:true` pack is a
// signal to re-ground, NOT a served truth. Pure + total. Transcribed from atlas-tools:45-47, 125, 144-145
// + method-tags-tls:54-59.

import type { QueryOut } from './types.js';

export interface QueryApi {
  /** Resolve any scope (file/folder/module/crate) → the merged covering bounded `Pack` of `tier≥T1`
   *  invariants (`≤ ~2K`); `stale:true` MUST mean re-ground before trusting (TOOLS-6, §6.1). Pure + total.
   *  (method-tags-tls:58)
   *
   *  [SIG-TBD — `scope` arg] atlas-tools:125 names `atlas-query <scope>`; no `Scope`/`Path` brand is
   *  frozen at this seam (cf retrieval `Path = string`). Transcribed as `string`, NOT invented as a brand.
   *  ([NOTE] the `≤ ~2K` token bound is an ADVISORY size bound verified by a size test, not a type
   *  constraint — method-tags-tls:59.) */
  query(scope: string): QueryOut;
}
