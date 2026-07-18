// @atlas/knowledge — ref/template.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The templated-write validator (KNOW-10, spec A-13) + the closed `predicateSlot` vocabulary gate. No
// free prose, ever: a fact missing a required template field, over its cap, or with a `predicateSlot`
// outside the closed 12-slot vocabulary is REJECTED; a well-formed fact is PERSISTED (0 free-prose facts
// persist). The reject/persist routing is total + mutually-exclusive over the finite validity product
// {required-field∈(present,missing) × size∈(≤cap,>cap) × slot∈(in-vocab-12, out)} (method-tags-knw:
// 81-86). The closed slot set has EXACTLY the 12 members (adding one is a `cv` bump) — the canonical
// `PredicateSlot` union lives in `ref/types.ts` and is re-exported here as this validator's vocabulary.

import type { Candidate, PredicateSlot } from './types.js';

// The closed slot vocabulary this validator gates against (KNOW-10). Single source of truth: the
// `PredicateSlot` union in `ref/types.ts` (atlas-knowledge:161-180). Re-exported — NOT redefined.
export type { PredicateSlot } from './types.js';

export interface TemplateApi {
  /** Per-kind template + closed-slot validator (KNOW-10). `true` iff the fact carries every required
   *  template field, is within its cap, AND its `slot` is one of the closed 12 (`PredicateSlot`); else
   *  REJECT — no free-prose fact ever persists (atlas-knowledge:203; method-tags-knw:84). Pure + total.
   *
   *  [FLAG — arg] The reference names `validateTemplate(fact)`. Typed as the staging `Candidate` (which
   *  carries the proposed `slot` + claim body the validator gates) — the ratified `GroundedFact` shape
   *  has no stored `slot` field (see the `ref/types.ts` FLAG). Flagged for the WP to confirm whether the
   *  validator runs on the `Candidate` or a raw proposal record.
   *
   *  [SIG-TBD — required-field set + per-slot cap NOT frozen] atlas-knowledge:60/202 names "a per-kind
   *  template + cap" but freezes NO concrete required-field list or numeric cap. The predicate the
   *  boolean gates is thus reference-described, not fully pinned — the field set/cap are NOT invented
   *  here. Flagged for DEFINE. */
  validateTemplate(fact: Candidate): boolean;

  /** Closed-vocabulary membership: `true` iff `slot` is one of the 12 (`PredicateSlot`). A fact whose
   *  `slot` is outside the closed set is rejected (atlas-knowledge:220). Because `slot` is already the
   *  finite `PredicateSlot` union, this is a totality/exhaustiveness guard at the value boundary. Pure. */
  isClosedSlot(slot: PredicateSlot): boolean;
}
