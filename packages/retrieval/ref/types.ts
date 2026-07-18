// @atlas/retrieval — ref/types.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Layer 5: the retrieval-local data model — bounded packs / OwnPack / poke / injection budget. The
// retrieval layer decides WHAT knowledge reaches a worker AND WHEN, with no embeddings and no RAG
// (A-14): relevance is resolved purely by the deterministic hashed structural index over scope /
// dependency / trigger. Transcribed EXACTLY from `docs/reference/atlas-retrieval.md` §Data model
// (lines 15-47) + method-tags-ret.md.
//
// The SHARED injection vocabulary — `Pack`, `PackInvariant`, `InjectionKind`, `Budget` — ALREADY lives
// in @atlas/contracts (it is the dialect that breaks the retrieval⟷memory cycle: both speak it without
// importing each other). It is IMPORTED here, NEVER redefined.
//
// [LEAD-RATIFIED] Retrieval OWNS pack / budget / drop mechanics and does NOT depend on @atlas/memory
// (the cycle was broken memory→retrieval). No memory type is imported anywhere in this package.
//
// [LEAD-RATIFIED] `ppr` is a STORED numeric FIELD read here for ranking (RETR-11), NOT a call into
// genesis — typed `ppr: number` on `RelatedFact`.

import type { Hash, NodeKey, Tier } from '@atlas/contracts';
import type { Pack, PackInvariant } from '@atlas/contracts';
import type { GroundedFact } from '@atlas/knowledge';

// Re-export the contracts-owned injection vocabulary so consumers of the retrieval surface can pull the
// whole dialect from the bare package root. Owned by @atlas/contracts — re-exported, NOT redefined.
export type { Pack, PackInvariant, InjectionKind, Budget } from '@atlas/contracts';

/**
 * [FLAG — reference names `Path`; no contracts `Path` brand exists] atlas-retrieval:167-172 types
 * `scope` / `unit` as `Path`. @atlas/contracts exposes no `Path` type, so it is transcribed as the
 * underlying `string` (the same discipline contracts applied to `Territory.owner` / `Territory.globs`).
 * NOT invented as a new exported brand. Flagged for a `Path` type to be sourced if one is ratified.
 */
export type Path = string;

/**
 * The scope-unit `level` vocabulary. Transcribed EXACTLY from atlas-retrieval:22 —
 *   `level ∈ crate|module|service|feature`. The list is closed here; an `epic` is deliberately NOT a
 * grounded `own` level (RETR-12: it is a project-memory goal, not a grounded node).
 */
export type OwnLevel = 'crate' | 'module' | 'service' | 'feature';

/**
 * The relation-kind partition (RETR-10). Transcribed from atlas-retrieval:33-41 / 120-126 — the closed
 * set of bands `relate()` partitions a closure into; `coChanged` is opt-in + labeled, never mixed into
 * the structural bands.
 */
export type RelationKind =
  | 'enclosing'
  | 'dependents'
  | 'dependencies'
  | 'governing'
  | 'coChanged';

/**
 * The handle behind an `own_<id>` tool (RETR-12). Transcribed EXACTLY from atlas-retrieval:22 —
 *   `OwnUnit = { level, id, grounding }`.
 *
 * [SIG-TBD — `id` type] The reference gives `id` no concrete type (the unit identity behind the tool
 * name `own_<id>`). Transcribed as `string`, NOT invented as a brand.
 *
 * [SIG-TBD — `grounding` type] The reference names `grounding` with no concrete type; it is the
 * groundedness handle (tree for crate/module, declared manifest for service/feature — RETR-12).
 * @atlas/grounding is NOT a declared dependency of this package, so it is transcribed as `unknown`
 * rather than imported/invented. Flagged for the owning WP.
 */
export interface OwnUnit {
  readonly level: OwnLevel;
  readonly id: string; // [SIG-TBD] unit identity behind `own_<id>` — reference gives no concrete type
  readonly grounding: unknown; // [SIG-TBD] groundedness handle — grounding not a dep, not imported
}

/**
 * A precomputed related node in a `RelationSet` band. Transcribed EXACTLY from atlas-retrieval:42 —
 *   `RelatedFact = { nodeId, relation, distance, tier, ppr, claim, stale }`.
 *   - `distance` — closure hops from the touched unit.
 *   - `ppr`      — [LEAD-RATIFIED] a STORED numeric importance field (GEN-11), read here for ranking
 *                   (RETR-11); NOT a call into genesis.
 */
export interface RelatedFact {
  readonly nodeId: NodeKey;
  readonly relation: RelationKind;
  readonly distance: number; // closure hops from the touched unit
  readonly tier: Tier;
  readonly ppr: number; // [LEAD-RATIFIED] stored precomputed importance (GEN-11) — a field, not a call
  readonly claim: string;
  readonly stale: boolean;
}

/**
 * How a reverse closure was bounded — the honest total-vs-returned receipt (RETR-11). Transcribed
 * EXACTLY from atlas-retrieval:43 —
 *   `BoundMeta = { maxHops, rank: 'tier-desc,ppr-desc,distance-asc,nodeKey-asc', total, returned,
 *                  truncated }`.
 * `rank` is transcribed as the exact frozen literal (the deterministic total rank of RETR-11).
 */
export interface BoundMeta {
  readonly maxHops: number;
  readonly rank: 'tier-desc,ppr-desc,distance-asc,nodeKey-asc';
  readonly total: number; // full pre-truncation count (honest)
  readonly returned: number;
  readonly truncated: boolean;
}

/**
 * "What relates to what I'm touching" — deterministic, pre-partitioned by relation kind (RETR-10).
 * Transcribed EXACTLY from atlas-retrieval:33-41 —
 *   `RelationSet = { unit, enclosing, dependents, dependents_meta, dependencies, governing, coChanged? }`.
 *   - `unit`            — the touched unit (path / changed AST unit).
 *   - `enclosing`       — spatial roll-up: file → module → crate.
 *   - `dependents`      — REVERSE closure (blast radius), BOUNDED + ranked + truncated (RETR-11).
 *   - `dependents_meta` — how that reverse closure was bounded (honest total vs returned).
 *   - `dependencies`    — FORWARD closure ("built on these contracts").
 *   - `governing`       — territory rule(s): owner + tier over the unit.
 *   - `coChanged?`      — git-history co-change: deterministic but correlational; opt-in + labeled.
 */
export interface RelationSet {
  readonly unit: Path;
  readonly enclosing: readonly PackInvariant[];
  readonly dependents: readonly RelatedFact[];
  readonly dependents_meta: BoundMeta;
  readonly dependencies: readonly RelatedFact[];
  readonly governing: readonly PackInvariant[];
  readonly coChanged?: readonly RelatedFact[]; // opt-in, labeled; never mixed into the structural bands
}

/**
 * A CURATED, zero-assembly briefing for the unit you own (RETR-12) — composed MECHANICALLY (index
 * reads), never by an LLM, never free prose. Transcribed EXACTLY from atlas-retrieval:23-31 —
 *   `OwnPack = { unit, invariants, shape, edges, gotchas, memory, drill }`.
 *
 * [FLAG — `unit` is a 1-line role, not an `OwnUnit`] atlas-retrieval:24 annotates `unit` as "1-line role
 * (from a `definition` fact / terrain)" — a rendered role line, transcribed as `string`. (Distinct from
 * `RelationSet.unit`, which is a touched-unit path.)
 *
 * [SIG-TBD — `shape` / `edges`] The reference gives no concrete type: `shape` = terrain (contents +
 * owner + tier, atlas-retrieval:26); `edges` = a bounded blast summary from `relate()` (key dependents /
 * dependencies, atlas-retrieval:27). Transcribed as `unknown` rather than invented; flagged.
 *
 * [FLAG — `gotchas` typed to knowledge `GroundedFact`] atlas-retrieval:28 leaves `gotchas` untyped ("the
 * non-obvious slots (gotcha / rationale)"); those slots ARE knowledge facts (the `gotcha` / `rationale`
 * PredicateSlots). Transcribed as `readonly GroundedFact[]` — the pack-contents source per the declared
 * @atlas/knowledge seam. Flagged for the reference to freeze the field type.
 *
 * [FLAG — `memory` is upward, do NOT import] atlas-retrieval:29 = "project-Rules scoped here + recent
 * lesson POINTERS (consultable, not inlined)". Memory is a HIGHER layer and retrieval MUST NOT depend on
 * @atlas/memory ([LEAD-RATIFIED], cycle broken memory→retrieval). Transcribed as `unknown` — a pointer
 * bag — NEVER a memory type. Flagged.
 */
export interface OwnPack {
  readonly unit: string; // [FLAG] a 1-line role line (atlas-retrieval:24), not an OwnUnit
  readonly invariants: readonly PackInvariant[]; // top tier≥T1 of the unit, ranked, capped
  readonly shape: unknown; // [SIG-TBD] terrain: contents + owner + tier
  readonly edges: unknown; // [SIG-TBD] bounded blast summary from relate()
  readonly gotchas: readonly GroundedFact[]; // [FLAG] gotcha/rationale slots — knowledge facts
  readonly memory: unknown; // [FLAG] upward memory-owned pointers — NOT a memory type, never imported
  readonly drill: OwnDrill;
}

/**
 * Progressive-disclosure affordances on an `OwnPack` (RETR-12) — more detail is PULL-reachable, never
 * inlined. Transcribed EXACTLY from atlas-retrieval:30 —
 *   `drill = { finer: OwnUnit[], refresh, complement }`.
 *
 * [SIG-TBD — `refresh` / `complement`] The reference gives no concrete type: `refresh` = re-poke;
 * `complement` = a `relate()` affordance. Transcribed as `unknown` rather than invented; flagged.
 */
export interface OwnDrill {
  readonly finer: readonly OwnUnit[]; // finer scope-units
  readonly refresh: unknown; // [SIG-TBD] re-poke affordance
  readonly complement: unknown; // [SIG-TBD] relate() affordance
}

/**
 * A poke: pushed on scope-entry (RETR-4). Transcribed EXACTLY from atlas-retrieval:19 —
 *   `Poke = { scope, pack, notice }`  — `notice` ≤ ~150 tokens (the compact push notice).
 *
 * [FLAG — `notice` type] The reference gives no concrete type; it is the compact ≤~150-token push
 * notice (under the pinned cap measure). Transcribed as `string`.
 */
export interface Poke {
  readonly scope: Path;
  readonly pack: Pack;
  readonly notice: string; // [FLAG] compact push notice ≤ ~150 tokens (pinned cap measure)
}

/**
 * One MCP tool per covering node, dynamic (RETR-5). Transcribed EXACTLY from atlas-retrieval:20 —
 *   `NodeTool = { nodeId, scope, schema }`.
 *
 * [SIG-TBD — `schema` type] The reference gives no concrete type: the MCP tool schema for a covering
 * node. Transcribed as `unknown` rather than invented (no MCP tool-schema shape is frozen here).
 */
export interface NodeTool {
  readonly nodeId: NodeKey;
  readonly scope: Path;
  readonly schema: unknown; // [SIG-TBD] MCP tool schema — shape not frozen
}

/**
 * The MISS-oracle per-territory coverage ledger (RETR-13). Transcribed EXACTLY from atlas-retrieval:47 —
 *   `OffAtlas = { territory, served, offAtlasReads, offAtlasRate }`.
 *   - `served`        — served turns for this territory.
 *   - `offAtlasReads` — turns with a Read/Grep OUTSIDE the surfaced scope-set.
 *   - `offAtlasRate`  — `offAtlasReads / served`; a territory with no served history yields `0` (never
 *                        a throw). Measures COVERAGE (the silent failure the drift-oracle cannot see).
 *
 * [FLAG — `territory` type] transcribed as `string` (the territory NAME / governance key), matching the
 * `Pack.territory` key discipline in @atlas/contracts.
 */
export interface OffAtlas {
  readonly territory: string; // [FLAG] territory name / governance key
  readonly served: number;
  readonly offAtlasReads: number;
  readonly offAtlasRate: number;
}
