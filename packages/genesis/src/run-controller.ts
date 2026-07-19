// @atlas/genesis — src/run-controller.ts  (WP-8.30.GEN · GEN-7 / GEN-8 — the run controller)
//
// The composition-root RUN CONTROLLER: it binds the two frozen surfaces of the one-time bootstrap —
// `GenesisApi` (`genesis`/`resume`) and `HandoffApi` (`handoff`/`changed`/`rerun`), both co-located below.
// Its three duties: CHECKPOINT + RESUME (GEN-8a, drive sites in deterministic GEN-2/11 rank order, resume
// from `rank > lastCompletedRank`); TOTAL / MALFORMED-DEGRADE (GEN-8b/8c, an honest partial `GenesisReport`
// + `resumeToken`, NEVER a throw); IDEMPOTENT + INCREMENTAL HAND-OFF (GEN-7, KNOW-15 upsert dedup by `id`,
// bucket-bounded `rerun`, hand control to born-from-work). Sibling stages are CALLED via `ControllerDeps`.

import type { Delta } from '@atlas/index';
import type { Candidate, Fact, GenesisBudget, GenesisReport, ResumeToken, Skeleton } from './types.js';

export interface GenesisApi {
  /** The TOTAL composition-root entry (GEN-8): `atlas-genesis <repo> --at <rev> [--budget N]
   *  [--scope <path>]` → `GenesisReport`. Runs S0→S4. TOTAL — a malformed repo/rev yields an honest
   *  empty/partial report carrying a `resumeToken`, NEVER a throw (GEN-8). `--scope` seeds a subtree, not
   *  the whole repo (GEN-13). With all deepening loops off (`budget`) cost == the single-pass baseline
   *  (GEN-14).
   *
   *  [FLAG — arg carriers] the surface line (atlas-genesis:184) types none of the args; `repo`/`rev`
   *  transcribed as `string` (mirroring `scan`/`mine`; `rev` deliberately a malformable raw string, not a
   *  branded `Hash`), `budget?` as the `GenesisBudget` policy, `scope?` as a subtree path `string`. */
  genesis(repo: string, rev: string, budget?: GenesisBudget, scope?: string): GenesisReport;

  /** Resume an interrupted run from the last completed ranked site (GEN-8). Consumes the `resumeToken`
   *  from a prior partial report and continues the deterministic rank-ordered spend. TOTAL — never throws. */
  resume(token: ResumeToken): GenesisReport;
}

export interface HandoffApi {
  /** S4 one-time handoff (GEN-7). Ends the one-time seeding and hands control to born-from-work (KNOW-13).
   *  NOT a standing sweeper. Total — never throws. */
  handoff(): void;

  /** The bounded change set since a `prior` skeleton (INDEX-12 / GEN-7). Re-indexes ONLY the changed
   *  buckets, never `N` — the `Delta` (`{idChanged, stateChanged, changedBuckets}`) reused verbatim from
   *  @atlas/index. Bounds the incremental re-run below. */
  changed(prior: Skeleton, rev: string): Delta;

  /** INCREMENTAL idempotent re-run (GEN-7). Re-indexes only the changed files (via `changed`) and UPSERTS
   *  already-grounded facts by id (0 duplicates, KNOW-15); a second run over an unchanged rev is a no-op
   *  on the grounded set. Total — a malformed rev ⇒ a partial report, never a throw (GEN-8). */
  rerun(repo: string, rev: string, prior: Skeleton): GenesisReport;
}

/** The GEN-2 hard-ceiling cap: default budget is `min(frontier_size, 200)` sites/run (atlas-genesis:198). */
export const CEILING_CAP = 200 as const;

/** All-off deepening (GEN-13/14 single-pass baseline) — this facet never opens a deepening loop (EPIC-31). */
const LOOPS_OFF = { enabled: false, maxDepth: 0, epsilon: 0 } as const;

/** The GEN-2 default cost policy when the caller passes no `--budget`: `min(frontier_size, 200)`, loops off. */
export function defaultBudget(frontierSize: number): GenesisBudget {
  return {
    ceiling: Math.min(frontierSize, CEILING_CAP),
    deepening: { review: LOOPS_OFF, enrich: LOOPS_OFF, expand: LOOPS_OFF },
  };
}

/**
 * A TOTAL plan of the ranked frontier (S0 `scan` → S1 `mine`/`rank`) — CALLED, never authored here (those
 * are sibling facets). `malformed` flags an honest degrade: `sites` is the reachable portion (possibly
 * empty), `skeleton` the partial substrate. Never throws by contract (GEN-8); the controller guards it too.
 */
export interface Plan {
  readonly malformed: boolean;
  readonly skeleton?: Skeleton;
  readonly sites: readonly Candidate[]; // deterministic GEN-2/11 rank order (may be [] / partial on malformed)
}

/**
 * The injected ports the run controller ORCHESTRATES (card exclusions: "it calls them"). Nothing here is
 * authored by this WP.
 *   - `plan`      — S0/S1 frontier build (total).
 *   - `visit`     — the S2 per-site proposal/admission driver (WP-8.28); MAY throw (an interruption).
 *   - `upsert`    — the KNOW-15 write-decision: idempotent merge by fact `id`, returns the grounded set.
 *   - `changed`   — the INDEX-12 bounded change set since a prior skeleton.
 *   - `handoffTo` — hand control to born-from-work (KNOW-13); the S4 terminator.
 */
export interface ControllerDeps {
  plan(repo: string, rev: string, scope?: string): Plan;
  visit(cand: Candidate): readonly Fact[];
  upsert(incoming: readonly Fact[]): readonly Fact[];
  changed(prior: Skeleton, rev: string): Delta;
  handoffTo(): void;
}

/** The site's axis bucket (its file) — the unit the INDEX-12 `changedBuckets` delta names (GEN-7c). */
export function bucketOf(cand: Candidate): string {
  const parts = cand.site.qualifiedPath.split('::');
  return parts[0] ?? cand.site.qualifiedPath;
}

interface DriveResult {
  readonly seeded: readonly Fact[];
  readonly lastCompletedRank: number; // the resume cursor — the last fully-completed ranked site (GEN-8)
  readonly interrupted: boolean; // a site threw mid-run ⇒ resumable partial (never propagated — GEN-8c)
  readonly llmCalls: number;
  readonly budgetSpent: number;
}

interface PendingRun {
  readonly sites: readonly Candidate[];
  readonly seeded: readonly Fact[];
  readonly llmCalls: number;
  readonly budgetSpent: number;
  readonly budget: GenesisBudget;
}

/** An honest empty/partial report — the total degrade shape (GEN-8b/8c). */
function emptyReport(token?: ResumeToken): GenesisReport {
  return {
    seeded: [],
    ratified: [],
    open: [],
    llmCalls: 0,
    budgetSpent: 0,
    ...(token ? { resumeToken: token } : {}),
  };
}

/**
 * The checkpoint/resume core (GEN-8a). Drives `sites` in ascending rank order starting past `floor`:
 *   • HARD ceiling (GEN-2): stop once `budgetSpent` hits `budget.ceiling` — the cold tail is left to
 *     born-from-work (a deliberate scope, NOT an interruption ⇒ no resume token).
 *   • CHECKPOINT: after each completed site, advance `lastCompletedRank` to that site's rank.
 *   • TOTAL (GEN-8c): a `visit` that throws is an interruption — caught, never propagated; the loop stops
 *     and the last completed rank becomes the resume cursor.
 *   • IDEMPOTENT (GEN-7b): every write routes through the injected upsert (dedup by id) — the returned
 *     grounded set is the report's `seeded`.
 */
function drive(
  sites: readonly Candidate[],
  budget: GenesisBudget,
  floor: number,
  startCalls: number,
  startSpent: number,
  base: readonly Fact[],
  deps: ControllerDeps,
): DriveResult {
  let seeded = base;
  let lastCompletedRank = floor;
  let llmCalls = startCalls;
  let budgetSpent = startSpent;
  let interrupted = false;

  const ordered = [...sites].sort((a, b) => a.rank - b.rank);
  for (const cand of ordered) {
    // GEN-2 hard ceiling — the cold tail is born-from-work's, not a resumable interruption.
    if (budgetSpent >= budget.ceiling) break;
    try {
      const facts = deps.visit(cand); // S2 per-site (WP-8.28); may throw = interruption
      seeded = deps.upsert(facts); // KNOW-15 idempotent upsert — 0 duplicates on re-run (GEN-7b)
      llmCalls += 1;
      budgetSpent += 1;
      lastCompletedRank = cand.rank; // checkpoint the last completed ranked site (GEN-8a)
    } catch {
      interrupted = true; // GEN-8c: never propagate — resume continues from lastCompletedRank
      break;
    }
  }
  return { seeded, lastCompletedRank, interrupted, llmCalls, budgetSpent };
}

/** Fold a drive result into a `GenesisReport`. A `resumeToken` rides ONLY a partial/interrupted or
 *  malformed run (GEN-8); a complete run carries none. `ratified`/`open` (S3, WP-8.29) are not this
 *  facet's stage — empty here. */
function toReport(res: DriveResult, malformed: boolean): GenesisReport {
  const partial = res.interrupted || malformed;
  return {
    seeded: res.seeded,
    ratified: [],
    open: [],
    llmCalls: res.llmCalls,
    budgetSpent: res.budgetSpent,
    ...(partial ? { resumeToken: { lastCompletedRank: res.lastCompletedRank } } : {}),
  };
}

/**
 * Bind the run controller to the frozen `GenesisApi` + `HandoffApi` surfaces (co-located above).
 * The single-run bootstrap keeps its checkpoint in the closure `pending` (the persisted resume context);
 * `resume(token)` re-drives its remainder. The injected seams are the "it calls them" ports (card
 * exclusions), never a change to the frozen contract.
 */
export function makeRunController(deps: ControllerDeps): GenesisApi & HandoffApi {
  let pending: PendingRun | null = null;

  const runFresh = (plan: Plan, budget: GenesisBudget): GenesisReport => {
    const res = drive(plan.sites, budget, -1, 0, 0, [], deps);
    pending = {
      sites: plan.sites,
      seeded: res.seeded,
      llmCalls: res.llmCalls,
      budgetSpent: res.budgetSpent,
      budget,
    };
    const report = toReport(res, plan.malformed);
    // S4 hand-off (GEN-7a) only on a COMPLETE run — a partial/interrupted or malformed run is not done.
    if (!res.interrupted && !plan.malformed) deps.handoffTo();
    return report;
  };

  const genesis = (repo: string, rev: string, budget?: GenesisBudget, scope?: string): GenesisReport => {
    try {
      const plan = deps.plan(repo, rev, scope);
      const b = budget ?? defaultBudget(plan.sites.length);
      return runFresh(plan, b);
    } catch {
      // GEN-8c: a malformed repo/rev never throws — honest empty skeleton + resume cursor.
      pending = null;
      return emptyReport({ lastCompletedRank: -1 });
    }
  };

  const resume = (token: ResumeToken): GenesisReport => {
    try {
      // No persisted run for this cursor — an honest empty partial, never a throw (GEN-8c).
      if (!pending) return emptyReport(token);
      // GEN-8a: continue past the last completed site — the done sites are NOT re-visited.
      const remaining = pending.sites.filter((s) => s.rank > token.lastCompletedRank);
      const res = drive(
        remaining,
        pending.budget,
        token.lastCompletedRank,
        pending.llmCalls,
        pending.budgetSpent,
        pending.seeded,
        deps,
      );
      pending = { ...pending, seeded: res.seeded, llmCalls: res.llmCalls, budgetSpent: res.budgetSpent };
      const report = toReport(res, false);
      if (!res.interrupted) deps.handoffTo(); // the resumed run completed ⇒ hand off (GEN-7a)
      return report;
    } catch {
      return emptyReport(token);
    }
  };

  // ── HandoffApi ─────────────────────────────────────────────────────────────────────────────────────
  const handoff = (): void => {
    // S4 one-time hand-off to born-from-work (GEN-7a). NOT a standing sweeper — one call, then return.
    deps.handoffTo();
  };

  const changed = (prior: Skeleton, rev: string): Delta => deps.changed(prior, rev);

  const rerun = (repo: string, rev: string, prior: Skeleton): GenesisReport => {
    try {
      const plan = deps.plan(repo, rev);
      if (plan.malformed) return emptyReport({ lastCompletedRank: -1 }); // total (GEN-8c)
      // GEN-7c INCREMENTAL: bound the re-index to ONLY the buckets the INDEX-12 delta names.
      const delta = deps.changed(prior, rev);
      const buckets = new Set(delta.changedBuckets);
      const incremental = plan.sites.filter((s) => buckets.has(bucketOf(s)));
      const res = drive(incremental, defaultBudget(incremental.length), -1, 0, 0, [], deps);
      const report = toReport(res, false);
      // Control returns to born-from-work after the incremental pass (GEN-7a); writes were idempotent (7b).
      if (!res.interrupted) deps.handoffTo();
      return report;
    } catch {
      return emptyReport({ lastCompletedRank: -1 });
    }
  };

  return { genesis, resume, handoff, changed, rerun };
}

// differential-vs-oracle (compile-time): the controller conforms to the frozen GenesisApi + HandoffApi.
const _controller: (deps: ControllerDeps) => GenesisApi & HandoffApi = makeRunController;
void _controller;
