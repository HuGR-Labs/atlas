// @atlas/grounding — ref/drift.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Drift detection: the interface-fold freshness oracle (GROUND-11) + the advisory→STALE router
// (GROUND-13). `driftDetect(grounding, src)` is FRESH iff every anchor's `subtreeHash` matches AND the
// forward-closure's INTERFACE/signature-level `rState` is unchanged — folding the callee's INTERFACE
// on the dependency axis (INDEX-12), NOT its full body: a signature/contract change DRIFTS every
// caller, a pure behavior-preserving body refactor drifts none. An ADVISORY fact's drift resolves to
// `STALE` (non-blocking, served-with-flag), never `DRIFTED` and never either arm of the KNOW-5 split.
// Pure + total; freshness is a STRUCTURAL predicate, NEVER a truth claim (FRESH ≠ true).
// (atlas-grounding:97-104, 116-123, 129; method-tags-grd:93-98, 107-112)

import type { Freshness } from '@atlas/contracts';
import type { Axes, Rollup } from '@atlas/index';
import type { Grounding } from './types.js';

/**
 * The GROUND-11 interface-fold seam — the dependency-axis `rState` grounding consumes from the lower
 * index layer (INDEX-12). A reference to the index `Rollup`'s STATE root (`rState` = BLAKE3 over
 * hash‖status‖freshness), NOT a redefinition. GROUND-11 folds the forward-closure's INTERFACE-level
 * `rState` — the type/contract-relevant structure — so a callee whose SIGNATURE changed drifts its
 * callers while a pure-body refactor does not. Owned by @atlas/index (`Rollup.rState`, atlas-index:43).
 */
export type InterfaceRState = Rollup['rState'];

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
