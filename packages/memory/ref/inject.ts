// @atlas/memory — ref/inject.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The injection composer (MEM-1 + MEM-4). Two load-bearing laws:
//   MEM-1 · injection-SCOPING (NOT confidentiality): a member's turn-header injects ONLY that member's
//           own Memory — `injectFor(store, seat) = { e ∈ store | e.owner == seat }` — 0 cross-seat entries.
//           This is a scoping predicate over a SHARED, git-native store, NOT access-control/isolation
//           (any repo reader holds every seat's bytes). Confidentiality is on the Refuse-to-model list.
//   MEM-4 · consultable is never free: `task` / `pr` / `logbook` NEVER auto-inject on a running turn;
//           they are returned ONLY by an explicit `memory-recall` — the sole carve-out being the MEM-13
//           re-spawn push (ref/respawn.ts).
// The composed running-turn header is the THREE derived+written slabs (Awareness · Orientation · Rules).
// The wider auto-injection payload also carries retrieval surfaces (own / pack / poke) under the shared
// `InjectionKind` budget ceiling — this is the ALLOWED memory→retrieval edge (retrieval NEVER imports
// memory). Transcribed from method-tags-mem:21-47 (INV-MEM-1/4 down-models) + atlas-memory:58-66.

import type { Budget } from '@atlas/contracts';
import type { OwnPack, Pack, Poke } from '@atlas/retrieval';
import type { Awareness } from './awareness.js';
import type { Orientation } from './orient.js';
import type { MemberId, MemoryRecord, MemoryStore, ProjectMemoryEntry } from './types.js';

/**
 * The injected turn-header — the THREE slabs (atlas-memory:27-66). `awareness` + `orientation` are shared
 * + DERIVED (never rot); `rules` is the member's own written `ProjectMemoryEntry[]` (the only written
 * project memory). This is the ONLY memory injected on a running turn — consultable kinds are excluded
 * (MEM-4).
 */
export interface TurnHeader {
  readonly awareness: Awareness; // slab 1 — derived rollup (MEM-11)
  readonly orientation: Orientation; // slab 2 — derived fold (MEM-6)
  readonly rules: readonly ProjectMemoryEntry[]; // slab 3 — the member's own written rules, scope-matched
}

/**
 * A co-injected retrieval surface (the `own` / `pack` / `poke` `InjectionKind`s). Owned by
 * @atlas/retrieval, IMPORTED here (the allowed memory→retrieval edge), NEVER redefined.
 */
export type RetrievalSurface = OwnPack | Pack | Poke;

/**
 * The full per-seat auto-injection payload: the memory header + the co-injected retrieval surfaces, under
 * the shared per-`InjectionKind` `Budget` ceiling.
 *
 * [SIG-TBD — cap-application shape not frozen] The reference freezes the SLABS + the drop-order vocabulary
 * (`Budget` per `InjectionKind`), not a concrete post-cap payload record; `budgets` carries the honest
 * per-surface ledger, `retrieval` the surfaces retrieval owns — no invented merged shape.
 */
export interface InjectionPayload {
  readonly header: TurnHeader;
  readonly retrieval: readonly RetrievalSurface[]; // [FLAG] retrieval-owned surfaces, co-injected under budget
  readonly budgets: readonly Budget[]; // per-InjectionKind cap + hit-rate — the drop-order ledger
}

export interface InjectApi {
  /** Owner-scoped filter: a member's own Memory ONLY — `{ e ∈ store | e.owner == seat }`, 0 cross-seat
   *  (MEM-1, injection-SCOPING not access-control). Pure + total. (method-tags-mem:25) */
  injectFor(store: MemoryStore, seat: MemberId): readonly MemoryRecord[];

  /** Assemble the running-turn header (the three slabs) for a seat; the CONSULTABLE kinds
   *  (`task`/`pr`/`logbook`) are EXCLUDED (running-turn header ∩ consultable == ∅ — MEM-4).
   *  (method-tags-mem:46) */
  assembleHeader(store: MemoryStore, seat: MemberId): TurnHeader;

  /** Compose the full budget-capped auto-injection payload: the memory header + co-injected retrieval
   *  surfaces (own/pack/poke) under the shared `InjectionKind` ceiling. The memory→retrieval edge. */
  compose(store: MemoryStore, seat: MemberId, surfaces: readonly RetrievalSurface[]): InjectionPayload;

  /** The ONLY path that returns consultable `task` / `pr` / `logbook` memory — an explicit
   *  `memory-recall`, never auto-injected on a running turn (MEM-4). (method-tags-mem:46)
   *
   *  [SIG-TBD — `query` shape not frozen] `memory-recall` is queried by taskId / prId / date / territory;
   *  no concrete query record is frozen → `unknown`, NOT invented. */
  recall(query: unknown): readonly MemoryRecord[];
}
