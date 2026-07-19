// @atlas/genesis — ref/predicate.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// GEN-12 — the synthesized predicate `check` (the teeth / anti-vacuity gate, method-tags-gen:93-98).
// Transcribed from atlas-genesis §S2 (lines 73-79) + GEN-12 (lines 144-155) + acceptance 10-12. When an
// S2 candidate is CHECKABLE, its `check` is authored as a REAL, deterministic, re-runnable CodeQL /
// Semgrep query — exactly the predicate evaluator KNOW-16 requires (no arbitrary code, no sandbox). The
// admission harness is MECHANICAL: (a) COMPILE the check, (b) evaluate on the anchored subtree → require
// `HOLDS` on current code, (c) evaluate on a mechanically-MUTATED counterfactual → require `BROKEN` (the
// TEETH: a check no mutant can break is vacuous → DROP). A failing check → REFINE ≤K, then drop, never
// force. SOUND ORACLE FIRST: a type-expressible slot prefers the language type-checker / LSP diagnostics
// (sound, `$0`) over a synthesized query. A predicate is a *machine-checked likely invariant*, never a
// proof.

import type { Status, StructRef } from '@atlas/contracts';
import type { IndexNode } from '@atlas/index';
import type { Check } from '@atlas/knowledge';
import type { Candidate } from './types.js';

/**
 * A synthesized runnable check. [PINNED — oracle-pin-map §1, KNOW-16] the check carrier is the RATIFIED
 * @atlas/knowledge `Check` — the tagged union of KNOW-16's two named legs ("a deterministic index-query
 * OR a pinned declarative assertion"). IMPORTED, never redefined: genesis synthesizes exactly the check
 * kind the steady-state predicate evaluator consumes (mirrors @atlas/knowledge `PredicateNode.check` and
 * `EvaluatorApi.evaluate(check, indexState)`). Re-exported so the genesis dialect reads from one place.
 */
export type { Check };

export interface PredicateApi {
  /** GEN-12 PROPOSE. Synthesize a runnable check for a checkable candidate (CodeQL / Semgrep). `null` =
   *  no admissible check (the candidate stays advisory, or abstains). Prefers the SOUND type-checker / LSP
   *  verdict for a type-expressible slot (`contract` / `ownership` / visibility) over a synthesized query. */
  synthesize(cand: Candidate): Check | null;

  /** GEN-12 VERIFY. Evaluate the check against index state → `HOLDS | BROKEN | NA` (KNOW-16, deterministic
   *  + pure — no code-exec, no clock, no IO; same index state ⇒ same verdict). Mirrors the @atlas/knowledge
   *  `EvaluatorApi.evaluate` verdict domain (a subset of `Status`; `'advisory'` is refused UPSTREAM, not a
   *  verdict here).
   *
   *  [FLAG — `indexState` carrier] typed as the @atlas/index `IndexNode` (mirrors KNOW-16
   *  `evaluate(check, indexState: IndexNode)`); the reference "over the structural/dependency axes" may be
   *  the multi-axis root (`Axes`) rather than a single node — flagged to reconcile at the WP. */
  verify(check: Check, indexState: IndexNode): Status;

  /** GEN-12 TEETH (anti-vacuity). Evaluate the check on a mechanically-MUTATED counterfactual of the
   *  anchored subtree; admit ONLY if it flips to `BROKEN` on some mutant. A check that returns `HOLDS` but
   *  survives EVERY mutant is vacuous (a tautology / matches nothing) → `false` ⇒ DROP. */
  teeth(check: Check, anchor: StructRef): boolean;
}
