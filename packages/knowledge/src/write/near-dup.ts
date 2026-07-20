// @atlas/knowledge — src/write/near-dup.ts  (KNOW-15h · the near-duplicate probe)
//
// The deterministic near-duplicate leg of the write decision, split out of router.ts (co-located here so
// router.ts stays within the ≤400-LOC ceiling and this is the home for the adjacency matcher). The EXACT
// claimNorm-collision probe is airtight and pure; the near-SYNONYM metric (0<sim<1) + the move-aware
// adjacency matcher are the OPEN-DEFINE residue (SCN-KNOW-15h-2), deliberately NOT invented here.

import type { Candidate } from '../types.js';
import type { NearDupConfig, StoreProjection } from './router.js';

/** EXACT normalized claim similarity — the AIRTIGHT leg. Returns `1` iff the claims are byte-identical
 *  after NFC+trim, else `0`. The near-SYNONYM metric (`0 < sim < 1`) is an OPEN-DEFINE threshold τ
 *  (residue SCN-KNOW-15h-2) — deliberately NOT invented here. */
function claimSimilarity(a: string, b: string): 0 | 1 {
  return a.normalize('NFC').trim() === b.normalize('NFC').trim() ? 1 : 0;
}

/**
 * The deterministic near-duplicate probe run BEFORE any CREATE (KNOW-15h): a `claimNorm` collision with
 * an existing sibling-slot claim forces MERGE/UPDATE rather than minting a parallel node (door-2). The
 * `claimNormThreshold` is surfaced as an EXPLICIT parameter (frozen `NearDupConfig`) — the OPEN-DEFINE τ
 * is a config the caller supplies, never a baked-in constant. Pure + total, no LLM. Reports a collision
 * iff some existing normalized claim reaches the threshold (exact match ⇒ `sim=1`, fires for any τ ≤ 1).
 */
export function nearDuplicateProbe(
  candidate: Candidate,
  existingClaimNorms: readonly string[],
  cfg: NearDupConfig,
): boolean {
  return existingClaimNorms.some((c) => claimSimilarity(candidate.claimNorm, c) >= cfg.claimNormThreshold);
}

/** `true` iff `short`'s segments are a leading run of `long`'s — the segment-wise structural-prefix
 *  test on `::`-split anchor paths. The degenerate equal case (`short === long`) is a prefix. Total. */
function isPrefix(short: readonly string[], long: readonly string[]): boolean {
  if (short.length > long.length) return false;
  for (let i = 0; i < short.length; i++) if (short[i] !== long[i]) return false;
  return true;
}

/** The length (in `::`-segments) of the longest common leading run of two anchor paths — the
 *  structural-nearness metric that ranks colliding neighbors (longer ⇒ nearer). Total. */
function commonPrefixLen(a: readonly string[], b: readonly string[]): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/**
 * The STRUCTURAL adjacency near-duplicate matcher (WP-ADJACENCY-B, KNOW-15h move-aware leg). A CREATE
 * whose `claimNorm` EXACTLY matches a claim already carried by a node at an ADJACENT code granularity is
 * re-routed to MERGE into that neighbor rather than minting a parallel node. Deterministic, NO embeddings,
 * EXACT `claimNorm` only (reuses the airtight `claimSimilarity` above; the near-SYNONYM τ stays OPEN-DEFINE).
 *
 * ADJACENCY = ANY-prefix (frozen decision 1): on the `::`-split anchor segments, a neighbor `n` is adjacent
 * to the candidate iff `nSegs` is a structural prefix of `candSegs` (an ANCESTOR unit) OR `candSegs` is a
 * prefix of `nSegs` (a DESCENDANT unit). Same-anchor is the degenerate prefix (included). SIBLING SLOTS =
 * ALL slots (no slot filter — `(primaryAnchor, *)`, frozen decision 2). COLLISION = the neighbor carries a
 * claim `c` with `claimSimilarity(claimNorm, c) >= cfg.claimNormThreshold` (frozen decision 3). On MULTIPLE
 * colliding neighbors the MERGE TARGET is the NEAREST — the longest common `::`-prefix to the candidate,
 * tie-broken by `nodeKey` lexicographic ascending (frozen decision 4, deterministic). Pure + total, no throw.
 */
export function adjacencyNearDup(
  primaryAnchor: string,
  claimNorm: string,
  projection: StoreProjection,
  cfg: NearDupConfig,
): { collision: boolean; mergeTarget?: string } {
  if (primaryAnchor === '') return { collision: false }; // empty/'' anchor ⇒ no candSegs ⇒ total no-op
  const candSegs = primaryAnchor.split('::');
  let best: { key: string; cpl: number } | undefined;
  for (const n of projection.current.values()) {
    if (n.primaryAnchor === undefined) continue; // only anchored neighbors participate
    const nSegs = n.primaryAnchor.split('::');
    if (!(isPrefix(nSegs, candSegs) || isPrefix(candSegs, nSegs))) continue; // ancestor OR descendant
    if (!n.claims.some((c) => claimSimilarity(claimNorm, c) >= cfg.claimNormThreshold)) continue; // EXACT leg
    const cpl = commonPrefixLen(candSegs, nSegs);
    if (best === undefined || cpl > best.cpl || (cpl === best.cpl && n.nodeKey < best.key)) {
      best = { key: n.nodeKey, cpl }; // NEAREST: longest common prefix, tie-break nodeKey ascending
    }
  }
  return best === undefined ? { collision: false } : { collision: true, mergeTarget: best.key };
}
