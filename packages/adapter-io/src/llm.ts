// @atlas/adapter-io — src/llm.ts  (ADAPT-LLM-1: the single bounded S2 site proposer)
//
// The raw llm adapter: the one bounded LLM entry — the S2 `SiteProposer` (@atlas/genesis), invoked once
// per visited site (the driver calls `propose` EXACTLY ONCE per site; extract.ts:105-113). This module is
// the SOLE model seam: the `ModelClient` port lives ONLY here, which is what makes golden 11a's "a model is
// invoked only via SiteProposer.propose" a mechanical module-graph audit. Everything model/prompt/budget is
// INJECTED (D5/wire binds the concrete async model behind this synchronous seam) — this file hardcodes no
// model, no prompt, no network/clock primitive, and imports no other adapter.

import type { Candidate, SiteProposer } from '@atlas/genesis';

/** The bounded spend envelope for the one call — a hard cost cap + a wall-clock timeout (ADAPT-LLM-1). */
export interface LlmBudget {
  readonly costCap: number;
  readonly timeoutMs: number;
}

/** The raw model verdict at a site: a claim, or `null` when the model ABSTAINED here (GEN-12). */
export interface CompletionResult {
  readonly claim: string | null; // null ⇒ the model abstained at this site
}

/** The single, synchronous model seam — one bounded completion per prompt (matches the frozen sync
 *  `SiteProposer.propose`; the concrete async binding is D5/wire's concern). Referenced by ONE src module
 *  (this one) — the sole model entry point in the whole system (ADAPT-LLM-1, golden 11a). */
export interface ModelClient {
  complete(prompt: string, budget: LlmBudget): CompletionResult;
}

/** Construct the S2 `SiteProposer` — ONE bounded model call per site, abstention allowed (ADAPT-LLM-1).
 *  The `SiteProposer` return type is frozen; the model client, budget, and prompt-builder are INJECTED so
 *  this seam hardcodes no model and no prompt (D5). `propose` makes exactly one `client.complete` call —
 *  no retry, no loop — and returns a candidate proposal the driver GATES (never auto-trusted, never written
 *  to a store — GEN-4/12, golden 11c). Self-declaration fields are never read or emitted (GEN-4d). */
export function createSiteProposer(deps: {
  client: ModelClient;
  budget: LlmBudget;
  buildPrompt: (cand: Candidate) => string;
}): SiteProposer {
  return {
    propose(cand: Candidate) {
      const prompt = deps.buildPrompt(cand);
      const r = deps.client.complete(prompt, deps.budget); // EXACTLY ONE bounded call — no retry/loop
      return r.claim === null ? null : { cand, claim: r.claim };
    },
  };
}
