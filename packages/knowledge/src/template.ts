// @atlas/knowledge — src/template.ts  (WP-5.14.KNOW · KNOW-10: templated-write validator + closed-slot gate)
//
// No free prose, ever (KNOW-10, atlas-knowledge:203; method-tags-knw:81-86). Implements the FROZEN
// `TemplateApi` (ref/template.ts): a staged `Candidate` PERSISTS iff it carries every required template
// field, its `claimText` is within the byte cap, AND its `slot` is one of the closed 12 (`PredicateSlot`);
// any violation ⇒ REJECT — 0 free-prose facts persist. The reject/persist route is a TOTAL, mutually-
// exclusive AND over the finite validity product {required-field∈(present,missing) × size∈(≤cap,>cap) ×
// slot∈(in-vocab-12, out)}. Pure — no clock, no IO, no hashing.
//
// BIND note (template.ts FLAG resolved): the frozen signature gates the staging `Candidate` (it carries the
// proposed `slot` + claim body), so the required-field check runs over the Candidate-carried template fields
// {claimText, claimNorm, provenance, grounding, slot}. `owner`/`scope` (also in `RequiredAdvisoryField`) are
// the KNOW-11 ownership fence — enforced fail-closed by the sibling authz facet, NOT re-checked here. No
// field invented.

import type { Candidate, PredicateSlot } from '../ref/types.js';
import type { TemplateApi, ClaimTextCapBytes } from '../ref/template.js';

/** The closed `predicateSlot` vocabulary as a runtime CLOSED set (KNOW-10) — the 12 members transcribed
 *  from the `PredicateSlot` union (ref/types.ts:163-175). A `slot` outside this set is REJECTED; adding a
 *  member is a `cv` bump, not a code change. Single source of truth is the union — mirrored here for the
 *  value boundary (a runtime tag whose type is erased). */
const CLOSED_SLOTS: ReadonlySet<PredicateSlot> = new Set<PredicateSlot>([
  'invariant',
  'contract',
  'precondition',
  'postcondition',
  'sideeffect',
  'ownership',
  'perf-bound',
  'security-property',
  'gotcha',
  'rationale',
  'dependency',
  'definition',
]);

/** The `claimText` size cap in bytes (KNOW-10, goldens-knw:61). Tied to the frozen type-level bound
 *  `ClaimTextCapBytes = 512` — a drift between this const and the frozen literal is a compile error. */
const CLAIM_TEXT_CAP_BYTES: ClaimTextCapBytes = 512;

const UTF8 = new TextEncoder();

/** A present, non-empty string (runtime-defensive: a fixture may omit a field the Candidate type marks
 *  required — the enumerated `missing` cell of universe B). */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/** Closed-vocabulary membership (KNOW-10): `true` iff `slot` is one of the 12. A free-prose blob with no
 *  slot binding (`slot` absent / out-of-vocab) yields `false` — the totality guard at the value boundary. */
export function isClosedSlot(slot: PredicateSlot): boolean {
  return CLOSED_SLOTS.has(slot);
}

/** Every Candidate-carried required template field is present (KNOW-10). The `missing` cell of the
 *  validity product — a receiptless (`provenance` absent) or grounding-less body is REJECTED. */
function hasRequiredFields(fact: Candidate): boolean {
  const f = fact as Partial<Candidate>;
  return (
    isNonEmptyString(f.claimText) &&
    isNonEmptyString(f.claimNorm) &&
    f.provenance != null &&
    f.grounding != null
  );
}

/** Per-kind template + closed-slot validator (KNOW-10). `true` iff required-fields-present ∧ claimText ≤
 *  512 B ∧ slot ∈ closed-12; else REJECT. Total + mutually-exclusive over the finite validity product. */
export function validateTemplate(fact: Candidate): boolean {
  if (!hasRequiredFields(fact)) return false; // missing-field cell (F2)
  if (UTF8.encode(fact.claimText).length > CLAIM_TEXT_CAP_BYTES) return false; // over-cap cell (F3)
  if (!isClosedSlot(fact.slot)) return false; // out-of-vocab / free-prose cell (F5)
  return true; // well-formed ⇒ PERSIST
}

/** The FROZEN `TemplateApi` binding (RED→GREEN oracle conformance). */
export const templateApi: TemplateApi = { validateTemplate, isClosedSlot };
