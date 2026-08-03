// @atlas/knowledge — src/authz.ts  (WP-5.14.KNOW · KNOW-11: owner-scoped write, universal read)
//
// Implements the FROZEN `AuthzApi` (co-located below): `authz(op,actor,fact) = op==read ? allow :
// inScope(actor, fact.scope)` (atlas-knowledge:61, 204-205; method-tags-knw:88-93). A read of ANY scope
// succeeds for ANY caller (universal read, KNOW-11b); a write is authorized only when the actor is in the
// fact's owning scope (owner-scoped write, KNOW-11c). Pure + total — no clock, no IO.
//
// BIND note (authz.ts FLAG resolved by R3): `fact.scope` is now SURFACED on the frozen `GroundedFact`
// (types.ts, OPTIONAL). The gate keys on `fact.scope` per the frozen reference and FAILS CLOSED when
// scope is absent — a fact with no scope has no ownership anchor, so no write is ever authorized
// (KNOW-11a behavioral MUST: no scope-less fact persists).
//
// #187 (owner-ratified 2026-08-03, reverses #178/PR#105): `owner` is REMOVED from KNOW-11a's MUST and is
// NOT a gate input, and was never load-bearing here in the first place — measured on the built binary,
// nothing supplies `owner` on any shipped write path (`atlas emit`, `atlas mine`), and `authz()`/`inScope`
// (this file) have ZERO production callers of their own: the live write door
// (`adapter-io/src/governed-emit.ts`, gate "2. AUTHZ") gates through a separate `actorInScope`
// reimplementation in `adapter-io/src/policy.ts`, which was never touched by #178 and never read `owner`
// either. Producer identity is carried by `provenance.source` (KNOW-14, required on every claim) — `owner`
// was a second, optional, unpopulated answer to a question the contract already answers. #178 folded
// `isOwner(fact.owner)` into the `authz()` write branch as a second leg; that leg is removed here, along
// with `isOwner`. `inScope(actor, fact.scope)` is FROZEN and was never touched by #178 — untouched again
// here.

import type { GroundedFact } from '../types.js';

// ── frozen AuthzApi surface, co-located here (was ref/authz.ts) ───────────────────────────────────────

/** The authorized operation. Read is universal; write is owner-scoped (atlas-knowledge:61). */
export type AuthzOp = 'read' | 'write';

export interface AuthzApi {
  /** Authorize `op` by `actor` on `fact` (KNOW-11). `read` ⇒ always allow (universal read); `write` ⇒
   *  allow iff `actor` is in `fact.scope` (owner-scoped write). Pure + total. `actor` is a nominal seat id
   *  (`string`); the gate keys on `fact.scope` (R3-surfaced on `GroundedFact`). */
  authz(op: AuthzOp, actor: string, fact: GroundedFact): boolean;
}

/**
 * Is `v` a WELL-FORMED ownership anchor — a non-empty string? THE runtime guard for the other half of the
 * `(scope, tier)` pair, and the exact counterpart of `isTier` (ratify/tier.ts): `scope` is declared
 * `string | undefined` on the frozen `GroundedFact`, a TYPE that evaporates at runtime, and every value
 * that reaches a door arrives from `JSON.parse` (the CLI wire), an SDK-parsed MCP argument (`node` is a
 * bare `object` there), a CAS blob, or an in-process embedder — none of them validated.
 *
 * Byte-exact and TOTAL over `unknown`, by the same discipline as `isTier`: `typeof v === 'string'` FIRST,
 * so nothing reaches a comparison by coercion — no `String` object, no `Symbol`, no array, no object whose
 * `toString`/`valueOf` renders a legitimate scope name. That last shape is not hypothetical: a scope is
 * used as a property KEY (`hasOwnProperty(scopes, scope)`), and a property key coerces, so `["core"]` and
 * `{toString:() => 'core'}` both READ as the scope `core` in an authorization lookup while remaining
 * `!==`-unequal to the string `'core'` — and to every other copy of themselves — at every later comparison.
 * No case-folding, no trimming, no Unicode normalization: the value that is checked is the value stored.
 */
export function isScope(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/** In-scope predicate (KNOW-11): `true` iff `actor` is in `scope`. Nominal territory-scope match — the
 *  honest reference model (method-tags-knw INV-KNOW-11 down-model). FAIL-CLOSED: an absent/empty (or
 *  otherwise malformed) scope has no anchor ⇒ `false` (no write authorized) — the emptiness test IS
 *  {@link isScope}, read from the one guard rather than re-encoded here. FROZEN — scope-only signature,
 *  unchanged by #178 or by its #187 reversal. */
export function inScope(actor: string, scope: string | undefined): boolean {
  if (!isScope(scope)) return false; // no ownership anchor ⇒ fail closed
  return actor === scope;
}

/** Authorize `op` by `actor` on `fact` (KNOW-11). `read` ⇒ always allow (universal read, KNOW-11b). `write`
 *  ⇒ allow iff `inScope(actor, fact.scope)` (owner-scoped write, fail-closed on absent scope, KNOW-11c).
 *  Pure + total. `owner` is not a gate input (#187) — see the file header. */
export function authz(op: AuthzOp, actor: string, fact: GroundedFact): boolean {
  if (op === 'read') return true; // universal read — any caller, any scope (KNOW-11b)
  return inScope(actor, fact.scope); // owner-scoped write (KNOW-11c)
}

/** The FROZEN `AuthzApi` binding (RED→GREEN oracle conformance). */
export const authzApi: AuthzApi = { authz };
