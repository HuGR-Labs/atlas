// @atlas/retrieval — src/ledger.ts  (WP-6.18.RETR · RETR-8 hits/hitRate ledger + caps tuned by observed hits)
//
// Calibration from observed use, not guesswork (RETR-8). This facet OWNS the per-kind hits/hitRate LEDGER
// (the `budget()` surface, ref/ledger.ts `LedgerApi`) AND the caps tuned by observed hits (ref/caps.ts
// `CapsApi.capFor`). The ledger is the calibration ORACLE that the ALREADY-BUILT drop-order (`src/drop.ts`,
// WP-6.22.RETR) and the caps CONSUME — `hits` measure PRECISION (served facts used), never COVERAGE (that
// is RETR-13's MISS-oracle, `src/offatlas.ts`). The drop ORDER itself is NOT re-implemented here — `drop.ts`
// owns `dropOrder`; this facet only produces the `Budget[]` (with `hitRate`) it reads.
// Transcribed from atlas-retrieval:113-117 / method-tags-ret:70-75 + goldens-ret.md §Fixture B / §REQ-RETR-8.
//
// SEAM. Identity is minted only through the sealed @atlas/kernel; this module NEVER hashes and NEVER
// tokenizes. `hits`/`hitRate` accrue by a COMMUTATIVE integer reduction over the served-injection records,
// so the ledger is deterministic and order-independent. The per-kind rows are emitted in a fixed key order
// (the frozen `InjectionKind` vocabulary, sorted), never hashmap-iteration order.
//
// [FLAG — cap-tuning gain is underspecified] REQ-RETR-8a normatively requires "caps tuned by the ledger's
// observed hits, never static guesswork" but the FORMULA is SILENT in the reference (like the RETR-6 tie-key
// κ / the RETR-13 threshold θ). So the mechanism is bound PARAMETRIC — a documented `gain` argument, NOT a
// baked magic constant. `capFor(kind) = round(base(kind) * (1 + gain*hitRate(kind)))`: a deterministic,
// monotone-in-hits response whose FLOOR at `hitRate = 0` is exactly the ratified RETR-7 sweet-spot (a
// never-used kind is untuned). SCN-RETR-8a-1 asserts only that the cap RESPONDS to observed hits (changes,
// never a constant); it does not pin the gain. If DEFINE ratifies a distinct tuning law, only `tunedCap`
// changes.

import type { Budget, InjectionKind } from '@atlas/contracts';
import type { LedgerApi } from '../ref/ledger.js';
import type { CapsApi } from '../ref/caps.js';

/**
 * The ratified RETR-7 sweet-spot caps under the pinned `cl100k_base` measure — the never-used FLOOR the
 * observed-hits tuning lifts from. Transcribed from atlas-retrieval:107-110 / goldens-ret.md §Fixture B
 * (Awareness `400` · Orientation `250` · projectMem `500` · own `1500` · pack `2000` ·
 * protocols.safetyCritical/advisory `500` shared · poke `150`). NOT invented.
 */
export const BASE_CAP: Readonly<Record<InjectionKind, number>> = {
  awareness: 400,
  orientation: 250,
  projectMem: 500,
  own: 1500,
  pack: 2000,
  'protocols.safetyCritical': 500,
  'protocols.advisory': 500,
  poke: 150,
};

/** The frozen `InjectionKind` vocabulary in a fixed sorted key order — the deterministic `budget()` order. */
const KINDS: readonly InjectionKind[] = (Object.keys(BASE_CAP) as InjectionKind[]).slice().sort();

/**
 * [FLAG — parametric, not baked] The default cap-tuning gain. The reference is SILENT on the tuning law
 * (REQ-RETR-8a routes the FORMULA to no pinned constant); this is a documented default, overridable per
 * `ledgerFrom`, never a hidden magic number. At `gain = 1` a fully-used kind (`hitRate = 1`) earns up to 2×
 * its sweet-spot; an unused kind stays at the floor.
 */
export const DEFAULT_TUNE_GAIN = 1;

/** One served injection: the `kind` injected + whether it governed a decision this turn (a RETR-8 hit). */
export interface HitRecord {
  readonly kind: InjectionKind;
  readonly hit: boolean;
}

/**
 * The tuned cap: `round(base * (1 + gain*hitRate))` — deterministic, monotone in `hitRate` (hence in
 * observed hits for a fixed served count), FLOORED at `base` when `hitRate = 0` (a never-used kind is
 * untuned). Pure + total. (RETR-8a)
 */
export function tunedCap(base: number, hitRate: number, gain: number = DEFAULT_TUNE_GAIN): number {
  return Math.round(base * (1 + gain * hitRate));
}

/** The RETR-8 ledger surface: the calibration `budget()` (LedgerApi) + caps tuned by observed hits (CapsApi). */
export interface RetrLedger extends LedgerApi, CapsApi {
  budget(): readonly Budget[];
  capFor(kind: InjectionKind): number;
}

/**
 * Build the RETR-8 ledger from a served-injection record set (RETR-8a/8b). `hits`/`served` accrue by a
 * COMMUTATIVE integer reduction (order-independent, deterministic); `hitRate = hits/served` (served `0` ⇒
 * `0`, never `NaN`); `capFor` tunes the ratified sweet-spot by observed `hitRate` (`gain`-parametric). The
 * emitted `budget()` rows are the drop-order oracle `src/drop.ts` reads — this facet does NOT order them.
 * Pure + total. `gain` is the documented, overridable tuning parameter (never a baked constant).
 */
export function ledgerFrom(records: readonly HitRecord[], gain: number = DEFAULT_TUNE_GAIN): RetrLedger {
  const served = new Map<InjectionKind, number>();
  const hitCount = new Map<InjectionKind, number>();
  for (const r of records) {
    served.set(r.kind, (served.get(r.kind) ?? 0) + 1);
    if (r.hit) hitCount.set(r.kind, (hitCount.get(r.kind) ?? 0) + 1);
  }
  const rateOf = (kind: InjectionKind): number => {
    const s = served.get(kind) ?? 0;
    return s === 0 ? 0 : (hitCount.get(kind) ?? 0) / s; // served 0 ⇒ 0, never NaN
  };
  const capFor = (kind: InjectionKind): number => tunedCap(BASE_CAP[kind], rateOf(kind), gain);
  const budget = (): readonly Budget[] =>
    KINDS.map((kind) => ({
      kind,
      capTokens: capFor(kind),
      hits: hitCount.get(kind) ?? 0,
      hitRate: rateOf(kind),
    }));
  return { budget, capFor };
}
