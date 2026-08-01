// @atlas/adapter-io — src/pack-shape.ts  (the ONE fact→PackInvariant shaping + the ONE Pack-mint bound)
//
// Both read projections — the scope readback (projection-query-index.ts) and the dependency/trigger retrieval
// feed (retrieval-model.ts) — map a `(CurrentNode, GroundedFact)` pair to a `PackInvariant` the SAME way:
// the identity + claim come from the trusted projection `CurrentNode` (recomputed nodeKey + the set-union
// claim set), the tier from the CAS `GroundedFact`. Extracted so the two doors can never drift.
//
// They drifted anyway — on the half this module did NOT own. Shaping was shared; BOUNDING was not. The
// scope path's invariants are bounded downstream where `@atlas/tools` createQuery mints the `Pack`
// (`tier≥T1`, TOOLS-6), but `retrievalPack` mints its OWN `Pack` in this package and never applied that
// bound, so `--by dependency|trigger` served every tier — an ordinary auto-accepted `T2`, and an
// off-lattice `T3` out of a committed `.atlas/` projection, which no write door ever saw.
//
// So the bound is placed HERE, at the MINT, not at each call site: `mintPack` is the only function in this
// package that assembles a `Pack`, and it bounds unconditionally. A future fourth retrieval mode gets the
// bound by construction — it cannot produce a pack without calling this. The bound cannot be literally the
// same function as tools' because the layer DAG forbids `tools → adapter-io` (ARCH-2); it is the same
// PREDICATE, stated identically in both, and both are pinned by tests.

import { isTier } from '@atlas/knowledge';
import type { Hash, NodeKey, Pack, PackInvariant } from '@atlas/contracts';
import type { CurrentNode, GroundedFact } from '@atlas/knowledge';

/** Shape one current node + its CAS fact into a structured `PackInvariant`: `nodeId` = the trusted (recomputed)
 *  projection `nodeKey`, `tier` = the fact's tier, `claim` = the node's set-union claim set joined. */
export function factToInvariant(node: CurrentNode, fact: GroundedFact): PackInvariant {
  return { nodeId: node.nodeKey as NodeKey, tier: fact.tier, claim: node.claims.join('; ') };
}

/**
 * The pack bound (TOOLS-6): a pack carries `tier≥T1` (T0 or T1) only; `T2` and every off-lattice value are
 * bounded OUT. Stated as MEMBERSHIP — `isTier(t) && t !== 'T2'` — NEVER as the bare `t !== 'T2'`.
 *
 * The negative form is how this survived twice: it admits every value that is not the literal string `'T2'`,
 * including every value that is not a governance class at all, so a row carrying `tier:'T3'` was served as
 * though it were ratified `T1`-or-stricter. That is reachable with no write door at all — `.atlas/` is a
 * COMMITTED artifact, so a repository can ship a projection plus a CAS blob that never passed a gate, and
 * the content re-hash on read confirms the BYTES, not their governance. An unrecognized class is not `≥T1`;
 * it is not a class, and it is bounded out. Byte-exact via the ONE lattice guard (`isTier`), never a local
 * string comparison.
 */
export const atLeastT1 = (inv: PackInvariant): boolean => isTier(inv.tier) && inv.tier !== 'T2';

/** The pack envelope fields the caller owns — everything about a `Pack` that is NOT its invariant set. */
export interface PackFrame {
  readonly territory: string;
  readonly axisHash: Hash;
  /** `true` MUST mean re-ground before trusting (TOOLS-6c) — never silently downgraded here. */
  readonly stale: boolean;
}

/**
 * Mint a `Pack` from `(CurrentNode, GroundedFact)` pairs — THE single Pack-assembly seam in this package.
 * Shapes each pair through `factToInvariant`, BOUNDS the result to `tier≥T1` (`atLeastT1`), sorts by
 * `nodeId` (deterministic: equal queries are byte-identical), and derives the advisory token estimate from
 * the BOUNDED set (a bounded-out invariant must not inflate the budget either). Pure + total.
 */
export function mintPack(frame: PackFrame, pairs: Iterable<readonly [CurrentNode, GroundedFact]>): Pack {
  const invariants: PackInvariant[] = [];
  for (const [node, fact] of pairs) {
    const inv = factToInvariant(node, fact);
    if (!atLeastT1(inv)) continue; // TOOLS-6 bound — applied at the MINT, so no mode can forget it
    invariants.push(inv);
  }
  invariants.sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));
  return {
    territory: frame.territory,
    axisHash: frame.axisHash,
    invariants,
    tokenEstimate: invariants.reduce((sum, i) => sum + i.claim.length, 0),
    stale: frame.stale,
  };
}
