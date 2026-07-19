// @atlas/grounding — src/types.ts  (frozen data model + co-located API interfaces; zero runtime)
//
// Layer 3 trust primitive: the content-addressed grounding receipt (`Grounding`/`GroundingEntry`) plus
// the frozen API interfaces shared by ≥2 impl files or held as public surface (GroundApi/DriftApi/
// GateApi/AnchorApi + the InterfaceRState seam). `StructRef`/`Freshness`/`Status` are the canonical
// layer-0 vocabulary owned by @atlas/contracts — imported, NEVER redefined here.

import type { StructRef, Freshness, Status } from '@atlas/contracts';
import type { Axes, Rollup } from '@atlas/index';

/**
 * The content-addressed grounding receipt. Transcribed EXACTLY from atlas-grounding:38:
 *   `Grounding = { entries: GroundingEntry[] }`  — sorted by anchor.
 * A `Grounding` is real iff it has ≥1 entry and every entry carries a non-empty `subtreeHash`
 * (GROUND-2); an ungrounded grounding MUST NOT ever be FRESH.
 */
export interface Grounding {
  readonly entries: readonly GroundingEntry[];
}

/**
 * One anchor in a grounding receipt. Transcribed EXACTLY from atlas-grounding:39-43:
 *   - `anchor`       — THE DRIFT ORACLE: a `StructRef` whose `subtreeHash` is the hash of the
 *     normalized structural unit (GROUND-1). Owned by @atlas/contracts.
 *   - `path`         — repo-relative, for humans/navigation.
 *   - `displayLines?`— OPTIONAL nav hint ("42-50") — NEVER the drift oracle (GROUND-1). Under
 *     `exactOptionalPropertyTypes` the field is genuinely absent-or-string, never `undefined`.
 */
export interface GroundingEntry {
  readonly anchor: StructRef;
  readonly path: string;
  readonly displayLines?: string;
}

// ── frozen API surface, co-located here (was ref/ground.ts · ref/drift.ts · ref/gate.ts · ref/anchor.ts) ─
// These interfaces carry zero runtime; they live with the shared data model because GroundApi / DriftApi /
// GateApi are each consumed by ≥2 src files (gate.ts / drift.ts / freshness.ts / emit-guard.ts), and
// AnchorApi is public surface with no impl in any src file.

/**
 * The structural anchor resolver — block-vs-file granularity (GROUND-1, GROUND-12). Resolves a
 * grounding entry to its `StructRef`, whose `subtreeHash` is the sole drift oracle; `displayLines`
 * and line-ranges NEVER participate. For a parseable policy artifact a repo/project rule keys on the
 * heading/section BLOCK `subtreeHash` (a block-level CAS node), reserving the whole-file byte-hash for
 * genuinely non-parseable files (GROUND-12). (atlas-grounding:44, 105-115; method-tags-grd:26-28, 100-105)
 */
export interface AnchorApi {
  /** Resolve a grounding entry to its structural anchor. The drift oracle is `anchor.subtreeHash`
   *  alone — `displayLines`/line-ranges are ignored, a line-range-only ref is rejected as invalid
   *  (GROUND-1). Block-vs-file granularity for policy artifacts (GROUND-12). (atlas-grounding:44)
   *
   *  [FLAG — reference tension, return type] The task inventory pins `resolveAnchor(entry): StructRef`
   *  (transcribed here). The method-tags-grd:27 DOWN reference-model instead names
   *  `resolveAnchor(entry)=entry.anchor.subtreeHash` (a bare `SubtreeHash`). Transcribed to the task's
   *  `StructRef` return (the richer surface — the `subtreeHash` is reachable as `.subtreeHash`); flagged
   *  for the two sources to reconcile whether the resolver returns the `StructRef` or just its oracle. */
  resolveAnchor(entry: GroundingEntry): StructRef;
}

/**
 * The anchor builder + the real-grounding predicate. `ground(node, src)` re-derives the anchor@src,
 * dropping unresolvable entries (fail-closed, never throws — GROUND-3). `isGrounded(g)` is the
 * real-grounding predicate: ≥1 entry AND every entry carries a non-empty `subtreeHash` (GROUND-2); an
 * ungrounded grounding is NEVER FRESH. Both pure + total. (atlas-grounding:128, 130, 79-82;
 * method-tags-grd:30-42)
 */
export interface GroundApi {
  /** Re-derive the grounding anchor for `node` against source-of-truth `src`; an unresolvable citation
   *  (unit gone, path absent) is DROPPED, never throws — fail-closed (GROUND-3). Pure + total.
   *  (atlas-grounding:128)
   *
   *  [PIN — `src` = built-index `Axes`] Owner DEFINE 2026-07-18 (oracle-pin-map §5). `src` is the
   *  built-index snapshot the anchor is re-derived against, consistent with `driftDetect`.
   *  [SIG-TBD — `node`] the reference (atlas-grounding:128) gives `node` no concrete shape; §5 pinned
   *  ONLY `src`, so `node` stays opaque here — the groundable-unit type is the owning WP's to pin from
   *  its reference, NOT guessed (do not import the upward `GroundedFact` — that inverts the DAG). */
  ground(node: unknown, src: Axes): Grounding;

  /** Real-grounding predicate: `true` iff `g` has ≥1 entry AND every entry's `anchor.subtreeHash` is
   *  non-empty (GROUND-2). An empty/partial grounding fails the predicate and MUST never surface FRESH.
   *  Pure + total. (atlas-grounding:130) */
  isGrounded(g: Grounding): boolean;
}

/**
 * The GROUND-11 interface-fold seam — the dependency-axis `rState` grounding consumes from the lower
 * index layer (INDEX-12). A reference to the index `Rollup`'s STATE root (`rState` = BLAKE3 over
 * hash‖status‖freshness), NOT a redefinition. GROUND-11 folds the forward-closure's INTERFACE-level
 * `rState` — the type/contract-relevant structure — so a callee whose SIGNATURE changed drifts its
 * callers while a pure-body refactor does not. Owned by @atlas/index (`Rollup.rState`, atlas-index:43).
 */
export type InterfaceRState = Rollup['rState'];

/**
 * Drift detection: the interface-fold freshness oracle (GROUND-11) + the advisory→STALE router
 * (GROUND-13). `driftDetect(grounding, src)` is FRESH iff every anchor's `subtreeHash` matches AND the
 * forward-closure's INTERFACE/signature-level `rState` is unchanged — folding the callee's INTERFACE
 * on the dependency axis (INDEX-12), NOT its full body: a signature/contract change DRIFTS every
 * caller, a pure behavior-preserving body refactor drifts none. An ADVISORY fact's drift resolves to
 * `STALE` (non-blocking, served-with-flag), never `DRIFTED` and never either arm of the KNOW-5 split.
 * Pure + total; freshness is a STRUCTURAL predicate, NEVER a truth claim (FRESH ≠ true).
 * (atlas-grounding:97-104, 116-123, 129; method-tags-grd:93-98, 107-112)
 */
export interface DriftApi {
  /** Freshness verdict for a grounding against source-of-truth `src`. FRESH iff every anchor's
   *  `subtreeHash` matches AND the forward-closure INTERFACE `rState` is unchanged (GROUND-11); an
   *  ungrounded/unresolvable grounding is DRIFTED (GROUND-2/3); an ADVISORY fact's drift resolves to
   *  `STALE`, not `DRIFTED` (GROUND-13). Never asserts the claim is true. Pure + total.
   *  (atlas-grounding:129)
   *
   *  [PIN — `src` = built-index snapshot `Axes`] Owner DEFINE 2026-07-18 (oracle-pin-map §5): `src` is
   *  the BUILT-index snapshot drift re-checks against — the carrier of the forward-closure interface-
   *  `rState` GROUND-11 folds (see `InterfaceRState`), which rides on the index nodes — NOT the raw
   *  `FileTree`. Pinned to `@atlas/index` `Axes` (the rolled-up axis-views bearing `rState` per node).
   *
   *  [FLAG — GROUND-13 advisory router, upward-owned discriminant] The advisory→`STALE` vs
   *  predicate→(KNOW-5 split) routing keys on the fact's `kind` ('advisory' | 'predicate'), a
   *  discriminant carried by the knowledge-layer `Fact` — an UPWARD-owned type this layer-3 module MUST
   *  NOT import (would invert the DAG). `driftDetect` returns the raw structural `Freshness`; where the
   *  advisory/predicate split is applied over a `Fact.kind` is left to the knowledge layer (KNOW-5).
   *  Flagged — not modeled here as an arg, to avoid inverting the DAG. */
  driftDetect(grounding: Grounding, src: Axes): Freshness;
}

/**
 * The truth-gate (GROUND-4, spec A-1). `gateHolds` serves `HOLDS` iff (grounded ∧ FRESH), else `NA`;
 * it is DOWNGRADE-ONLY — it passes every non-`HOLDS` verdict through unchanged and only ever downgrades
 * `HOLDS`→`NA`, never upgrades, and is idempotent. An `untrusted`-source claim is advisory and EXCLUDED
 * from the gate's inputs (GROUND-8, spec A-9) — it can never contribute a `HOLDS`. Pure + total: no
 * clock, no IO, no global state, no throw. (atlas-grounding:131, 136, 83-93; method-tags-grd:44-49, 72-77)
 */
export interface GateApi {
  /** Truth-gate a candidate verdict: `HOLDS` only if its `grounding` is grounded ∧ drift-FRESH against
   *  `src`, else downgraded to `NA` (GROUND-4). Downgrade-only + idempotent: a non-`HOLDS` verdict
   *  passes through unchanged. An `untrusted`-source candidate is excluded (GROUND-8). (atlas-grounding:131)
   *
   *  [FLAG — `candidate` arg, upward-owned] The reference names `gateHolds(candidate, grounding, src)`.
   *  The `candidate` carries the incoming `Status` verdict AND the `source` provenance the GROUND-8
   *  filter keys on ('untrusted' → excluded) — both fields of the knowledge-layer `Candidate`/`Fact`,
   *  an UPWARD-owned type this layer-3 module MUST NOT import (would invert the DAG). Transcribed as
   *  `unknown` rather than invented; flagged for the knowledge layer to supply the concrete shape.
   *
   *  [PIN — `src` = built-index `Axes`] Owner DEFINE 2026-07-18 (oracle-pin-map §5): the source-of-truth
   *  snapshot drift is re-checked against is the built-index `@atlas/index` `Axes`, consistent with
   *  `driftDetect`/`ground`. (`candidate` stays `unknown` — upward-owned, see FLAG above.) */
  gateHolds(candidate: unknown, grounding: Grounding, src: Axes): Status;
}
