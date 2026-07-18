// @atlas/index — ref/coverage.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The standing coverage gate (INDEX-16), NOT reactive. The `unresolved`-edge ratio (`unresolved/total`)
// is a per-territory published health metric on every rollup; the T0 ceiling (>15%) is enforced as a
// standing gate FROM DAY ONE — a T0 territory that crosses it FAILS the gate (never merely schedules
// the `functional` axis). (atlas-index:127-140, 202-205; method-tags-idx:125-130)

import type { Territory } from '@atlas/contracts';

export interface CoverageApi {
  /** The per-territory published health metric: `unresolvedEdges / totalEdges` (INDEX-16). Readable on
   *  the rollup. (method-tags-idx:129) */
  ratio(territory: Territory): number;

  /** The standing gate: reference `gate(territory) = tier==T0 ∧ ratio>0.15 ⇒ FAIL` (method-tags-idx:129).
   *
   *  [FLAG — boolean polarity not pinned] The reference states the FAIL CONDITION but not whether the
   *  returned `boolean` is `true`=pass or `true`=fail. Transcribed as the reference gives it (a boolean
   *  verdict) WITHOUT choosing a polarity — flagged for the WP to fix the convention (recommend
   *  `true`=PASS to read as a gate predicate, but not invented here). */
  gate(territory: Territory): boolean;
}
