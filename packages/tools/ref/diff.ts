// @atlas/tools — ref/diff.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// `atlas-diff` — the READ-ONLY version-delta projection (TOOLS-16). It surfaces the PERSIST-14
// version-delta (`{added, edited, superseded, decayed}`, each with provenance) as a read-only projection:
// CLI≡MCP (0 divergence, one published schema) and 0 WRITE PATH (read/subscribe only; writes still funnel
// through `atlas-emit`). It is a read projection like the per-node handler (TOOLS-10) and `atlas doctor`
// (TOOLS-12) — NOT a fifth write tool: the governance write surface stays EXACTLY FOUR (TOOLS-1/16), and
// `atlas-diff` carries NO write authority (this facet exposes NO write-returning method). Transcribed
// from atlas-tools:114-119 + method-tags-tls:131-136.

import type { Hash } from '@atlas/contracts';
import type { DiffOut } from './types.js';

export interface DiffApi {
  /** Read-only fold-diff between two commit states (TOOLS-16). Surfaces the PERSIST-14 delta faithfully;
   *  0 mutation, 0 write path — reads/renders the @atlas/persist `VersionDelta`. The CLI≡MCP determinism
   *  arm is delegated to the TOOLS-3 cross-transport PBT over the one handler (method-tags-tls:135).
   *
   *  [FLAG — `shaA`/`shaB` = `Hash`] atlas-tools:114 names `atlas-diff <shaA> <shaB>`; transcribed as
   *  `Hash` exactly as @atlas/persist `DiffApi.diff(shaA,shaB)` pins them. */
  diff(shaA: Hash, shaB: Hash): DiffOut;
}
