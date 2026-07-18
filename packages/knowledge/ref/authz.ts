// @atlas/knowledge — ref/authz.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Owner-scoped write, universal read (KNOW-11, §ownership). Every fact carries an `owner` + `scope`;
// a write outside the owner's scope is REJECTED; a read of ANY scope succeeds for ANY caller (100%).
// `authz(op,actor,fact) = op==read ? allow : inScope(actor, fact.scope)`. Transcribed from
// atlas-knowledge:61, 204-205 and method-tags-knw:88-93.

import type { GroundedFact } from './types.js';

/** The authorized operation. Read is universal; write is owner-scoped (atlas-knowledge:61). */
export type AuthzOp = 'read' | 'write';

export interface AuthzApi {
  /** Authorize `op` by `actor` on `fact` (KNOW-11). `read` ⇒ always allow (universal read); `write` ⇒
   *  allow iff `actor` is in `fact.scope` (owner-scoped write). Pure + total.
   *
   *  [FLAG — `actor` type] The reference model's `actor` is a `seat` (nominal seat id), not in the
   *  ratified contracts membership. Transcribed as `string` — the same discipline contracts applied to
   *  `Territory.owner`/`TerritoryView.owner`. NOT invented as a new exported type.
   *
   *  [FLAG — `fact.scope` absent from the frozen shape] The gate keys on `fact.scope` (and `owner`), but
   *  the frozen `GroundedFact` shapes (ref/types.ts) list NO `owner`/`scope` field though KNOW-11
   *  requires them. Typed as `GroundedFact` per the reference `authz(op,actor,fact)`; the missing
   *  `scope`/`owner` fields are flagged for the data model to surface — NOT invented here. */
  authz(op: AuthzOp, actor: string, fact: GroundedFact): boolean;
}
