// @atlas/retrieval — ref/offatlas.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The MISS-oracle — off-atlas coverage per territory (RETR-13). The ledger logs, per territory, an
// OFF-ATLAS RATE = the fraction of served turns in which a seat had to `Read`/`Grep` OUTSIDE the
// surfaced scope-set to finish (the served pack under-covered the work). Where `hits` (RETR-8) measure
// the PRECISION of what was served, the off-atlas rate measures COVERAGE — the one silent failure the
// drift-oracle (RETR-3) cannot see, because unanchored knowledge has no grounding to drift. A territory
// whose off-atlas rate crosses a threshold MUST raise a calibration prompt to author the missing
// tag/edge. Deterministic; a territory with no served history yields rate `0`, never a throw.
// Transcribed from atlas-retrieval:154-162 / method-tags-ret:105-110.
//
// [OPEN DEFINE — RETR-13 threshold is PARAMETRIC, not baked] The off-atlas value that triggers the
// calibration prompt (REQ-RETR-13b) is an OPEN reconciliation routed to DEFINE (method-tags-ret:110,
// 122; `req-ret.md` §[NEEDS RECONCILIATION]). It is SILENT in the reference clause and MUST NOT be
// invented at S2. The surface below is written threshold-PARAMETRIC: the concrete number is supplied by
// DEFINE and bound by S3's golden. See `OffAtlasThreshold` + `crossesThreshold` below.

import type { OffAtlas } from './types.js';

/**
 * [OPEN DEFINE — RETR-13] The off-atlas rate value that triggers a calibration prompt. The reference is
 * SILENT on this number (an open DEFINE reconciliation); it is transcribed as a parameter — a
 * `number` — NEVER a baked constant. S3's golden binds the concrete value once DEFINE supplies it.
 */
export type OffAtlasThreshold = number;

export interface OffatlasApi {
  /** Per-territory coverage ledger (the MISS-oracle, RETR-13): each territory's `served` /
   *  `offAtlasReads` / `offAtlasRate`. Deterministic; a territory with no served history reports rate
   *  `0`, never a throw. (atlas-retrieval:174) */
  offAtlas(): readonly OffAtlas[];

  /** The threshold-crossing predicate (RETR-13), written PARAMETRIC over the OPEN-DEFINE threshold: a
   *  territory whose off-atlas rate crosses `threshold` MUST raise a calibration prompt to author the
   *  missing tag/edge. Pure + total (no served history ⇒ `false`, never a throw). The concrete
   *  `threshold` is an OPEN DEFINE dependency — supplied at DEFINE, bound by S3's golden, NOT invented
   *  here. (method-tags-ret:109-110)
   *
   *  [FLAG — `territory` arg type] transcribed as `string` (the territory name / governance key),
   *  matching `OffAtlas.territory`. */
  crossesThreshold(territory: string, threshold: OffAtlasThreshold): boolean;
}
