// @atlas/grounding — src/drift.ts   (WP-4.10-a.GROUND · GROUND-1 / GROUND-2 / GROUND-3 / GROUND-5)
//
// The LOCAL single-entry drift oracle + the real-grounding predicate.
//   - `isGrounded(g)`  — GROUND-2: `g` is real iff it has ≥1 entry AND EVERY entry carries a non-empty
//     `subtreeHash`. An empty/partial grounding fails and MUST never surface FRESH.
//   - `driftDetect(grounding, src)` — the freshness verdict against the BUILT-index snapshot `src`
//     (Owner-DEFINE pin: `Axes`). FRESH iff `isGrounded` AND every anchor's recorded `subtreeHash` still
//     RESOLVES to the same structural unit in `src` (GROUND-1: the oracle is `subtreeHash`, never
//     `displayLines`/line-ranges). An ungrounded grounding is DRIFTED (GROUND-2); an unresolvable citation
//     is DRIFTED, fail-closed, NEVER a throw (GROUND-3); a real change to the cited unit's normalized
//     subtree is DRIFTED (GROUND-5). Both pure + total. Transcribed against the frozen oracles
//     `./types.ts` (`DriftApi.driftDetect` + `GroundApi.isGrounded`).
//
// SCOPE (card exclusions): NOT the GROUND-11 forward-closure interface fold (owned by WP-4.10-b.GROUND) —
// this slice folds only the LOCAL grounding-set; NOT the GROUND-13 advisory→`STALE` routing (owned by
// WP-4.12-a.GROUND, keys on the UPWARD-owned `Fact.kind` this layer MUST NOT import). `driftDetect`
// therefore returns the raw LOCAL structural `Freshness` — `FRESH` | `DRIFTED`, never `STALE` here.
// The `ground(node)` verb is DEFINE-parked (its `node` type is unpinned) and CARVED to a successor WP —
// `isGrounded` (its co-verb in `GroundApi`) is co-located here with `driftDetect`, which depends on it.

import type { Freshness, SubtreeHash } from '@atlas/contracts';
import type { Axes, IndexNode } from '@atlas/index';
import type { Grounding, DriftApi, GroundApi } from './types.js';

/** Resolve a structural unit's CURRENT subtreeHash in `node`'s subtree by its qualified key (the anchor's
 *  `qualifiedPath`). Total: an absent unit returns `undefined` (unresolvable), never a throw. */
function findByKey(node: IndexNode, key: string): SubtreeHash | undefined {
  if (node.key === key) return node.subtreeHash;
  for (const child of node.children) {
    const hit = findByKey(child, key);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/** The current subtreeHash of `qualifiedPath` across the built-index axes, or `undefined` if the unit is
 *  gone/unresolvable (GROUND-3 fail-closed). `displayLines`/line-ranges are never consulted (GROUND-1). */
function resolveCurrent(src: Axes, qualifiedPath: string): SubtreeHash | undefined {
  for (const root of [src.spatial, src.territory, src.dependency]) {
    const hit = findByKey(root, qualifiedPath);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/**
 * GROUND-2 real-grounding predicate: `true` iff `g` has ≥1 entry AND every entry's `anchor.subtreeHash`
 * is non-empty. The conjunct is `every` (AND), never `some` (OR) — one empty anchor sinks the grounding.
 * Conforms to the frozen `GroundApi.isGrounded`. Pure + total.
 */
export const isGrounded: GroundApi['isGrounded'] = (g: Grounding): boolean =>
  g.entries.length >= 1 && g.entries.every((e) => e.anchor.subtreeHash.length > 0);

/**
 * GROUND-1/2/3/5 local freshness verdict against the built-index snapshot `src`. Conforms to the frozen
 * `DriftApi.driftDetect(grounding, src)`. Pure + total (no clock, no IO, no throw):
 *   - `¬isGrounded(grounding)`                              ⇒ DRIFTED (GROUND-2: ungrounded never FRESH).
 *   - an anchor whose unit is gone/unresolvable in `src`    ⇒ DRIFTED (GROUND-3: fail-closed, no throw).
 *   - an anchor whose current subtreeHash ≠ the recorded one ⇒ DRIFTED (GROUND-5: a real change drifts).
 *   - every anchor resolves and matches                     ⇒ FRESH   (GROUND-1/5: subtreeHash-only, a
 *                                                              reformat / line-shift / rename stays FRESH).
 */
export const driftDetect: DriftApi['driftDetect'] = (grounding: Grounding, src: Axes): Freshness => {
  if (!isGrounded(grounding)) return 'DRIFTED';
  for (const e of grounding.entries) {
    const current = resolveCurrent(src, e.anchor.qualifiedPath);
    if (current === undefined || current !== e.anchor.subtreeHash) return 'DRIFTED';
  }
  return 'FRESH';
};
