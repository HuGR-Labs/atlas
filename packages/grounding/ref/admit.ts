// @atlas/grounding — ref/admit.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The two-door admission bar (GROUND-7) + the templated-write validator (GROUND-9, spec A-13). A fact
// is admitted iff it passes BOTH doors: (1) TRUTH — its grounding re-checks FRESH via `gateHolds`
// (GROUND-4); and (2) USEFULNESS — it is actionable AND non-obvious. A true-but-obvious fact is noise
// and MUST be rejected; failing EITHER door blocks admission. `validateTemplate` enforces the fixed
// field set + cap — a missing-field, over-cap, or free-prose fact is rejected, none persists (GROUND-9).
// Pure + total. (atlas-grounding:132, 90-94; method-tags-grd:65-70, 79-84)
//
// [Refuse-to-model] The "non-obvious" predicate of the usefulness door has NO finite/mechanical oracle
// (method-tags-grd:119) — only the door WIRING (the conjunction) and the truth door are modeled; the
// non-obviousness verdict is a human/review judgment, not a signature here.

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
