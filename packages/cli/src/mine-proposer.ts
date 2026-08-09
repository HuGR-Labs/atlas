// @atlas/cli — src/mine-proposer.ts  (ADR-0011: how `mine` obtains its S2 proposer)
//
// Split out of `mine.ts` at the 400-LOC ceiling, and cohesive on its own: everything here answers one
// question — where does the model come from, and what happens when it does not. `mine.ts` keeps the run
// composition; this file keeps the proposer resolution.

import {
  createCommandClient,
  createPromptFactory,
  createSiteProposer,
  createUnitSiblingReader,
  createUnitSourceReader,
  loadModelConfig,
  shippedEnrichedTemplatePath,
} from '@atlas/adapter-io';
import type { SiteProposer } from '@atlas/genesis';

/** The opt-in ENRICH arm (A4-LEVER.md): when set truthy, the proposer shows the model each target unit's
 *  same-file CONTEXT siblings, fixing the cross-unit precision trap (#201). Default OFF ⇒ the shipped
 *  anchored-unit-only prompt, byte-identical. Gated here rather than defaulted so the flip stays a measured
 *  decision, not a silent behaviour change. */
export const ENRICH_ENV = 'ATLAS_ENRICH';

/** `true` iff the ENRICH arm is enabled by `env`. OFF for unset and for every explicit falsey spelling
 *  (`''`, `'0'`, `'false'`, `'off'`, `'no'`, case-insensitive) — so `ATLAS_ENRICH=false` does NOT silently
 *  turn it on. Any other value is ON. Pure + total, exported so the gating decision is tested, not merely
 *  inspected. */
export function enrichEnabled(env: NodeJS.ProcessEnv): boolean {
  const v = env[ENRICH_ENV];
  if (v === undefined) return false;
  return !['', '0', 'false', 'off', 'no'].includes(v.trim().toLowerCase());
}

/** The honest fail-closed default proposer: no model is wired, so the model abstains at every site
 *  (GEN-12). Reached when the operator has configured no model — which is the zero-config state, and `mine`
 *  reports it rather than implying the repo held nothing (WP-F6). */
export function defaultProposer(): SiteProposer {
  return { propose: () => null };
}

/**
 * The outcome of asking for a model: the proposer to run, WHETHER it is a real one, and — when it is — the
 * digest of the prompt artifact it will send.
 *
 * `wired` is a fact ABOUT THE RESOLUTION, and it has to be, because the caller cannot recover it: `mine.ts`
 * installs the resolved proposer on the right-hand side of a `??`, so "was a model injected by the caller"
 * (`deps?.proposer !== undefined`) is ALWAYS FALSE on the CLI path and reported "no proposer model is
 * wired" in the same four lines as `llmCalls 2`.
 *
 * `promptDigest` is the ADR-0011 Decision-3 provenance leg — the hash of the prompt artifact, which
 * `propose.md` itself relies on ("the refusal RATE is only readable as a quality signal with this prompt
 * held fixed — which the provenance hash is what makes possible"). `PromptFactory.digest` had no reader
 * anywhere, so the property was asserted in three texts and carried by nothing.
 */
export interface ResolvedProposer {
  readonly proposer: SiteProposer;
  readonly wired: boolean; //           a real operator-configured model, not the abstaining default
  readonly promptDigest?: string; //    the digest of the prompt artifact (absent ⇒ no prompt was loaded)
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
 *
 * `env` is THREADED, not defaulted away: `loadModelConfig` already parameterises it (model-config.ts:90),
 * and without a seam here `runMine(repo)` with no deps reads the DEVELOPER'S OWN `~/.config/atlas/model.json`
 * — three cli tests go red on any machine that has one, and once the source reader works a unit test would
 * EXECUTE the operator's model binary.
 */
export function resolveProposer(repoPath: string, env: NodeJS.ProcessEnv = process.env): ResolvedProposer {
  const cfg = loadModelConfig(repoPath, env); // throws on malformed — never silently "no model"
  const propose = cfg?.roles.propose;
  if (cfg === null || propose === undefined) return { proposer: defaultProposer(), wired: false };
  // #182 S2 — the UNIT-granular reader. It WRAPS `createFileSourceReader(repoPath)` (all three of its
  // containment/symlink/fd checks intact) and narrows a `::` site to the unit's own bytes; a bare-path
  // site reads exactly as before, which is what lets one binary serve both A/B arms.
  // Default: the anchored-unit-only prompt. Opt-in ENRICH (ATLAS_ENRICH): also show the target's same-file
  // context siblings via the enriched template — the fact stays anchored to the target (KNOW-15g), only what
  // the model SEES widens.
  const prompts = enrichEnabled(env)
    ? createPromptFactory({
        source: createUnitSourceReader(repoPath),
        related: createUnitSiblingReader(repoPath),
        templatePath: shippedEnrichedTemplatePath(),
      })
    : createPromptFactory({ source: createUnitSourceReader(repoPath) });
  const proposer = createSiteProposer({
    client: createCommandClient(propose),
    budget: { costCap: cfg.costCap, timeoutMs: cfg.timeoutMs },
    buildPrompt: prompts.build,
  });
  return { proposer, wired: true, promptDigest: String(prompts.digest) };
}
