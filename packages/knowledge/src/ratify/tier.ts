// @atlas/knowledge — src/tier.ts  (WP-5.15.KNOW · EPIC-15)
//
// The criticality classifier (KNOW-7). Criticality is NEVER auto-assigned: a `T0`-keyword match yields
// `t0Candidate:true` AND `tier=='T2'` (0 auto-promotes); the heuristic may only FLAG a candidate for
// human ratification, never write the tier. Binds the FROZEN `TierApi` (co-located below):
// `classify(territory: TerritoryView): { t0Candidate: boolean; tier: Tier }`.
//
// FACET BOUNDARY (BIND — resolved vs the frozen TierApi, co-located below):
//  • [FLAG — arg] the oracle types `classify(territory)` as the knowledge-local `TerritoryView` (the
//    init.ts output shape) while noting the canonical `Territory` could also apply. This facet binds
//    to the oracle's declared type — `TerritoryView` — matching the init→classify pipeline; the flag is
//    resolved, not an unpinned MUST-field.
//  • The `T0` keyword corpus is a builder-owned HEURISTIC (heuristics only FLAG — KNOW-7), not a frozen
//    contract value: a closed, path-segment-matched list of security-critical territory names. It writes
//    NOTHING to the tier — the human ratifier owns any `T0` promotion.

import type { Tier } from '@atlas/contracts';
import type { TerritoryView } from '../types.js';

// ── frozen TierApi surface, co-located here (was ref/tier.ts) ─────────────────────────────────────────

export interface TierApi {
  /** Classify a territory's criticality (KNOW-7). Sets `t0Candidate` by keyword but ALWAYS emits
   *  `tier='T2'` — the invariant `t0Candidate ⇒ tier=='T2'` holds over the whole keyword corpus
   *  (method-tags-knw:64). A `T0` tier is human-ratified only (never mechanical). Pure + total.
   *  Typed on the knowledge-local `TerritoryView` (the init.ts output shape). */
  classify(territory: TerritoryView): { readonly t0Candidate: boolean; readonly tier: Tier };
}

/** The closed `T0`-flag keyword corpus (heuristic — flags only, never assigns the tier). */
export const T0_KEYWORDS: readonly string[] = [
  'auth',
  'payments',
  'secrets',
  'kms',
  'crypto',
  'billing',
];

/** True iff a path has a segment matching a `T0` keyword (e.g. `auth/`, `payments/…`). */
export function isT0Candidate(path: string): boolean {
  const segments = path.toLowerCase().split('/').filter((s) => s.length > 0);
  return segments.some((seg) => T0_KEYWORDS.includes(seg));
}

/**
 * Classify a territory's criticality (KNOW-7). Sets `t0Candidate` by keyword but ALWAYS emits
 * `tier='T2'` — the invariant `t0Candidate ⇒ tier=='T2'` holds over the whole corpus. A `T0` tier is
 * human-ratified only (never mechanical). Pure + total.
 */
export function classify(territory: TerritoryView): { readonly t0Candidate: boolean; readonly tier: Tier } {
  return { t0Candidate: isT0Candidate(territory.path), tier: 'T2' };
}

/** The frozen-`TierApi` binding (conformance handle). */
export const classifier: TierApi = { classify };
