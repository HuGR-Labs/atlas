// @atlas/tools — ref/types.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Layer 7: the PUBLIC tool / OKF surface — the Atlas's whole read/write API. The four governance tools
// are the ONLY write/read governance surface (TOOLS-1); everything else (diff / doctor / node) is a
// READ-ONLY projection of the same store, carrying NO write authority. This file carries the package's
// shared data model: the tool result records + the shipped `next+invariant` guidance envelope.
// Transcribed EXACTLY from `docs/reference/atlas-tools.md` §Data model (lines 14-26) + §Invariants
// TOOLS-1..16 + method-tags-tls.md down-models.
//
// [LEAD-RATIFIED] The shared vocabulary — `Pack`/`PackInvariant`/`InjectionKind`/`Budget`/`Hash`/
// `NodeKey`/`SubtreeHash`/`Territory` — lives in @atlas/contracts and is IMPORTED, NEVER redefined.
//
// [LEAD-RATIFIED / TOOLS-1 SACRED] The GOVERNANCE (write) surface is EXACTLY four tools — `atlas-init`,
// `atlas-query`, `atlas-emit`, `atlas-reconcile` — and the ONLY write path is `atlas-emit`. `atlas-diff`
// (TOOLS-16), `atlas doctor` (TOOLS-12), and the per-node projections (TOOLS-10) are read-only views;
// they are NOT modeled as a fifth governance/write tool anywhere in this package.

import type { Hash, Pack, Territory } from '@atlas/contracts';
import type { VersionDelta } from '@atlas/persist';

// Re-export the contracts-owned surface vocab so consumers can pull the whole dialect from the bare
// package root. Owned by @atlas/contracts — re-exported, NOT redefined.
export type { Hash, Pack, PackInvariant, Territory } from '@atlas/contracts';

/**
 * The closed governance-tool vocabulary — EXACTLY four, no more (TOOLS-1). Transcribed EXACTLY from
 * atlas-tools:15 — `Tool = 'atlas-init' | 'atlas-query' | 'atlas-emit' | 'atlas-reconcile'`. The ONLY
 * write path is `atlas-emit`; the other three are the read/derive governance surface. `atlas-diff` /
 * `atlas doctor` / `atlas node` are deliberately NOT members — they are read-only projections, not a
 * fifth governance tool.
 */
export type Tool = 'atlas-init' | 'atlas-query' | 'atlas-emit' | 'atlas-reconcile';

/**
 * The guidance envelope shipped with EVERY result (TOOLS-4). Transcribed EXACTLY from atlas-tools:16 —
 * `Guidance = { next: string, invariant: string }`: what to do next + which invariant governs, so the
 * caller is never left to guess the follow-up. Both fields MUST be non-empty on every path (§Acceptance).
 */
export interface Guidance {
  readonly next: string;
  readonly invariant: string;
}

/**
 * The total result wrapper (TOOLS-2 pure+total, TOOLS-4 guidance shipped). Transcribed EXACTLY from
 * atlas-tools:17 — `Verdict = { ok, data?, rejected?, guidance }`. A malformed argument fails CLOSED to
 * a structured rejected verdict — NEVER a throw. The one published schema (TOOLS-3) is byte-identical
 * over CLI and MCP.
 *
 * `data` is generic over the per-tool result record (`InitOut` / `QueryOut` / …). Under
 * `exactOptionalPropertyTypes`, `data?` / `rejected?` are genuinely present-on-ok / present-on-reject.
 */
export interface Verdict<T = unknown> {
  readonly ok: boolean;
  readonly data?: T;
  readonly rejected?: string;
  readonly guidance: Guidance; // TOOLS-4 — non-empty on every path
}

/**
 * `atlas-init` result (TOOLS-5). Transcribed EXACTLY from atlas-tools:19 —
 *   `InitOut = { territories: Territory[], blastRadius, t0Candidates: string[] }`.
 * The `$0`-LLM structural move-in: every territory ships at the `T2/advisory` default with ZERO
 * invariants; `t0Candidates` NAMES the T0-keyword territories FLAGGED but NOT promoted (§Acceptance §8.5/
 * §8.6 — a T0-keyword territory yields a candidate flag AND `tier=='T2'`). `Territory` is the
 * contracts-owned manifest shape (`{name,owner,tier,globs}`) — imported, not redefined.
 *
 * [SIG-TBD — `blastRadius` type] atlas-tools:19 names `blastRadius` with NO concrete type (the move-in's
 * blast-radius summary). No blast-radius shape is frozen in contracts/index at this seam, so it is
 * transcribed as `unknown` rather than invented; flagged for the owning WP.
 */
export interface InitOut {
  readonly territories: readonly Territory[]; // all at T2/advisory, ZERO invariants (TOOLS-5)
  readonly blastRadius: unknown; // [SIG-TBD] blast-radius summary — no concrete type frozen (atlas-tools:19)
  readonly t0Candidates: readonly string[]; // T0-keyword territory NAMES flagged, NOT promoted (A-6)
}

/**
 * `atlas-query` result (TOOLS-6). Transcribed EXACTLY from atlas-tools:20 — `QueryOut = Pack`: the merged
 * covering bounded pack (`≤ ~2K`, `tier≥T1`, stale-flagged). `Pack` is the contracts-owned injection
 * type — imported, NEVER redefined; a `stale:true` pack means re-ground before trusting (§6.1).
 */
export type QueryOut = Pack;

/**
 * `atlas-emit` result (TOOLS-7). Transcribed EXACTLY from atlas-tools:21 —
 *   `EmitOut = { emitted: boolean, id?, rejected?: string }`.
 * Fail-closed: a node whose grounding does not re-derive at `source@sha` ⇒ `emitted:false`, nothing
 * persisted, a structured `rejected`. On success, `id` is the CAS id of the persisted object.
 *
 * [FLAG — `id` = `Hash`] atlas-tools:21 leaves `id` untyped; it is the content-addressed CAS id of the
 * persisted object (mirrors the @atlas/knowledge `EmitApi.admit` receipt `id?: Hash`). Transcribed as
 * `Hash`. Under `exactOptionalPropertyTypes`, `id?` is absent-on-reject / present-on-emit.
 */
export interface EmitOut {
  readonly emitted: boolean;
  readonly id?: Hash; // [FLAG] CAS id of the persisted object — mirrors knowledge EmitApi.admit
  readonly rejected?: string; // structured fail-closed reason (TOOLS-7)
}

/**
 * One reviewable drift item (TOOLS-8). Transcribed EXACTLY from atlas-tools:24 —
 *   `DriftItem = { fact: string, class: 'mechanical'|'semantic', anchorWas, anchorNow }`.
 * The `DRIFTED` subset is presented as a reviewable `DriftItem[]` set, NEVER all-or-nothing. The
 * `mechanical`/`semantic` split is the @atlas-knowledge KNOW-5 classifier (referenced, NOT redefined).
 *
 * [SIG-TBD — `anchorWas` / `anchorNow` type] atlas-tools:24 names the old/new grounding anchors with NO
 * concrete type (a `path@subtreeHash`-flavored pointer — cf contracts `StructRef`). No anchor shape is
 * frozen at this result seam, so they are transcribed as `string` (the honest nominal form), NOT invented
 * as a `StructRef`. Flagged for the owning WP to confirm the anchor carrier.
 */
export interface DriftItem {
  readonly fact: string;
  readonly class: 'mechanical' | 'semantic'; // the KNOW-5 split (referenced, not redefined)
  readonly anchorWas: string; // [SIG-TBD] old anchor — no concrete type frozen (atlas-tools:24)
  readonly anchorNow: string; // [SIG-TBD] new anchor — no concrete type frozen (atlas-tools:24)
}

/**
 * `atlas-reconcile` result (TOOLS-8 / TOOLS-13). Transcribed EXACTLY from atlas-tools:22-23 —
 *   `ReconcileOut = { drift: DriftItem[], mechanical: string[], semantic: string[],
 *                     regroundedCount, reauthorCount, exitCode }`.
 * The exit-gate is deterministic: `exitCode == 2` ONLY when `|semantic| > 0` (block the merge on ANY
 * semantic flip — never a silent green there); a run whose drift is entirely `mechanical` exits `0`
 * (TOOLS-8). `reauthorCount` MUST equal `|semantic|` (never `|DRIFTED|`, never the whole store, A-4).
 * Under `--accept-reground`, `regroundedCount == |mechanical|` — auto-re-grounded in one pass, no human,
 * no block (TOOLS-13); each re-ground write still passes the `atlas-emit` fail-closed check (TOOLS-7).
 *
 * [NOTE — the task's "semanticCount"] the frozen §Data model carries the `semantic: string[]` SUBSET
 * (the drifted fact names); its cardinality (`semantic.length`) IS the semantic count. Transcribed as the
 * richer subset per the frozen reference, NOT collapsed to a bare count.
 */
export interface ReconcileOut {
  readonly drift: readonly DriftItem[]; // the reviewable set, never all-or-nothing (TOOLS-8)
  readonly mechanical: readonly string[]; // auto-re-groundable fact names (anchor moved, claim re-derives)
  readonly semantic: readonly string[]; // BROKEN fact names — blocks (exit 2)
  readonly regroundedCount: number; // == |mechanical| under --accept-reground (TOOLS-13)
  readonly reauthorCount: number; // == |semantic| (A-4) — never the whole store
  readonly exitCode: number; // 2 ONLY when |semantic|>0, else 0 (TOOLS-8) — reference names only {0,2}
}

/**
 * The hot-set size report against a budget (TOOLS-12). Transcribed EXACTLY from atlas-tools:25 —
 * `hotSet?: { size, budget, over: boolean }`: an ADVISORY size check — `over` flags an over-budget
 * hot-set. Read-only; `atlas doctor` persists nothing.
 */
export interface HotSet {
  readonly size: number;
  readonly budget: number;
  readonly over: boolean; // advisory over-budget flag (TOOLS-12)
}

/**
 * A guided re-ground / retire PLAN (TOOLS-12). `atlas doctor reground <fact>` returns a plan a human/agent
 * then runs through `atlas-emit` — it PERSISTS NOTHING itself (the store changes only when the plan is run
 * through the single write door). Carries NO write authority.
 *
 * [SIG-TBD — plan shape not frozen] atlas-tools names the guided re-ground/retire flow but freezes NO
 * concrete plan record (only that it emits via `atlas-emit`, never a direct store mutation). `fact` +
 * `action` are transcribed from the reference's "re-ground / retire" wording (TOOLS-12, surface :139);
 * the emittable payload is `unknown` rather than invented. Flagged for the owning WP.
 */
export interface RegroundPlan {
  readonly fact: string; // the drifted fact the plan targets
  readonly action: 'reground' | 'retire'; // the guided flow (TOOLS-12 "re-ground / retire")
  readonly emit: unknown; // [SIG-TBD] the templated payload to run through atlas-emit — shape not frozen
}

/**
 * `atlas doctor` result (TOOLS-12). Transcribed EXACTLY from atlas-tools:25 —
 *   `DoctorOut = { archive?, whyBroken?, hotSet?: { size, budget, over }, plan?: RegroundPlan }`.
 * READ-ONLY + advisory: archive browse / drift-explain / hot-set report / guided re-ground plan. It
 * persists nothing; any proposed write funnels through `atlas-emit`. NOT a fifth governance tool (the
 * write surface stays exactly four — TOOLS-1).
 *
 * [SIG-TBD — `archive` / `whyBroken` types] atlas-tools:25 names both with NO concrete type — `archive` =
 * the monotone supersede-lineage view; `whyBroken` = the drift-explain (which anchor drifted, mechanical
 * vs semantic). No concrete shape is frozen at this seam, so both are transcribed as `unknown`, NOT
 * invented. Flagged for the owning WP.
 */
export interface DoctorOut {
  readonly archive?: unknown; // [SIG-TBD] monotone archive / supersede-lineage view — no concrete type
  readonly whyBroken?: unknown; // [SIG-TBD] drift-explain view — no concrete type frozen (atlas-tools:25)
  readonly hotSet?: HotSet; // hot-set size vs budget (advisory)
  readonly plan?: RegroundPlan; // guided re-ground/retire plan — emits via atlas-emit, never direct
}

/**
 * `atlas-diff` result (TOOLS-16). The read-only PERSIST-14 version-delta projection —
 * `{added, edited, superseded, decayed}`, each entry carrying its provenance. `VersionDelta` is the
 * @atlas/persist-owned shape (`ref/diff.ts`) — IMPORTED, NEVER redefined here. `atlas-diff` is a READ
 * projection like the per-node handler (TOOLS-10) / `atlas doctor` (TOOLS-12): 0 write path, carries NO
 * write authority; the governance write surface stays exactly four (TOOLS-1/16).
 */
export type DiffOut = VersionDelta;
