// @atlas/grounding — ref/gate.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The truth-gate (GROUND-4, spec A-1). `gateHolds` serves `HOLDS` iff (grounded ∧ FRESH), else `NA`;
// it is DOWNGRADE-ONLY — it passes every non-`HOLDS` verdict through unchanged and only ever downgrades
// `HOLDS`→`NA`, never upgrades, and is idempotent. An `untrusted`-source claim is advisory and EXCLUDED
// from the gate's inputs (GROUND-8, spec A-9) — it can never contribute a `HOLDS`. Pure + total: no
// clock, no IO, no global state, no throw. (atlas-grounding:131, 136, 83-93; method-tags-grd:44-49, 72-77)

import type { Status } from '@atlas/contracts';
import type { Axes } from '@atlas/index';
import type { Grounding } from './types.js';

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
