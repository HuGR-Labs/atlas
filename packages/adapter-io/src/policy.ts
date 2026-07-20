// @atlas/adapter-io — src/policy.ts  (WP-POLICY: admin-locked, versioned governance policy)
//
// THE governance tunables, externalized as DATA. The engine's governance seams (near-dup τ, the T0
// heuristic keyword set, the KNOW-11 owner-scoped write gate) are RULES admins own — so they live in a
// declarative `<repoPath>/.atlas/policy.json` an admin edits (locked via CODEOWNERS + branch-protection),
// while the runtime reads them here as a plain config. This module is the FAIL-CLOSED loader: it never
// throws and never silently permits a write.
//
// FAIL-CLOSED is the whole point. A missing OR malformed policy resolves to `defaultPolicy()` — the
// CONSERVATIVE default: exact-match-only near-dup (`claimNormThreshold: 1`), an EMPTY T0 keyword set, and
// EMPTY authz scopes. Empty scopes ⇒ no actor is in ANY scope ⇒ NO write is authorized until an admin
// declares scopes (reads stay universal per KNOW-11b). An absent/broken policy can therefore never open a
// write path — the default denies. `actorInScope` mirrors @atlas/knowledge authz `inScope` (KNOW-11a):
// fail-closed on an absent/empty scope or an unlisted actor.
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
 * A fresh object is returned each call (no shared mutable default can be aliased/mutated).
 */
export function defaultPolicy(): AtlasPolicy {
  return {
    nearDup: { claimNormThreshold: 1 },
    t0Heuristic: { keywords: [] },
    authz: { scopes: {} },
  };
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
  const scopes: Record<string, readonly string[]> = {};
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
 * Is `actor` authorized to write `scope`? Mirrors @atlas/knowledge authz `inScope` (KNOW-11a) — FAIL-CLOSED:
 * `false` when `scope` is absent/empty, when the scope is not declared in the policy, or when `actor` is not
 * a listed member. `true` only when the policy declares the scope AND lists the actor. Pure + total, no IO —
 * an absent/broken policy (⇒ empty scopes via {@link defaultPolicy}) therefore authorizes NO write.
 */
export function actorInScope(policy: AtlasPolicy, actor: string, scope: string | undefined): boolean {
  if (scope === undefined || scope.length === 0) return false; // no ownership anchor ⇒ fail closed
  const members = policy.authz.scopes[scope];
  if (members === undefined) return false; // undeclared scope ⇒ fail closed
  return members.includes(actor);
}
