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
// must not — and now structurally CANNOT — write the knowledge projection. WHERE A CANDIDATE GOES NEXT is
// `atlas promote` (WP-PROMOTE), the governed curator door: it reads this sidecar back and presents each row to
// the `atlas-emit` door with the KNOW-18 fast path disabled, so the ratifier really runs. That door is the
// reason the sentence below about severance is now only HALF the story — severance is what protects the
// explorer, ratification is what protects the curator — and it is why every trap this file records about a
// mined nodeKey colliding with a governed node is live again at promotion time, against the REAL projection. NONE of `loadProjection`,
// `persistProjection` or `commitProjection` is CALLED here (they are named only in prose), and that absence
// IS the guarantee: the fixtures make all THREE throw, so a re-introduced call fails the suite loudly.
// CONCURRENCY: the write door is `commitStaging`, whose `decide` re-runs the WHOLE pass body on contention.
// It is also the ONLY staging door there is — the unconditional `persistStaging` this file used to call was
// last-writer-wins by definition, and was deleted in task #83 once a probe showed nothing called it.

import { makeRunController, createScan, createMine, runExtract } from '@atlas/genesis';
import type {
  ControllerDeps,
  Plan,
  FrontierOptions,
  GenesisBudget,
  GenesisReport,
  Candidate,
  ExtractResult,
  Fact,
  SiteProposer,
  EmitGate,
  HistorySource,
  SkeletonSource,
} from '@atlas/genesis';
import { createDiskStore, headSha, createSkeletonSource, gitSidecarTrust } from '@atlas/adapter-io';
import { resolveProposer } from './mine-proposer.js';
import { resolveFrontier } from './mine-frontier.js';
import { createProposerPool, makeVisitAll, proposerPoolAvailable } from './mine-pool.js';
import type { ProposerPool, SiteVisit } from './mine-pool.js';
import { composedGate } from './mine-gate.js';
import type { CommitDecision, CommitRefusal, DiskStore } from '@atlas/adapter-io';
import { upsert as knowledgeUpsert, normalizeCheck, primaryAnchorId, nodeKey } from '@atlas/knowledge';
import type { WriteRequest, StoreProjection, Candidate as KnowledgeCandidate } from '@atlas/knowledge';
import { id } from '@atlas/kernel';
import { join } from 'node:path';
import { MINED_SCOPE, MINED_TIER, StagingCommitError as StagingRefusalError } from './mine-staging.js';
import { foldVerdict } from './mine-render.js';
import type { MinePass } from './mine-render.js';
import type { CliVerdict } from './render.js';

/** The projection + prose of a finished pass (mine-render.ts) — RE-EXPORTED so the module surface is
 *  unchanged by the file split. */
export { mineOutcome, mineWhyEmpty } from './mine-render.js';
export type { MineOutcome, MinePass } from './mine-render.js';

/**
 * The injected seams the `mine` driver assembles into `ControllerDeps`. Every member is INJECTABLE
 * (`runMine(repo, deps?)` takes a `Partial`); an omitted member falls back to a real adapter (proposer /
 * history / store / skeleton / GATE) or an honest fail-closed default (handoff) so `runMine(repo)` alone is
 * a valid, total call — never a live model, never a fabricated fact.
 *
 * `gate` MOVED SIDES in that sentence (REQ-CLI-4d). It used to fall back to an abstaining stub, and because
 * nothing in production injected one, `atlas mine` staged ZERO candidates on every repository it was ever
 * run against. The fallback is now the composition root's real gate over the frozen `admit` seams — see
 * `mine-gate.ts` for the measurement and for why the driver still invents no admission.
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
  /** #182 — how wide the structural frontier is cut, and where its ordering priors come from. Omitted ⇒
   *  resolved from `ATLAS_FRONTIER` + this pass's own skeleton source (see `withDefaults`). Injectable so
   *  a test can pin either arm without touching the environment. */
  readonly frontier?: FrontierOptions;
  /** The environment the OPERATOR config is located in (`$ATLAS_MODEL_CONFIG` / `$XDG_CONFIG_HOME`),
   *  defaulted to `process.env`. Threaded so a test is HERMETIC: without it `runMine(repo)` reads the
   *  developer's own `~/.config/atlas/model.json` and would execute their model binary in a unit test. */
  readonly env?: NodeJS.ProcessEnv;
}

/** The two pass-level events the frozen `GenesisReport` has no field for: a wiring FAULT that the
 *  controller's GEN-8c catch would otherwise swallow anonymously, and the count of structural seeds
 *  dropped for having no path. Observers only — the driver reads no value back from either. */
export interface PassWatch {
  readonly onFault?: (e: Error) => void;
  readonly onSeedsDropped?: (dropped: number) => void;
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

/** The admission seam resolution (mine-gate.ts) — RE-EXPORTED so the module surface is unchanged by the
 *  file split. `makeAdmitGate` now HAS a production caller: `composedGate`, the REQ-CLI-4d supply this
 *  driver falls back to below. */
export { makeAdmitGate, unwiredGate, UNWIRED_GATE_REASON } from './mine-gate.js';

/** The staging refusal vocabulary, its thrown discriminant, and what a staged ROW DECLARES about itself
 *  (`MINED_SCOPE`/`MINED_TIER`) — all extracted to `mine-staging.ts` at the LOC ceiling, along the same
 *  seam. RE-EXPORTED here because `StagingCommitError` and `MINED_SCOPE` are part of this module's
 *  published surface. */
export { StagingCommitError, STAGING_REFUSAL_TEXT, MINED_SCOPE, MINED_TIER } from './mine-staging.js';

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

/** The filled seams PLUS the two facts about the S2 resolution that the seams themselves cannot answer —
 *  see `ResolvedProposer` (mine-proposer.ts) for why `modelWired` cannot be recovered from `deps`. */
interface ResolvedDeps {
  readonly deps: MineDeps;
  readonly modelWired: boolean;
  readonly promptDigest?: string;
}

/** Fill the injectable seams: a real adapter for the store, honest fail-closed seams for the rest. */
function withDefaults(repoPath: string, deps?: Partial<MineDeps>): ResolvedDeps {
  const rev = deps?.rev ?? 'HEAD';
  // Resolved ONCE, and only when the caller injected no proposer — resolution reads the operator's config
  // off disk, and an injected proposer means that file is none of this pass's business.
  const resolved = deps?.proposer === undefined ? resolveProposer(repoPath, deps?.env ?? process.env) : undefined;
  // HOISTED out of the literal below: the REQ-CLI-4d gate is built over THE SAME `SkeletonSource` this pass
  // ranks its sites from, so the gate and the frontier can never resolve two different indexes.
  const skeleton = deps?.skeleton ?? defaultSkeleton(repoPath);
  // #182 — the frontier arm, resolved ONCE from the threaded env and this pass's own skeleton source, so
  // the seam that enumerates units and the seam that orders them are the same object (one fold, one truth).
  const frontier: FrontierOptions = deps?.frontier ?? resolveFrontier(deps?.env ?? process.env, skeleton);
  const d: MineDeps = {
    frontier,
    rev,
    proposer: deps?.proposer ?? resolved!.proposer,
    history: deps?.history ?? defaultHistory(),
    skeleton,
    // PROVENANCE (the third seam this store takes, alongside the N11 watermark). `mine` built its store
    // WITHOUT it, so a repo whose `.atlas/` arrived by COMMIT was staged into as though a door had produced
    // it — and `STAGING_REFUSAL_TEXT.untrusted`, which was already written, could never fire. Staging is not
    // a serving path, so nothing was being SERVED; what was missing is the seam, and the next reader who
    // wires staging into a door would have inherited the hole rather than found it. `gitSidecarTrust` is the
    // same memoized `git ls-files` the composition root injects — one question per pass, not per write.
    store: deps?.store ?? createDiskStore(join(repoPath, '.atlas', 'cas'), () => headSha(repoPath), gitSidecarTrust(repoPath)),
    // REQ-CLI-4d — THE ADMISSION SUPPLY. The fallback is no longer an abstaining stub: it is the
    // composition root's gate over the frozen `admit` seams (`composedGate` → `buildMineAdmission`,
    // adapter-io/src/compose.ts), built LAZILY over this pass's own skeleton axes. The driver still invents
    // no admission (REQ-CLI-4c) — it wires a gate it does not author, exactly as it wires the store above.
    gate: deps?.gate ?? composedGate(skeleton, repoPath, rev),
    handoffTo: deps?.handoffTo ?? ((): void => {}),
    ...(deps?.budget !== undefined ? { budget: deps.budget } : {}),
    ...(deps?.scope !== undefined ? { scope: deps.scope } : {}),
    ...(deps?.env !== undefined ? { env: deps.env } : {}),
  };
  // WIRED is read off the RESOLUTION, never off `deps`: the resolved proposer is installed on the RIGHT of a
  // `??` above, so `deps?.proposer !== undefined` is ALWAYS FALSE on the CLI path — which is how a run with
  // `llmCalls 2` printed "no proposer model is wired" four lines away from its own cost.
  const modelWired = deps?.proposer !== undefined || (resolved?.wired ?? false);
  return { deps: d, modelWired, ...(resolved?.promptDigest !== undefined ? { promptDigest: resolved.promptDigest } : {}) };
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
export function buildControllerDeps(
  repoPath: string,
  d: MineDeps,
  onRefusal?: (r: CommitRefusal) => void,
  watch?: PassWatch,
  pool?: ProposerPool,
): ControllerDeps {
  // THE ONE PER-SITE EXPRESSION — both `visit` and `visitAll` route through it, so neither can produce
  // different facts for a site: there is exactly one place facts come from (see `SiteVisit`, mine-pool.ts).
  const visitWith: SiteVisit = (cand, proposer) => runExtract([cand], SINGLE_SITE, { proposer, gate: d.gate });
  const mine = createMine({
    skeleton: d.skeleton,
    history: d.history,
    ...(watch?.onSeedsDropped !== undefined ? { onSeedsDropped: watch.onSeedsDropped } : {}),
    ...(d.frontier !== undefined ? { frontier: d.frontier } : {}), // #182 — the A/B arm + its priors
  });
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
    // A `ModelCommandError` is REPORTED on its way past, then re-thrown unchanged so GEN-8c still classifies
    // the site as an interruption. It is the one throw here that is NOT about this site: the model binary is
    // missing / timed out / exited non-zero for the whole run, and `describeModelFailure` (llm.ts:152) has
    // already put the command and its stderr in the message. Swallowed, it reached the user as an anonymous
    // partial — `exit 1 · llmCalls 0 · resume at rank -1`, with nothing to act on.
    // The WHOLE `ExtractResult` is returned, not `.facts`. Picking the facts off here is what made the run's
    // coverage unfalsifiable: each site's grounded `WhyNot` died in this expression, one layer above the
    // controller, so a site that ABSTAINED and a site that was silently DROPPED reached the report
    // identically — and `mineWhyEmpty` printed "every one abstained" from `facts === 0` alone, a word the run
    // had no grounds for. `ControllerDeps.visit` accepts either arm; handing back the wide one is the only
    // change needed for the per-site ledger to carry real abstentions instead of `unrecorded`.
    visit: (cand): ExtractResult => {
      try {
        return visitWith(cand, d.proposer);
      } catch (e) {
        if ((e as { name?: unknown } | null)?.name === 'ModelCommandError') watch?.onFault?.(e as Error);
        throw e;
      }
    },
    // CONCURRENCY, ONLY WHEN A POOL WAS SUPPLIED (task #158): `visitAll` runs the batch's model calls in
    // parallel, then admits each site here in rank order through the SAME `visitWith` the arm above uses.
    ...(pool !== undefined ? { visitAll: makeVisitAll(pool, visitWith, watch?.onFault) } : {}),
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

/**
 * Drive the frozen run-controller one governed pass, capturing what the report cannot carry.
 *
 * [ADR-0011] A CAPTURED `ModelCommandError` IS RE-THROWN. `createCommandClient` throws it precisely so a
 * broken configuration cannot present itself as "this repo has no facts" — but it is thrown from inside
 * `visit`, and GEN-8c makes that a bare `catch` in the controller, so a missing model binary reached the
 * user as `exit 1, llmCalls 0, "resume at rank -1"` and nothing else: no command name, no stderr. Re-throwing
 * puts it on the SAME governed-refusal path as `ModelConfigError` (cli.ts:110-116) — exit 2, message
 * verbatim — while a genuinely partial run (a budget, a contended commit) keeps its report and exit 1.
 */
export function driveMinePass(repoPath: string, deps?: Partial<MineDeps>): MinePass {
  const resolved = withDefaults(repoPath, deps);
  const d = resolved.deps;
  let refusal: CommitRefusal | undefined;
  let fault: Error | undefined;
  let seedsDropped = 0;
  const watch: PassWatch = {
    onFault: (e) => void (fault ??= e),
    onSeedsDropped: (n) => void (seedsDropped += n),
  };
  // POOL ONLY WHEN THE PROPOSER CAME FROM OPERATOR CONFIG (task #158) — a fact about the seam, not a policy:
  // a worker rebuilds its proposer via `resolveProposer(repoPath, env)`, pure in those two args, whereas an
  // INJECTED proposer is a closure and cannot cross a thread. Third conjunct: the pool is a COMPILED
  // artifact (a worker loads a file), so outside `dist/` there is nothing to start.
  const usePool = resolved.modelWired && deps?.proposer === undefined && proposerPoolAvailable();
  const pool = usePool ? createProposerPool(repoPath, d.env ?? process.env) : undefined;
  try {
    const ports = buildControllerDeps(repoPath, d, (r) => void (refusal = r), watch, pool);
    const report = makeRunController(ports).genesis(repoPath, d.rev, d.budget, d.scope);
    if (fault !== undefined) throw fault; // a misconfigured model is not a mining outcome
    return {
      report,
      modelWired: resolved.modelWired,
      seedsDropped,
      ...(refusal !== undefined ? { refusal } : {}),
      ...(resolved.promptDigest !== undefined ? { promptDigest: resolved.promptDigest } : {}),
    };
  } finally {
    // `finally`, not a trailing call: `driveMinePass` THROWS on a captured `ModelCommandError`, and a pool
    // left running there holds eight live threads and the CLI never exits.
    pool?.close();
  }
}

/** The `GenesisReport` alone (the write-set carrier) — the shape every existing caller and oracle uses. */
export function driveMine(repoPath: string, deps?: Partial<MineDeps>): GenesisReport {
  return driveMinePass(repoPath, deps).report;
}
/** Run the one-time genesis bootstrap over a repo, projecting the outcome to a `CliVerdict` (CLI-4). A pass
 *  that seeds nothing renders WHY, read off its own report — `foldVerdict`/`mineWhyEmpty` (mine-render.ts).
 *
 *  It THROWS exactly one class of error: a `ModelCommandError` the pass captured (see `driveMinePass`). A
 *  misconfigured model is not a mining outcome, and `cli.ts` renders it as the governed refusal it is. */
export async function runMine(repoPath: string, deps?: Partial<MineDeps>): Promise<CliVerdict> {
  const pass = driveMinePass(repoPath, deps);
  return foldVerdict(pass, deps?.budget?.ceiling);
}

