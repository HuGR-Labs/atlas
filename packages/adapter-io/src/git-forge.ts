// @atlas/adapter-io — src/git-forge.ts  (ADAPT-GIT-3: forge)
//
// The low-level `Forge` port (@atlas/persist) over the host git — trailer/note/PR projection carrying the
// atlas, executing PERSIST-* semantics unchanged. SKELETON — signature frozen, body deferred to WP-9.4.8.FORGE.

import type { Forge } from '@atlas/persist';

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
