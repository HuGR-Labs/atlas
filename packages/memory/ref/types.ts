// @atlas/memory — ref/types.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Layer 6: the per-member (per-seat + orchestrator) Memory kind — the member's own craft of DOING the
// work. Memory shares the ONE Atlas with Knowledge (same hashed index, same grounding primitive, same
// templated-write rule, same portable export) but is a DISTINCT kind, never conflated (MEM-2). This file
// carries the package's shared data model: the four templated entry types + the store envelope.
// Transcribed EXACTLY from `docs/reference/atlas-memory.md` §Data model (lines 13-107) +
// `docs/spec/memory.md` §2-4 + method-tags-mem.md down-models.
//
// [LEAD-RATIFIED] memory→retrieval is the ALLOWED edge (the RET⟷MEM cycle is broken by memory importing
// retrieval, NOT the reverse). Memory MAY import @atlas/retrieval; retrieval MUST NOT import @atlas/memory.
//
// [LEAD-RATIFIED] The shared injection vocabulary — `Pack`, `PackInvariant`, `InjectionKind`, `Budget`,
// `Hash`, `NodeKey`, `SubtreeHash` — lives in @atlas/contracts and is IMPORTED, NEVER redefined here.

import type { StructRef } from '@atlas/contracts';
import type { GroundedFact } from '@atlas/knowledge';

// Re-export the contracts-owned injection vocabulary so consumers can pull the whole dialect from the
// bare package root. Owned by @atlas/contracts — re-exported, NOT redefined.
export type { InjectionKind, Budget, Pack, PackInvariant } from '@atlas/contracts';

/**
 * A member identity — a seat (`charlie` / `lucy` / `jimmy` / …) OR the orchestrator. Every member owns
 * its own private, decaying Memory (atlas-memory:7-11). [SIG-TBD — no member-id brand frozen] The
 * reference names members by seat-string; no contracts brand exists, so transcribed as `string`, NOT
 * invented as a new brand. Flagged for a `MemberId` brand to be sourced if one is ratified.
 */
export type MemberId = string;

/**
 * The four Memory types (atlas-memory:17-25). The load-bearing axis is HOW each is accessed:
 * `project` is INJECTED (never queried); `task` / `pr` / `logbook` are CONSULTABLE (never auto-injected —
 * MEM-4). `logbook` is orchestrator-only (v0). This is the per-ENTRY discriminant; the store-partition
 * discriminant (Memory vs Knowledge, MEM-2) is `AtlasKind` in ref/kinds.ts — a distinct axis.
 */
export type MemoryKind = 'task' | 'pr' | 'project' | 'logbook';

/**
 * A grounding / provenance pointer (atlas-memory:76, 104; spec/memory:104). The reference names this
 * `Ref` — "a path@subtreeHash / PR / commit pointer".
 *
 * [SIG-TBD — `Ref` not frozen as a concrete type in contracts] @atlas/contracts freezes only `StructRef`
 * (the `path@subtreeHash` grounding-anchor leg). The PR / commit / ADR-URL leg has no frozen shape, so it
 * is transcribed as the underlying `string` (the same discipline retrieval applied to `Path = string`).
 * `Ref` is thus the honest superset: a structured grounding anchor OR a bare pointer string. NOT invented
 * as a new exported brand; flagged for a `Ref` type to be sourced if one is ratified.
 */
export type Ref = StructRef | string;

/**
 * `project` memory — the STRICTEST template because it is INJECTED on every turn (atlas-memory:72-80,
 * spec/memory:101-106). Transcribed EXACTLY from atlas-memory:72-80.
 *   - `rule`      — ONE imperative line ("always X" / "never Y"). No narrative.
 *   - `scope`     — when it applies (path glob / tool / phase) — makes it role-relevant.
 *   - `grounding` — OPTIONAL pointer that earns the rule its place.
 *   - `frecency`  — the ranking key: a single TIME-DECAYED score of logged CITED hits (MEM-7).
 *
 * [FLAG — `frecency` supersedes the spec's `hits`] The canonical reference (atlas-memory:76-79, MEM-7)
 * stores `frecency: number` (one decayed score), REPLACING the older spec/memory:105 `hits: number` +
 * separate window. Transcribed as `frecency` per the drift-checked canonical reference.
 */
export interface ProjectMemoryEntry {
  readonly rule: string;
  readonly scope: string;
  readonly grounding?: Ref; // OPTIONAL pointer (path@subtreeHash / PR / commit) — earns the rule its place
  readonly frecency: number; // [FLAG] one time-decayed cited-hit score (MEM-7), supersedes spec `hits`
}

/**
 * `task` memory — richer, consultable (atlas-memory:87, spec/memory:119). Transcribed EXACTLY:
 *   `TaskMemoryEntry = { taskId, attempted[], failedWith[], stoppedAt, lesson, ref? }`.
 * The `{ attempted, failedWith, stoppedAt, lesson }` subset is the CLOSING FOLD auto-recalled at re-spawn
 * (MEM-13, see ref/respawn.ts).
 *
 * [SIG-TBD — element types] The reference lists `attempted[]` / `failedWith[]` as arrays with no element
 * type; transcribed as `readonly string[]` (structured terse lines under the per-entry char cap), NOT a
 * concrete record. `taskId` / `stoppedAt` / `lesson` transcribed as `string`.
 */
export interface TaskMemoryEntry {
  readonly taskId: string;
  readonly attempted: readonly string[]; // [SIG-TBD] element type not frozen — terse lines
  readonly failedWith: readonly string[]; // [SIG-TBD] element type not frozen — terse lines
  readonly stoppedAt: string;
  readonly lesson: string;
  readonly ref?: Ref;
}

/**
 * `pr` memory — richer, consultable (atlas-memory:88, spec/memory:120). Transcribed EXACTLY:
 *   `PrMemoryEntry = { prId, decisions[], reviewOutcomes[], knowledgeDelta[], ref? }`.
 *
 * [FLAG — `knowledgeDelta` typed to knowledge `GroundedFact`] The reference leaves `knowledgeDelta[]`
 * untyped ("the knowledge-delta it produced", atlas-memory:20). That delta IS the shared-Knowledge change
 * the PR produced — knowledge facts — so it is transcribed as `readonly GroundedFact[]` per the declared
 * @atlas/knowledge seam (same discipline retrieval used for `gotchas`). Flagged for the reference to
 * freeze the field type.
 *
 * [SIG-TBD — `decisions` / `reviewOutcomes` element types] no element type frozen → `readonly string[]`.
 */
export interface PrMemoryEntry {
  readonly prId: string;
  readonly decisions: readonly string[]; // [SIG-TBD] element type not frozen — terse lines
  readonly reviewOutcomes: readonly string[]; // [SIG-TBD] element type not frozen — terse lines
  readonly knowledgeDelta: readonly GroundedFact[]; // [FLAG] the Knowledge delta — knowledge facts
  readonly ref?: Ref;
}

/**
 * `logbook` — the orchestrator's decision journal (atlas-memory:96-104, spec/memory:133-143). Transcribed
 * EXACTLY. Fixed index fields + one prose block per FIXED section (never a free-form dump — MEM-5/8).
 * Consultable, never injected; append-only; a later entry supersedes by LINK, never by rewriting.
 *
 * [SIG-TBD — `at` type] the timestamp/ordering key has no frozen type; transcribed as `string` (an
 * ISO/label), NOT a wall-clock brand (MEM-7/frecency decay is ledger-driven, not wall-clock).
 * The five prose sections are `string` (prose confined WITHIN its fixed section — MEM-8).
 */
export interface LogbookEntry {
  readonly prId: string;
  readonly at: string; // [SIG-TBD] ordering/timestamp key — no frozen type
  readonly territories: readonly string[]; // structured index field — keeps it navigable
  readonly shipped: string; // prose within section
  readonly decisions: string; // prose within section — the key decisions AND WHY (the core)
  readonly tradeoffs: string; // prose within section
  readonly risks: string; // prose within section
  readonly openThreads: string; // prose within section
  readonly links: readonly Ref[]; // PR, ratified facts, ADRs, superseded prior entries
}

/** The templated-write union — every Memory write fills exactly one of these (MEM-5). */
export type MemoryEntry = ProjectMemoryEntry | TaskMemoryEntry | PrMemoryEntry | LogbookEntry;

/**
 * The owner-tagged store envelope over the ONE Atlas store. `owner` is the frozen scoping key MEM-1's
 * `injectFor` filters on; `kind` is the MEM-2 partition discriminant; `entry` is the templated payload.
 *
 * [SIG-TBD — full envelope not frozen] The reference gives no concrete store record beyond the
 * owner-scoped, kind-partitioned entry (Memory is a git-native projection over the CAS/log — MEM-9/10).
 * Additional legs (archived flag, version pointer) ride the versioned record, not frozen here → the
 * envelope carries only the three grounded fields; extra state is NOT invented.
 */
export interface MemoryRecord {
  readonly owner: MemberId; // MEM-1 scoping key — `injectFor` filters by owner
  readonly kind: MemoryKind; // MEM-2 discriminant
  readonly entry: MemoryEntry;
}

/** The member's Memory as a flat owner-scoped collection over the single store (MEM-9/10 git-native). */
export type MemoryStore = readonly MemoryRecord[];
