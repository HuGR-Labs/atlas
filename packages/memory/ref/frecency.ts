// @atlas/memory — ref/frecency.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Frecency eviction (MEM-7) — decay = DE-ACTIVATION, not deletion. The injected `project` set is a FIXED
// slot count — the top entries ranked by `frecency`, a SINGLE time-decayed score of logged CITED hits.
// A `hit` is a LOGGED EVENT: it increments ONLY when a seat / cold-reviewer explicitly CITES this
// rule-id as governing a decision ("rule applied") in the event ledger — a real denominator, an auditable
// promotion bar; NOT a self-assessed "prevented a mistake". An entry whose `frecency` decays to ~zero is
// EVICTED to the archive (retained, versioned, re-spawnable — no memory ever dies); an old-popular rule
// cannot pin a slot (the LFU-ossification failure a cumulative count causes). Deterministic, ledger-driven
// — decay is over LOGGED WAVES, never wall-clock (Refuse-to-model). Tag PBT-by-shape (deterministic
// eviction ordering under capacity — the RETR-6 drop-order shape). Transcribed from method-tags-mem:63-68
// (INV-MEM-7 down-model) + atlas-memory:76-79, 121.
//
// The injected slot count is a ratified bound, left as PROSE not code: top 12 entries (orchestrator MAY
// hold more within its ~800 cap).

import type { ProjectMemoryEntry } from './types.js';

/**
 * One logged, CITED hit — a ledger event where a seat / cold-reviewer cited a rule-id as governing a
 * decision (MEM-7). The DENOMINATOR of the frecency score.
 *
 * [FLAG — `ruleId` is NOT a frozen field of `ProjectMemoryEntry`] MEM-7 cites a "rule-id" in the ledger,
 * but the frozen `ProjectMemoryEntry` template (`{rule, scope, grounding?, frecency}`) carries NO id
 * field. Transcribed as `ruleId: string`; flagged UPWARD for the reference to surface the entry↔ledger
 * identity key the citation binds to.
 *
 * [SIG-TBD — `wave` unit] the decay step is over LOGGED ledger events / waves, never wall-clock; the
 * ordering key is transcribed as `wave: number` (a logical position), NOT a clock brand.
 */
export interface CitedHit {
  readonly ruleId: string; // [FLAG] no id on ProjectMemoryEntry — the entry↔ledger key is unfrozen
  readonly wave: number; // [SIG-TBD] logical ledger position — ledger-driven, NOT wall-clock
}

/** The append-only ledger of cited hits the frecency score decays over (MEM-7). */
export type HitLedger = readonly CitedHit[];

/**
 * The rank/evict result (MEM-7). `injected` = the top-slots hot set; `evicted` = decayed-to-~zero entries
 * moved to the archive (retained, re-spawnable — never deleted). A total, deterministic partition.
 */
export interface FrecencyRanking {
  readonly injected: readonly ProjectMemoryEntry[]; // top-N by frecency — the hot set
  readonly evicted: readonly ProjectMemoryEntry[]; // ~zero-frecency — archived, versioned, re-spawnable
}

export interface FrecencyApi {
  /** The single time-decayed frecency score of an entry = `decay(Σ cited-hit events)` over the ledger;
   *  decayed on read/write; near-zero ⇒ eviction (MEM-7). Pure + deterministic. (method-tags-mem:67) */
  score(entry: ProjectMemoryEntry, ledger: HitLedger): number;

  /** Rank the injected set: sort-desc by `score`, take the top slots; partition off the ~zero-frecency
   *  evictions to the archive. TOTAL order with a deterministic tie-break; an old-popular rule cannot pin
   *  a slot; no memory deleted (MEM-7). Pure + deterministic. (method-tags-mem:67) */
  rank(entries: readonly ProjectMemoryEntry[], ledger: HitLedger): FrecencyRanking;
}
