// @atlas/retrieval — src/drop.ts  (WP-6.22.RETR · injection ceiling + drop-by-hit-rate + fail-closed stale)
//
// The per-turn injection-budget enforcer (RETR-6) + fail-closed staleness (RETR-3) — one seam-freeze
// ("injection-budget + fresh-pack contract") owned by RETR, consumed by TOOLS (WP-6.22.TOOLS). The SUM of
// everything auto-injected in a turn MUST respect the hard `~5K` ceiling under the pinned `cl100k_base`
// measure; on overflow, DROPPABLE kinds drop by OBSERVED per-kind `hitRate` — least-used first (the RETR-8
// ledger, WP-6.18.RETR) — never a hardcoded order. TWO kinds are exempt and MUST NOT drop, ever:
// `awareness` (Awareness.constitution, T0) and `protocols.safetyCritical` (T0-adjacent). Until the ledger
// has data (cold start) the documented cold-start default order applies; once it has data every non-pin
// kind reorders by observed `hitRate`. A per-kind drop-counter is ledgered (a kind dropped `>20%` of turns
// is mis-capped / mis-prioritized). RETR-3: a pack whose `stale` is `true` MUST NOT be trusted as-is — it
// is re-grounded BEFORE use; `stale` == the exact OR over its backings' drift-bit (never a guess).
// Transcribed from atlas-retrieval:77-78 / 96-117 + goldens-ret.md §Fixture B / §REQ-RETR-6 / §REQ-RETR-3.
//
// SEAM CONSUMER. The facet READS the RETR-8 hits/hitRate ledger (WP-6.18.RETR) + the per-turn pinned
// `cl100k_base` `tokenEstimate` the index supplies; it NEVER tokenizes and NEVER hashes (identity is minted
// only through the sealed @atlas/kernel `asHash`; no raw hashing here). `related` is NOT a member of the
// frozen @atlas/contracts `InjectionKind` closed vocabulary (goldens §Fixture B names it, but the sealed
// enum does not) — never invented onto the frozen enum; the single frozen `awareness` is the constitution
// pin (there is no separate awareness-tail kind).
//
// [FLAG — `dropOrder` returns the ranked drop SEQUENCE, not a ceiling-truncated set] the frozen `DropApi`
// (ref/drop.ts) is `dropOrder(items: readonly Budget[]): readonly InjectionKind[]`, and the frozen `Budget`
// (@atlas/contracts) carries `capTokens`, NOT this turn's actual `tokenEstimate`. So `dropOrder` can only
// yield the deterministic drop ORDERING (drop-first first, pins excluded); the ceiling arithmetic ("drop
// from the bottom until sum ≤ ~5K") needs the per-turn count and lives in `resolveCeiling`, which shares
// the identical order. NOT widened onto the frozen `Budget`.
//
// [FLAG — hitRate-tie secondary key κ is an OPEN DEFINE dependency] method-tags-ret §RETR-6/8 guarantee a
// deterministic TOTAL order over kinds but do NOT name the secondary tie-key κ when two kinds tie on
// `hitRate` ([NEEDS RECONCILIATION], goldens §SCN-RETR-6b-2 `gen: residue`). The determinism MUST is fully
// pinned, so this facet MUST ship a total order; it uses the reference's own documented COLD-START PRIORITY
// order as the tie-break backbone (a pinned artifact, not an invented value). If DEFINE later ratifies a
// distinct κ, only the tie-break line changes; the residue golden asserts determinism only, not a κ outcome.

import type { Budget, InjectionKind, Pack } from '@atlas/contracts';
import type { DropApi } from '../ref/drop.js';
import type { StaleApi } from '../ref/stale.js';

/** The hard injection ceiling `~5K` (RETR-6), a concrete count under the pinned `cl100k_base` measure. */
export const CEILING = 5000;
/** A kind dropped on `>20%` of turns is mis-capped / mis-prioritized (RETR-6f drop-counter threshold). */
export const MISCAP_THRESHOLD = 0.2;

/** The two exempt kinds — the constitution (T0) and safety-critical protocols (T0-adjacent) NEVER drop. */
const PINS: ReadonlySet<InjectionKind> = new Set(['awareness', 'protocols.safetyCritical']);
/** A kind is pinned iff it is one of the two exempt kinds (derived from the kind alone). */
export const isPin = (kind: InjectionKind): boolean => PINS.has(kind);

/**
 * The documented COLD-START drop order (atlas-retrieval:96-106), drop-FIRST first (lowest priority first),
 * in the frozen `InjectionKind` vocabulary: the reference cold-start priority is `Orientation → project-Rules
 * → own → pack → (related) → protocols.advisory → poke`; dropping from the bottom yields this ascending
 * order. `related` is not in the frozen enum; the two pins are the highest priority and never appear here.
 * This map is also the deterministic tie-break backbone (κ) for the warm regime.
 */
const COLD_START_DROP_RANK: Readonly<Record<InjectionKind, number>> = {
  poke: 0,
  'protocols.advisory': 1,
  pack: 2,
  own: 3,
  projectMem: 4,
  orientation: 5,
  'protocols.safetyCritical': 98, // pin — never dropped (excluded before ranking)
  awareness: 99, // pin — never dropped
};

/** The minimal ledger shape the drop order reads: the kind + its observed `hitRate`/`hits` (RETR-8). */
interface DropRow {
  readonly kind: InjectionKind;
  readonly hitRate: number;
  readonly hits: number;
}

/**
 * The deterministic TOTAL drop order over the DROPPABLE kinds (pins excluded), drop-first first. WARM (the
 * ledger has data — any row has `hits > 0`): `hitRate-asc` (least-used dropped first), ties broken by the
 * documented cold-start priority (the κ backbone — see file FLAG). COLD (no data yet): purely the cold-start
 * priority order. Pure + total; never a hashmap-iteration / insertion order.
 */
function orderDroppable(rows: readonly DropRow[]): InjectionKind[] {
  const warm = rows.some((r) => r.hits > 0);
  return rows
    .filter((r) => !isPin(r.kind))
    .slice()
    .sort((a, b) =>
      warm && a.hitRate !== b.hitRate
        ? a.hitRate - b.hitRate // hitRate-asc: the least-used kind drops first (RETR-6b / RETR-8)
        : COLD_START_DROP_RANK[a.kind] - COLD_START_DROP_RANK[b.kind],
    )
    .map((r) => r.kind);
}

/**
 * The drop order under capacity (RETR-6), satisfies the frozen `DropApi`: orders the droppable kinds by
 * `(pinned-desc, hitRate-asc)` — the two pins never appear — with the cold-start default until the ledger
 * has data. Returns the ranked drop SEQUENCE (see file FLAG: the ceiling truncation is `resolveCeiling`'s,
 * which needs the per-turn `tokenEstimate` absent from the frozen `Budget`). Pure + total.
 */
export function dropOrder(items: readonly Budget[]): readonly InjectionKind[] {
  return orderDroppable(items);
}

// ── the per-turn ceiling enforcer (RETR-6a/6b/6c) ────────────────────────────────────────────────────────

/** One turn's actual injection: the pinned `cl100k_base` `tokenEstimate` + the RETR-8 observed hitRate/hits. */
export interface Injection {
  readonly kind: InjectionKind;
  readonly tokenEstimate: number; // this turn's pinned cl100k_base count (index-supplied; never tokenized here)
  readonly hitRate: number;
  readonly hits: number;
}

/** The outcome of enforcing the ceiling on one turn's injections: who survived, who dropped, the final sum. */
export interface CeilingResult {
  readonly survivors: readonly Injection[];
  readonly dropped: readonly InjectionKind[]; // in drop order (least-used first)
  readonly sum: number; // post-drop total ≤ CEILING (unless only the two pins remain over the ceiling)
}

/**
 * Enforce the `~5K` ceiling on one turn's injections (RETR-6a): if the sum exceeds the ceiling, drop the
 * droppable kinds in `orderDroppable` order (least-used first / cold-start default) until `sum ≤ CEILING`.
 * The two pins are NEVER dropped, even under heavy overflow (RETR-6c) — the ceiling yields to the pins.
 * Deterministic; total.
 */
export function resolveCeiling(injections: readonly Injection[], ceiling: number = CEILING): CeilingResult {
  const order = orderDroppable(injections);
  const byKind = new Map(injections.map((i) => [i.kind, i] as const));
  const surviving = new Set(injections);
  const dropped: InjectionKind[] = [];
  let sum = injections.reduce((s, i) => s + i.tokenEstimate, 0);
  for (const kind of order) {
    if (sum <= ceiling) break;
    const victim = byKind.get(kind);
    if (victim === undefined) continue;
    surviving.delete(victim);
    dropped.push(kind);
    sum -= victim.tokenEstimate;
  }
  return { survivors: injections.filter((i) => surviving.has(i)), dropped, sum };
}

// ── the per-kind drop-counter ledger (RETR-6f) ───────────────────────────────────────────────────────────

/** A per-kind drop-counter row: how many of the last `turns` turns dropped `kind`, its rate, and the flag. */
export interface DropStat {
  readonly kind: InjectionKind;
  readonly dropped: number;
  readonly turns: number;
  readonly rate: number;
  readonly flagged: boolean; // rate > MISCAP_THRESHOLD ⇒ mis-capped / mis-prioritized
}

/**
 * Ledger the per-kind drop-counter over a window of turns (RETR-6f): each turn is the set of kinds dropped
 * that turn; a kind whose drop-rate exceeds `MISCAP_THRESHOLD` (`>20%`) is flagged mis-capped. Deterministic.
 */
export function dropCounter(history: readonly (readonly InjectionKind[])[]): readonly DropStat[] {
  const turns = history.length;
  const counts = new Map<InjectionKind, number>();
  for (const turn of history) for (const kind of new Set(turn)) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  return [...counts.entries()]
    .map(([kind, dropped]): DropStat => {
      const rate = turns === 0 ? 0 : dropped / turns;
      return { kind, dropped, turns, rate, flagged: rate > MISCAP_THRESHOLD };
    })
    .sort((a, b) => COLD_START_DROP_RANK[a.kind] - COLD_START_DROP_RANK[b.kind]); // deterministic key order
}

// ── fail-closed staleness (RETR-3) ───────────────────────────────────────────────────────────────────────

/**
 * Pack staleness (RETR-3c), satisfies the frozen `StaleApi`: `= OR(backings.drifted)` — `true` iff ANY
 * backing grounding drifted (the exact OR over the index drift-oracle's drift-bit, never an age/TTL guess).
 * The empty backing set is `false` (the identity element of OR). Pure + deterministic.
 */
export function isStale(backings: readonly { readonly drifted: boolean }[]): boolean {
  return backings.some((b) => b.drifted);
}

/** A `stale:true` pack is NOT trusted as-is (RETR-3a); a fresh (`stale:false`) pack is trusted. Pure. */
export function isTrusted(p: { readonly stale: boolean }): boolean {
  return !p.stale;
}

/**
 * The fail-closed read path (RETR-3a/3b): a fresh pack is served as-is; a `stale` pack is routed through
 * `reground` BEFORE use, and only the re-grounded (`stale:false`) pack is served. If re-grounding still
 * drifts, the pack is NOT served (`null`) — a stale pack is never trusted. Deterministic given `reground`.
 */
export function servePack(p: Pack, reground: (p: Pack) => Pack): Pack | null {
  if (!p.stale) return p; // fresh: trusted, served as-is
  const fresh = reground(p); // stale: re-ground BEFORE use (RETR-3b)
  return fresh.stale ? null : fresh; // fail-closed: never serve a still-stale pack (RETR-3a)
}

// ── frozen-interface BIND (compile-time only) ────────────────────────────────────────────────────────────
const _dropBind = { dropOrder } satisfies DropApi;
const _staleBind = { isStale } satisfies StaleApi;
void _dropBind;
void _staleBind;
