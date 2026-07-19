// @atlas/grounding — src/emit-guard.ts   (WP-4.11-a.GROUND · GROUND-6, GROUND-9)
//
// The fail-closed emit guard: the two DECISIONS the truth-gate contributes at `emit` so that an
// ungrounded or free-prose fact never enters the store.
//   - `truthDoorHolds` (GROUND-6, spec A-2) — the emit truth door: a fact may enter ONLY if the gate
//     serves `HOLDS` (grounded ∧ FRESH, GROUND-4). An ungrounded/drifted candidate ⇒ `NA` ⇒ blocked ⇒
//     nothing persists. This is the "frozen from WP-4.11-a.GROUND" truth-door internal that the 2-door
//     `admit` (WP-4.11-b.GROUND) and `atlas-emit` (WP-4.11-a.TOOLS) both gate on.
//   - `validateTemplate` (GROUND-9, spec A-13) — the templated-write validator: a raw free-prose fact
//     is rejected — no free-prose fact persists.
// Goldens SCN-GROUND-6-1 / SCN-GROUND-9-1. Both pure + total (no clock, no IO, no throw).
//
// SCOPE (card exclusions): NOT the 2-door `admit` composition nor the usefulness door (owned by
// WP-4.11-b.GROUND); NOT the persistence sink / re-derivation (`emit`, owned by WP-4.11-a.TOOLS — the
// truth-door DECISION is modeled here, the write-side is delegated per §GROUND-6 / method-tags-grd).
//
// [RESIDUE — out of this facet] the CONCRETE required-field set `F` and per-slot cap `κ` of the A-13
// template (SCN-GROUND-9-2, DEFINE-parametric, [NEEDS RECONCILIATION]) are NOT enforced or fabricated
// here — `validateTemplate` enforces only the coarse "structured template shape vs raw free prose"
// distinction (SCN-GROUND-9-1); the field-set/cap guard is pending the A-13 reconciliation lift.

import type { Status } from '@atlas/contracts';
import type { Axes } from '@atlas/index';
import type { Grounding, GateApi } from './types.js';

/**
 * The two-door admission bar (GROUND-7) + the templated-write validator (GROUND-9, spec A-13). A fact is
 * admitted iff it passes BOTH doors: (1) TRUTH — its grounding re-checks FRESH via `gateHolds` (GROUND-4);
 * and (2) USEFULNESS — actionable AND non-obvious. A true-but-obvious fact is noise and MUST be rejected;
 * failing EITHER door blocks. `validateTemplate` (impl'd below) enforces the fixed field set + cap.
 * Pure + total. (atlas-grounding:132, 90-94; method-tags-grd:65-70, 79-84)
 *
 * [Refuse-to-model] The "non-obvious" predicate of the usefulness door has NO finite/mechanical oracle
 * (method-tags-grd:119) — only the door WIRING (the conjunction) and the truth door are modeled; the
 * non-obviousness verdict is a human/review judgment, not a signature here.
 */
export interface AdmitApi {
  /** Two-door admission: `true` iff BOTH the truth door (`gateHolds(...) === 'HOLDS'`, i.e. grounded ∧
   *  FRESH — GROUND-4) AND the usefulness door (actionable ∧ non-obvious) pass; failing either blocks
   *  (GROUND-7). An ungrounded fact is blocked at the truth door (fail-closed write, GROUND-6/spec A-2).
   *  Pure + total. (atlas-grounding:132)
   *
   *  [FLAG — `fact` arg, upward-owned] The reference names `admit(fact)`. The `Fact` (its grounding,
   *  source, template fields, actionable/non-obvious signals) is the knowledge-layer type — UPWARD-owned,
   *  this layer-3 module MUST NOT import it (would invert the DAG). Transcribed as `unknown` rather than
   *  invented; flagged for the knowledge layer to supply the concrete shape. */
  admit(fact: unknown): boolean;

  /** Templated-write validator (GROUND-9, spec A-13): reject a fact missing a required template field,
   *  over cap, or carrying free prose — no free-prose fact persists. Pure + total. (method-tags-grd:82-84)
   *
   *  [FLAG — `fact` arg, upward-owned] Same upward-owned `Fact` as `admit` → `unknown`. The fixed field
   *  set + cap live with the knowledge-layer template; flagged for that layer to supply the shape. */
  validateTemplate(fact: unknown): boolean;
}

/**
 * The emit truth door (GROUND-6): `true` iff the truth-gate serves `HOLDS` for the candidate against
 * `src` — i.e. its grounding is grounded ∧ FRESH (GROUND-4). Fail-closed: an ungrounded or drifted
 * candidate serves `NA`, the door returns `false`, and NOTHING enters at `emit`. Consumes the gate as a
 * seam (no second copy of the gate). Pure + total.
 */
export function truthDoorHolds(
  gate: Pick<GateApi, 'gateHolds'>,
  candidate: unknown,
  grounding: Grounding,
  src: Axes,
): boolean {
  const verdict: Status = gate.gateHolds(candidate, grounding, src);
  return verdict === 'HOLDS';
}

/**
 * The templated-write validator (GROUND-9, spec A-13): reject a raw free-prose fact — no free-prose
 * fact persists. Fail-closed coarse gate — a fact MUST be the fixed TEMPLATE shape (a structured,
 * non-null, non-array record); a raw prose string (or any non-record scalar) is rejected. The concrete
 * required-field set / cap is the DEFINE-parametric residue (SCN-GROUND-9-2), out of this facet — see
 * the file header. Pure + total.
 *
 * [FLAG — `fact`, upward-owned] `AdmitApi` (co-located above) pins the arg as `unknown` (the knowledge-layer `Fact` is
 * UPWARD-owned; importing it inverts the DAG). The coarse structured-vs-prose check needs no upward type.
 */
export function validateTemplate(fact: unknown): boolean {
  return typeof fact === 'object' && fact !== null && !Array.isArray(fact);
}
