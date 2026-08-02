// @atlas/cli — src/mine-proposer.ts  (ADR-0011: how `mine` obtains its S2 proposer)
//
// Split out of `mine.ts` at the 400-LOC ceiling, and cohesive on its own: everything here answers one
// question — where does the model come from, and what happens when it does not. `mine.ts` keeps the run
// composition; this file keeps the proposer resolution.

import { createCommandClient, createFileSourceReader, createPromptFactory, createSiteProposer, loadModelConfig } from '@atlas/adapter-io';
import type { SiteProposer } from '@atlas/genesis';

/** The honest fail-closed default proposer: no model is wired, so the model abstains at every site
 *  (GEN-12). Reached when the operator has configured no model — which is the zero-config state, and `mine`
 *  reports it rather than implying the repo held nothing (WP-F6). */
export function defaultProposer(): SiteProposer {
  return { propose: () => null };
}

/**
 * [ADR-0011] Resolve the S2 proposer from the OPERATOR's configuration.
 *
 * `loadModelConfig` reads `~/.config/atlas/model.json` (never the repo — a command named by the repository
 * under analysis would make `atlas mine` on a clone an arbitrary-code-execution path) and THROWS on a
 * malformed one. That throw is deliberate and must not be caught here: a broken config degrading to
 * `defaultProposer` would abstain at every site and report a clean, empty run — indistinguishable from a
 * repository that genuinely holds no groundable fact.
 *
 * ABSENT config ⇒ the fail-closed default. That is a state, not an error.
 */
export function resolveProposer(repoPath: string): SiteProposer {
  const cfg = loadModelConfig(repoPath); // throws on malformed — never silently "no model"
  const propose = cfg?.roles.propose;
  if (cfg === null || propose === undefined) return defaultProposer();
  const prompts = createPromptFactory({ source: createFileSourceReader(repoPath) });
  return createSiteProposer({
    client: createCommandClient(propose),
    budget: { costCap: cfg.costCap, timeoutMs: cfg.timeoutMs },
    buildPrompt: prompts.build,
  });
}
