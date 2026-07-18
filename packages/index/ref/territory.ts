// @atlas/index — ref/territory.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The `territory` axis assignment (INDEX-14). A unit matched by ≥2 overlapping globs resolves to
// EXACTLY one owner+tier by longest-path-match, then manifest declaration order — deterministic,
// byte-identical across rebuilds, `$0`-LLM. A no-glob path is flagged `uncovered` and, if T0-adjacent,
// defaults to deny. (atlas-index:68-101, 192-196; method-tags-idx:111-116)

import type { Tier } from '@atlas/contracts';
import type { Manifest } from './types.js';

/**
 * The single owner+tier a path resolves to (atlas-index:77-78; the `assign` return, method-tags-idx:115).
 *   - `owner` — the resolved territory owner. Reference type is `seat` (a nominal seat id); the ratified
 *     contracts membership carries it as `string` (see @atlas/contracts `Territory` FLAG) — so `string`.
 *   - `tier`  — the criticality tier (human-ratified, `Tier` from contracts).
 *
 * [FLAG — `uncovered`/deny verdict not modeled in this minimal return] atlas-index:92-94 requires a
 * no-glob path to resolve to an `uncovered` verdict (T0-adjacent ⇒ default deny), NOT an owner+tier.
 * The task's frozen surface is `assign(...): { owner, tier }`, so the `uncovered`/deny verdict is NOT
 * added to this shape — flagged for the WP to widen the return (e.g. a discriminated union) at build.
 */
export interface TerritoryAssignment {
  readonly owner: string;
  readonly tier: Tier;
}

export interface TerritoryApi {
  /** Assign a path to its single owner+tier from the hashed manifest; longest-path-match then
   *  declaration-order tiebreak; deterministic, `$0`-LLM (INDEX-14). (atlas-index:77-78;
   *  method-tags-idx:115) */
  assign(path: string, manifest: Manifest): TerritoryAssignment;
}
