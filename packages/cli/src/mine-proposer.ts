// @atlas/cli — src/mine-proposer.ts  (ADR-0011: how `mine` obtains its S2 proposer)
//
// Split out of `mine.ts` at the 400-LOC ceiling, and cohesive on its own: everything here answers one
// question — where does the model come from, and what happens when it does not. `mine.ts` keeps the run
// composition; this file keeps the proposer resolution.

import { execFileSync } from 'node:child_process';

import { join } from 'node:path';

import {
  createCommandClient,
  createCountResolver,
  createDepResolver,
  createPromptFactory,
  createSiteProposer,
  createUnitCountCandidates,
  createUnitDepCandidates,
  createUnitSiblingReader,
  createUnitSourceReader,
  gotchaClaimParser,
  loadModelConfig,
  makeCountClaimParser,
  makeDependencyClaimParser,
  readScipOrEmpty,
  shippedCountTemplatePath,
  shippedDependencyTemplatePath,
  shippedEnrichedTemplatePath,
  shippedGotchaTemplatePath,
} from '@atlas/adapter-io';
import type { CandidateReader, ClaimParser, ModelCommand } from '@atlas/adapter-io';
import { cappedBudget } from '@atlas/genesis';
import type { GenesisBudget, SiteProposer } from '@atlas/genesis';
import type { StructRef } from '@atlas/contracts';

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

/** Resolve the mining arm from `env`. `undefined`/`''` ⇒ `'advisory'`; `'dependency'`/`'count'` (case-
 *  insensitive, trimmed) ⇒ that arm; ANY OTHER value THROWS — a misspelled arm is a misconfiguration, and
 *  silently falling back to advisory would mine the wrong family while reporting success (the fail-silent trap
 *  #167). `count` is the #196c cardinality dual of `dependency` — same throw-on-typo discipline. */
export function resolveMineSlot(env: NodeJS.ProcessEnv): MineSlot {
  const v = env[MINE_SLOT_ENV]?.trim().toLowerCase();
  if (v === undefined || v === '') return 'advisory';
  if (v === 'advisory' || v === 'dependency' || v === 'count' || v === 'gotcha') return v;
  throw new Error(`${MINE_SLOT_ENV}=${JSON.stringify(env[MINE_SLOT_ENV])} is not a known mining arm — use 'advisory', 'dependency', 'count' or 'gotcha'`);
}

/** One resolved mining arm. `gotcha` is the 196b justified vertical slice's opt-in SEMANTIC arm — it is a valid
 *  single arm (`resolveMineSlot`/`resolveProposer`) but is DELIBERATELY absent from the sound-by-default SET
 *  (`resolveMineSlots`), because it is not sound: it lands `justified`, not `proven`. */
export type MineSlot = 'advisory' | 'dependency' | 'count' | 'gotcha';

/** [MINE-BUDGET-CAP] The env that caps how many sites a metered `atlas mine` run visits. It is the CLI-
 *  reachable knob onto the run-controller's already-existing `GenesisBudget.ceiling` seam — there is no
 *  `--budget` FLAG (the surface types none), so a metered run's spend was uncapped below the 200 default
 *  until this. An env, not a flag, to match `ATLAS_MINE_SLOT`/`ATLAS_ENRICH`. */
export const MINE_BUDGET_ENV = 'ATLAS_MINE_BUDGET';

/** Resolve the site-ceiling budget from `env`. Unset/'' ⇒ `undefined` — the controller's `defaultBudget`
 *  applies and behaviour is BYTE-IDENTICAL to today (the cap is opt-in). A POSITIVE INTEGER string N ⇒
 *  `cappedBudget(N)`. ANY other value (`0`, negative, `1.5`, `abc`, a non-empty non-integer) THROWS —
 *  mirroring `resolveMineSlot`'s throw discipline: a bad budget is a misconfiguration and must NOT silently
 *  fall back to the 200 default, mining far more than the operator asked (the fail-silent trap #167). */
export function resolveMineBudget(env: NodeJS.ProcessEnv): GenesisBudget | undefined {
  const raw = env[MINE_BUDGET_ENV];
  if (raw === undefined || raw === '') return undefined;
  const trimmed = raw.trim();
  // A positive integer only — `Number.parseInt` would accept `1.5`/`3abc`, so match the whole string first.
  if (!/^[1-9][0-9]*$/.test(trimmed))
    throw new Error(`${MINE_BUDGET_ENV}=${JSON.stringify(raw)} is not a positive integer site cap — pass a whole number ≥ 1 (e.g. ${MINE_BUDGET_ENV}=25), or leave it unset for the default`);
  return cappedBudget(Number(trimmed));
}

/** [SOUND-DEFAULT-MINE] The SET of arms a run mines. Unset/'' ⇒ the SOUND-by-default union — advisory PROSE
 *  AND the two sound arms (dependency + count) TOGETHER, so a DEFAULT `atlas mine` no longer hides the proven
 *  facts behind an env var. An EXPLICIT valid arm ⇒ the SINGLETON of just that arm, which is what preserves the
 *  benchmark's per-axis isolation (one arm measured per invocation). A typo THROWS — reusing `resolveMineSlot`'s
 *  exact validation and message, so the fail-silent trap (#167) stays closed for the plural door too. `resolveMineSlot`
 *  (singular) is UNCHANGED: it still answers unset⇒'advisory' for the frozen single-pass callers. */
export function resolveMineSlots(env: NodeJS.ProcessEnv): readonly MineSlot[] {
  const v = env[MINE_SLOT_ENV]?.trim();
  if (v === undefined || v === '') return ['advisory', 'dependency', 'count'];
  return [resolveMineSlot(env)]; // an explicit arm — validated (throws on typo) and isolated to itself
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
  /** [PROVABLE-FRONTIER] The faithful provability precondition for THIS arm's sound oracle — built from the
   *  SAME `CandidateReader` that feeds the proposer's candidate list, so it is exact by construction: the
   *  dependency oracle can prove a fact at a site IFF the unit has outgoing cross-unit deps (`candidates`
   *  non-empty), and the count oracle IFF the unit defines externally-called exports. `mine.ts` threads it
   *  into `FrontierOptions.provableFirst` so the frontier is reordered provable-first. Present ONLY for the
   *  sound arms (`dependency`/`count`); the ADVISORY arm leaves it UNSET (no reorder — byte-identical). */
  readonly provableFirst?: (site: StructRef) => boolean;
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
/** The candidate-grounded arms that read the code index (`.atlas/index.scip`) to drive BOTH the prompt-side
 *  candidate list and the gate-side per-unit resolver: `dependency` (#196a fan-out) and `count` (#196c fan-in).
 *  The advisory/ENRICH arms do not. Reading the index ONCE per arm keeps the closed list the model sees and the
 *  symbol the parser binds derived from the SAME projection the gate reads (they can never disagree). */
export function resolveProposer(repoPath: string, env: NodeJS.ProcessEnv = process.env, slotOverride?: MineSlot): ResolvedProposer {
  // [ADR-0017] VALIDATE THE ARM FIRST — a misspelled `ATLAS_MINE_SLOT` is a misconfiguration, and it must
  // throw BEFORE the no-model early return below, or a typo (`dependncy`) would be silently swallowed as a
  // clean zero-config abstention in the exact same fail-silent shape `resolveMineSlot`'s throw exists to
  // prevent (Luna cold-review F4). Config validation, like `loadModelConfig`'s own throw, precedes the
  // "is a model even wired" question. The resolved arm is read again below (byte-identically) for the wired path.
  //
  // [SOUND-DEFAULT-MINE] `slotOverride` — when the multi-arm DRIVER (`runMineArms`) drives a SPECIFIC arm, it
  // passes the already-resolved slot here rather than mutating `process.env`, so a single binary serves every
  // arm without a global. When ABSENT the behaviour is BYTE-IDENTICAL to before (`resolveMineSlot(env)`); the
  // override is a pre-validated arm from `resolveMineSlots`, so it does not re-run the typo guard.
  const slot = slotOverride ?? resolveMineSlot(env);
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
  // `slot` was already resolved (and validated) at the top of this function.
  // [#196a/#196c candidate-grounded] The dependency AND count arms read the index ONCE and drive BOTH the
  // prompt-side candidate list (the names the model selects from) AND the gate-side per-unit resolver (name →
  // the unit's own symbol, plus — for count — the harness-derived witnessed number). Reading it once keeps them
  // derived from the SAME `.atlas/index.scip` the gate reads, so the closed list the model sees and the symbol
  // the parser binds can never disagree. `dependency` is fan-OUT (`DEPENDS-ON:`); `count` is its fan-IN dual
  // (`COUNT:`) — the model SELECTS a name, the harness derives the number, the sound oracle re-proves.
  const slotScip = slot === 'dependency' || slot === 'count' ? readScipOrEmpty(join(repoPath, '.atlas', 'index.scip')) : undefined;
  // [#196a/#196c + PROVABLE-FRONTIER] The candidate reader is built ONCE per sound arm and drives BOTH the
  // prompt-side candidate list AND the frontier-side provability precondition — the SAME `CandidateReader`, so
  // "the model has a name to pick" and "the oracle can prove a fact here" can never disagree. A site is provable
  // IFF this reader lists at least one candidate for it (a dep-sink/barrel lists none ⇒ not provable ⇒ ranked
  // after the provable sites). Undefined for the advisory arm ⇒ no reorder.
  const candidateReader: CandidateReader | undefined =
    slotScip === undefined ? undefined : slot === 'count' ? createUnitCountCandidates(slotScip) : createUnitDepCandidates(slotScip);
  // [196b gotcha] The SEMANTIC gotcha arm reads no index (no candidates) — it takes the SAME anchored-unit-only
  // source view as the bare advisory prompt, only the TEMPLATE differs (it asks for a `{claim, derivation}`
  // block). Selected before the ENRICH/bare branches so `ATLAS_MINE_SLOT=gotcha` loads `propose-gotcha.md`.
  const prompts =
    slotScip !== undefined && candidateReader !== undefined
      ? createPromptFactory({
          source: createUnitSourceReader(repoPath),
          candidates: candidateReader,
          templatePath: slot === 'count' ? shippedCountTemplatePath() : shippedDependencyTemplatePath(),
        })
      : slot === 'gotcha'
        ? createPromptFactory({ source: createUnitSourceReader(repoPath), templatePath: shippedGotchaTemplatePath() })
        : enrichEnabled(env)
          ? createPromptFactory({
              source: createUnitSourceReader(repoPath),
              related: createUnitSiblingReader(repoPath),
              templatePath: shippedEnrichedTemplatePath(),
            })
          : createPromptFactory({ source: createUnitSourceReader(repoPath) });
  // The predicate parser resolves the picked NAME to the unit's own SYMBOL (per-unit — the #196a lucy BLOCKER)
  // and puts that symbol on the seed's `target`. The count parser ALSO puts the harness-derived `atLeast`/`scope`
  // on the seed (the model never supplies the number), so the fact is bound to the unit's specific export.
  // [196b gotcha] The gotcha arm reads no index (`slotScip` undefined) but is NOT advisory-default: it injects
  // `gotchaClaimParser`, which lifts the `{claim, derivation}` pair out of the reason-freely block. The sound
  // arms bind their per-unit resolver (name → symbol); the semantic gotcha arm needs no resolver.
  const parseClaim: ClaimParser | undefined =
    slotScip === undefined
      ? slot === 'gotcha'
        ? gotchaClaimParser
        : undefined
      : slot === 'count'
        ? makeCountClaimParser(createCountResolver(slotScip))
        : makeDependencyClaimParser(createDepResolver(slotScip));
  const proposer = createSiteProposer({
    // [ADR-0020] The sound-gated slots (dependency/count) keep the ONE-LINE answer contract; the advisory AND the
    // semantic gotcha slot use the reason-freely fenced-`atlas-fact` BLOCK contract (measured 100%/0-halluc vs the
    // one-line 77.5%) — gotcha carries a second field (`derivation`) in that same block.
    client: createCommandClient(propose, slot === 'advisory' || slot === 'gotcha' ? 'block' : 'line'),
    budget: { costCap: cfg.costCap, timeoutMs: cfg.timeoutMs },
    buildPrompt: prompts.build,
    ...(parseClaim !== undefined ? { parseClaim } : {}),
  });
  // [PROVABLE-FRONTIER] The provability precondition rides out on the SAME reader the candidate list uses — a
  // site is provable IFF the reader lists ≥1 candidate for it. Sound arms only; the advisory arm has no reader
  // and so leaves this UNSET, which is what keeps its frontier byte-identical (no reorder in `createMine`).
  const provableFirst: ((site: StructRef) => boolean) | undefined =
    candidateReader === undefined ? undefined : (site: StructRef): boolean => candidateReader.candidates(site).length > 0;
  return {
    proposer,
    wired: true,
    promptDigest: String(prompts.digest),
    modelIdentity: captureModelIdentity(propose),
    ...(provableFirst !== undefined ? { provableFirst } : {}),
  };
}
