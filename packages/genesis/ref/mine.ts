// @atlas/genesis — ref/mine.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// S1 — git-history mining (GEN-1: `$0`, MECHANICAL, no LLM). Transcribed from atlas-genesis §S1
// (lines 42-67) + §Surface (line 187) + INV-GEN-6 (method-tags-gen:51-56) + INV-GEN-15
// (method-tags-gen:114-119). `mine` returns RANKED CANDIDATES, NEVER FACTS (GEN-6) — each mined signal
// (hotspots / SZZ / temporal-coupling / ownership) is a NAMED ranking heuristic that feeds only the
// candidate `rank`, never the fact set. A high-churn / high-SZZ site with no grounded invariant mints
// ZERO facts. `$0`, deterministic; the PPR ranking arm is delegated to `ref/rank.ts` (GEN-11).

import type { Candidate } from './types.js';

/**
 * The GEN-15 history-thin pre-check result. History is high-signal but degenerates SILENTLY on the repos
 * where it is weakest — young/greenfield, squashed / shallow-cloned history (kills `git blame` → SZZ +
 * co-change collapse), and initial-commit monorepo imports / vendored / generated code (blame resets to
 * one mega-commit). A cheap pre-check MUST detect this and fall the personalization vector back to
 * STRUCTURAL signals (PPR without history seeding + type/API-surface density) — history is a ranking
 * BOOSTER, never a dependency. GENESIS-HOME.
 *
 * [PINNED — oracle-pin-map §genesis, GEN-15] the carrier is `thin` (the boolean verdict) + an optional
 * `reason` drawn from GEN-15's three named triggers: `low-commit-count` (young/greenfield),
 * `shallow-clone` (squashed / shallow history kills blame → SZZ + co-change collapse), and
 * `blame-concentrated` (initial-commit monorepo import / vendored / generated). No fields beyond this.
 */
export interface HistoryProbe {
  readonly thin: boolean; // degenerate history detected → fall back to structural centrality
  readonly reason?: 'low-commit-count' | 'shallow-clone' | 'blame-concentrated';
}

export interface MineApi {
  /** S1 mining (GEN-6). MECHANICAL `$0`-LLM pure function of (repo, rev) that returns RANKED CANDIDATES,
   *  NEVER facts — SZZ (bug-introducing commits) + hotspots (change-freq × complexity) + temporal/logical
   *  coupling + ownership feed the candidate `signals`/`rank` ONLY. A signal is NOT a fact until grounded
   *  and ratified (GEN-6). The PPR ranking that fills `ppr`/`rank` is `ref/rank.ts` (GEN-11).
   *
   *  [FLAG — arg types] the surface `mine(repo, rev)` (atlas-genesis:187) leaves both untyped; transcribed
   *  as `string` / `string` (a repo path + a free-form git rev), mirroring `scan`. */
  mine(repo: string, rev: string): readonly Candidate[];

  /** GEN-15 history-thin pre-check. A cheap MECHANICAL probe (commit count below threshold / shallow
   *  clone / blame concentrated in one commit) that detects degenerate history so `mine`'s personalization
   *  vector falls back to structural + type/API-surface density — never rank noise. History is a booster,
   *  never a dependency. */
  probeHistory(repo: string, rev: string): HistoryProbe;
}
