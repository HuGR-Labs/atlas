// @atlas/adapter-io — src/git.ts  (ADAPT-GIT-1/2/3: history · drift · forge)
//
// The raw git adapter: three git-backed seams — the S1 mining `HistorySource` (@atlas/genesis), the
// GROUND `DriftSource` (@atlas/tools), and the low-level `Forge` port (@atlas/persist). SKELETON —
// signatures frozen, bodies deferred to the ADAPT-GIT WPs.

import type { HistorySource } from '@atlas/genesis';
import type { DriftSource } from '@atlas/tools';
import type { Forge } from '@atlas/persist';

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

/** Construct the GROUND `DriftSource` — the drifted set at a merge base (ADAPT-GIT-2). */
export function createDriftSource(): DriftSource {
  return {
    driftAt(): never {
      throw new Error('unimplemented: ADAPT-GIT-2 — drift set at a merge base');
    },
  };
}

/** Construct the low-level `Forge` port over the host git (ADAPT-GIT-3). */
export function createForge(): Forge {
  return {
    writeCommit(): never {
      throw new Error('unimplemented: ADAPT-GIT-3 — forge writeCommit');
    },
    readTrailer(): never {
      throw new Error('unimplemented: ADAPT-GIT-3 — forge readTrailer');
    },
    readNote(): never {
      throw new Error('unimplemented: ADAPT-GIT-3 — forge readNote');
    },
    writePR(): never {
      throw new Error('unimplemented: ADAPT-GIT-3 — forge writePR');
    },
    readPRBody(): never {
      throw new Error('unimplemented: ADAPT-GIT-3 — forge readPRBody');
    },
    configurePush(): never {
      throw new Error('unimplemented: ADAPT-GIT-3 — forge configurePush');
    },
    pushRefspecs(): never {
      throw new Error('unimplemented: ADAPT-GIT-3 — forge pushRefspecs');
    },
    hostSidePRCount(): never {
      throw new Error('unimplemented: ADAPT-GIT-3 — forge hostSidePRCount');
    },
    bareClone(): never {
      throw new Error('unimplemented: ADAPT-GIT-3 — forge bareClone');
    },
    calls(): never {
      throw new Error('unimplemented: ADAPT-GIT-3 — forge call ledger');
    },
  };
}
