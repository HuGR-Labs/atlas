// @atlas/genesis — ref/types.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Layer 8: the one-time BOOTSTRAP / composition root. Genesis seeds the Atlas onto an already-existing
// (brownfield) repo — deterministic skeleton, rationed intelligence — then hands off to born-from-work.
// This file carries the package's shared data model: the ranked mining `Candidate` (a ranked SITE, NEVER
// a fact — GEN-6), the S1 ranking-signals record, the abstention `WhyNot`, the batched ratification
// question, the per-stage cost report, the resume token, and the total `GenesisReport`. Transcribed from
// `docs/reference/atlas-genesis.md` §Surface/API (lines 183-196), §The pipeline (S0→S4), and the
// GEN-1..16 invariant register.
//
// [LEAD-RATIFIED] Shared identity vocab — `StructRef` (the grounding anchor) — lives in @atlas/contracts
// and is IMPORTED, NEVER redefined. `Fact`/`Ratified` REUSE the @atlas/knowledge `GroundedFact` (the
// steady-state node genesis hands off to — KNOW-13); genesis does not mint a competing fact record.
//
// [HOME NOTE] `Candidate` and `WhyNot` are GENESIS-HOME. A grep of the lower layers found a *different*
// `Candidate` in @atlas/knowledge (a staging PROPOSED FACT: `{claimText, slot, grounding, ...}`) — that
// is a fact-in-waiting, semantically the OPPOSITE of the genesis ranked-site Candidate (which is NEVER a
// fact, GEN-6). They are distinct types with distinct homes; genesis owns its own. `WhyNot` is frozen
// nowhere below → defined here.

import type { StructRef } from '@atlas/contracts';
import type { GroundedFact } from '@atlas/knowledge';

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
 * ONLY after S2 `extract` grounds it and it clears the 2-door bar (GEN-4). This is genesis-HOME (see the
 * HOME NOTE above); it is NOT the @atlas/knowledge staging `Candidate`.
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
 * A grounded ABSTENTION (GEN-12). When S2 `extract` finds no non-obvious grounded fact at a site, it
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
  readonly cost?: CostReport; // [FLAG] GEN-13/A-13 require per-stage cost; §Surface literal omits it
  readonly resumeToken?: ResumeToken; // present only on a partial/interrupted run (GEN-8)
}
