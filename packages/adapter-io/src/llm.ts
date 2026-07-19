// @atlas/adapter-io — src/llm.ts  (ADAPT-LLM-1: the single bounded S2 site proposer)
//
// The raw llm adapter: the one bounded LLM entry — the S2 `SiteProposer` (@atlas/genesis), invoked once
// per visited site. SKELETON — signature frozen, body deferred to the ADAPT-LLM WP.

import type { SiteProposer } from '@atlas/genesis';

/** Construct the S2 `SiteProposer` — one bounded LLM call per site, abstention allowed (ADAPT-LLM-1). */
export function createSiteProposer(): SiteProposer {
  return {
    propose(): never {
      throw new Error('unimplemented: ADAPT-LLM-1 — bounded S2 site proposal');
    },
  };
}
