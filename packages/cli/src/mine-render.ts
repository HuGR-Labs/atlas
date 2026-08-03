// @atlas/cli — src/mine-render.ts  (CLI-4 / WP-F6: how a finished `mine` pass renders)
//
// Split out of `mine.ts` at the 400-LOC ceiling, and cohesive on its own: everything here answers one
// question — given a pass that has already run, what does the operator get to read. `mine.ts` keeps the
// run composition; this file keeps the projection and the prose.
//
// Nothing here asserts anything about the WIRING: every leg is READ OFF the run's own outcome, which is
// what keeps the "why is it 0" line from going stale when a seam upstream of it is wired or unwired later.

import type { GenesisReport } from '@atlas/genesis';
import type { CommitRefusal } from '@atlas/adapter-io';
import { STAGING_REFUSAL_TEXT as REFUSAL_TEXT } from './mine-staging.js';
import type { CliVerdict } from './render.js';

/**
 * One finished pass: the run's `GenesisReport` plus the four things the report cannot carry.
 *
 * `GenesisReport` is transcribed EXACTLY from the frozen surface literal (genesis/types.ts:129-153), so it
 * is not the place for any of this; each rides BESIDE it instead:
 *   - `refusal`      — WHY the staging commit refused. `run-controller` catches an interrupted site WITHOUT
 *                      a cause (GEN-8c is a bare `catch`), so "contended" would otherwise reach the user as
 *                      an anonymous partial run.
 *   - `modelWired`   — whether a REAL S2 proposer ran, computed from the RESOLUTION (mine-proposer.ts), not
 *                      from what the caller injected.
 *   - `promptDigest` — the ADR-0011 D3 provenance hash of the prompt artifact those proposals were built
 *                      from. Absent when no model was wired: no prompt was loaded, so there is none.
 *   - `seedsDropped` — dep-graph nodes the structural frontier had to drop for having no path. A bounded
 *                      set that is silently truncated reads as "we covered everything" (#130).
 */
export interface MinePass {
  readonly report: GenesisReport;
  readonly refusal?: CommitRefusal;
  readonly modelWired: boolean;
  readonly promptDigest?: string;
  readonly seedsDropped: number;
}

/**
 * The OBSERVED shape of a finished pass — every leg READ OFF the run's own `GenesisReport`, never asserted
 * about the wiring (WP-F6). This is the whole point: the "why is it 0" line below is DERIVED from what the
 * run actually did, so it cannot go stale when a seam upstream of it is wired (or unwired) later.
 *   - `sitesVisited` — `report.budgetSpent`, the sites the controller COMPLETED against the ceiling
 *     (run-controller.ts increments it once per completed site). 0 ⇒ the extractor was never reached at
 *     all, so the proposer was never consulted — a 0 that NO amount of model-wiring would change.
 *   - `complete`     — no `resumeToken` ⇒ the pass ran to its end (GEN-8); a partial 0 is not a result.
 *   - `ceiling`      — the caller's explicit `--budget` ceiling, if any. Present ONLY to keep the
 *     `sitesVisited === 0` explanation exact: with no explicit budget the controller's default ceiling is
 *     `min(frontierSize, 200)`, so a COMPLETE pass that visited 0 sites proves the frontier itself was
 *     empty; with an explicit `ceiling: 0` the frontier is unknown and the budget is the honest cause.
 */
export interface MineOutcome {
  readonly facts: number; //        grounded candidate facts the pass actually wrote
  readonly sitesVisited: number; // sites completed against the ceiling (report.budgetSpent)
  readonly complete: boolean; //    the pass ran to its end (no resumeToken)
  readonly modelWired: boolean; //  a real S2 proposer actually ran this pass
  readonly ceiling?: number; //     the caller's explicit budget ceiling, when one was given
}

/** Project the run's own report to the observed outcome — the ONLY input the explanation below reads. */
export function mineOutcome(r: GenesisReport, modelWired: boolean, ceiling?: number): MineOutcome {
  return {
    facts: r.seeded.length,
    sitesVisited: r.budgetSpent,
    complete: r.resumeToken === undefined,
    modelWired,
    ...(ceiling !== undefined ? { ceiling } : {}),
  };
}

/**
 * WHY the pass produced nothing — COMPUTED from `MineOutcome`, never a hard-coded cause (WP-F6).
 *
 * A 0-fact pass has genuinely different causes, and naming the wrong one is a lie even when the sentence is
 * literally true. The distinction the user needs is WHERE the run stopped producing:
 *   • 0 sites visited  — the run died UPSTREAM of the model: the structural pass (skeleton → ranked
 *     frontier) handed the extractor nothing, so no proposer was ever consulted. Saying "no model is wired"
 *     here would tell the user the product is one wire from working when the model is not even reached.
 *     Naming what would NOT fix it is only half a diagnosis, so this case now also names where the answer
 *     is: `atlas doctor index`. `axes.edges` comes from SCIP alone and the frontier ranks by dep-graph
 *     degree, so the usual cause of a structurally empty frontier is an absent `.atlas/index.scip` — which
 *     that leg reports, along with the command that produces one. It POINTS, it does not promise: an
 *     indexed repository can still have an empty frontier, and the leg says which case this is.
 *   • N sites visited, 0 facts — the model gate IS where the 0 came from: every visited site abstained
 *     (`genesis/extract.ts:118`) or was refused by the 2-door gate. Only HERE is the absent proposer the
 *     operative cause, and only here is "abstain-by-design, never fabricated" the honest framing.
 *   • an incomplete pass — a 0 that is not a finished result at all.
 * Returns `null` when the pass seeded facts (there is nothing to explain).
 */
export function mineWhyEmpty(o: MineOutcome): string | null {
  if (o.facts > 0) return null;
  if (!o.complete) {
    return 'mine: 0 candidate facts — the pass did not run to completion, so this 0 is not a finished result';
  }
  if (o.sitesVisited === 0) {
    return o.ceiling === 0
      ? 'mine: 0 candidate facts — 0 sites visited: the run budget ceiling was 0, so nothing was ever extracted'
      : 'mine: 0 candidate facts — 0 sites visited: the structural pass (skeleton → ranked frontier) yielded no site, so no proposer was ever consulted; wiring a model would not change this 0. Run `atlas doctor index` to see whether this repository has the SCIP index the frontier is derived from';
  }
  return o.modelWired
    ? `mine: 0 candidate facts — ${o.sitesVisited} site(s) visited and every one abstained: nothing was proposed or admitted (facts are never fabricated)`
    : `mine: 0 candidate facts — ${o.sitesVisited} site(s) visited and every one abstained: no proposer model is wired, so nothing could be proposed (facts are never fabricated)`;
}

/** The DROP line (GEN-15c). A dep-graph node with no counterpart on the spatial axis has no path, so no
 *  bytes could be shown to a model at it (INDEX-13 cross-language/FFI targets, and any indexed document
 *  outside the tracked tree). It is dropped from the frontier — and SAID, because a frontier that shrinks
 *  in silence is indistinguishable from a repository with less in it. */
export function frontierDropLine(dropped: number): string | null {
  return dropped > 0
    ? `frontier: ${dropped} dep-graph node(s) dropped — no path on the spatial axis, so no source could be shown to a model (INDEX-13)`
    : null;
}

/** The PROVENANCE line (ADR-0011 D3). The prompt is a versioned artifact "hashed into the run's provenance",
 *  and `propose.md` leans on it: the refusal RATE is only readable as a quality signal with the prompt held
 *  fixed. That is only true if the hash of the artifact actually used LEAVES the run. */
export function promptProvenanceLine(digest: string | undefined): string | null {
  return digest === undefined ? null : `prompt: ${digest} — the artifact every proposal on this run was built from`;
}

/** Fold a finished pass to the CLI's process outcome. `renderVerdict` (render.ts) projects a handler
 *  `Verdict`, not a `GenesisReport`, so the fold is direct: a partial/interrupted run is a non-zero exit.
 *  An empty pass EXPLAINS itself with `mineWhyEmpty` — the cause is computed from the report, so the line
 *  stays true whether the 0 came from an empty frontier or from an unwired model (WP-F6). */
export function foldVerdict(pass: MinePass, ceiling?: number): CliVerdict {
  const r = pass.report;
  const why = mineWhyEmpty(mineOutcome(r, pass.modelWired, ceiling));
  const lines = [
    `genesis: seeded ${r.seeded.length} candidate fact(s); ratified ${r.ratified.length}`,
    `cost: llmCalls ${r.llmCalls} · budgetSpent ${r.budgetSpent}`,
    ...opt(frontierDropLine(pass.seedsDropped)),
    ...opt(promptProvenanceLine(pass.promptDigest)),
    // NAMED, above the generic partial line: a refused staging commit wrote NOTHING, and "did not run to
    // completion" alone leaves the operator guessing between a dead model and a lost race.
    ...(pass.refusal !== undefined ? [`staging: REFUSED (${pass.refusal}) — ${REFUSAL_TEXT[pass.refusal]}`] : []),
    ...opt(why),
    ...(r.resumeToken ? [`partial: resume at rank ${r.resumeToken.lastCompletedRank}`] : []),
  ];
  const failed = r.resumeToken !== undefined || pass.refusal !== undefined;
  return { exitCode: failed ? 1 : 0, stdout: `${lines.join('\n')}\n` };
}

/** One optional line as a spreadable list — `null` contributes nothing. */
const opt = (line: string | null): readonly string[] => (line === null ? [] : [line]);
