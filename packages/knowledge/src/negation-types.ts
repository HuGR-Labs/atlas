// @atlas/knowledge — src/negation-types.ts  (ADR-0015 D3 · #99b — the scoped-negative data model)
//
// EXTRACTED from `types.ts` at the 400-LOC godfile ceiling along a cohesive boundary (the #99b negation
// shapes are their own concern), exactly as `relation-key.ts` was extracted from `router.ts` at the same
// ceiling on the sibling #99a leg. RE-EXPORTED by `types.ts` (`export type { NegationNode, AbstainedRecord }`)
// so the package surface — `import type { NegationNode } from '@atlas/knowledge'` — is byte-identical to
// having declared them inline. `RelationKind`/`ObviousnessScore` stay owned by `types.ts` and are imported
// here (a type-only cycle, erased at runtime). See docs/design/99b-negation-fact-contract.md §1.

import type { Tier, NodeKey } from '@atlas/contracts';
import type { ClaimEntry } from '@atlas/kernel';
import type { Grounding } from '@atlas/grounding';
import type { KnowledgeFreshness, RelationKind, ObviousnessScore } from './types.js';

/**
 * A SCOPED grounded NEGATIVE (ADR-0015 D3, #99b — "the honesty core"). Structurally a sibling of
 * `RelationNode` — no `check`, so no predicate lifecycle — asserting `¬∃` over a relation within a
 * CLOSED scope: "within scope S under edge-model E, no `relationKind`-edge targets X was found". A
 * closed-world negative is sound ONLY if the negated relation was computed COMPLETELY over S, so the
 * groundable form is the scoped positive that carries its own completeness proof (§0).
 *
 * IDENTITY vs FRESHNESS, made concrete (why `scope` is an identity leg):
 *   - `relationKind` + `target` (the location-free GLOBAL symbol key X the negative is ABOUT, ¬∃·→X)
 *     + `scope` (the CLOSED scope S, a DIRECTORY key) are the identity legs. They feed
 *     `negationKey = hash({neg, t, s})` (negation-key.ts) — NOT `deepestCommonUnit`. `(¬calls, X)` in
 *     scope `src/payments` is a DIFFERENT fact than in scope `src/`: the negative is only as strong as
 *     the scope it was proven closed over (§1). Two negations over the same (kind, X) at different
 *     scopes are distinct nodes. A pure edit does not change them.
 *   - `grounding` carries EXACTLY ONE entry anchored at the scope directory:
 *     `{ kind:'directory', qualifiedPath: S, subtreeHash: <S's folded hash at emit> }`. That folded
 *     hash IS the insertion-sensitive scope Merkle (§3): `driftDetect` (drift.ts) rides VERBATIM —
 *     a NEW caller of X entering S (a new file, or an edit to an in-S file) moves the named-child set
 *     ⇒ the dir hash moves ⇒ DRIFTED. Identity (target+scope) is SPLIT from freshness (the directory
 *     subtreeHash), the whole point of D3's "insertion-sensitivity a per-unit hash lacks".
 *   - `edgeModel` is the `IndexerPlan.version` at emit — the ONE completeness clause `driftDetect`
 *     CANNOT see (an extractor upgrade changes no file bytes). It rides as this explicit field and is
 *     compared by the door's re-check (N2); freshness never re-runs `reverseCallers` (§3 clause 2/4).
 */
export interface NegationNode {
  readonly kind: 'negation';
  readonly id: NodeKey; // = negationKey (negation-key.ts); MINTED, never trusted from the payload
  readonly tier: Tier;
  readonly relationKind: RelationKind; // the NEGATED relation (reuse #99a's closed 'depends-on'|'calls')
  readonly target: string; // the location-free GLOBAL symbol key X the negative is ABOUT (¬∃ · →X) — identity leg
  readonly scope: string; // the CLOSED scope S (a DIRECTORY key) the witness ranges over — identity leg
  readonly grounding: Grounding; // ONE entry anchored at S; its subtreeHash IS the scope Merkle (§3 — DECIDED)
  readonly edgeModel: string; // the IndexerPlan.version at emit — the ONE witness clause the oracle can't see (§3)
  readonly freshness: KnowledgeFreshness;
  readonly claims: readonly ClaimEntry[];
  readonly authoring: 'NEGATED' | 'SUPERSEDED';
  readonly obviousness?: ObviousnessScore; // ADR-0012 — additive, absent-tolerant (see AdvisoryNode)
}

/**
 * The explicit honest-abstention record (owner-ratified 2026-08-10, closes #202's 0/300 abstentions).
 * NOT a `GroundedFact` — it asserts NOTHING about the world; it records that the door was ASKED a
 * negative it could not soundly DECIDE, and WHY. A durable, read-back SIBLING record (the door emits
 * it, N2), so "abstention FIRED" is observable rather than a silent fail-closed refusal.
 *
 * It reuses the SAME `negationKey` address the negation WOULD take, so a later successful negation at
 * the same question SUPERSEDES the abstention on the shared address (the honest lifecycle: "couldn't
 * decide" → later "decided false", handled at the door, not by routing). `reason` is a CLOSED set of
 * WHY-it-could-not-decide causes; `witness.underApproxSources` names the unresolved/dynamic edges that
 * left the scope OPEN (the completeness hole), so the abstention carries its own evidence.
 */
export interface AbstainedRecord {
  readonly kind: 'abstained';
  readonly id: NodeKey; // = negationKey(the refused question) — the same address the negation WOULD take
  readonly relationKind: RelationKind;
  readonly target: string;
  readonly scope: string;
  readonly reason: 'scope-open' | 'target-not-global' | 'scope-empty'; // WHY it could not decide (closed set)
  readonly witness: { readonly underApproxSources: readonly string[] }; // the unresolved/dynamic edges that opened S
}
