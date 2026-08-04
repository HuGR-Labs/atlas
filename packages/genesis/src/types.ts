// @atlas/genesis — src/types.ts  (frozen data model + co-located API interfaces; zero runtime)
//
// Layer 8 bootstrap/composition-root shared model: the ranked mining `Candidate` (a ranked SITE, NEVER a
// fact — GEN-6), S1 signals, abstention `WhyNot`, ratification `OpenQ`, per-stage cost, resume token, the
// total `GenesisReport`, plus the co-located API interfaces consumed by ≥2 src files (the GEN-13/14 budget
// vocabulary + `BudgetApi`, the S2 `ExtractApi`/`ExtractResult`, and the S0 `Skeleton`/`ScanApi`).
// `StructRef` (contracts) and `GroundedFact` (knowledge) are IMPORTED, NEVER redefined; `Candidate`/`WhyNot`
// are GENESIS-HOME (distinct from the @atlas/knowledge staging `Candidate`, which is a fact-in-waiting).

import type { StructRef, Tier } from '@atlas/contracts';
import type { GroundedFact } from '@atlas/knowledge';
import type { Axes, Manifest } from '@atlas/index';

/**
 * A seeded fact. Genesis does NOT mint a competing node record — a fact it seeds IS the steady-state
 * @atlas/knowledge `GroundedFact` (KNOW-13, the kind genesis hands off to). Re-exported as `Fact` so
 * consumers can read the genesis dialect from one place; owned by @atlas/knowledge, NOT redefined.
 */
export type Fact = GroundedFact;

/**
 * A human-ratified fact (KNOW-8, GEN-5). The S3 interview's output: `T0` / contested facts reach
 * `ratified` ONLY through the batched, ranked interview. Reuses the @atlas/knowledge `GroundedFact`
 * (a ratified fact is a grounded node) — NOT a distinct invented record.
 */
export type Ratified = GroundedFact;

/** The five pipeline stages (§The pipeline S0→S4) — used to key the per-stage cost report (GEN-13). */
export type PipelineStage = 'S0' | 'S1' | 'S2' | 'S3' | 'S4';

/**
 * The S1 mined ranking signals for one site (GEN-6 — these feed only the candidate `rank`, NEVER the fact
 * set). Transcribed EXACTLY from atlas-genesis:193 —
 *   `MinedSignals = { hotspot, szzBugCommits: number, coChanged: StructRef[], owners: string[],
 *                     messages: string[] }`.
 * Each field is a NAMED mechanical heuristic: `hotspot` = CodeScene change-freq × complexity;
 * `szzBugCommits` = SZZ bug-introducing commit count; `coChanged` = temporal/logical-coupling basket;
 * `owners` = git-blame ownership / bus-factor; `messages` = commit-message corpus. A signal is a *ranking*
 * input only — churn/SZZ alone MUST NOT mint a fact (GEN-6).
 *
 * [FLAG — `hotspot` type] atlas-genesis:193 lists `hotspot` with NO type (the other four are typed). It is
 * a change-frequency × complexity SCALAR score (a recency-weighted number, §S1) — transcribed as `number`
 * (the honest scalar form), NOT invented as a record. Flagged for the owning WP to confirm the carrier.
 */
export interface MinedSignals {
  readonly hotspot: number; // [FLAG] reference untyped; change-freq × complexity scalar (§S1)
  readonly szzBugCommits: number; // SZZ bug-introducing commits blamed to this site
  readonly coChanged: readonly StructRef[]; // temporal/logical-coupling co-change basket
  readonly owners: readonly string[]; // git-blame ownership / bus-factor map
  readonly messages: readonly string[]; // commit-message corpus for this site
}

/**
 * A RANKED mining site — NEVER a fact (GEN-6). Transcribed EXACTLY from atlas-genesis:192 —
 *   `Candidate = { site: StructRef, signals: MinedSignals, ppr: number, rank: number }`.
 * `mine`/`rank` return `Candidate[]`; the signals feed only `ppr`/`rank`. A Candidate becomes a `Fact`
 * ONLY after S2 `extract` grounds it and it clears the 2-door bar (GEN-4). This is genesis-HOME; it is
 * NOT the @atlas/knowledge staging `Candidate`.
 *   - `site`    — the anchored structural unit (the drift oracle rides `StructRef.subtreeHash`).
 *   - `signals` — the mined ranking heuristics (GEN-6).
 *   - `ppr`     — personalized-PageRank score over the def→ref graph (GEN-11, deterministic).
 *   - `rank`    — the total order position (stable, ties broken deterministically — GEN-11).
 */
export interface Candidate {
  readonly site: StructRef;
  readonly signals: MinedSignals;
  readonly ppr: number;
  readonly rank: number;
}

/**
 * A grounded ABSTENTION (GEN-12). When S2 `extract` finds no grounded fact at a site, it
 * emits a `WhyNot` — abstention is a VALID outcome, never a manufactured fact. GENESIS-HOME (frozen
 * nowhere below).
 *
 * [PINNED — oracle-pin-map §12] atlas-genesis §S2/GEN-12 names "a grounded why-not" (:149). The minimal
 * carrier is `site` (grounded to the anchored StructRef) + a `reason` (honest justification text) — no
 * speculative fields. NOT an invented record.
 */
export interface WhyNot {
  readonly site: StructRef; // the anchored site the model abstained on (grounded)
  readonly reason: string; // the why-not body — honest justification text (GEN-12)
}

/**
 * One open ratification question for the S3 interview (GEN-5). Transcribed EXACTLY from atlas-genesis:194 —
 *   `OpenQ = { kind: 'owner'|'tier'|'contested'|'intent', site, options?: string[], rankReason }`.
 * The interview is batched + ranked (blast×tier), never one-at-a-time, capped at the top 20 Q/session.
 *
 * [FLAG — `site` type] the reference lists `site` untyped; it is the anchored site under question →
 * transcribed as the frozen `StructRef` (mirrors `Candidate.site`).
 * [PINNED — oracle-pin-map §genesis] `rankReason` is the blast×tier rank justification text
 * (atlas-genesis:194 surface literal) → `string`. NOT a record.
 */
export interface OpenQ {
  readonly kind: 'owner' | 'tier' | 'contested' | 'intent';
  readonly site: StructRef; // [FLAG] reference untyped — the anchored site under question
  readonly options?: readonly string[];
  readonly rankReason: string; // justification text — blast×tier rank reason (atlas-genesis:194)
}

/**
 * The per-stage cost line (GEN-13 — "report cost per stage"). GENESIS-HOME.
 *
 * [PINNED — oracle-pin-map §12] GEN-13 floor: `stage` + `llmCalls` only. LLM-call count is the GEN-3 cost
 * oracle; token / wall-clock / ceiling legs are NOT invented (no golden forces them). `stage` is the
 * reference-grounded `PipelineStage` (§The pipeline S0→S4) — a stricter transcription of the `string` floor.
 */
export interface StageCost {
  readonly stage: PipelineStage;
  readonly llmCalls: number; // the GEN-3 cost oracle — a function of the frontier, never of size
}

/** The whole-run per-stage cost report (GEN-13). One `StageCost` per pipeline stage. */
export type CostReport = readonly StageCost[];

/**
 * The resume cursor (GEN-8). An interrupted run resumes from the LAST COMPLETED RANKED SITE; a malformed
 * rev yields a partial report carrying this token, NEVER a throw. GENESIS-HOME.
 *
 * [PINNED — oracle-pin-map §genesis, GEN-8] sites are visited in a deterministic rank order (GEN-2/11), so
 * the resume cursor is the last completed rank. Minimal single-leg carrier; additional legs (partial
 * skeleton hash, spent budget) are NOT invented.
 */
export interface ResumeToken {
  readonly lastCompletedRank: number; // resume from the last completed ranked site (GEN-8)
}

/**
 * What ONE site on the planned frontier came to. The RUN LEDGER's row (GEN-8 + GEN-12g).
 *
 * The five arms are the outcomes the run controller can actually distinguish, and they are deliberately
 * NOT collapsed: `abstained` (a site was visited and the grounded GEN-12 `WhyNot` came back) and
 * `unvisited` (the run never spent a call there) are different facts about coverage, and a ledger that
 * cannot tell them apart is the defect this row exists to remove. `unrecorded` is the honest third case —
 * the site WAS visited and produced no fact, but the `visit` port returned bare facts, so the `WhyNot` it
 * had is not reachable from here. It reports that it cannot report, rather than manufacturing an
 * abstention reason nothing grounded.
 *
 * GENESIS-HOME, and built from vocabulary that already exists: the site is the anchored `StructRef` the
 * `Candidate` already carries, the abstention is the `WhyNot` GEN-12 already defines, and `facts` names the
 * seeded `Fact`s by their own `id`. No parallel record of a site, a fact or an abstention is introduced.
 */
export type SiteOutcome =
  | {
      readonly outcome: 'seeded';
      readonly rank: number; //          the GEN-2/11 rank position this site was driven at
      readonly site: StructRef; //       the anchored site (grounded — the same ref the Candidate carried)
      readonly facts: readonly string[]; // the seeded facts, by their own `id` — WITH WHAT, not just how many
    }
  | {
      readonly outcome: 'abstained';
      readonly rank: number;
      readonly site: StructRef;
      readonly whyNot: WhyNot; //        the grounded GEN-12 abstention, kept — not re-derived, not invented
    }
  | {
      readonly outcome: 'unrecorded';
      readonly rank: number;
      readonly site: StructRef;
      readonly note: string; //          WHY the outcome could not be recorded — about the port, not the site
    }
  | {
      readonly outcome: 'interrupted';
      readonly rank: number;
      readonly site: StructRef; //       `visit` threw (GEN-8c catches it WITHOUT a cause) — the site is not done
    }
  | {
      readonly outcome: 'unvisited';
      readonly rank: number;
      readonly site: StructRef;
      /** WHY no call was spent: the GEN-2 hard ceiling was already reached (the cold tail born-from-work
       *  inherits), or the run stopped at an earlier interrupted site and never got here. */
      readonly cause: 'ceiling' | 'after-interrupt';
    };

/**
 * The RUN LEDGER (GEN-8 + GEN-12g): one `SiteOutcome` per PLANNED site, so a run's coverage of its own
 * frontier can be reconciled from what the run produced instead of inferred from a count.
 *
 * A COUNT IS NOT A LEDGER. "N abstained" does not let anyone establish that no site was dropped; only a row
 * per site does, and only rows let a dropped site be told from an abstaining one. `sites − facts` is not a
 * residual either — one site may yield more than one fact — which is why `facts` rides on the row.
 *
 * ADDITIVE + ABSENT-TOLERANT, the `builtAt`/`sameAs`/`derivedAt` precedent: `GenesisReport.coverage` is
 * OPTIONAL and a report that predates the ledger simply has none. An ABSENT ledger means "this run recorded
 * no coverage" — it never means "this run covered nothing".
 */
export interface RunCoverage {
  /** Where the row set came from. `'planned'` — `plan` returned a frontier and every row below accounts for
   *  one of its sites. `'unavailable'` — planning itself failed (GEN-8b/8c), so the run never HAD a frontier:
   *  this ledger claims no coverage, and in particular does not claim the repository was empty. */
  readonly frontier: 'planned' | 'unavailable';
  /** Sites the run was handed by `plan`. Compared against `sites.length`, this is the check itself: a gap
   *  means the controller drove a frontier it did not account for. */
  readonly planned: number;
  /** One row per planned site — the ledger. Ordered by the GEN-2/11 rank the run drove them in. */
  readonly sites: readonly SiteOutcome[];
}

/**
 * The total run report (GEN-8). Transcribed EXACTLY from atlas-genesis:195 —
 *   `GenesisReport = { seeded, ratified, open, llmCalls, budgetSpent, resumeToken? }`.
 * `atlas-genesis` is TOTAL: a malformed rev returns a partial report + `resumeToken`, never a throw.
 *   - `seeded`      — the grounded facts auto-admitted by S2 (each grounded, GEN-4).
 *   - `ratified`    — the human-ratified facts from the S3 interview (KNOW-8).
 *   - `open`        — the deferred/unanswered ratification questions (capped at 20/session, GEN-5).
 *   - `llmCalls`    — total LLM calls (GEN-2 budget-bounded; a function of the frontier, GEN-3).
 *   - `budgetSpent` — sites spent against the `--budget` ceiling.
 *   - `resumeToken` — present ONLY on a partial/interrupted run (GEN-8).
 *
 * [FLAG — `cost`, surface-vs-acceptance tension] the §Surface literal (:195) lists 6 fields with NO
 * `cost`, yet GEN-13 + acceptance-13 require the `GenesisReport` "report per-stage cost under the ceiling".
 * Transcribed as an OPTIONAL `cost?: CostReport` to honor GEN-13 without contradicting the frozen literal.
 * Flagged for the two references to reconcile whether per-stage cost is a first-class report field.
 */
export interface GenesisReport {
  readonly seeded: readonly Fact[];
  readonly ratified: readonly Ratified[];
  readonly open: readonly OpenQ[];
  readonly llmCalls: number;
  readonly budgetSpent: number;
  /** MODEL CALLS ACTUALLY MADE — including the ones whose results were DISCARDED (task #158).
   *
   *  It is a SECOND counter rather than a correction to `llmCalls`, because the two answer different
   *  questions and only one of them is about money. `llmCalls` counts sites whose result was USED — it is
   *  incremented per folded site, so a site that faulted, or one whose batch-mate faulted first, does not
   *  appear in it. That is right for a coverage claim and WRONG for a cost claim: those calls were issued
   *  and, against a real provider, billed. Under a bounded pool up to `POOL_WIDTH - 1` calls can be issued
   *  and discarded when a lower-ranked batch-mate faults, and a sequential run already discarded the
   *  faulting call itself.
   *
   *  `modelCalls - llmCalls` is therefore the DISCARDED count, and it is the number an operator is owed:
   *  cost is the axis this product is measured on, so a spend figure that quietly excluded calls we paid
   *  for would make the one number we are trying to win a false claim.
   *
   *  OPTIONAL in the TYPE only because `GenesisReport` literals are constructed in frozen test fixtures
   *  this change may not edit. Every path in the run controller SETS IT, ALWAYS, INCLUDING ZERO — a field
   *  that appeared only when non-zero would read as "this never happens". */
  readonly modelCalls?: number;
  readonly cost?: CostReport; // [FLAG] GEN-13/A-13 require per-stage cost; §Surface literal omits it
  readonly resumeToken?: ResumeToken; // present only on a partial/interrupted run (GEN-8)
  /** The per-site run ledger (GEN-8/12g). OPTIONAL for the same reason `cost` is: the §Surface literal
   *  (:195) lists six fields and none of them is a site ledger, while GEN-12g requires abstention to be a
   *  valid RECORDED outcome — which, dropped, it was not. Absent ⇒ this run recorded no coverage (an
   *  artifact from before the ledger); it never means the run covered nothing. */
  readonly coverage?: RunCoverage;
}

// ── GEN-13 / GEN-14 cost-discipline surface, co-located here (was ref/budget.ts) ──────────────────────
// Consumed by extract.ts + loops.ts + cost-policy.ts + run-controller.ts (≥2), so housed here beside the
// shared model rather than in one impl file. CHEAP BY DEFAULT (base tier = exactly one LLM call/site);
// ESCALATE BY VALUE (extra mechanisms switch on only under `high-value ∧ uncertain`). The REVIEW / ENRICH /
// EXPAND deepening loops are GOVERNED (GEN-14): opt-in, budget-gated, fixpoint-stopping — all off ⇒ Δ=0.

/**
 * One governed deepening loop (GEN-14). REVIEW / ENRICH / EXPAND are each opt-in or default-shallow,
 * budget-gated, with a fixpoint stop (a no-revision round / marginal value `< ε` / loop-until-dry on the
 * 2-door bar). No loop runs unbounded; the loops are the DEPTH DIAL, never a change to the default cost.
 *
 * [PINNED — oracle-pin-map §12] the fixpoint/ε carrier. GEN-14 names the stop conditions in prose; the
 * minimal carrier is `enabled` (the on/off gate) + `maxDepth` (the bounded depth dial, 0 at base) +
 * `epsilon` (the marginal-value-`<ε` stop leg). No speculative fields beyond the three named stops.
 */
export interface LoopConfig {
  readonly enabled: boolean; // default false — loops-off ⇒ single-pass baseline (GEN-13/14, Δ=0)
  readonly maxDepth: number; // the bounded depth dial — 0 at the base tier
  readonly epsilon: number; // marginal-value stop: halt a round when value gain < ε // DEFINE default, owner-tunable
}

/** The three governed deepening loops (GEN-14). With all three off, genesis cost == the single cheap pass. */
export interface DeepeningLoops {
  readonly review: LoopConfig;
  readonly enrich: LoopConfig;
  readonly expand: LoopConfig;
}

/**
 * The GEN-2 MARGINAL-VALUE STOP — a FIXED scheduler policy, NOT a tunable `GenesisBudget` field
 * (atlas-genesis:117). The scheduler keeps a trailing window of the last 20 ranked sites and HALTS
 * admission once that window admits fewer than 4 (a `< 20%` admit-rate). Named here at the type layer
 * (zero-runtime literal-type consts) so the policy is documented where the budget lives; it is applied by
 * the scheduler, never carried on `GenesisBudget`. [PINNED — oracle-pin-map §12, transcribed :117.]
 */
export interface MarginalValueStop {
  readonly window: 20; // trailing window size (sites)
  readonly minAdmits: 4; // halt below this many admits in the window (fewer than 4 of 20 ⇒ < 20%)
}

/**
 * The genesis cost policy (GEN-13). Carries the hard site ceiling + the governed deepening loops.
 *   - `ceiling`   — the hard `--budget` site ceiling; default `min(frontier_size, 200)` (GEN-2).
 *   - `deepening` — the three governed loops; ALL off ⇒ cost == single-pass baseline (GEN-14).
 *
 * The GEN-2 marginal-value stop is the fixed `MarginalValueStop` policy (above), NOT a field here.
 */
export interface GenesisBudget {
  readonly ceiling: number; // hard site budget — default min(frontier_size, 200) (GEN-2)
  readonly deepening: DeepeningLoops; // governed loops — all off ⇒ single-pass baseline (GEN-14)
}

/**
 * The S2 mechanisms a site MAY escalate to beyond the base single grounded proposal (GEN-13). All OFF at
 * the base tier (an empty set ⇒ exactly one LLM call/site); each switches on ONLY under the escalation
 * predicate `(high-value ∧ uncertain)`.
 */
export type Mechanism = 'self-consistency' | 'refuter' | 'check-synthesis' | 'codeql';

/** The escalation decision for one site (GEN-13). Base tier ⇒ `mechanisms == []` (exactly one call). */
export interface EscalationDecision {
  readonly tier: Tier; // the site's (candidate) tier — refuter fires only for `T0`, checks for `tier≥T1`
  readonly mechanisms: readonly Mechanism[]; // base ⇒ [] (one call); escalated subset otherwise
}

export interface BudgetApi {
  /** GEN-13 escalation. The predicate `(high-value ∧ uncertain)` is the ONLY gate that switches extra
   *  mechanisms on; a base-tier site returns `mechanisms: []` (exactly one LLM call — no self-consistency,
   *  no refuter, no check synthesis). Semgrep is preferred before CodeQL; the refuter fires only for
   *  `T0`-candidates. */
  escalate(cand: Candidate, budget: GenesisBudget): EscalationDecision;

  /** GEN-13 per-stage cost under the ceiling — the `GenesisReport` cost breakdown. LLM-call count is a
   *  function of the PPR frontier, never of file/line count (GEN-3). */
  report(): CostReport;
}

// ── S2 extract surface, co-located here (was ref/extract.ts) ──────────────────────────────────────────
// Consumed by extract.ts + loops.ts (≥2), so housed here beside the shared model. S2 is the ONLY LLM entry
// (GEN-2): highest-PPR-first, one bounded call/site, hard budget + marginal-value stop; the LLM only
// PROPOSES (GEN-12), admission is MECHANICAL, abstention is a valid grounded `WhyNot`.

/**
 * The S2 output. Transcribed EXACTLY from atlas-genesis:188 —
 *   `extract(...): { facts: Fact[], abstained: WhyNot[] }`.
 * `facts` = the grounded candidates that cleared the 2-door bar (GEN-4); `abstained` = the grounded
 * why-nots where no grounded fact was found (GEN-12). Abstention is first-class — a site
 * that yields no fact yields a `WhyNot`, never a forced fact.
 */
export interface ExtractResult {
  readonly facts: readonly Fact[];
  readonly abstained: readonly WhyNot[];
}

export interface ExtractApi {
  /** S2 propose→verify (GEN-2, the ONLY LLM entry). Consumes the RANKED `Candidate[]`, spends ≤1 bounded
   *  call per site highest-PPR-first under `budget`, and HALTS at the budget ceiling or the marginal-value
   *  stop. NEVER calls an un-ranked site (GEN-2). GEN-12: the model only proposes; admission is mechanical
   *  (grounding re-derives; obviousness is scored, never a door — ADR-0012; a predicate additionally passes the teeth gate).
   *  Returns grounded facts + grounded abstentions.
   *
   *  [FLAG — `budget` carrier] the surface `extract(cands, budget)` (atlas-genesis:188) leaves `budget`
   *  untyped; transcribed as the `GenesisBudget` policy — it carries the hard site ceiling
   *  (`min(frontier_size, 200)`, GEN-2) plus the GEN-13/14 escalation + deepening dials. A bare numeric
   *  `--budget N` maps to `GenesisBudget.ceiling`. */
  extract(cands: readonly Candidate[], budget: GenesisBudget): ExtractResult;
}

// ── S0 scan surface, co-located here (was ref/scan.ts) ────────────────────────────────────────────────
// Consumed by rank.ts + seed.ts + run-controller.ts (≥2), so housed here beside the shared model. S0 is a
// DETERMINISTIC `$0`-LLM pure function of (repo, rev): AST + def/ref tags (tree-sitter), cross-file
// resolution (SCIP / stack-graphs), BLAKE3 content-address. Byte-identical re-runs; ships ZERO facts.

/**
 * The S0 output — the addressable substrate, nothing more (GEN-1). GENESIS-HOME (`Skeleton` is frozen
 * nowhere below). "3 axes + content-address every node (= atlas-init)" (atlas-genesis:24, :186).
 *   - `axes`     — the ≥3 content-addressed axis hierarchies (spatial / territory / dependency), reused
 *     verbatim from the @atlas/index `Axes` (each object stored once in the CAS, INDEX-10).
 *   - `manifest` — the territories manifest, every territory at `T2/advisory` with ZERO invariants; T0
 *     only flagged, never promoted (KNOW-6/7). Reused from the @atlas/index `Manifest`.
 *
 * [PINNED — oracle-pin-map §genesis, settled by upstream @atlas/index] atlas-genesis frames S0 as
 * "= atlas-init" (the TOOLS-5 move-in). `Skeleton` = `axes` + `manifest`, both IMPORTED from the now-frozen
 * @atlas/index: the built axis-views (`Axes`) + the T2 territory overlay (`Manifest`). The INDEX-13
 * unresolved-edge ledger (`Axes.edges`) and per-node CAS ids ride inside `Axes`. NOT invented beyond this.
 */
export interface Skeleton {
  readonly axes: Axes; // the ≥3 content-addressed axis hierarchies (INDEX-10)
  readonly manifest: Manifest; // territories at T2/advisory, ZERO invariants, T0 flagged (KNOW-6/7)
}

export interface ScanApi {
  /** S0 structural skeleton (GEN-1). DETERMINISTIC `$0`-LLM pure function of (repo, rev): tree-sitter +
   *  SCIP / stack-graphs + BLAKE3 content-address. Re-running on the same rev ⇒ byte-identical skeleton;
   *  no LLM handle reachable. Ships zero facts (territories at T2, T0 flagged only).
   *
   *  [FLAG — arg types] the surface `scan(repo, rev)` (atlas-genesis:186) leaves both untyped. `repo`
   *  transcribed as `string` (a repo path/handle); `rev` transcribed as `string` (a free-form git rev —
   *  deliberately NOT `Hash`, since GEN-8 requires a MALFORMED rev yield a partial skeleton, never a
   *  throw — a malformable input is a raw string, not a branded digest). Flagged for the WP. */
  scan(repo: string, rev: string): Skeleton;
}
