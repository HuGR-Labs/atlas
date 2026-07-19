// @atlas/retrieval — src/offatlas.ts  (WP-6.18.RETR · RETR-13 per-territory off-atlas MISS-oracle)
//
// The MISS-oracle — off-atlas coverage per territory (RETR-13), satisfying the frozen ref/offatlas.ts
// `OffatlasApi`. The ledger logs, per territory, an OFF-ATLAS RATE = `offAtlasReads / served` = the fraction
// of served turns in which a seat had to `Read`/`Grep` OUTSIDE the surfaced scope-set to finish (the served
// pack under-covered the work). Where RETR-8 `hits` measure PRECISION, this measures COVERAGE — the one
// silent failure the drift-oracle (RETR-3) cannot see, because un-anchored knowledge has no grounding to
// drift. A territory whose rate crosses a threshold MUST raise a calibration prompt to author the missing
// tag/edge. Deterministic; a territory with no served history yields rate `0`, NEVER a throw.
// Transcribed from atlas-retrieval:154-162 / method-tags-ret:105-110 + goldens-ret.md §REQ-RETR-13.
//
// Identity is minted only through the sealed @atlas/kernel; this module NEVER hashes and NEVER tokenizes.
// `served`/`offAtlasReads` accrue by a COMMUTATIVE integer reduction over the turn records, and `offAtlas()`
// emits rows in sorted territory order, so the ledger is deterministic + order-independent (SCN-RETR-13c-1).
//
// [DEFINE-park — RETR-13 threshold θ] The off-atlas value that triggers the calibration prompt (REQ-RETR-13b)
// is an OPEN DEFINE dependency — SILENT in the reference clause (`req-ret.md` §[NEEDS RECONCILIATION];
// ref/offatlas.ts `OffAtlasThreshold`). It is NOT invented here: `crossesThreshold` takes the threshold as an
// explicit PARAMETER (mirroring how `drop.ts` handled κ), with the frozen predicate `offAtlasRate > θ`
// (goldens SCN-RETR-13b-1). A no-history territory has rate `0`, so it crosses no non-negative θ (⇒ `false`).

import type { OffAtlas } from '../ref/types.js';
import type { OffatlasApi, OffAtlasThreshold } from '../ref/offatlas.js';

/** One served turn for a territory + whether the seat had to `Read`/`Grep` OUTSIDE the surfaced scope-set. */
export interface TurnRecord {
  readonly territory: string;
  readonly offAtlas: boolean;
}

/**
 * Build the RETR-13 off-atlas MISS-oracle from a served-turn record set. `served`/`offAtlasReads` accrue by
 * a COMMUTATIVE integer reduction (deterministic, order-independent). `known` names territories to include
 * with `served = 0` even when never served (a registered-but-unserved territory reports rate `0`, never a
 * throw — SCN-RETR-13d/e). Pure + total.
 *   - `offAtlas()`        — one row per (served ∪ known) territory, in sorted territory order.
 *   - `crossesThreshold`  — `offAtlasRate > threshold` (θ is a PARAMETER, an OPEN DEFINE dependency).
 */
export function offAtlasFrom(turns: readonly TurnRecord[], known: readonly string[] = []): OffatlasApi {
  const served = new Map<string, number>();
  const offReads = new Map<string, number>();
  for (const t of turns) {
    served.set(t.territory, (served.get(t.territory) ?? 0) + 1);
    if (t.offAtlas) offReads.set(t.territory, (offReads.get(t.territory) ?? 0) + 1);
  }
  for (const k of known) if (!served.has(k)) served.set(k, 0); // registered-but-unserved ⇒ served 0

  const rateOf = (territory: string): number => {
    const s = served.get(territory) ?? 0;
    return s === 0 ? 0 : (offReads.get(territory) ?? 0) / s; // no served history ⇒ 0, never NaN / throw
  };

  const offAtlas = (): readonly OffAtlas[] =>
    [...served.keys()].sort().map((territory) => ({
      territory,
      served: served.get(territory) ?? 0,
      offAtlasReads: offReads.get(territory) ?? 0,
      offAtlasRate: rateOf(territory),
    }));

  const crossesThreshold = (territory: string, threshold: OffAtlasThreshold): boolean =>
    rateOf(territory) > threshold; // parametric over the OPEN-DEFINE θ; total (unknown territory ⇒ rate 0)

  return { offAtlas, crossesThreshold };
}
