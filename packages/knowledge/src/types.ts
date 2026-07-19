// @atlas/knowledge — src/types.ts  (frozen data model + co-located API interfaces; zero runtime)
//
// Layer 4 Knowledge-kind shared model: the shared, grounded, project-level truth (GroundedFact = advisory
// | predicate, Candidate, TerritoryView, Check, the closed PredicateSlot vocabulary), plus the co-located
// EvaluatorApi / StoreApi interfaces — both consumed by ≥2 src files (EvaluatorApi by evaluator.ts + the
// store; StoreApi by evaluator.ts/archive.ts/router.ts), so they live here beside the model. Layer-0
// identity vocabulary (Tier/Status/StructRef/Hash/NodeKey), kernel ClaimEntry, grounding Grounding, and
// the index IndexNode are imported, NEVER redefined.

import type { Tier, Status, StructRef, Hash, NodeKey } from '@atlas/contracts';
import type { ClaimEntry } from '@atlas/kernel';
import type { Grounding } from '@atlas/grounding';
import type { IndexNode } from '@atlas/index';

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
 * [PINNED — oracle-pin-map §Non-decisions] The reference names `source` with no concrete type (a
 * provenance origin — a URL / commit / agent id); pinned to `string` (the honest nominal form), NOT a
 * new exported type. Under `exactOptionalPropertyTypes`, `sha?` is genuinely absent-or-string.
 */
export interface ClaimProvenance {
  readonly source: string; // PINNED → string (provenance origin nominal form)
  readonly trusted: boolean;
  readonly sha?: string;
}

/**
 * A predicate's mechanical `check` (KNOW-16, atlas-knowledge:66). RATIFIED oracle-pin (oracle-pin-map §1,
 * cross-cutting DEFINE): KNOW-16's two named legs — "a deterministic index-query OR a pinned declarative
 * assertion". A tagged union; both legs named by the reference. Consumers (the evaluator, `normalize`
 * into `nodeKey`) treat it opaquely — minimal, no speculative fields.
 */
export type Check =
  | { readonly kind: 'index-query'; readonly query: string }
  | { readonly kind: 'assertion'; readonly expr: string };

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
 * [RESOLVED — R3 data-model reconciliation, owner-authorized 2026-07-19] The `owner`/`scope` (KNOW-11a)
 * and `predicateSlot` (KNOW-15b nodeKey leg / KNOW-4g read-side grouping) fields are now SURFACED on both
 * node shapes — OPTIONALLY. Optional because ~17 merged `GroundedFact` literals (src+test) omit them; the
 * KNOW-11 "every fact MUST carry owner+scope" stays enforced BEHAVIORALLY by the WP-5.14 emit/authz facet +
 * the conformance goldens, not by the type. Grounded shapes (`string`, closed `PredicateSlot`) — not
 * invented. Discharges the former [FLAG — no stored slot/owner/scope].
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
  readonly owner?: string; // R3 — KNOW-11a (authz keys inScope(actor, scope); nominal seat/owner id)
  readonly scope?: string; // R3 — KNOW-11a (territory scope id)
  readonly predicateSlot?: PredicateSlot; // R3 — KNOW-15b nodeKey leg / KNOW-4g read-side grouping
}

/**
 * The checkable family: adds a `check` + mechanical `HOLDS/BROKEN/NA`. Transcribed EXACTLY from
 * atlas-knowledge:23-24:
 *   `PredicateNode = { kind:'predicate', id, tier, check, grounding, status, freshness,
 *                      claims: ClaimEntry[], authoring:'PREDICATED'|'SUPERSEDED' }`
 *
 * [PINNED — oracle-pin-map §1] KNOW-16's `check` = "a deterministic index-query OR a pinned declarative
 * assertion" is pinned to the ratified `Check` tagged union (above). It is `normalize`d into the
 * predicate `nodeKey` (KNOW-15) and evaluated by the evaluator.
 *
 * [FLAG — no stored `supersededBy`] KNOW-12 (atlas-knowledge:97-99) says a predicate SUPERSEDE adds a
 * `supersededBy` POINTER into CAS, yet the frozen shape lists no such field (only `authoring:'…'|
 * 'SUPERSEDED'` marks the state). The pointer is handled in `archive.ts` but is ABSENT from the
 * frozen record — NOT invented here. Flagged.
 */
export interface PredicateNode {
  readonly kind: 'predicate';
  readonly id: NodeKey; // [FLAG] identity leg — see AdvisoryNode
  readonly tier: Tier;
  readonly check: Check; // PINNED → Check (KNOW-16 index-query | declarative assertion)
  readonly grounding: Grounding;
  readonly status: Status;
  readonly freshness: KnowledgeFreshness;
  readonly claims: readonly ClaimEntry[]; // [FLAG] kernel `ClaimEntry` — see the union note below
  readonly authoring: 'PREDICATED' | 'SUPERSEDED';
  readonly owner?: string; // R3 — KNOW-11a (see AdvisoryNode)
  readonly scope?: string; // R3 — KNOW-11a
  readonly predicateSlot?: PredicateSlot; // R3 — KNOW-15b nodeKey leg / KNOW-4g grouping
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
 * [PINNED — oracle-pin-map §1 blastRadius] The blast-radius reachability set + the region set both pin
 * to `readonly NodeKey[]` — the reverse-dep closure already lives in index axis-3, so the SET is the
 * honest carrier (no tighter shape in the reference). Under `exactOptionalPropertyTypes`, `regions?` is
 * genuinely absent-or-value.
 */
export interface TerritoryView {
  readonly path: string;
  readonly owner: string; // [FLAG] reference: `seat` (nominal seat id) — transcribed as string
  readonly tier: Tier;
  readonly files: readonly string[];
  readonly regions?: readonly NodeKey[]; // PINNED → NodeKey[] (region set)
  readonly blastRadius: readonly NodeKey[]; // PINNED → NodeKey[] (reachability set)
}

/**
 * The closed `predicateSlot` vocabulary (NORMATIVE). Transcribed EXACTLY — all 12 members — from
 * atlas-knowledge:166-179. The list is CLOSED: adding a slot is a spec revision that bumps the contract
 * version `cv` (atlas-knowledge:163). "Same topic" is decidable ONLY because this union is finite, which
 * is what lets `nodeKey` collide and force UPDATE/union instead of proliferating (atlas-knowledge:150).
 * Each slot binds to exactly one write template (KNOW-10) — see `template.ts`.
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
 *   - `check?`     — predicate candidates only (atlas-knowledge:127); pinned `Check`, see `PredicateNode`.
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
  readonly check?: Check; // PINNED → Check (predicate candidates only)
  readonly grounding: Grounding;
  readonly provenance: ClaimProvenance;
  readonly tier: Tier;
}

// ── frozen API surface, co-located here (was ref/evaluator.ts · ref/store.ts) ─────────────────────────
// These interfaces carry zero runtime; they live with the shared data model because EvaluatorApi is
// consumed by BOTH evaluator.ts and StoreApi, and StoreApi is consumed by evaluator.ts / archive.ts /
// router.ts (≥2 src consumers each). Housing them here keeps the impl files free of impl→impl imports.

/**
 * The pure predicate-check evaluator (KNOW-16, spec §3.2). A `PredicateNode.check` evaluates to
 * `HOLDS/BROKEN/NA` from Atlas-INDEX state ALONE — a deterministic query over the structural/dependency
 * axes or a pinned declarative assertion — with NO arbitrary code execution, NO sandbox, NO clock/IO
 * (same index state ⇒ same verdict). A check needing runtime/behavioral execution is OUT OF SCOPE for v0
 * and MUST stay advisory; the verdict feeds `atlas-reconcile`. (atlas-knowledge:66, 221-223)
 */
export interface EvaluatorApi {
  /** Evaluate a check against index state (KNOW-16). Deterministic + pure — no code-exec, no clock, no
   *  IO; same `indexState` ⇒ same verdict. Yields `HOLDS | BROKEN | NA` (a subset of `Status`; the
   *  `'advisory'` member is not an evaluator verdict — a runtime-requiring check is refused to advisory
   *  UPSTREAM, not returned here).
   *
   *  [PINNED — oracle-pin-map §1] KNOW-16's check ("a deterministic index-query or a pinned declarative
   *  assertion") is pinned to the ratified `Check` union (see `PredicateNode.check`).
   *
   *  [FLAG — `indexState` arg] Typed as the LOWER-layer `@atlas/index` `IndexNode` (the task's reserved
   *  index-query import — DAG-safe, index is below knowledge). The reference says "over the Atlas index
   *  (structural/dependency AXES)", which may be the multi-axis root set (`Axes`) rather than a single
   *  `IndexNode`; transcribed to the pinned `IndexNode` per the task, flagged for the WP to confirm the
   *  index-state granularity. */
  evaluate(check: Check, indexState: IndexNode): Status;
}

/**
 * Advisory-standalone operability (KNOW-9, spec §3.2). Both node families ship day-one, but with NO
 * evaluator wired the store is FULLY operable on advisory nodes alone (emit / query / reconcile all
 * succeed); the predicate family is present day-one, NOT deferred. (atlas-knowledge:36, 59, 200-201)
 *
 * [SIG-TBD — NO concrete signature frozen] method-tags-knw:78 describes "a reference store PARAMETRIZED
 * by `evaluator?=none`" that runs the full emit→query→reconcile cycle on advisory nodes with a null
 * evaluator, but freezes NO concrete store signature. The one FROZEN structural fact — the evaluator is
 * OPTIONAL — is transcribed below; the rest is flagged, NOT invented.
 */
export interface StoreApi {
  /** The predicate-check evaluator seam — OPTIONAL (KNOW-9). Absent (`evaluator?=none`) ⇒ the store
   *  operates on advisory nodes alone; a code path that HARD-REQUIRES an evaluator to operate on advisory
   *  fails the standalone cycle (method-tags-knw:79). Under `exactOptionalPropertyTypes`, genuinely
   *  absent-or-present.
   *
   *  [SIG-TBD] The full emit→query→reconcile operating surface is composed from the sibling facets
   *  (`emit.ts`, `reconcile.ts`, the query pack) — the aggregate store signature is not frozen; only the
   *  optional-evaluator parametrization is transcribed. Flagged. */
  readonly evaluator?: EvaluatorApi;
}
