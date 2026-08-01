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

// ── the tier LATTICE — the ordering the write doors gate on (task #84) ────────────────────────────────
//
// `Tier` is an ORDERED governance class, not a label: `T0` (human+billy, KNOW-8) is strictly stricter than
// `T1`, which is strictly stricter than `T2` (fast-path auto-accept, KNOW-18). Until this was written down,
// the ordering existed only as scattered `=== 'T0'` / `=== 'T2'` equality checks, so no code could ask the
// one question a write door must ask: "is this write's class WEAKER than the class of the node it targets?"
// A door that cannot ask it gates on the write's own self-declaration — a confused deputy, since the
// routing `nodeKey` (hash(primaryAnchorId ‖ slot[‖ check])) contains no tier at all.
//
// Pure + total + no clock/LLM, like every other law in this facet.

/** Strictness rank — HIGHER binds harder. `T0` is the strictest (human+billy); `T2` the most permissive. */
const TIER_STRICTNESS: Readonly<Record<Tier, number>> = { T2: 0, T1: 1, T0: 2 };

/** The tier lattice as a total order, strictest-first — the canonical enumeration for a doc/gate to read. */
export const TIER_ORDER: readonly Tier[] = ['T0', 'T1', 'T2'];

/**
 * Is `v` one of the three real governance classes? `Tier` is a TYPE-ONLY union — it vanishes at runtime, and
 * NOTHING in this repo validates it: `atlas emit` is `JSON.parse` + a cast, and the MCP `node` input schema
 * declares a bare `object`. So the value reaching a write door is arbitrary attacker JSON, and a door that
 * indexes a lattice with it is comparing `undefined`. This is the guard that makes the lattice total; use it
 * BEFORE trusting any `tier` that came off a payload or out of CAS.
 */
export function isTier(v: unknown): v is Tier {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(TIER_STRICTNESS, v);
}

/**
 * Rank an UNTRUSTED class. An unrecognized value is not "somewhere in the middle" — it is unknown, and the
 * only safe reading of an unknown class is the one that lets nothing through. `undefined` is returned so the
 * caller must decide explicitly, rather than silently landing on a number.
 */
function rankOf(v: unknown): number | undefined {
  return isTier(v) ? TIER_STRICTNESS[v] : undefined;
}

/**
 * Is `declared` a WEAKER governance class than `incumbent`? This is the predicate a write door gates on:
 * a write may re-state or RAISE the class of the node it targets, never lower it. Lowering the class of a
 * ratified node is a re-classification — a separate governed act, never a side effect of emitting a fact.
 *
 * TOTAL over `unknown`, and FAIL-CLOSED on anything off the lattice. Typing the parameters `Tier` was the
 * whole vulnerability: `TIER_STRICTNESS['T3']` is `undefined`, `0 < undefined` is `false`, so declaring
 * `tier:'T3'` (or `null`, `0`, `'t0'`, `' T0'`, `'toString'`) read as "not a downgrade" and walked straight
 * past the guard onto a billy-ratified `T0` node — then a second hop re-declared it `T2`, which a pack bounds
 * OUT, erasing the invariant from every read. Reproduced end-to-end through the CLI with no billy token.
 * Hence: an unrecognized DECLARED class is always weaker (nothing off-lattice may write anything), and an
 * unrecognized INCUMBENT class is always strictest (a node whose class we cannot read is never written).
 */
export function isWeakerTier(declared: unknown, incumbent: unknown): boolean {
  const d = rankOf(declared);
  const i = rankOf(incumbent);
  if (d === undefined || i === undefined) return true; // off-lattice on either side ⇒ refuse
  return d < i;
}

/**
 * The lattice JOIN — the stricter of two classes. A governed act spanning SEVERAL nodes (the `sameAs` link
 * spans two) must clear the strictest class among them: linking a `T0` node to a `T2` one is a `T0` act,
 * because the weaker endpoint would otherwise be a side door onto the stronger. Pure + total.
 */
export function strictestTier(a: unknown, b: unknown): Tier {
  // TOTAL + FAIL-CLOSED, for the same reason `isWeakerTier` is: these arguments come off stored facts, which
  // are attacker-authored JSON. An off-lattice class is treated as the STRICTEST, so a garbage `tier` can
  // never DILUTE the join and make a governed multi-node act (a `sameAs` link) cheaper to sign.
  if (!isTier(a) || !isTier(b)) return 'T0';
  return isWeakerTier(a, b) ? b : a;
}
