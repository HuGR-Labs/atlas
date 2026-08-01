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
// must not — and now structurally CANNOT — write the knowledge projection. No CALL to `loadProjection` or
// `persistProjection` occurs anywhere in this file (they are named only in prose), and that absence is the
// guarantee: the test fixtures make both methods THROW, so a re-introduced call fails the suite loudly.

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
import { createDiskStore, headSha, createSkeletonSource } from '@atlas/adapter-io';
import type { DiskStore } from '@atlas/adapter-io';
import { upsert as knowledgeUpsert, normalizeCheck, primaryAnchorId, nodeKey, emptyStore } from '@atlas/knowledge';
import type { WriteRequest, StoreProjection, Candidate as KnowledgeCandidate } from '@atlas/knowledge';
import { id, asNodeKey } from '@atlas/kernel';
import { join } from 'node:path';
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
 * The reserved scope every MINED node carries — now PROVENANCE plus a fail-closed default, not the boundary
 * itself (ADR-0008 moved these rows out of the governed projection entirely). Mining has no actor, so a mined
 * node has no owner — and an unowned node is not writable by "anyone", it is writable by NOBODY until an
 * admin says otherwise. No actor is a member of this scope unless `.atlas/policy.json` declares it, so
 * `actorInScope` denies by default (KNOW-11a) and, should a candidate ever be promoted, the emit door's scope
 * check refuses any fact declaring a different scope onto a mined row. Granting it is the deliberate act of
 * appointing a curator for mined candidates. Deliberate, but NOT protected: the grant lives in
 * `.atlas/policy.json`, which no live mechanism gates (see policy.ts).
 */
export const MINED_SCOPE = 'atlas:mined';

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
    store: deps?.store ?? createDiskStore(join(repoPath, '.atlas', 'cas'), () => headSha(repoPath)),
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
 *   - `upsert`    — the KNOW-15 write-decision (`@atlas/knowledge` `upsert`), dedup-by-id, persisted durably
 *                   to STAGING (ADR-0008) — the candidate sidecar, never the knowledge projection.
 *   - `changed`   — the INDEX-12 delta seam (unused by a single `genesis()` pass; supplied for the surface).
 *   - `handoffTo` — the S4 terminator (a no-op for a mine pass).
 */
export function buildControllerDeps(repoPath: string, d: MineDeps): ControllerDeps {
  const mine = createMine({ skeleton: d.skeleton, history: d.history });
  const scan = createScan(d.skeleton);
  // STAGING, NOT KNOWLEDGE (ADR-0008 / KNOW-8). `mine` is the explorer: it passes no truth gate, no KNOW-11
  // authz and no KNOW-8 ratification, so it may write only CANDIDATES. Every read and every write below goes
  // through the STAGING sidecar — a store of the same shape at a different path — and this driver never CALLS
  // the projection doors at all. That is what closes #87: mining cannot mutate governed
  // knowledge because it cannot REACH it, rather than because a check says no. A staged candidate becomes
  // knowledge only by passing a governed door, like anything else.
  //
  // REHYDRATE, never start empty. `persistStaging` REPLACES the file wholesale, so seeding from `emptyStore()`
  // would not "start a fresh pass": it would make every run overwrite staging with only what that run mined,
  // dropping every earlier candidate. (That is exactly how mine once destroyed the governed projection it was
  // then sharing — SCN-CLI-4d.) Rehydrating makes the pass ADDITIVE, which is also what `upsert` assumes: it
  // routes CREATE-vs-UPDATE against the projection it is handed, so an empty one reports a CREATE for a node
  // that already exists.
  let projection: StoreProjection = d.store.loadStaging() ?? emptyStore();
  // The set of nodes ALREADY STAGED when this pass began — what a mined candidate must not re-author.
  // Snapshotted, NOT re-read off `projection`: the running projection also contains the rows this very pass
  // just created, so testing against it made a pass drop its OWN second claim about the same symbol (two
  // mined claims at one anchor ⇒ the second silently vanished). "Never re-author what was already
  // established" is a statement about the pass-start state, not about the accumulating one.
  const established = new Set(projection.current.keys());
  const grounded = new Map<string, Fact>(); // KNOW-15 idempotent grounded set, keyed by the MINTED nodeKey (0 duplicates)

  return {
    plan: (repo, rev, _scope): Plan => ({ malformed: false, skeleton: scan.scan(repo, rev), sites: mine.mine(repo, rev) }),
    visit: (cand): readonly Fact[] => runExtract([cand], SINGLE_SITE, { proposer: d.proposer, gate: d.gate }).facts,
    upsert: (incoming): readonly Fact[] => {
      for (const raw of incoming) {
        // IDENTITY IS MINTED, NEVER TRUSTED — the routing/dedup `nodeKey` is RECOMPUTED from the content
        // via the frozen `nodeKey(f)` formula (KNOW-15b), the SAME seam that mints contentHash/primaryAnchor.
        // The author-supplied payload `f.id` is NEVER used for routing or the grounded-set key — trusting it
        // would let an author spoof/collide/dodge another node's identity (governed-emit.ts parity, WP-F3).
        // Map `predicateSlot` → the Candidate's `.slot` before minting — the cast is otherwise LOSSY
        // (identity fns read `.slot`, a GroundedFact carries `predicateSlot`), producing a slot-free nodeKey
        // that diverges from the true `hash(primaryAnchorId ‖ predicateSlot)` (governed-emit.ts parity).
        // STAMP THE CANDIDATE SCOPE — BELT-AND-BRACES since ADR-0008, kept as PROVENANCE. A mined fact
        // arrives with no `scope`: there is no actor behind it, so nobody owns it. While mine wrote the
        // governed projection that was load-bearing — an unowned node there is not neutral, because the emit
        // door's incumbent guard has nothing to compare against, so ANY actor holding ANY scope could adopt a
        // mined node with no ratify token and promote it to `T1`, inside the pack bound (reproduced). Mined
        // rows now live in staging, where no door reads them, so that path is closed structurally. The stamp
        // STAYS: it marks these bytes as mined-not-authored for whoever later curates them, and it keeps the
        // fail-closed default if a candidate is ever promoted — `MINED_SCOPE` is a reserved name no actor
        // belongs to unless an admin deliberately grants it in `.atlas/policy.json`. Stamped BEFORE the
        // content hash so the bytes and the row agree.
        const f = { ...raw, scope: MINED_SCOPE } as Fact;
        const view = { ...f, slot: f.predicateSlot } as unknown as KnowledgeCandidate;
        const key = nodeKey(view) as unknown as string;
        const req: WriteRequest = {
          nodeKey: key,
          contentHash: id(f) as unknown as string,
          family: f.kind,
          claimNorm: claimNormOf(f),
          // ── ADJACENCY carrier (ADDITIVE) — carry the computed primary anchor + R3-optional slot onto the
          //    node for a later sibling-adjacency scan (WP-B); NOT read here, routing is byte-identical.
          //    `predicateSlot` is R3-optional; conditional spread keeps `slot` ABSENT (exactOptionalPropertyTypes).
          primaryAnchor: primaryAnchorId(view) as unknown as string,
          ...(f.predicateSlot !== undefined ? { slot: f.predicateSlot } : {}),
        };
        // A MINED CANDIDATE NEVER RE-AUTHORS AN ESTABLISHED ONE — BELT-AND-BRACES since ADR-0008. This check
        // was the load-bearing defence when mine wrote the governed projection: with the real projection
        // rehydrated, an LLM-proposed claim whose minted nodeKey collided with a governed node routed as an
        // UPDATE and set-unioned straight into it; on a billy-ratified T0 node that is a governed-knowledge
        // mutation authored by whatever text was sitting in a source file, i.e. prompt-injectable
        // (reproduced). ADR-0008 removed the boundary crossing itself — the governed projection is now
        // unreachable from here — so this skip no longer defends it. It STAYS because it is still correct
        // WITHIN staging: a later pass must not silently rewrite a candidate an earlier one proposed (the
        // set-union is just as unreviewable between two candidates as it was against a fact).
        if (established.has(key)) continue;
        // PUT THE BYTES FIRST, exactly as the governed door does. Persisting a row that names a contentHash
        // absent from CAS creates a node whose stored fact can never be read back — and the governed doors
        // now (correctly) refuse to write a node whose class they cannot read, so such a row is permanently
        // unwritable by ANYONE, billy included. Reproduced: a recoverable corruption became an unrecoverable
        // denial of service, and it survives the move to staging because a candidate is promoted THROUGH
        // those same doors — an unreadable candidate is one no curator could ever ratify. The write order
        // also matters: `put` before the sidecar, so a failed put leaves no dangling reference. (The CAS is
        // shared and append-only by design; a blob is inert until some row names it.)
        d.store.put(f as unknown as Parameters<DiskStore['put']>[0]);
        projection = knowledgeUpsert(projection, req).store; // route the write-decision
        grounded.set(key, f);
      }
      d.store.persistStaging(projection); // durable — the CANDIDATE sidecar, NEVER the knowledge projection
      return [...grounded.values()];
    },
    changed: (_prior, _rev) => ({ idChanged: false, stateChanged: false, changedBuckets: [] }),
    handoffTo: () => d.handoffTo(),
  };
}

/** Drive the frozen run-controller one governed pass and return its `GenesisReport` (the write-set carrier). */
export function driveMine(repoPath: string, deps?: Partial<MineDeps>): GenesisReport {
  const d = withDefaults(repoPath, deps);
  return makeRunController(buildControllerDeps(repoPath, d)).genesis(repoPath, d.rev, d.budget, d.scope);
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
function foldVerdict(r: GenesisReport, modelWired: boolean, ceiling?: number): CliVerdict {
  const why = mineWhyEmpty(mineOutcome(r, modelWired, ceiling));
  const lines = [
    `genesis: seeded ${r.seeded.length} candidate fact(s); ratified ${r.ratified.length}`,
    `cost: llmCalls ${r.llmCalls} · budgetSpent ${r.budgetSpent}`,
    ...(why ? [why] : []),
    ...(r.resumeToken ? [`partial: resume at rank ${r.resumeToken.lastCompletedRank}`] : []),
  ];
  return { exitCode: r.resumeToken ? 1 : 0, stdout: `${lines.join('\n')}\n` };
}

/** Run the one-time genesis bootstrap over a repo, projecting the outcome to a `CliVerdict` (CLI-4). A pass
 *  that seeds nothing renders WHY, read off its own report — `foldVerdict`/`mineWhyEmpty`. */
export async function runMine(repoPath: string, deps?: Partial<MineDeps>): Promise<CliVerdict> {
  const modelWired = deps?.proposer !== undefined; // a real S2 model was injected (else honest abstain)
  return foldVerdict(driveMine(repoPath, deps), modelWired, deps?.budget?.ceiling);
}
