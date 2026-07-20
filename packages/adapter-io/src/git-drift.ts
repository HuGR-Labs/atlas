// @atlas/adapter-io — src/git-drift.ts  (ADAPT-GIT-2: drift)
//
// The GROUND `DriftSource` (@atlas/tools) — the drifted-anchor set across a git merge-base, feeding
// `atlas-reconcile`'s mechanical-vs-semantic classification (TOOLS-8 exitCode law unchanged). SKELETON —
// signature frozen, body deferred to WP-9.2.5.DRIFT.

import type { DriftSource } from '@atlas/tools';

/** Construct the GROUND `DriftSource` — the drifted set at a merge base (ADAPT-GIT-2). */
export function createDriftSource(): DriftSource {
  return {
    driftAt(): never {
      throw new Error('unimplemented: ADAPT-GIT-2 — drift set at a merge base');
    },
  };
}
