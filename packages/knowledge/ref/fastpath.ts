// @atlas/knowledge — ref/fastpath.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The confidence fast-path (KNOW-18, spec A-6/A-7). Human review is spent on RISK, not rubber-stamp: a
// candidate that is grounded ∧ low-risk ∧ `T2` ∧ advisory AUTO-ACCEPTS (no human); a `T0`, CONTESTED
// (reviewer veto / conflicting node), or ANY PREDICATE candidate routes to FULL human ratification. The
// fast-path is backstopped by the KNOW-17 hits-decay — anything it over-admits decays out. Shares the
// KNOW-8 ratifier gate (`ref/ratify.ts`). Transcribed from atlas-knowledge:68, 228-230 and
// method-tags-knw:138-143.

import type { Candidate } from './types.js';

export interface FastpathApi {
  /** Route a candidate (KNOW-18): `(grounded ∧ lowRisk ∧ T2 ∧ advisory) ? 'auto-accept' : 'full-ratify'`.
   *  Predicate / `T0` / contested candidates ALL route to `full-ratify`; only the fast-path cell
   *  auto-accepts (method-tags-knw:142). Pure + total.
   *
   *  [FLAG — `lowRisk` ↔ KNOW-17 seam] The `lowRisk` conjunct's admission threshold calibrates on
   *  observed downstream `hits` (KNOW-17, the OPEN-DEFINE door-2 threshold in `ref/hits.ts`), never the
   *  proposer's self-score (atlas-knowledge:158). The `route` predicate itself stays a pure boolean over
   *  the candidate; the threshold that fixes `lowRisk` lives parametrically in `ref/hits.ts` — flagged as
   *  the KNOW-18 ↔ KNOW-17 seam, not baked here.
   *
   *  [FLAG — `contested` discriminant] "contested" (reviewer veto / conflicting node) is not a field of
   *  the frozen `Candidate` — it is decided against store state at ratify time. Flagged; not modeled as a
   *  candidate field. */
  route(candidate: Candidate): 'auto-accept' | 'full-ratify';
}
