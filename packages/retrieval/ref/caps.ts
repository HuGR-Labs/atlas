// @atlas/retrieval — ref/caps.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Per-kind cap enforcement under the pinned measure (RETR-7). Each injection kind stays within its
// ratified sweet-spot cap (Awareness `~400` · Orientation `~250` · projectMem `~500` / orch `~800` ·
// `own` `~1.5K` · pack `~2K` · related `~300` · protocols `~500` shared · poke `~150`); no single kind
// consumes the whole `~5K` ceiling. Every cap is enforced under the pinned cap measure — `cl100k_base`
// (tiktoken), pinned by version + content hash — so enforcement is a DETERMINISTIC, byte-identical
// function of the input (NOT a vague threshold). The reference cap-table is a pure map `kind →
// pinnedCap`, shared by the packer (RETR-2), drop-policy (RETR-6), and `own` composer (RETR-12).
// Transcribed from atlas-retrieval:107-112 / method-tags-ret:63-68.

import type { InjectionKind } from '@atlas/contracts';

export interface CapsApi {
  /** Injection kind → its pinned sweet-spot cap in the pinned cap-measure unit (RETR-7). A pure lookup
   *  over the cap-table; deterministic. (method-tags-ret:67) */
  capFor(kind: InjectionKind): number;
}
