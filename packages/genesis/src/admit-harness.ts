// @atlas/genesis — src/admit-harness.ts   (WP-8.28-b.GEN — EPIC-28-b, GEN-12)
//
// The S2 MECHANICAL ADMISSION engine (mechanical admit + synthesized-check TEETH / mutant gate). In S2 the
// LLM ONLY proposes typed candidates; admission is mechanical. A PREDICATE candidate is admitted only if its
// synthesized `check` (a) compiles + returns `HOLDS` on current code AND (b) flips to `BROKEN` on ≥1
// mechanically-mutated counterfactual (the TEETH / anti-vacuity — a check no mutant can break → DROP). An
// ADVISORY candidate passes the 2-door bar (grounding ∧ non-obviousness); abstention is a valid grounded
// why-not. SOUND ORACLE FIRST for type-expressible slots. Co-locates the frozen `PredicateApi` + `Check`
// re-export; the check-engine / 2-door semantics are consumed as injected ports, never defined here.

import type { NodeKey, Status, StructRef, Tier } from '@atlas/contracts';
import type { AdvisoryNode, Check, GroundedFact, PredicateNode, PredicateSlot } from '@atlas/knowledge';
import type { IndexNode } from '@atlas/index';
import type { Candidate, WhyNot } from './types.js';

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

/** The citations carrier of a grounded fact — reused from the frozen node shape, NEVER redefined. */
type FactGrounding = AdvisoryNode['grounding'];

// ---- the LLM proposal: a TYPED candidate ONLY (GEN-12a) — no admission vote, no confidence field --------

/**
 * A predicate candidate the LLM proposes (GEN-12a). It carries the CLAIM only — the runnable `check` is
 * SYNTHESIZED mechanically by the harness (`PredicateApi.synthesize`), never trusted from the model.
 * `scratch` is the chain-of-thought: SCRATCH ONLY (GEN-12f), never persisted onto the emitted node.
 */
export interface PredicateProposal {
  readonly kind: 'predicate';
  readonly site: Candidate; // the genesis ranked SITE — the admission anchor rides `site.site.subtreeHash`
  readonly slot: PredicateSlot; // drives SOUND-ORACLE-FIRST (GEN-12k)
  readonly nodeKey: NodeKey; // identity carried through (minted upstream, not by a model vote)
  readonly claimNorm: string;
  readonly grounding: FactGrounding;
  readonly tier: Tier;
  readonly scratch?: string; // chain-of-thought — discarded, never a fact (GEN-12f)
}

/** An advisory candidate the LLM proposes (GEN-12e) — a grounded claim with no verdict. */
export interface AdvisoryProposal {
  readonly kind: 'advisory';
  readonly site: Candidate;
  readonly nodeKey: NodeKey;
  readonly claimNorm: string;
  readonly grounding: FactGrounding;
  readonly tier: Tier;
  readonly scratch?: string; // chain-of-thought — discarded, never a fact (GEN-12f)
}

/** A grounded abstention (GEN-12g) — a VALID outcome, never a manufactured fact. */
export interface Abstention {
  readonly kind: 'abstain';
  readonly whyNot: WhyNot;
}

/** What the proposer emits for one site — a typed candidate OR a grounded abstention. NO admission authority. */
export type Proposal = PredicateProposal | AdvisoryProposal | Abstention;

// ---- the injected mechanical seams (defined elsewhere; consumed here) ----------------------------------

/**
 * The 2-door bar (CAMPAIGN-4). An advisory is admitted only through BOTH doors: `grounded` (truth — the
 * citation re-derives) ∧ `nonObvious` (usefulness — non-obvious AND actionable, not a restated signature).
 */
export interface TwoDoorBar {
  grounded(grounding: FactGrounding, indexState: IndexNode): boolean;
  nonObvious(claimNorm: string): boolean;
}

/**
 * The sound `$0` type-checker / LSP oracle (GEN-12k). `expressible` reports whether the slot is expressible
 * in the language type system; `diagnose` returns the SOUND compiler/LSP verdict (the compiler already ran).
 */
export interface TypeOracle {
  expressible(slot: PredicateSlot): boolean;
  diagnose(site: Candidate, slot: PredicateSlot): Status;
}

/** The admission harness's injected dependencies — every mechanism is a seam, none is defined here. */
export interface AdmitDeps {
  readonly predicate: PredicateApi; // synthesize/verify/teeth (CodeQL/Semgrep, KNOW-16)
  readonly doors: TwoDoorBar; // the advisory 2-door bar (CAMPAIGN-4)
  readonly typeOracle: TypeOracle; // sound-oracle-first (GEN-12k)
  readonly refine: (check: Check, site: Candidate) => Check | null; // CEGIS refine; `null` = no change
  readonly indexState: IndexNode; // current code (KNOW-16 evaluate carrier)
  readonly K: number; // refine budget (GEN-13 default K≤1)
}

// ---- the admission outcome -----------------------------------------------------------------------------

/** The label on an admitted predicate (GEN-12i) — a machine-checked LIKELY invariant, NEVER a proof. */
export const LIKELY_INVARIANT = 'machine-checked likely invariant' as const;
export type InvariantLabel = typeof LIKELY_INVARIANT;

/** The mechanical admission verdict. `admitted` yields the fact to emit; `dropped`/`abstained` yield none. */
export type Admission =
  | { readonly outcome: 'admitted'; readonly fact: GroundedFact; readonly label?: InvariantLabel }
  | { readonly outcome: 'dropped'; readonly reason: string }
  | { readonly outcome: 'abstained'; readonly whyNot: WhyNot };

// the structured drop reasons — honest, never a forced fact.
const DROP_NO_CHECK = 'no admissible synthesized check for a checkable candidate (GEN-12)';
const DROP_NOT_HOLDS = 'synthesized check does not compile ∧ HOLDS on current code, after refine ≤K (GEN-12c/12d)';
const DROP_VACUOUS = 'synthesized check survives every mutant — vacuous / toothless (GEN-12j)';
const DROP_TYPE_BROKEN = 'sound type-checker / LSP verdict is not HOLDS on the type-expressible slot (GEN-12k)';
const DROP_UNGROUNDED = 'advisory fails the truth door — the citation does not ground (GEN-12e)';
const DROP_OBVIOUS = 'advisory fails the non-obviousness door — restates an obvious/public fact (GEN-12e)';

// ---- the harness ---------------------------------------------------------------------------------------

/**
 * Run one site: invoke the proposer EXACTLY once, then admit its typed candidate mechanically. The proposer
 * is never re-prompted (GEN-12h) — a 0-candidate abstention is a valid outcome, not a failure (GEN-12g).
 */
export function runSite(propose: () => Proposal, deps: AdmitDeps): Admission {
  const proposal = propose(); // GEN-12h: invoked ONCE — never pressured to emit
  return admit(proposal, deps); // GEN-12a: the harness casts the decision, not the model
}

/** Mechanically admit one typed candidate (GEN-12). Pure + total: no clock, no IO, no throw. */
export function admit(p: Proposal, deps: AdmitDeps): Admission {
  switch (p.kind) {
    case 'abstain':
      return { outcome: 'abstained', whyNot: p.whyNot }; // GEN-12g — valid, unpressured
    case 'advisory':
      return admitAdvisory(p, deps);
    case 'predicate':
      return admitPredicate(p, deps);
  }
}

/** GEN-12e — an advisory passes ONLY through both doors: grounding (truth) ∧ non-obviousness (usefulness). */
function admitAdvisory(p: AdvisoryProposal, deps: AdmitDeps): Admission {
  if (!deps.doors.grounded(p.grounding, deps.indexState)) return { outcome: 'dropped', reason: DROP_UNGROUNDED };
  if (!deps.doors.nonObvious(p.claimNorm)) return { outcome: 'dropped', reason: DROP_OBVIOUS };
  return { outcome: 'admitted', fact: buildAdvisory(p) };
}

/**
 * GEN-12 — mechanical predicate admission. SOUND ORACLE FIRST for a type-expressible slot; otherwise the
 * synthesized-check path: compile ∧ HOLDS (refine ≤K, else drop) ∧ TEETH (flip on ≥1 mutant, else vacuous).
 */
function admitPredicate(p: PredicateProposal, deps: AdmitDeps): Admission {
  // GEN-12k — a type-expressible slot uses the SOUND `$0` type-checker / LSP, not a synthesized query.
  if (deps.typeOracle.expressible(p.slot)) {
    if (deps.typeOracle.diagnose(p.site, p.slot) !== 'HOLDS') return { outcome: 'dropped', reason: DROP_TYPE_BROKEN };
    return { outcome: 'admitted', fact: buildPredicate(p, soundCheck(p.slot)), label: LIKELY_INVARIANT };
  }

  // synthesized-check path (CodeQL/Semgrep, KNOW-16).
  let check = deps.predicate.synthesize(p.site);
  if (check === null) return { outcome: 'dropped', reason: DROP_NO_CHECK };

  // GEN-12c VERIFY — require HOLDS on current code; GEN-12d — a failing check is refined ≤K, then dropped.
  let verdict = deps.predicate.verify(check, deps.indexState);
  for (let k = 0; verdict !== 'HOLDS' && k < deps.K; k += 1) {
    const refined = deps.refine(check, p.site);
    if (refined === null) break; // no change → stop early, never force
    check = refined;
    verdict = deps.predicate.verify(check, deps.indexState);
  }
  if (verdict !== 'HOLDS') return { outcome: 'dropped', reason: DROP_NOT_HOLDS }; // never forced

  // GEN-12j TEETH — admit ONLY if the check flips to BROKEN on ≥1 mutant; a survivor is vacuous → drop.
  if (!deps.predicate.teeth(check, p.site.site)) return { outcome: 'dropped', reason: DROP_VACUOUS };

  return { outcome: 'admitted', fact: buildPredicate(p, check), label: LIKELY_INVARIANT };
}

/** The SOUND declarative check for a type-expressible slot (GEN-12k) — the `assertion` leg, not a query. */
function soundCheck(slot: PredicateSlot): Check {
  return { kind: 'assertion', expr: `type-checker/LSP diagnostics: ${slot}` };
}

/** Construct the emitted predicate node. The chain-of-thought is structurally absent (GEN-12f). */
function buildPredicate(p: PredicateProposal, check: Check): PredicateNode {
  return {
    kind: 'predicate',
    id: p.nodeKey,
    tier: p.tier,
    check,
    grounding: p.grounding,
    status: 'HOLDS',
    freshness: 'FRESH',
    claims: [],
    authoring: 'PREDICATED',
  };
}

/** Construct the emitted advisory node. The chain-of-thought is structurally absent (GEN-12f). */
function buildAdvisory(p: AdvisoryProposal): AdvisoryNode {
  return {
    kind: 'advisory',
    id: p.nodeKey,
    tier: p.tier,
    claimNorm: p.claimNorm,
    grounding: p.grounding,
    freshness: 'FRESH',
    claims: [],
    authoring: 'ADVISORY',
  };
}
