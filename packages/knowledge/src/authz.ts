// @atlas/knowledge — src/authz.ts  (WP-5.14.KNOW · KNOW-11: owner-scoped write, universal read)
//
// Implements the FROZEN `AuthzApi` (ref/authz.ts): `authz(op,actor,fact) = op==read ? allow :
// inScope(actor, fact.scope)` (atlas-knowledge:61, 204-205; method-tags-knw:88-93). A read of ANY scope
// succeeds for ANY caller (universal read, KNOW-11b); a write is authorized only when the actor is in the
// fact's owning scope (owner-scoped write, KNOW-11c). Pure + total — no clock, no IO.
//
// BIND note (authz.ts FLAG resolved by R3): `fact.scope`/`fact.owner` are now SURFACED on the frozen
// `GroundedFact` (ref/types.ts, OPTIONAL). The gate keys on `fact.scope` per the frozen reference and
// FAILS CLOSED when scope is absent — a fact with no scope has no ownership anchor, so no write is ever
// authorized (KNOW-11a behavioral MUST: no scope-less fact persists). `owner` is NOT part of the frozen
// `inScope(actor, fact.scope)` predicate — it is the ownership label carried on the persisted node, not a
// second write-gate leg — so it is not re-checked here.

import type { GroundedFact } from '../ref/types.js';
import type { AuthzApi, AuthzOp } from '../ref/authz.js';

/** In-scope predicate (KNOW-11): `true` iff `actor` is in `scope`. Nominal territory-scope match — the
 *  honest reference model (method-tags-knw INV-KNOW-11 down-model). FAIL-CLOSED: an absent/empty scope has
 *  no anchor ⇒ `false` (no write authorized). */
export function inScope(actor: string, scope: string | undefined): boolean {
  if (scope === undefined || scope.length === 0) return false; // no ownership anchor ⇒ fail closed
  return actor === scope;
}

/** Authorize `op` by `actor` on `fact` (KNOW-11). `read` ⇒ always allow (universal read); `write` ⇒ allow
 *  iff `inScope(actor, fact.scope)` (owner-scoped write, fail-closed on absent scope). Pure + total. */
export function authz(op: AuthzOp, actor: string, fact: GroundedFact): boolean {
  if (op === 'read') return true; // universal read — any caller, any scope (KNOW-11b)
  return inScope(actor, fact.scope); // owner-scoped write (KNOW-11c)
}

/** The FROZEN `AuthzApi` binding (RED→GREEN oracle conformance). */
export const authzApi: AuthzApi = { authz };
