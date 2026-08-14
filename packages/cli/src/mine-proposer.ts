// @atlas/cli — src/mine-proposer.ts  (ADR-0011: how `mine` obtains its S2 proposer)
//
// Split out of `mine.ts` at the 400-LOC ceiling, and cohesive on its own: everything here answers one
// question — where does the model come from, and what happens when it does not. `mine.ts` keeps the run
// composition; this file keeps the proposer resolution.

import { execFileSync } from 'node:child_process';

import {
  createCommandClient,
  createPromptFactory,
  createSiteProposer,
  createUnitSiblingReader,
  createUnitSourceReader,
  dependencyClaimParser,
  loadModelConfig,
  shippedDependencyTemplatePath,
  shippedEnrichedTemplatePath,
} from '@atlas/adapter-io';
import type { ClaimParser, ModelCommand } from '@atlas/adapter-io';
import type { SiteProposer } from '@atlas/genesis';

/** The sentinel `modelIdentity` for the fail-closed default: no model was wired, so nothing produced a
 *  fact. It is a STATE, honestly named — never a fabricated identity. */
export const NO_MODEL_IDENTITY = 'unwired:no-model-configured';

/**
 * [#210] Capture a STABLE identity for the resolved proposer model, for W-REPORT to stamp on the run report
 * so a run is reproducible w.r.t. what produced it. It is `cmd + args` plus a BEST-EFFORT `--version` probe:
 * on success the trimmed output is appended; on any failure (missing binary, non-zero exit, no `--version`,
 * timeout) the identity records cmd+args and NOTES the probe failed — a version is NEVER fabricated.
 *
 * HONESTY CONSTRAINT (#210): this is "which CLI + version", NOT a cost basis. `claude -p` is an AGENTIC CLI,
 * so measured prompt bytes are a lower bound on billed input; nothing here computes a price/token/cost from
 * it, mirroring `llm.ts`'s refusal to pretend a subprocess reports a spend.
 */
export function captureModelIdentity(cmd: ModelCommand): string {
  const base = [cmd.cmd, ...cmd.args].join(' ');
  try {
    const version = execFileSync(cmd.cmd, ['--version'], {
      encoding: 'utf8',
      timeout: 5_000,
      stdio: ['ignore', 'pipe', 'ignore'], // no stdin, capture stdout, discard stderr
    }).trim();
    return version === '' ? `${base} (version unavailable: --version produced no output)` : `${base} @ ${version}`;
  } catch {
    return `${base} (version unavailable: --version probe failed)`;
  }
}

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

/** [ADR-0017] The mining ARM selector. Unset ⇒ the shipped ADVISORY arm (byte-identical). `dependency` ⇒
 *  the ADR-0017 dependency arm: the `DEPENDS-ON:` prompt + `dependencyClaimParser`, so `atlas mine` emits
 *  typed dependency `PredicateSeed`s the sound oracle proves-or-drops. Selected by env like ENRICH so the
 *  flip stays a MEASURED decision, never a silent behaviour change. Other values are rejected (see
 *  `resolveMineSlot`) rather than silently treated as advisory — a typo must not degrade the arm invisibly. */
export const MINE_SLOT_ENV = 'ATLAS_MINE_SLOT';

/** Resolve the mining arm from `env`. `undefined`/`''` ⇒ `'advisory'`; `'dependency'` (case-insensitive,
 *  trimmed) ⇒ `'dependency'`; ANY OTHER value THROWS — a misspelled arm is a misconfiguration, and silently
 *  falling back to advisory would mine the wrong family while reporting success (the fail-silent trap #167). */
export function resolveMineSlot(env: NodeJS.ProcessEnv): 'advisory' | 'dependency' {
  const v = env[MINE_SLOT_ENV]?.trim().toLowerCase();
  if (v === undefined || v === '') return 'advisory';
  if (v === 'advisory' || v === 'dependency') return v;
  throw new Error(`${MINE_SLOT_ENV}=${JSON.stringify(env[MINE_SLOT_ENV])} is not a known mining arm — use 'advisory' or 'dependency'`);
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
  readonly modelIdentity: string; //    [#210] which CLI + version produced answers (NO_MODEL_IDENTITY if none)
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
  if (cfg === null || propose === undefined)
    return { proposer: defaultProposer(), wired: false, modelIdentity: NO_MODEL_IDENTITY };
  // #182 S2 — the UNIT-granular reader. It WRAPS `createFileSourceReader(repoPath)` (all three of its
  // containment/symlink/fd checks intact) and narrows a `::` site to the unit's own bytes; a bare-path
  // site reads exactly as before, which is what lets one binary serve both A/B arms.
  //
  // [ADR-0017] The mining ARM selects BOTH the template and the claim parser (they are COUPLED — the prompt
  // writes the grammar the parser reads). `dependency` ⇒ the `DEPENDS-ON:` template + `dependencyClaimParser`.
  // Otherwise the ADVISORY arm: the anchored-unit-only prompt (default) or, opt-in ENRICH (ATLAS_ENRICH), the
  // enriched template that also shows the target's same-file context siblings — the fact stays anchored to the
  // target (KNOW-15g), only what the model SEES widens. Advisory keeps `parseClaim` UNSET (advisory default).
  const slot = resolveMineSlot(env);
  const prompts =
    slot === 'dependency'
      ? createPromptFactory({ source: createUnitSourceReader(repoPath), templatePath: shippedDependencyTemplatePath() })
      : enrichEnabled(env)
        ? createPromptFactory({
            source: createUnitSourceReader(repoPath),
            related: createUnitSiblingReader(repoPath),
            templatePath: shippedEnrichedTemplatePath(),
          })
        : createPromptFactory({ source: createUnitSourceReader(repoPath) });
  const parseClaim: ClaimParser | undefined = slot === 'dependency' ? dependencyClaimParser : undefined;
  const proposer = createSiteProposer({
    client: createCommandClient(propose),
    budget: { costCap: cfg.costCap, timeoutMs: cfg.timeoutMs },
    buildPrompt: prompts.build,
    ...(parseClaim !== undefined ? { parseClaim } : {}),
  });
  return { proposer, wired: true, promptDigest: String(prompts.digest), modelIdentity: captureModelIdentity(propose) };
}
