// @atlas/adapter-io — src/git-history.ts  (ADAPT-GIT-1: history)
//
// The S1 mining `HistorySource` (@atlas/genesis) — real `git log`/`blame`/coupling over a rev, feeding
// ranking only (mints no fact). SKELETON — signature frozen, body deferred to WP-9.3.6-a.HISTORY.

import type { HistorySource } from '@atlas/genesis';

/** Construct the S1 mining `HistorySource` at a git revision (ADAPT-GIT-1). */
export function createHistorySource(rev: string): HistorySource {
  void rev;
  return {
    commitCount(): never {
      throw new Error('unimplemented: ADAPT-GIT-1 — git commit count');
    },
    shallow(): never {
      throw new Error('unimplemented: ADAPT-GIT-1 — shallow-clone probe');
    },
    blameConcentration(): never {
      throw new Error('unimplemented: ADAPT-GIT-1 — blame concentration');
    },
    frontier(): never {
      throw new Error('unimplemented: ADAPT-GIT-1 — mined hotspot/SZZ/coupling frontier');
    },
    signals(): never {
      throw new Error('unimplemented: ADAPT-GIT-1 — mined ranking signals');
    },
  };
}
