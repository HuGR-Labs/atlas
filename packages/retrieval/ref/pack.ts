// @atlas/retrieval — ref/pack.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Bounded deterministic pack composition (RETR-2). A pack is `≤ ~2K` under the pinned cap measure
// (`cl100k_base`, tiktoken, pinned by version + content hash); it carries every T0 invariant IN FULL,
// then T1 by the total order `(hits-desc, ppr-desc, nodeKey-asc)` until the cap; the CAP WINS (a
// truncation marker + a `pull-reachable` tail — 0 silent drops). A merged pack over K territories is
// `≤ ~2K` total, T0-first then the same rank. Total: a malformed/missing territory yields an empty pack,
// never a throw (RETR-9). Composed with the shared comparator `ref/rank.ts` and the cap-table
// `ref/caps.ts`. Transcribed from atlas-retrieval:170 + method-tags-ret:28-33.

import type { Pack } from '@atlas/contracts';
import type { Territory } from '@atlas/contracts';

export interface PackApi {
  /** Territory → its pack: `≤ ~2K` tier≥T1 invariants (T0 in full, then T1 by `(hits-desc, ppr-desc,
   *  nodeKey-asc)` until the cap), stale-flagged (§3.4). Pure + total (miss ⇒ empty pack, no throw —
   *  RETR-9). (atlas-retrieval:170) */
  pack(territory: Territory): Pack;
}
