// @atlas/index — src/coverage.ts
//
// INDEX-16 — the STANDING coverage gate (not reactive). The unresolved-edge ratio (unresolved/total) is
// a per-territory published health metric on every rollup; the T0 ceiling (> 15%) is enforced as a
// standing gate FROM DAY ONE — a T0 territory that crosses it FAILs the gate (never merely schedules the
// `functional` axis). Transcribes ref/coverage.ts against goldens SCN-INDEX-16a-1/16b-1/16c-1.
//
// EXCLUSIONS: coverage-gate rule ONLY. This facet does NOT record/resolve edges (EPIC-8-b/13) nor assign
// territory (EPIC-9-a/14-15). The unresolved-edge set + territory assignment are consumed as FROZEN
// UPSTREAM INPUTS (per-territory tallies), never computed here. No sibling src is imported.

import type { Territory } from '@atlas/contracts';
import type { CoverageApi } from '../ref/coverage.js'; // types-only (frozen oracle surface)

/** The T0 unresolved-edge ceiling (INDEX-16): a T0 territory with ratio strictly above this FAILs. */
export const T0_COVERAGE_CEILING = 0.15;

/** A per-territory unresolved-edge tally — the FROZEN UPSTREAM INPUT. `territory` is the name assigned
 *  upstream (EPIC-9-a); `unresolved`/`total` summarise the upstream edge set (EPIC-8-b). Not a contract. */
export interface TerritoryEdgeTally {
  readonly territory: string;
  readonly unresolved: number;
  readonly total: number;
}

/** Build the CoverageApi over a frozen set of per-territory unresolved-edge tallies. */
export function createCoverage(tallies: readonly TerritoryEdgeTally[]): CoverageApi {
  const byName = new Map<string, TerritoryEdgeTally>();
  for (const t of tallies) byName.set(t.territory, t);

  const ratioOf = (territory: Territory): number => {
    const t = byName.get(territory.name);
    if (t === undefined || t.total === 0) return 0;
    return t.unresolved / t.total;
  };

  return {
    ratio(territory: Territory): number {
      return ratioOf(territory);
    },
    gate(territory: Territory): boolean {
      // Reference FAIL condition: tier==T0 ∧ ratio > 0.15 ⇒ FAIL.
      // Boolean polarity: `true`=PASS (ref recommendation; goldens pin the semantic FAIL, not the bit),
      // so a FAILing gate returns `false`.
      const fails = territory.tier === 'T0' && ratioOf(territory) > T0_COVERAGE_CEILING;
      return !fails;
    },
  };
}
