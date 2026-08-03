// @atlas/knowledge — src/authz.ts  (WP-5.14.KNOW · KNOW-11: owner-scoped write, universal read)
//
// Implements the FROZEN `AuthzApi` (co-located below): `authz(op,actor,fact) = op==read ? allow :
// inScope(actor, fact.scope)` (atlas-knowledge:61, 204-205; method-tags-knw:88-93). A read of ANY scope
// succeeds for ANY caller (universal read, KNOW-11b); a write is authorized only when the actor is in the
// fact's owning scope (owner-scoped write, KNOW-11c). Pure + total — no clock, no IO.
//
// BIND note (authz.ts FLAG resolved by R3): `fact.scope`/`fact.owner` are now SURFACED on the frozen
// `GroundedFact` (types.ts, OPTIONAL). The gate keys on `fact.scope` per the frozen reference and
// FAILS CLOSED when scope is absent — a fact with no scope has no ownership anchor, so no write is ever
// authorized (KNOW-11a behavioral MUST: no scope-less fact persists). `owner` is NOT part of the frozen
// `inScope(actor, fact.scope)` predicate — `inScope`'s signature is, and stays, scope-only (frozen,
// untouched by #178) — but it IS now folded into the `authz()` write branch as a SEPARATE leg, via
// {@link isOwner}, the exact counterpart of {@link isScope} (#178 KNOW-11a: "every fact carries owner +
// scope" was ratified but never enforced — `template.ts` said authz enforced it, authz said it did not;
// neither was true until this leg). `write` now fails closed on EITHER an absent owner or an absent/foreign
// scope; `read` is untouched (KNOW-11b stays universal — no owner/scope check ever runs on a read).

import type { GroundedFact } from '../types.js';

// ── frozen AuthzApi surface, co-located here (was ref/authz.ts) ───────────────────────────────────────

/** The authorized operation. Read is universal; write is owner-scoped (atlas-knowledge:61). */
export type AuthzOp = 'read' | 'write';

export interface AuthzApi {
  /** Authorize `op` by `actor` on `fact` (KNOW-11). `read` ⇒ always allow (universal read); `write` ⇒
   *  allow iff `fact` carries a well-formed `owner` (#178, {@link isOwner}) AND `actor` is in `fact.scope`
   *  (owner-scoped write, {@link inScope}). Pure + total. `actor` is a nominal seat id (`string`); the gate
   *  keys on `fact.owner`/`fact.scope` (R3-surfaced on `GroundedFact`). */
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

/**
 * Is `v` a WELL-FORMED ownership label — a non-empty string? THE runtime guard for the OTHER half of
 * KNOW-11a's `owner + scope` pair (#178) — the exact counterpart of {@link isScope}, by the identical
 * discipline: `owner` is declared `string | undefined` on the frozen `GroundedFact` (types.ts, R3), a TYPE
 * that evaporates at runtime, and every value that reaches a write door arrives unvalidated — `JSON.parse`
 * (the CLI wire), an SDK-parsed MCP argument, a CAS blob, or an in-process embedder.
 *
 * Byte-exact and TOTAL over `unknown`, same discipline as `isScope`/`isTier`: `typeof v === 'string'`
 * FIRST, so nothing reaches the {@link authz} write decision by coercion — no `String` object, no
 * `Symbol`, no array, no object whose `toString`/`valueOf` renders what looks like an owner id. No
 * case-folding, no trimming, no Unicode normalization: the value checked is the value stored.
 */
export function isOwner(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/** In-scope predicate (KNOW-11): `true` iff `actor` is in `scope`. Nominal territory-scope match — the
 *  honest reference model (method-tags-knw INV-KNOW-11 down-model). FAIL-CLOSED: an absent/empty (or
 *  otherwise malformed) scope has no anchor ⇒ `false` (no write authorized) — the emptiness test IS
 *  {@link isScope}, read from the one guard rather than re-encoded here. FROZEN — scope-only signature,
 *  untouched by #178: `owner` is a separate leg, folded into {@link authz} directly, never here. */
export function inScope(actor: string, scope: string | undefined): boolean {
  if (!isScope(scope)) return false; // no ownership anchor ⇒ fail closed
  return actor === scope;
}

/** Authorize `op` by `actor` on `fact` (KNOW-11). `read` ⇒ always allow (universal read, KNOW-11b —
 *  untouched by #178: no owner/scope check ever runs on this leg). `write` ⇒ allow iff `fact` carries a
 *  well-formed `owner` ({@link isOwner}, #178 KNOW-11a) AND `inScope(actor, fact.scope)` (owner-scoped
 *  write, KNOW-11c) — fail-closed on EITHER an absent owner or an absent/foreign scope. Pure + total. */
export function authz(op: AuthzOp, actor: string, fact: GroundedFact): boolean {
  if (op === 'read') return true; // universal read — any caller, any scope (KNOW-11b)
  return isOwner(fact.owner) && inScope(actor, fact.scope); // KNOW-11a ownership fence + owner-scoped write
}

/** The FROZEN `AuthzApi` binding (RED→GREEN oracle conformance). */
export const authzApi: AuthzApi = { authz };
