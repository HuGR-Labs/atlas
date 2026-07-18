// @atlas/knowledge — ref/types.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The Knowledge kind's data model: the shared, grounded, project-level truth. Transcribed EXACTLY from
// `docs/reference/atlas-knowledge.md` §Data model (lines 19-32, 42) and §The closed `predicateSlot`
// vocabulary (lines 161-180). Layer-0 identity vocabulary (`Tier`, `Status`, `StructRef`, `Hash`,
// `NodeKey`), the kernel `ClaimEntry`, and the grounding `Grounding` are imported, NEVER redefined.

import type { Tier, Status, StructRef, Hash, NodeKey } from '@atlas/contracts';
import type { ClaimEntry } from '@atlas/kernel';
import type { Grounding } from '@atlas/grounding';

/**
 * The Knowledge freshness vocabulary. Transcribed from atlas-knowledge:29 — `Freshness = 'FRESH' |
 * 'DRIFTED'`.
 *
 * [FLAG — deliberate DISTINCT type, do not conflate] @atlas/contracts owns the CANONICAL 3-state
 * `Freshness = 'FRESH' | 'DRIFTED' | 'STALE'` (the grounding oracle, where `STALE` is advisory drift —
 * non-blocking, served-with-flag; GROUND-13). The Knowledge node carries the 2-state variant (no
 * `STALE`): a Knowledge fact is either FRESH or DRIFTED. To avoid REDEFINING the contracts type name
 * with a narrower body, the 2-state variant is transcribed under the distinct name
 * `KnowledgeFreshness` — same discipline the ratified skeleton applied to `TerritoryView`/
 * `ClaimProvenance`. Flagged for the two references (atlas-knowledge:29 vs contracts) to reconcile.
 */
export type KnowledgeFreshness = 'FRESH' | 'DRIFTED';

/**
 * The provenance receipt on a claim. Transcribed EXACTLY from atlas-knowledge:27 —
 *   `Provenance = { source, trusted: boolean, sha? }`  — untrusted → advisory, excluded from the gate.
 *
 * Named `ClaimProvenance` (NOT `Provenance`) per the LEAD-RATIFIED decision: `Provenance` is
 * @atlas/persist's per-agent metering type; the Knowledge claim-receipt is a distinct type.
 *
 * [SIG-TBD — `source` field type] The reference names `source` with no concrete type (a provenance
 * origin — a URL / commit / agent id). Transcribed as `string` (the honest nominal form), NOT invented
 * as a new exported type. Under `exactOptionalPropertyTypes`, `sha?` is genuinely absent-or-string.
 */
export interface ClaimProvenance {
  readonly source: string; // [SIG-TBD] reference names `source` without a concrete type
  readonly trusted: boolean;
  readonly sha?: string;
}

/**
 * The Knowledge node — one of the two content kinds of the Atlas. Transcribed EXACTLY from
 * atlas-knowledge:19 — `GroundedFact = AdvisoryNode | PredicateNode`. A discriminated union on `kind`.
 */
export type GroundedFact = AdvisoryNode | PredicateNode;

/**
 * The flat, honest default (a grounded claim, no verdict). Transcribed EXACTLY from
 * atlas-knowledge:21-22:
 *   `AdvisoryNode = { kind:'advisory', id, tier, claimNorm, grounding, freshness,
 *                     claims: ClaimEntry[], authoring:'ADVISORY'|'SUPERSEDED' }`
 *
 * [FLAG — `id` identity leg] atlas-knowledge:15 frames a node `id` as "the BLAKE3 hash of its canonical
 * form" (a `contentHash`-flavored value), while KNOW-15 (atlas-knowledge:123-124) makes NODE IDENTITY
 * the `nodeKey = hash(primaryAnchorId ‖ predicateSlot)`. `id` is transcribed as the branded `NodeKey`
 * (the create/update identity leg), NOT a `Hash` — flagged for the two lines to reconcile which leg the
 * stored `id` field carries.
 *
 * [FLAG — no stored `slot`/`owner`/`scope`] The frozen node shapes (atlas-knowledge:21-24) list NO
 * `predicateSlot`, `owner`, or `scope` field, yet the `nodeKey` is `hash(primaryAnchorId ‖
 * predicateSlot)` (KNOW-15) and KNOW-11 requires every fact carry `owner` + `scope`. The slot feeds
 * identity and owner/scope feed authz (`ref/authz.ts`) but are ABSENT from the frozen record — NOT
 * invented here as fields. Flagged for the data model to surface them.
 */
export interface AdvisoryNode {
  readonly kind: 'advisory';
  readonly id: NodeKey; // [FLAG] identity leg — see above (reference:15 says "hash of canonical form")
  readonly tier: Tier;
  readonly claimNorm: string;
  readonly grounding: Grounding;
  readonly freshness: KnowledgeFreshness;
  readonly claims: readonly ClaimEntry[]; // [FLAG] kernel `ClaimEntry` — see the union note below
  readonly authoring: 'ADVISORY' | 'SUPERSEDED';
}

/**
 * The checkable family: adds a `check` + mechanical `HOLDS/BROKEN/NA`. Transcribed EXACTLY from
 * atlas-knowledge:23-24:
 *   `PredicateNode = { kind:'predicate', id, tier, check, grounding, status, freshness,
 *                      claims: ClaimEntry[], authoring:'PREDICATED'|'SUPERSEDED' }`
 *
 * [SIG-TBD — `check` type] KNOW-16 (atlas-knowledge:66) defines a `check` as "a deterministic query
 * over the Atlas index (structural/dependency axes) or a pinned declarative assertion" — no concrete
 * record shape is frozen. Transcribed as `unknown` rather than invented; it is `normalize`d into the
 * predicate `nodeKey` (KNOW-15) and evaluated by `ref/evaluator.ts`. Flagged for the owning WP.
 *
 * [FLAG — no stored `supersededBy`] KNOW-12 (atlas-knowledge:97-99) says a predicate SUPERSEDE adds a
 * `supersededBy` POINTER into CAS, yet the frozen shape lists no such field (only `authoring:'…'|
 * 'SUPERSEDED'` marks the state). The pointer is handled in `ref/archive.ts` but is ABSENT from the
 * frozen record — NOT invented here. Flagged.
 */
export interface PredicateNode {
  readonly kind: 'predicate';
  readonly id: NodeKey; // [FLAG] identity leg — see AdvisoryNode
  readonly tier: Tier;
  readonly check: unknown; // [SIG-TBD] KNOW-16 index-query / declarative assertion — shape not frozen
  readonly grounding: Grounding;
  readonly status: Status;
  readonly freshness: KnowledgeFreshness;
  readonly claims: readonly ClaimEntry[]; // [FLAG] kernel `ClaimEntry` — see the union note below
  readonly authoring: 'PREDICATED' | 'SUPERSEDED';
}

// [FLAG — `ClaimEntry` reference divergence] atlas-knowledge:26 defines a Knowledge-local
//   `ClaimEntry = { claimNorm, claimText, provenance }`.
// Per the task's DAG-safe rule the LOWER-layer `ClaimEntry` is IMPORTED from @atlas/kernel (where it is
// aliased to `Event`, kernel/ref/types.ts) rather than redefined here. The two shapes DIVERGE (kernel
// `Event` vs the `{claimNorm, claimText, provenance}` record). Transcribed to the imported kernel type
// to avoid inverting/duplicating the DAG; flagged for the two references to reconcile whether Knowledge
// claims are kernel `Event`s or a distinct `{claimNorm, claimText, provenance}` record.

/**
 * The knowledge-local RICHER territory shape. Transcribed EXACTLY from atlas-knowledge:42 —
 *   `Territory = { path, owner, tier, files[], regions?, blastRadius }`.
 *
 * Named `TerritoryView` (NOT `Territory`) per the LEAD-RATIFIED decision: the CANONICAL
 * `Territory = { name, owner, tier, globs }` stays in @atlas/contracts; this richer view is a distinct
 * type owned HERE.
 *
 * [FLAG — `owner` field type] The reference `owner` is a `seat` (nominal seat id), not in the ratified
 * contracts membership. Transcribed as `string` — the same discipline contracts applied to
 * `Territory.owner`. NOT invented as a new exported type.
 *
 * [SIG-TBD — `regions?` / `blastRadius` types] The reference names `regions?` and `blastRadius` with NO
 * concrete type (a region set; the blast-radius reachability set). Transcribed as `unknown` rather than
 * invented. Under `exactOptionalPropertyTypes`, `regions?` is genuinely absent-or-value. Flagged.
 */
export interface TerritoryView {
  readonly path: string;
  readonly owner: string; // [FLAG] reference: `seat` (nominal seat id) — transcribed as string
  readonly tier: Tier;
  readonly files: readonly string[];
  readonly regions?: unknown; // [SIG-TBD] region set — shape not frozen
  readonly blastRadius: unknown; // [SIG-TBD] blast-radius reachability set — shape not frozen
}

/**
 * The closed `predicateSlot` vocabulary (NORMATIVE). Transcribed EXACTLY — all 12 members — from
 * atlas-knowledge:166-179. The list is CLOSED: adding a slot is a spec revision that bumps the contract
 * version `cv` (atlas-knowledge:163). "Same topic" is decidable ONLY because this union is finite, which
 * is what lets `nodeKey` collide and force UPDATE/union instead of proliferating (atlas-knowledge:150).
 * Each slot binds to exactly one write template (KNOW-10) — see `ref/template.ts`.
 */
export type PredicateSlot =
  | 'invariant'
  | 'contract'
  | 'precondition'
  | 'postcondition'
  | 'sideeffect'
  | 'ownership'
  | 'perf-bound'
  | 'security-property'
  | 'gotcha'
  | 'rationale'
  | 'dependency'
  | 'definition';

/**
 * A proposed, un-ratified fact in staging (from the explorer). Transcribed from atlas-knowledge:31.
 *
 * [SIG-TBD — record NOT frozen] atlas-knowledge:31 is a PROSE characterization ("a proposed, un-ratified
 * fact in staging"), not a frozen field list. The fields below are the reference-ATTRIBUTED minimum the
 * write path consumes — NOT an invented record:
 *   - `claimText` / `claimNorm` — the LLM proposes ONLY the claim body (atlas-knowledge:127; the body of
 *      a `ClaimEntry`, atlas-knowledge:26).
 *   - `slot`       — proposed alongside the body (atlas-knowledge:127), from the closed vocabulary.
 *   - `check?`     — predicate candidates only (atlas-knowledge:127); [SIG-TBD] shape, see `PredicateNode`.
 *   - `grounding`  — the citations; `primaryAnchorId` is COMPUTED from these, never proposed (KNOW-15).
 *   - `provenance` — every claim carries a receipt (KNOW-14).
 *   - `tier`       — proposed tier (heuristics may only FLAG T0, never assign it — KNOW-7).
 * The `id`/`nodeKey`/`status`/`freshness` legs are NOT candidate fields — they are recomputed
 * side-indexes minted at ratification. Flagged: this record is not frozen; do not treat as canonical.
 */
export interface Candidate {
  readonly claimText: string;
  readonly claimNorm: string;
  readonly slot: PredicateSlot;
  readonly check?: unknown; // [SIG-TBD] predicate candidates only — check shape not frozen
  readonly grounding: Grounding;
  readonly provenance: ClaimProvenance;
  readonly tier: Tier;
}
