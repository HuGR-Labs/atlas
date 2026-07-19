// @atlas/knowledge — src/freshness.ts  (WP-4.10-a.KNOW · knowledge drift-verdict binding site)
//
// KNOW-3 (atlas-knowledge:53): the drift oracle is the BLAKE3 `subtreeHash`, NOT a line-range — a
// reformat/rename/import-above stays FRESH; a real change to the cited unit DRIFTs. This module is the
// KNOWLEDGE-LAYER BINDING that wires a Knowledge fact's freshness verdict to GROUND's frozen
// drift-oracle (`@atlas/grounding` `DriftApi.driftDetect`, WP-4.10-a.GROUND). It CONSUMES the oracle;
// it does NOT redefine it, and it computes NO hash itself (the subtreeHash compute lives in GROUND /
// grounding-ref/subtree.ts and is re-checked there — SEAM: consume-only, no raw hashing here).
//
// BUILD-AHEAD: `@atlas/grounding` ships zero runtime yet (its barrel is `export type *`), so the oracle
// is injected as a `DriftApi` dependency (types-only import) rather than statically imported — the
// binding is written against the FROZEN grounding interface + a fixture oracle, ahead of GROUND's impl.
//
// SCOPE (card exclusions): NOT the subtreeHash compute (owned by GROUND); NOT the write-decision/upsert
// (EPIC-13); NOT the drift mechanical/semantic split nor the advisory→STALE router (EPIC-12 / GROUND-13).
// A Knowledge fact carries the 2-state `KnowledgeFreshness` (FRESH | DRIFTED — no STALE, types.ts):
// the structural verdict is FRESH iff the oracle says FRESH, else DRIFTED (fail-closed narrowing).

import type { DriftApi } from '@atlas/grounding';
import type { Axes } from '@atlas/index';
import type { GroundedFact, KnowledgeFreshness } from './types.js';

/**
 * The bound Knowledge drift-verdict function: `freshness(fact, tree)` (KNOW-3a/3b/3c). Given a built-
 * index snapshot `tree` (`@atlas/index` `Axes` — the GROUND-pinned drift source-of-truth carrier), it
 * returns the fact's 2-state `KnowledgeFreshness`.
 */
export type Freshness = (fact: GroundedFact, tree: Axes) => KnowledgeFreshness;

/**
 * Bind the Knowledge drift-verdict to GROUND's drift oracle.
 *
 * The returned `freshness(fact, tree)`:
 *   - delegates entirely to `oracle.driftDetect(fact.grounding, tree)` — the drift oracle is the anchor
 *     `subtreeHash` re-checked against the current tree (KNOW-3a); no line number, no local re-hash;
 *   - narrows the canonical 3-state grounding `Freshness` down to the 2-state Knowledge vocabulary:
 *     `FRESH` stays `FRESH`; anything else (`DRIFTED`, or a `STALE` the layer never sees for KNOW-3)
 *     is `DRIFTED` (fail-closed — a non-FRESH structural verdict never surfaces as FRESH).
 *
 * Because the verdict IS the oracle's verdict, cosmetic edits that leave `subtreeHash` unchanged stay
 * FRESH (KNOW-3b) and a real change that moves `subtreeHash` DRIFTs (KNOW-3c) — the discipline is the
 * oracle's, consumed here, never re-implemented. Pure + total (as pure/total as the injected oracle).
 */
export function bindFreshness(oracle: DriftApi): Freshness {
  return (fact: GroundedFact, tree: Axes): KnowledgeFreshness => {
    const verdict = oracle.driftDetect(fact.grounding, tree);
    return verdict === 'FRESH' ? 'FRESH' : 'DRIFTED';
  };
}
