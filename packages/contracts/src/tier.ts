// @atlas/contracts — tier.ts
//
// Criticality overlay. `tier` is human-ratified (no mechanical criticality ground truth, INDEX-15).
//
// The type AND its ORDER live together here, at L0, because both are vocabulary rather than policy — and
// because keeping them apart is what made a `Tier` unsafe to use. The union is TYPE-ONLY: it evaporates at
// runtime, and every value that reaches a door or a comparator arrives from `JSON.parse` (the CLI wire),
// an SDK-parsed MCP argument, or a CAS blob out of a COMMITTED `.atlas/` directory. None of those is
// trusted, none was validated, and four separate modules had each rebuilt the ordering privately as a bare
// `Record<Tier, number>` — so an off-lattice value silently produced `undefined` in a comparison
// (`0 < undefined` is `false`; `x - undefined` is `NaN`) and every one of them read it as "fine".
// One lattice, one guard, reachable from every layer without inverting the DAG.

/** Territory criticality tier — human-ratified. (atlas-index lines 76-77) */
export type Tier = 'T0' | 'T1' | 'T2';

/** Strictness rank — HIGHER binds harder. `T0` is the strictest (human+billy ratification, KNOW-8);
 *  `T2` the most permissive (fast-path auto-accept, KNOW-18). */
const STRICTNESS: Readonly<Record<Tier, number>> = { T2: 0, T1: 1, T0: 2 };

/** The lattice as a total order, STRICTEST-FIRST — the canonical enumeration a doc, gate or sort reads. */
export const TIER_ORDER: readonly Tier[] = ['T0', 'T1', 'T2'];

/**
 * Is `v` one of the three real governance classes? THE runtime guard for a type that has none of its own.
 * Byte-exact by construction: an own-property lookup, so no case-folding, no whitespace trimming, no
 * Unicode normalization, and no prototype member (`'toString'`, `'__proto__'`, `'constructor'`) can pass.
 * `typeof v === 'string'` additionally rejects `String` objects, `Symbol`s, and anything relying on
 * `toString`/`valueOf` coercion.
 */
export function isTier(v: unknown): v is Tier {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(STRICTNESS, v);
}

/**
 * Rank an UNTRUSTED class, STRICTEST-FIRST (`T0` → 0), matching the `TIER_ORDER` index — the ordering the
 * retrieval comparators sort by. An unrecognized value ranks LAST (after every real class) rather than
 * `NaN`, so a sort stays total and a poisoned row sinks instead of scrambling the order around it.
 */
export function tierRank(v: unknown): number {
  return isTier(v) ? TIER_ORDER.indexOf(v) : TIER_ORDER.length;
}

/**
 * Is `declared` a WEAKER governance class than `incumbent`? The predicate a write door gates on: a write
 * may re-state or RAISE the class of the node it targets, never lower it.
 *
 * TOTAL over `unknown` and FAIL-CLOSED off the lattice — an unrecognized DECLARED class is always weaker
 * (nothing off-lattice writes anything), an unrecognized INCUMBENT always strictest (a node whose class
 * cannot be read is never written).
 */
export function isWeakerTier(declared: unknown, incumbent: unknown): boolean {
  if (!isTier(declared) || !isTier(incumbent)) return true; // off-lattice either side ⇒ refuse
  return STRICTNESS[declared] < STRICTNESS[incumbent];
}

/**
 * The lattice JOIN — the stricter of two classes. A governed act spanning SEVERAL nodes (a `sameAs` link
 * spans a whole equivalence class) must clear the strictest class among them, else the weakest member is a
 * side door onto the strongest. FAIL-CLOSED: garbage joins to `T0`, so an unreadable class can never
 * DILUTE the join and make a governed act cheaper to sign.
 */
export function strictestTier(a: unknown, b: unknown): Tier {
  if (!isTier(a) || !isTier(b)) return 'T0';
  return isWeakerTier(a, b) ? b : a;
}
