// @atlas/knowledge — src/emit.ts  (WP-4.11-a.KNOW · KNOW-2, spec A-2 · ungrounded facts fail closed)
//
// The fail-closed grounded write — the store-admission machine behind `atlas-emit`. An ungrounded fact
// does NOT enter: `admit(node) = isGrounded(node.grounding) ? persist : {emitted:false}`, where the
// grounded predicate is GROUND's `isGrounded` (GROUND-2: ≥1 entry ∧ every entry a non-empty
// `subtreeHash`). Admission is TOTAL — a structured rejection, NEVER a throw. Transcribed against the
// FROZEN oracle `../ref/emit.ts` (`EmitApi.admit`); golden SCN-KNOW-2-1.
//
// SEAM (card guardrails — "no second copy of the gate; consume-only; no raw hashing"): the grounded
// check is NOT re-implemented here — it is GROUND's frozen `GroundApi.isGrounded`, INJECTED build-ahead
// (types-only import of the FROZEN interface) exactly as `bindFreshness`/`bindGate` inject their oracles.
// The persistence sink is likewise injected: the receipt's CAS `id` is the sink's content-addressed id
// (KERNEL-1) — this module computes NO hash of its own.
//
// SCOPE (card exclusions): NOT defining `gateHolds`/the fail-closed grounded predicate (owned by
// WP-4.11-a.GROUND, consumed here); NOT the 2-door usefulness admission (EPIC-11-b); NOT the
// write-decision routing / upsert (CAMPAIGN-5). The served-status recompute (KNOW-1) is `./status.ts`.
//
// [FLAG — simulated seal] the card `content_hash: <filled-at-freeze>` was never filled; this binding is
// written against the VISIBLE frozen `../ref/emit.ts` text + SCN-KNOW-2-1, flagged simulated.
// [FLAG — receipt `id`, from ref/emit.ts] the frozen oracle flags WHICH id the receipt surfaces
// ("the content-addressed CAS id of the persisted object"); this binding surfaces exactly the injected
// sink's returned `Hash` (never a self-hashed value) — the which-id reconciliation stays the ref's flag.

import type { Hash } from '@atlas/contracts';
import type { GroundApi } from '@atlas/grounding';
import type { GroundedFact } from '../ref/types.js';
import type { EmitApi } from '../ref/emit.js';

/**
 * The fail-closed grounded-write seam (KNOW-2), injected build-ahead. Owned by WP-4.11-a.GROUND (the
 * grounded predicate) + the CAS sink; consumed here as the FROZEN `GroundApi` method shape + a persist
 * leg — never re-defined, never re-hashed here.
 */
export interface EmitDeps {
  /** GROUND-2 real-grounding predicate: ≥1 entry ∧ every entry carries a non-empty `subtreeHash`. The
   *  single fail-closed gate the admission defers to (no second copy of the gate). */
  readonly isGrounded: GroundApi['isGrounded'];
  /** The content-addressed persistence sink: writes the admitted node and returns its CAS `id`. Injected
   *  (consume-only) — this module performs NO raw hashing (SEAM). */
  readonly persist: (node: GroundedFact) => Hash;
}

/**
 * Bind `atlas-emit`'s fail-closed admission over the injected grounded/persist seam. The returned
 * `admit` conforms EXACTLY to the frozen `EmitApi.admit(node): {emitted, id?}` and is pure + total
 * (no clock, no IO, no global state, no throw) given a pure/total `deps`.
 *
 * Law (KNOW-2, SCN-KNOW-2-1):
 *   - an ungrounded node (0 entries, or ANY entry with an empty `subtreeHash`) ⇒ `{emitted:false}`,
 *     NOTHING persisted — a structured rejection, never a throw;
 *   - a grounded node ⇒ persisted once, `{emitted:true, id}` — the receipt carries the sink's CAS id.
 * The grounded verdict IS GROUND's `isGrounded` verdict, consumed here, never re-implemented — so a
 * single empty `subtreeHash` fails closed for the same reason GROUND-2 says it does.
 */
export function bindEmit(deps: EmitDeps): EmitApi {
  const admit: EmitApi['admit'] = (node: GroundedFact) =>
    deps.isGrounded(node.grounding)
      ? { emitted: true, id: deps.persist(node) }
      : { emitted: false };
  return { admit };
}
