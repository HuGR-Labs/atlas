// @atlas/knowledge — src/write/near-dup.ts  (KNOW-15h · the near-duplicate probe)
//
// The deterministic near-duplicate leg of the write decision, split out of router.ts (co-located here so
// router.ts stays within the ≤400-LOC ceiling and this is the home for the adjacency matcher). The EXACT
// claimNorm-collision probe is airtight and pure; the near-SYNONYM metric (0<sim<1) + the move-aware
// adjacency matcher are the OPEN-DEFINE residue (SCN-KNOW-15h-2), deliberately NOT invented here.

import type { Candidate } from '../types.js';
import type { NearDupConfig } from './router.js';

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
