// @atlas/genesis — ref/budget.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// GEN-13 / GEN-14 — cost discipline (method-tags-gen:100-112). Transcribed from atlas-genesis GEN-13
// (lines 156-162) + GEN-14 (lines 163-168) + acceptance 13-14. CHEAP BY DEFAULT: the BASE tier is EXACTLY
// ONE LLM call per site — no self-consistency, no refuter, no check synthesis; ESCALATE BY VALUE — extra
// mechanisms switch on ONLY when a cheap signal shows the candidate is high-value (tier/blast) AND
// uncertain. Defaults: one sample, advisory unless checkable ∧ `tier≥T1`, CEGIS `K≤1`, refuter only for
// `T0` (small model), Semgrep before CodeQL, query DB built once (amortized). The REVIEW / ENRICH / EXPAND
// deepening loops are GOVERNED (GEN-14): each opt-in or default-shallow, budget-gated, with a
// diminishing-returns / fixpoint stop — ALL loops off ⇒ cost == the single cheap pass (Δ=0). Report cost
// per stage under a hard ceiling with the GEN-2 marginal-value stop.

import type { Tier } from '@atlas/contracts';
import type { Candidate, CostReport } from './types.js';

/**
 * One governed deepening loop (GEN-14). REVIEW / ENRICH / EXPAND are each opt-in or default-shallow,
 * budget-gated, with a fixpoint stop (a no-revision round / marginal value `< ε` / loop-until-dry on the
 * 2-door bar). No loop runs unbounded; the loops are the DEPTH DIAL, never a change to the default cost.
 *
 * [SIG-TBD — fixpoint predicate carrier] GEN-14 names the stop conditions in PROSE with no field list.
 * `enabled` (default false) + `depth` (the dial, 0 at base) are the honest minimum; the fixpoint / ε
 * carrier is NOT invented. Flagged for the owning WP.
 */
export interface LoopConfig {
  readonly enabled: boolean; // default false — loops-off ⇒ single-pass baseline (GEN-13/14, Δ=0)
  readonly depth: number; // the depth dial — 0 at the base tier
}

/** The three governed deepening loops (GEN-14). With all three off, genesis cost == the single cheap pass. */
export interface DeepeningLoops {
  readonly review: LoopConfig;
  readonly enrich: LoopConfig;
  readonly expand: LoopConfig;
}

/**
 * The genesis cost policy (GEN-13). Carries the hard site ceiling + the governed deepening loops.
 *   - `ceiling`   — the hard `--budget` site ceiling; default `min(frontier_size, 200)` (GEN-2).
 *   - `deepening` — the three governed loops; ALL off ⇒ cost == single-pass baseline (GEN-14).
 *
 * [SIG-TBD — marginal-value-stop params] GEN-2's numeric stop (halt when the trailing-20-site admit-rate
 * `< 20%`) is a POLICY the scheduler applies; its threshold carrier is not frozen as a field here — NOT
 * invented. Flagged.
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
