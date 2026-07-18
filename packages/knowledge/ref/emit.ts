// @atlas/knowledge — ref/emit.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The fail-closed grounded write (KNOW-2, spec A-2) — the machine behind `atlas-emit`. Ungrounded facts
// don't enter: `admit(node) = isGrounded(node) ? persist : {emitted:false}`, where `isGrounded ⇔ ≥1
// entry each with a non-empty `subtreeHash`. Admission is TOTAL — a structured rejection, NEVER a throw
// (method-tags-knw:25-30). Transcribed from atlas-knowledge:79, 188 and method-tags-knw:25-30.

import type { Hash } from '@atlas/contracts';
import type { GroundedFact } from './types.js';

export interface EmitApi {
  /** Fail-closed admission (KNOW-2). Persists iff the node is grounded (≥1 grounding entry, each with a
   *  non-empty `subtreeHash`); an ungrounded/partially-grounded node ⇒ `{emitted:false}`, nothing
   *  persisted. Returns the CAS id on success. Pure + total — a structured rejection, never a throw
   *  (atlas-knowledge:79).
   *
   *  [FLAG — return `id`] `id` is the content-addressed CAS id of the persisted object (a `Hash`, the
   *  dedup leg — atlas-knowledge:110). Under `exactOptionalPropertyTypes`, `id?` is genuinely
   *  absent-on-reject / present-on-emit. Note the NODE identity leg is the `nodeKey` (`ref/router.ts`);
   *  the emit receipt returns the `contentHash`-flavored CAS id, flagged for the WP to confirm which id
   *  the receipt surfaces. */
  admit(node: GroundedFact): { readonly emitted: boolean; readonly id?: Hash };
}
