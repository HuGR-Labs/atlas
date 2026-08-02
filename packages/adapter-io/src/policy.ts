// @atlas/adapter-io — src/policy.ts  (WP-POLICY: the versioned governance policy + its fail-closed loader)
//
// THE governance tunables, externalized as DATA. The engine's governance seams (near-dup τ, the T0
// heuristic keyword set, the KNOW-11 owner-scoped write gate) are RULES admins own — so they live in a
// declarative `<repoPath>/.atlas/policy.json` an admin edits, while the runtime reads them here as plain
// config.
//
// THE WP NAME AND THIS HEADER BOTH USED TO SAY THE FILE WAS LOCKED. It is NOT, and the distinction that
// matters is that the lock is UNAVAILABLE rather than merely un-configured: the CODEOWNERS line names a
// team that exists in no org (GitHub rejects it outright as an unknown owner), and branch protection 403s
// on this repo's plan — "Upgrade to GitHub Pro or make this repository public", for rules and rulesets
// alike. Anyone with write access can edit the authorization policy directly.
//
// So the ONLY control actually holding is the one implemented BELOW, which is why it is written the way it
// is. This module is the FAIL-CLOSED loader: it never throws and never silently permits a write.
//
// FAIL-CLOSED is the whole point. A missing OR malformed policy resolves to `defaultPolicy()` — the
// CONSERVATIVE default: exact-match-only near-dup (`claimNormThreshold: 1`), an EMPTY T0 keyword set, and
// EMPTY authz scopes. Empty scopes ⇒ no actor is in ANY scope ⇒ NO write is authorized until an admin
// declares scopes (reads stay universal per KNOW-11b). An absent/broken policy can therefore never open a
// write path — the default denies. `actorInScope` mirrors @atlas/knowledge authz `inScope` (KNOW-11a):
// fail-closed on an absent/empty scope or an unlisted actor.
//
// AND THE POLICY IS NOT AN AUTHENTICATED INPUT EITHER. `authz.scopes` names WHO may write WHAT, but the
// "who" is a self-asserted string (`actorInScope` below says why), and this file is world-readable and
// world-writable to anyone who can run the tool. Both halves are advisory. That is a legitimate posture for
// a local developer tool and it is stated here so no reader has to infer it from the absence of a check.
//
// One-way DAG leaf (adapter ring): the core never imports this. The `claimNormThreshold` here feeds the
// frozen `NearDupConfig` (@atlas/knowledge) EXACTLY — same field name, same meaning (the OPEN-DEFINE τ the
// near-dup matcher takes as a parameter, never a baked-in constant).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NearDupConfig } from '@atlas/knowledge';

// ── the policy shape ─────────────────────────────────────────────────────────────────────────────────

/** The near-dup governance tunable. `claimNormThreshold` feeds the frozen `NearDupConfig` (@atlas/knowledge
 *  router) EXACTLY — the write-decision near-duplicate probe's τ. `1` ⇒ exact-match only (the airtight,
 *  conservative floor: only byte-identical claims collide). */
export interface NearDupPolicy {
  readonly claimNormThreshold: number;
}

/** The T0-candidate heuristic tunable — the keyword set that flags a fact as a T0 (human-ratification)
 *  candidate, feeding the T0 heuristic seam. Empty ⇒ the heuristic proposes nothing on its own. */
export interface T0HeuristicPolicy {
  readonly keywords: readonly string[];
}

/** The authorization config — the actor↔scope membership map ("who may write to which scope"), feeding the
 *  KNOW-11 `inScope(actor, fact.scope)` gate. `scopes[scope]` is the list of actor ids authorized to write
 *  that scope. An UNLISTED scope (or an absent actor) is fail-closed: no write. */
export interface AuthzPolicy {
  readonly scopes: Record<string, readonly string[]>;
}

/** The admin-owned, versioned governance policy. Carries only DATA the governance seams consume — no code,
 *  no judgement. Sourced from `<repoPath>/.atlas/policy.json`; resolves to {@link defaultPolicy} when absent
 *  or malformed (fail-closed). */
export interface AtlasPolicy {
  readonly nearDup: NearDupPolicy;
  readonly t0Heuristic: T0HeuristicPolicy;
  readonly authz: AuthzPolicy;
}

// ── the conservative fail-closed default ───────────────────────────────────────────────────────────────

/**
 * The CONSERVATIVE fail-closed default (KNOW-11a / KNOW-15h floor). An absent or broken policy resolves
 * here and must NEVER silently permit a write:
 *   • `nearDup.claimNormThreshold: 1` — exact-match only (the airtight leg; only τ ≤ 1 fires, i.e. byte-
 *     identical claims collide). No near-synonym merges are asserted without an admin declaring the τ.
 *   • `t0Heuristic.keywords: []` — the heuristic flags nothing on its own until an admin declares the set.
 *   • `authz.scopes: {}` — NO actor is in ANY scope ⇒ NO write is authorized. Reads stay universal
 *     (KNOW-11b), but a write requires an admin to have declared the scope membership first.
 * A fresh object is returned each call (no shared mutable default can be aliased/mutated). The scopes map
 * is a null-prototype object ({@link emptyScopes}) — no inherited `Object.prototype` keys, no `__proto__`
 * setter — so a prototype-named scope (`'constructor'`, `'__proto__'`, …) lands nowhere and reads back as
 * absent, keeping {@link actorInScope} total + fail-closed.
 */
export function defaultPolicy(): AtlasPolicy {
  return {
    nearDup: { claimNormThreshold: 1 },
    t0Heuristic: { keywords: [] },
    authz: { scopes: emptyScopes() },
  };
}

/** A null-prototype scopes map: no inherited `Object.prototype` members, no `__proto__` accessor. Untrusted
 *  JSON keys (`'constructor'`, `'__proto__'`, `'toString'`, …) land as plain own data props or nowhere —
 *  never resolving to an inherited function and never polluting the prototype. */
function emptyScopes(): Record<string, readonly string[]> {
  return Object.create(null) as Record<string, readonly string[]>;
}

// ── the fail-closed loader ───────────────────────────────────────────────────────────────────────────

/**
 * Load `<repoPath>/.atlas/policy.json` into an {@link AtlasPolicy}. TOTAL + FAIL-CLOSED: any failure —
 * the file missing, unreadable, non-JSON, or structurally invalid — resolves to {@link defaultPolicy}
 * WITHOUT throwing. The conservative default denies writes (empty scopes), so a broken policy can never
 * open a write path. Every field is validated + narrowed before it is trusted; a partial/typo'd policy
 * degrades to the default for the offending leg by falling through validation (whole-policy fallback).
 */
export function loadPolicy(repoPath: string): AtlasPolicy {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(repoPath, '.atlas', 'policy.json'), 'utf8'));
  } catch {
    return defaultPolicy(); // missing / unreadable / non-JSON — fail closed to the denying default
  }
  return parsePolicy(raw);
}

/** Narrow arbitrary parsed JSON to a valid {@link AtlasPolicy}, or fall back to {@link defaultPolicy}.
 *  Total — returns a policy for ANY input, never throws. */
function parsePolicy(raw: unknown): AtlasPolicy {
  if (!isRecord(raw)) return defaultPolicy();
  const nearDup = parseNearDup(raw.nearDup);
  const t0Heuristic = parseT0(raw.t0Heuristic);
  const authz = parseAuthz(raw.authz);
  if (nearDup === undefined || t0Heuristic === undefined || authz === undefined) return defaultPolicy();
  return { nearDup, t0Heuristic, authz };
}

/** Validate `nearDup` — requires a finite `claimNormThreshold` number. Fail-closed ⇒ `undefined`. */
function parseNearDup(v: unknown): NearDupPolicy | undefined {
  if (!isRecord(v)) return undefined;
  const t = v.claimNormThreshold;
  if (typeof t !== 'number' || !Number.isFinite(t)) return undefined;
  return { claimNormThreshold: t };
}

/** Validate `t0Heuristic` — requires a `keywords` array of strings. Fail-closed ⇒ `undefined`. */
function parseT0(v: unknown): T0HeuristicPolicy | undefined {
  if (!isRecord(v)) return undefined;
  const kw = v.keywords;
  if (!Array.isArray(kw) || !kw.every((k): k is string => typeof k === 'string')) return undefined;
  return { keywords: [...kw] };
}

/** Validate `authz` — requires a `scopes` object mapping scope → string[] of actors. Fail-closed ⇒
 *  `undefined`. A malformed scope map denies (no write authorized). */
function parseAuthz(v: unknown): AuthzPolicy | undefined {
  if (!isRecord(v)) return undefined;
  const s = v.scopes;
  if (!isRecord(s)) return undefined;
  const scopes = emptyScopes(); // null-proto: untrusted keys land as own props, never invoke the __proto__ setter
  for (const [scope, actors] of Object.entries(s)) {
    if (!Array.isArray(actors) || !actors.every((a): a is string => typeof a === 'string')) return undefined;
    scopes[scope] = [...actors];
  }
  return { scopes };
}

/** A plain (non-null, non-array) object guard. */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ── pure helpers the wiring consumes ──────────────────────────────────────────────────────────────────

/**
 * The near-dup config the @atlas/knowledge router takes — the policy's `claimNormThreshold` surfaced as the
 * frozen `NearDupConfig` EXACTLY (same field, same τ meaning). Pure projection, no IO.
 */
export function nearDupConfig(policy: AtlasPolicy): NearDupConfig {
  return { claimNormThreshold: policy.nearDup.claimNormThreshold };
}

/**
 * Is `actor` authorized to write `scope`?
 *
 * NOT AUTHENTICATION. Read the signature literally: this takes `actor` as a STRING and asks whether that
 * string is listed under `scope`. It does not, and cannot, ask whether the caller IS that actor — nothing in
 * Atlas establishes that. The string arrives from `ATLAS_ACTOR` or the caller's own `git config user.email`
 * (see `compose.ts`), both self-asserted, and the policy it is checked against is a file readable and
 * writable by anyone who can invoke the CLI. This is an ANTI-ACCIDENT GUARDRAIL — it stops the wrong seat
 * writing the wrong scope by mistake — and it is not an adversarial control (ARCH-12). Every caller of this
 * function inherits that ceiling, however carefully the gate around it is built.
 *
 * Mirrors @atlas/knowledge authz `inScope` (KNOW-11a) — FAIL-CLOSED:
 * `false` when `scope` is absent/empty, when the scope is not declared in the policy, or when `actor` is not
 * a listed member. `true` only when the policy declares the scope AND lists the actor. Pure + total, no IO —
 * an absent/broken policy (⇒ empty scopes via {@link defaultPolicy}) therefore authorizes NO write.
 *
 * The membership lookup is guarded by an OWN-property check ({@link Object.prototype.hasOwnProperty}) BEFORE
 * `.includes`: a scope named after an INHERITED `Object.prototype` member (`'constructor'`, `'toString'`,
 * `'hasOwnProperty'`, `'valueOf'`, …) resolves to the prototype function on a plain map and would throw on
 * `.includes` — here it is not an OWN key of the (null-proto) map, so it fails closed `false` instead of
 * throwing. `'__proto__'` is the one reserved name JSON.parse materializes as an OWN key, so it is rejected
 * by name up front: a governance scope is an identifier like `'core/knowledge'`, never `'__proto__'`.
 * Total — never throws — and never permits an unlisted actor.
 */
export function actorInScope(policy: AtlasPolicy, actor: string, scope: string | undefined): boolean {
  if (scope === undefined || scope.length === 0) return false; // no ownership anchor ⇒ fail closed
  if (scope === '__proto__') return false; // reserved name (an own key after JSON.parse) ⇒ never anchors a scope
  const scopes = policy.authz.scopes;
  if (!Object.prototype.hasOwnProperty.call(scopes, scope)) return false; // undeclared / inherited-proto name ⇒ fail closed (total, never throws)
  const members = scopes[scope]; // own key ⇒ defined; the `!== undefined` is only the noUncheckedIndexedAccess narrowing (it does NOT swallow the inherited-fn throw — that is what the hasOwnProperty guard prevents)
  return members !== undefined && members.includes(actor);
}
