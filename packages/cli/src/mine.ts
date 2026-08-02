// @atlas/cli — src/mine.ts  (CLI-4: drive the genesis bootstrap from the CLI)
//
// Drive the FROZEN genesis run-controller (@atlas/genesis) over a repo as ONE governed pass and project the
// outcome to a `CliVerdict` (CLI-4). This facet ONLY COMPOSES the frozen parts: it re-orders NO stage
// (`scan→rank→extract→admit→…`), invents NO admission of its own (the gate forwards the frozen `admit`
// verbatim, GEN-4/12), and every write is CANDIDATE-ONLY — the controller hard-codes `ratified: []`, so
// never-ratified is a STRUCTURAL property of the seam, not a stamp this driver applies.
//
// The five `ControllerDeps` ports (plan/visit/upsert/changed/handoffTo) are assembled INLINE from the real
// adapters (`createSkeletonSource`/`createSiteProposer`/`createHistorySource`/`createDiskStore`) + the genesis stage-builders
// (`createScan`/`createMine`/`runExtract`/`admit`). Each seam is INJECTABLE (`Partial<MineDeps>`) so a
// conformance test supplies a recorded proposer + an injected frontier + a gate double and never touches a
// live model (mirrors packages/e2e/test/s02-genesis-mining.e2e.test.ts). `upsert` routes through the KNOW-15
// write-decision (`@atlas/knowledge` `upsert`/`routeWrite`), NEVER a bare `store.put`.
//
// DESTINATION (ADR-0008): every write this driver makes lands in the STAGING sidecar. `mine` is the explorer
// and KNOW-8 lets the explorer write only CANDIDATES; it holds no truth gate, no authz and no ratifier, so it
// must not — and now structurally CANNOT — write the knowledge projection. NONE of `loadProjection`,
// `persistProjection` or `commitProjection` is CALLED here (they are named only in prose), and that absence
// IS the guarantee: the fixtures make all THREE throw, so a re-introduced call fails the suite loudly.
// CONCURRENCY: the write door is `commitStaging`, whose `decide` re-runs the WHOLE pass body on contention.
// It is also the ONLY staging door there is — the unconditional `persistStaging` this file used to call was
// last-writer-wins by definition, and was deleted in task #83 once a probe showed nothing called it.

import { makeRunController, createScan, createMine, runExtract, admit } from '@atlas/genesis';
import type {
  ControllerDeps,
  Plan,
  GenesisBudget,
  GenesisReport,
  Candidate,
  Fact,
  SiteProposer,
  EmitGate,
  EmitVerdict,
  SeedProposal,
  HistorySource,
  SkeletonSource,
  AdmitDeps,
  AdvisoryProposal,
} from '@atlas/genesis';
import { createDiskStore, headSha, createSkeletonSource, gitSidecarTrust } from '@atlas/adapter-io';
import type { CommitDecision, CommitRefusal, DiskStore } from '@atlas/adapter-io';
import { upsert as knowledgeUpsert, normalizeCheck, primaryAnchorId, nodeKey } from '@atlas/knowledge';
import type { WriteRequest, StoreProjection, Candidate as KnowledgeCandidate } from '@atlas/knowledge';
import { id, asNodeKey } from '@atlas/kernel';
import { join } from 'node:path';
import { StagingCommitError as StagingRefusalError, STAGING_REFUSAL_TEXT as REFUSAL_TEXT } from './mine-staging.js';
import type { CliVerdict } from './render.js';

/**
 * The injected seams the `mine` driver assembles into `ControllerDeps`. Every member is INJECTABLE
 * (`runMine(repo, deps?)` takes a `Partial`); an omitted member falls back to a real adapter (proposer /
 * history / store) or an honest fail-closed default (skeleton / gate / handoff) so `runMine(repo)` alone is
 * a valid, total call — never a live model, never a fabricated fact.
 */
export interface MineDeps {
  readonly rev: string; //                the git rev the pass runs at
  readonly proposer: SiteProposer; //     S2 — the ONE bounded LLM entry (GEN-2); default abstains (no model wired)
  readonly history: HistorySource; //     S1 — mined ranking signals + frontier (GEN-6)
  readonly skeleton: SkeletonSource; //   S0 — the structural skeleton source (GEN-1); default = the REAL walk
  readonly store: DiskStore; //           the durable CAS + the STAGING sidecar candidates persist to (ADR-0008)
  readonly gate: EmitGate; //             the 2-door admission gate — forwards the frozen `admit` verbatim
  readonly handoffTo: () => void; //      S4 — the born-from-work terminator (a no-op for a mine pass)
  readonly budget?: GenesisBudget; //     the hard site ceiling; omitted ⇒ the controller's defaultBudget
  readonly scope?: string; //             a subtree to seed instead of the whole repo (GEN-13)
}

/** All deepening loops OFF — a mine pass is the single-pass baseline (GEN-13/14, Δ=0). */
const OFF = { enabled: false, maxDepth: 0, epsilon: 0 } as const;

/** A one-site extract budget: the controller already enforces the run ceiling; `visit` extracts its one cand. */
const SINGLE_SITE: GenesisBudget = { ceiling: 1, deepening: { review: OFF, enrich: OFF, expand: OFF } };

/**
 * The S0 default is the REAL structural source (`createSkeletonSource`, adapter-io) — the frozen walk +
 * optional SCIP dump + `@atlas/index` build + the `atlas-init` T2 territory move-in, composed.
 *
 * It used to be a hand-built `emptySkeleton()` whose `axes.edges` was `[]`. Because `structuralSeeds`
 * (genesis/rank.ts:321) ranks by dep-graph DEGREE and reads ONLY `axes.edges`, an empty skeleton yielded 0
 * seeds ⇒ `rank` 0 candidates ⇒ the controller visited 0 sites and made 0 model calls. That made the
 * ABSENT SKELETON — not the absent model — the operative cause of a 0-candidate run: wiring a real proposer
 * on top of it would still have produced 0. GEN-8b is unaffected: the real source is itself fail-closed, so
 * an unwalkable/non-git repo or a malformed rev still degrades to an honestly-empty (never fabricated)
 * skeleton rather than throwing.
 */
function defaultSkeleton(repoPath: string): SkeletonSource {
  return createSkeletonSource(repoPath);
}

/** The advisory claim body a write carries (the KNOW-4c set-union element); a predicate carries its check. */
const claimNormOf = (f: Fact): string => (f.kind === 'advisory' ? f.claimNorm : normalizeCheck(f.check));

/**
 * Build an `EmitGate` that forwards the FROZEN `admit` verdict VERBATIM (GEN-4/12): the seed becomes an
 * advisory candidate (the driver adds NO predicate), `admit` casts the mechanical decision, and its outcome
 * maps 1:1 to the emit verdict. The driver injects NO admission of its own — admission is `admit`'s alone.
 */
export function makeAdmitGate(deps: AdmitDeps): EmitGate {
  return {
    emit(seed: SeedProposal, cand: Candidate): EmitVerdict {
      const proposal: AdvisoryProposal = {
        kind: 'advisory',
        site: cand,
        nodeKey: asNodeKey(cand.site.qualifiedPath),
        claimNorm: seed.claim,
        grounding: { entries: [{ anchor: cand.site, path: cand.site.qualifiedPath }] } as AdvisoryProposal['grounding'],
        tier: 'T2',
      };
      const verdict = admit(proposal, deps);
      if (verdict.outcome === 'admitted') return { emitted: true, fact: verdict.fact };
      const reason = verdict.outcome === 'dropped' ? verdict.reason : verdict.whyNot.reason;
      return { emitted: false, whyNot: { site: cand.site, reason } };
    },
  };
}

/** The honest fail-closed default gate: no admission machinery is wired, so every site abstains (never a
 *  fabricated fact). A real pass injects a gate (or `makeAdmitGate` over real `admit` seams). */
function defaultGate(): EmitGate {
  return { emit: (_seed, cand) => ({ emitted: false, whyNot: { site: cand.site, reason: 'no admission seam wired (mine default)' } }) };
}

/** The honest fail-closed default proposer: no model is wired, so the model abstains at every site (GEN-12).
 *  (Inlined rather than `createSiteProposer(...)` — see the NOTE on the stale consumed adapter-io dist.) */
function defaultProposer(): SiteProposer {
  return { propose: () => null };
}

/**
 * The reserved scope every MINED node carries — PROVENANCE plus a fail-closed default, not the boundary itself
 * (ADR-0008 moved these rows out of the governed projection entirely). Mining has no actor, so a mined node has no
 * owner, and an unowned node is writable not by "anyone" but by NOBODY: no actor belongs to this scope unless
 * `.atlas/policy.json` declares it, so `actorInScope` denies by default (KNOW-11a) and, should a candidate ever be
 * promoted, the emit door refuses any fact declaring a different scope onto a mined row. Granting it appoints a
 * curator — deliberate, NOT protected: the grant lives in `.atlas/policy.json`, which no live mechanism gates.
 */
export const MINED_SCOPE = 'atlas:mined';

/** The governance CLASS a mined row lives under: `T2`, the candidate class, always — stamped from this constant,
 *  never forwarded from `f.tier`, so an injected gate cannot mint a staged row DECLARING `T0`. */
const MINED_TIER = 'T2' as const;

/** The staging refusal vocabulary + its thrown discriminant, extracted at the LOC ceiling (see that file's
 *  header). RE-EXPORTED here because `StagingCommitError` is part of this module's published surface. */
export { StagingCommitError, STAGING_REFUSAL_TEXT } from './mine-staging.js';

/** The honest fail-closed default history: no signals, empty frontier ⇒ the structural fallback ranks 0
 *  sites (GEN-15b). A real pass INJECTS `createHistorySource(repo, rev)`; the default never shells git.
 *  (Inlined rather than `createHistorySource(...)` — see the NOTE on the stale consumed adapter-io dist.) */
function defaultHistory(): HistorySource {
  return {
    commitCount: () => 0,
    shallow: () => false,
    blameConcentration: () => 0,
    frontier: () => [],
    signals: () => ({ hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] }),
  };
}

/** Fill the injectable seams: a real adapter for the store, honest fail-closed seams for the rest. */
function withDefaults(repoPath: string, deps?: Partial<MineDeps>): MineDeps {
  const rev = deps?.rev ?? 'HEAD';
  return {
    rev,
    proposer: deps?.proposer ?? defaultProposer(),
    history: deps?.history ?? defaultHistory(),
    skeleton: deps?.skeleton ?? defaultSkeleton(repoPath),
    // PROVENANCE (the third seam this store takes, alongside the N11 watermark). `mine` built its store
    // WITHOUT it, so a repo whose `.atlas/` arrived by COMMIT was staged into as though a door had produced
    // it — and `STAGING_REFUSAL_TEXT.untrusted`, which was already written, could never fire. Staging is not
    // a serving path, so nothing was being SERVED; what was missing is the seam, and the next reader who
    // wires staging into a door would have inherited the hole rather than found it. `gitSidecarTrust` is the
    // same memoized `git ls-files` the composition root injects — one question per pass, not per write.
    store: deps?.store ?? createDiskStore(join(repoPath, '.atlas', 'cas'), () => headSha(repoPath), gitSidecarTrust(repoPath)),
    gate: deps?.gate ?? defaultGate(),
    handoffTo: deps?.handoffTo ?? ((): void => {}),
    ...(deps?.budget !== undefined ? { budget: deps.budget } : {}),
    ...(deps?.scope !== undefined ? { scope: deps.scope } : {}),
  };
}

/**
 * Assemble the five frozen `ControllerDeps` ports from the injected seams (inline glue — `Plan`/`EmitGate`
 * have no genesis-side factory; this composition IS the driver):
 *   - `plan`      — S0 `createScan` (the canonical skeleton) + S1 `createMine` (rank the frontier), in order.
 *   - `visit`     — per-site `runExtract([cand], …, { proposer, gate })` → the gate's admitted `.facts`.
 *   - `upsert`    — the KNOW-15 write-decision, dedup-by-id, committed durably to STAGING (ADR-0008).
 *   - `changed`   — the INDEX-12 delta seam (unused by a single `genesis()` pass; supplied for the surface).
 *   - `handoffTo` — the S4 terminator (a no-op for a mine pass); `onRefusal` — see `MinePass`.
 */
export function buildControllerDeps(repoPath: string, d: MineDeps, onRefusal?: (r: CommitRefusal) => void): ControllerDeps {
  const mine = createMine({ skeleton: d.skeleton, history: d.history });
  const scan = createScan(d.skeleton);
  // STAGING, NOT KNOWLEDGE (ADR-0008 / KNOW-8). `mine` is the explorer — no truth gate, no KNOW-11 authz, no
  // KNOW-8 ratification — so it writes only CANDIDATES, through the STAGING sidecar: the same shape at a different
  // path. This driver never CALLS a projection door, which is what closes #87 — mining cannot mutate governed
  // knowledge because it cannot REACH it, not because a check says no. Reproduced at a REAL minted-key collision
  // (a mined nodeKey EQUAL to a ratified T0 node's): `projection.json` comes back byte-identical.
  const grounded = new Map<string, Fact>(); // KNOW-15 idempotent grounded set, keyed by the MINTED nodeKey (0 duplicates)

  /**
   * THE WHOLE PASS BODY AS ONE PURE DECISION over a staging snapshot — the seam `commitStaging` requires. It used to be
   * `loadStaging() ?? emptyStore()` at pass start plus `persistStaging` per site: atomic (no torn read, no annihilation) but
   * UNCONDITIONAL, hence last-writer-wins BY DEFINITION — two concurrent passes rehydrate one snapshot, each compute a whole-Map
   * replacement, and the second publish erases the first's candidates while BOTH exit 0 reporting what they "seeded" (MEASURED at
   * 8 processes × 5 sites: 40 reported committed, 5 durable). `commitStaging` re-runs this from scratch on every lost compare-and-
   * swap — hence PURE: no writes (CAS objects ride out in `put`, ordered before publication), no clock, no random. ESTABLISHED is
   * recomputed per attempt: a key in THIS snapshot this pass did not itself write. A pass-start set computed once is not re-
   * runnable and missed a row a CONCURRENT pass staged after we started, which the old code then set-unioned into; the exclusion
   * is `grounded`/`minted`, not the running projection, so a pass can still make a SECOND claim about a symbol it just wrote.
   */
  const decide = (staged: StoreProjection, incoming: readonly Fact[]): CommitDecision<Map<string, Fact>> => {
    let projection = staged;
    const minted = new Map<string, Fact>(); // what THIS attempt would write; folded into `grounded` only on settle
    const puts: unknown[] = []; // the CAS bytes the protocol makes durable BEFORE publishing the rows naming them
    for (const raw of incoming) {
      // STAMP THE CANDIDATE SCOPE — PROVENANCE plus a fail-closed default (ADR-0008 kept it when the boundary
      // crossing was removed). A mined fact has no actor, so nobody owns it, and an unowned node is writable by
      // NOBODY until an admin appoints a curator. Stamped BEFORE the content hash so the bytes carry it — AND onto
      // the request below so the ROW does too; the request used to omit both halves, so every staged row recorded
      // `scope`/`tier` as `undefined` while this file claimed the two agreed.
      const f = { ...raw, scope: MINED_SCOPE } as Fact;
      // IDENTITY IS MINTED, NEVER TRUSTED — `nodeKey` is RECOMPUTED from the content by the frozen formula
      // (KNOW-15b), the SAME seam that mints contentHash/primaryAnchor; the payload's own `f.id` never routes, or
      // an author could spoof another node's identity (governed-emit.ts parity, WP-F3). Map `predicateSlot` →
      // `.slot` first: the cast is otherwise LOSSY (identity fns read `.slot`) and yields a slot-free key.
      const view = { ...f, slot: f.predicateSlot } as unknown as KnowledgeCandidate;
      const key = nodeKey(view) as unknown as string;
      // A MINED CANDIDATE NEVER RE-AUTHORS AN ESTABLISHED ONE — belt-and-braces since ADR-0008, load-bearing before
      // it: a mined key colliding with a governed node routed UPDATE and set-unioned into it, mutating a ratified
      // T0 fact from whatever text sat in a source file (prompt-injectable, reproduced). It STAYS — a set-union
      // between two candidates is just as unreviewable.
      if (staged.current.has(key) && !grounded.has(key) && !minted.has(key)) continue;
      const req: WriteRequest = {
        nodeKey: key,
        contentHash: id(f) as unknown as string,
        family: f.kind,
        claimNorm: claimNormOf(f),
        // ── ADJACENCY carrier (ADDITIVE) — primary anchor + R3-optional slot for a later sibling-adjacency
        //    scan (WP-B). NOT routed; `slot` stays ABSENT when omitted (exactOptionalPropertyTypes).
        primaryAnchor: primaryAnchorId(view) as unknown as string,
        ...(f.predicateSlot !== undefined ? { slot: f.predicateSlot } : {}),
        // ── GOVERNANCE carrier (ADR-0007) — from the MINED constants, never forwarded from the fact. Neither
        //    half is routed (`RouteInputs` reads neither), so no hash and no route moves; what changes is that
        //    the row now DECLARES what it is — what the ARCH-10 guard derives authority from.
        scope: MINED_SCOPE,
        tier: MINED_TIER,
      };
      // BYTES BEFORE THE ROW, as the governed door does — here by handing them to the protocol, which puts them
      // before it publishes. A row naming a contentHash absent from CAS is a node whose fact can never be read
      // back, and the doors correctly refuse a node whose class they cannot read: a recoverable corruption became
      // an unrecoverable DoS (reproduced), and promotion runs through those same doors.
      puts.push(f);
      projection = knowledgeUpsert(projection, req).store; // route the write-decision
      minted.set(key, f);
    }
    // `next` is published even when nothing was minted, keeping the write cadence identical to the
    // `persistStaging`-per-site one it replaces — so a mutant seeding from `emptyStore()` still publishes that
    // empty store and is caught (SCN-CLI-4d's first case).
    return { out: minted, next: projection, put: puts };
  };

  return {
    plan: (repo, rev, _scope): Plan => ({ malformed: false, skeleton: scan.scan(repo, rev), sites: mine.mine(repo, rev) }),
    visit: (cand): readonly Fact[] => runExtract([cand], SINGLE_SITE, { proposer: d.proposer, gate: d.gate }).facts,
    upsert: (incoming): readonly Fact[] => {
      // THE CANDIDATE SIDECAR, NEVER THE KNOWLEDGE PROJECTION. An unconditional persist carries no decision
      // to re-run and so cannot be made concurrency-safe, which is why this door is the only one left.
      const r = d.store.commitStaging<Map<string, Fact>>((staged) => decide(staged, incoming));
      if (!r.settled) {
        // VISIBLE. Nothing was written, so returning the grounded set unchanged would report a successful
        // pass over a write that did not happen — the silent loss this seam removes.
        onRefusal?.(r.refusal);
        throw new StagingRefusalError(r.refusal);
      }
      for (const [key, f] of r.out) grounded.set(key, f); // fold in only what actually settled
      return [...grounded.values()];
    },
    changed: (_prior, _rev) => ({ idChanged: false, stateChanged: false, changedBuckets: [] }),
    handoffTo: () => d.handoffTo(),
  };
}

/** One finished pass: the run's `GenesisReport` plus, when the staging commit refused, WHY. The refusal rides
 *  BESIDE the report because `run-controller` catches an interrupted site WITHOUT a cause (GEN-8c is a bare
 *  `catch`), so "contended" would otherwise reach the user as an anonymous partial run. */
export interface MinePass {
  readonly report: GenesisReport;
  readonly refusal?: CommitRefusal;
}

/** Drive the frozen run-controller one governed pass, capturing any staging refusal. */
export function driveMinePass(repoPath: string, deps?: Partial<MineDeps>): MinePass {
  const d = withDefaults(repoPath, deps);
  let refusal: CommitRefusal | undefined;
  const ports = buildControllerDeps(repoPath, d, (r) => void (refusal = r));
  const report = makeRunController(ports).genesis(repoPath, d.rev, d.budget, d.scope);
  return { report, ...(refusal !== undefined ? { refusal } : {}) };
}

/** The `GenesisReport` alone (the write-set carrier) — the shape every existing caller and oracle uses. */
export function driveMine(repoPath: string, deps?: Partial<MineDeps>): GenesisReport {
  return driveMinePass(repoPath, deps).report;
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
  readonly modelWired: boolean; //  a real S2 proposer was injected at this door
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
      : 'mine: 0 candidate facts — 0 sites visited: the structural pass (skeleton → ranked frontier) yielded no site, so no proposer was ever consulted; wiring a model would not change this 0';
  }
  return o.modelWired
    ? `mine: 0 candidate facts — ${o.sitesVisited} site(s) visited and every one abstained: nothing was proposed or admitted (facts are never fabricated)`
    : `mine: 0 candidate facts — ${o.sitesVisited} site(s) visited and every one abstained: no proposer model is wired, so nothing could be proposed (facts are never fabricated)`;
}

/** Fold a `GenesisReport` to the CLI's process outcome. `renderVerdict` (render.ts) projects a handler
 *  `Verdict`, not a `GenesisReport`, so the fold is direct: a partial/interrupted run is a non-zero exit.
 *  An empty pass EXPLAINS itself with `mineWhyEmpty` — the cause is computed from the report, so the line
 *  stays true whether the 0 came from an empty frontier or from an unwired model (WP-F6). */
function foldVerdict(r: GenesisReport, modelWired: boolean, ceiling?: number, refusal?: CommitRefusal): CliVerdict {
  const why = mineWhyEmpty(mineOutcome(r, modelWired, ceiling));
  const lines = [
    `genesis: seeded ${r.seeded.length} candidate fact(s); ratified ${r.ratified.length}`,
    `cost: llmCalls ${r.llmCalls} · budgetSpent ${r.budgetSpent}`,
    // NAMED, above the generic partial line: a refused staging commit wrote NOTHING, and "did not run to
    // completion" alone leaves the operator guessing between a dead model and a lost race.
    ...(refusal !== undefined ? [`staging: REFUSED (${refusal}) — ${REFUSAL_TEXT[refusal]}`] : []),
    ...(why ? [why] : []),
    ...(r.resumeToken ? [`partial: resume at rank ${r.resumeToken.lastCompletedRank}`] : []),
  ];
  return { exitCode: r.resumeToken !== undefined || refusal !== undefined ? 1 : 0, stdout: `${lines.join('\n')}\n` };
}

/** Run the one-time genesis bootstrap over a repo, projecting the outcome to a `CliVerdict` (CLI-4). A pass
 *  that seeds nothing renders WHY, read off its own report — `foldVerdict`/`mineWhyEmpty`. */
export async function runMine(repoPath: string, deps?: Partial<MineDeps>): Promise<CliVerdict> {
  const modelWired = deps?.proposer !== undefined; // a real S2 model was injected (else honest abstain)
  const pass = driveMinePass(repoPath, deps);
  return foldVerdict(pass.report, modelWired, deps?.budget?.ceiling, pass.refusal);
}
