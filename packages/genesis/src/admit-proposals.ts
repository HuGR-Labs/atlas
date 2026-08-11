// @atlas/genesis — src/admit-proposals.ts   (the LLM proposal data model — the typed candidate ONLY)
//
// EXTRACTED from `admit-harness.ts` at the 400-LOC godfile ceiling along the cohesive boundary WP-96 forced:
// the harness owns the mechanical ADMISSION ENGINE (synthesize / verify / teeth / mint), and this module owns
// the SHAPES the LLM proposes into it — a typed candidate carrying the CLAIM only, never an admission vote.
// The exact sibling of the knowledge `relation-key.ts` / `negation-types.ts` extractions on #99a/#99b. Every
// shape is re-exported by `admit-harness.ts` (which uses them), so the package surface is byte-identical.
//
// The four fact families each get a proposal slot: advisory + predicate (the original two), and — widened by
// ADR-0015 D2/D3 (WP-96) — relation + negation, so the later relation/negation admission WPs have a typed
// place to fill and the `Proposal` union is exhaustive (tsc). NO admission authority rides any of these: the
// harness casts the decision, never the model (GEN-12a). `scratch` is chain-of-thought — never a fact (GEN-12f).

import type { NodeKey, Tier } from '@atlas/contracts';
import type { AdvisoryNode, PredicateSlot, RelationKind } from '@atlas/knowledge';
import type { Candidate, WhyNot } from './types.js';

/** The citations carrier of a grounded fact — reused from the frozen node shape, NEVER redefined. */
export type FactGrounding = AdvisoryNode['grounding'];

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

/**
 * A RELATION candidate the LLM proposes (ADR-0015 D2, #99a). Mirrors `RelationNode`
 * (packages/knowledge/src/types.ts:109) MINUS the harness/door-minted legs (`relationKey`/id, freshness,
 * authoring, obviousness): the proposer supplies the two LOCATION-FREE endpoint unitKeys + `relationKind` +
 * grounding; the identity (`relationKey`) is minted DOWNSTREAM (KNOW-15b parity), never by the model. No
 * `check` — a relation is not a checkable predicate, so a relation carrying one is refused as malformed
 * (`familyOf`, governed-emit-identity.ts:38). Admission (grounding/mint) is WP-96-R — this is only its slot.
 */
export interface RelationProposal {
  readonly kind: 'relation';
  readonly site: Candidate;
  readonly relationKind: RelationKind;
  readonly endpointA: string; // location-free unitKey of A (subject) — identity leg, NOT a single anchor
  readonly endpointB: string; // location-free unitKey of B (object) — identity leg
  readonly grounding: FactGrounding; // EXACTLY two entries: [0] anchors A, [1] anchors B (AND-folded freshness)
  readonly tier: Tier;
  readonly scope?: string;
  readonly scratch?: string; // chain-of-thought — discarded, never a fact (GEN-12f)
}

/**
 * A NEGATION candidate the LLM proposes (ADR-0015 D3, #99b). Mirrors `NegationNode`
 * (packages/knowledge/src/negation-types.ts:41) MINUS the harness/door-minted legs (`negationKey`/id,
 * `edgeModel`, freshness, authoring, claims). NO `grounding`: the governed door CONSTRUCTS it at admit from
 * the scope directory's subtree-Merkle (bobby F4; governed-emit-negation.ts:199-201) — the proposer names
 * only the (relationKind, target, scope) it is a negative about. `scope` stays the directory/witness identity
 * leg for now (the authz-vs-identity split is WP-96-N, amends #99b — out of THIS WP). Admission is WP-96-N.
 */
export interface NegationProposal {
  readonly kind: 'negation';
  readonly site: Candidate;
  readonly relationKind: RelationKind; // the NEGATED relation (shares #99a's closed vocabulary)
  readonly target: string; // location-free GLOBAL symbol key X the negative is ABOUT (¬∃ · →X) — identity leg
  readonly scope: string; // the CLOSED scope S (a DIRECTORY key) the witness ranges over — identity leg
  readonly tier: Tier;
  readonly scratch?: string; // chain-of-thought — discarded, never a fact (GEN-12f)
}

/** A grounded abstention (GEN-12g) — a VALID outcome, never a manufactured fact. */
export interface Abstention {
  readonly kind: 'abstain';
  readonly whyNot: WhyNot;
}

/** What the proposer emits for one site — a typed candidate OR a grounded abstention. NO admission authority. */
export type Proposal =
  | PredicateProposal
  | AdvisoryProposal
  | RelationProposal
  | NegationProposal
  | Abstention;
