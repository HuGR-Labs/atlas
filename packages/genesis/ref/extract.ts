// @atlas/genesis — ref/extract.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// S2 — the ONLY LLM entry in the whole pipeline (GEN-2, method-tags-gen:23-28). Transcribed from
// atlas-genesis §S2 (lines 69-84) + §Surface (line 188) + INV-GEN-2 + INV-GEN-12 (method-tags-gen:93-98).
// `extract` visits candidates HIGHEST-PPR-FIRST, one BOUNDED call per site, under a HARD budget with a
// numeric MARGINAL-VALUE stop (halt when the trailing-20-site admit-rate `< 20%`). No repo-wide LLM
// sweep; no embedding / vectorization anywhere (A-14). GEN-12: the LLM only PROPOSES typed candidates —
// admission is MECHANICAL; abstention is a VALID outcome (a grounded `WhyNot`), never a manufactured
// fact; chain-of-thought is scratch, never persisted. The synthesized predicate `check` (propose→verify→
// repair, teeth) lives in `ref/predicate.ts` (GEN-12).

import type { Candidate, Fact, WhyNot } from './types.js';
import type { GenesisBudget } from './budget.js';

/**
 * The S2 output. Transcribed EXACTLY from atlas-genesis:188 —
 *   `extract(...): { facts: Fact[], abstained: WhyNot[] }`.
 * `facts` = the grounded candidates that cleared the 2-door bar (GEN-4); `abstained` = the grounded
 * why-nots where no non-obvious grounded fact was found (GEN-12). Abstention is first-class — a site
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
   *  (grounding re-derives ∧ the non-obviousness door; a predicate additionally passes the teeth gate,
   *  `ref/predicate.ts`). Returns grounded facts + grounded abstentions.
   *
   *  [FLAG — `budget` carrier] the surface `extract(cands, budget)` (atlas-genesis:188) leaves `budget`
   *  untyped; transcribed as the `GenesisBudget` policy (`ref/budget.ts`) — it carries the hard site
   *  ceiling (`min(frontier_size, 200)`, GEN-2) plus the GEN-13/14 escalation + deepening dials. A bare
   *  numeric `--budget N` maps to `GenesisBudget.ceiling`. */
  extract(cands: readonly Candidate[], budget: GenesisBudget): ExtractResult;
}
