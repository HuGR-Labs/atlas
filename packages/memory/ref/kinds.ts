// @atlas/memory — ref/kinds.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The kind partition (MEM-2). Memory and Knowledge live in the ONE Atlas on the same index/format, yet a
// Memory entry MUST NOT route into the shared-Knowledge partition and a Knowledge fact MUST NOT route into
// Memory (0 conflations). The router discriminates on `kind ∈ {memory, knowledge}` into the matching
// partition of the single CAS store — reuses KERNEL-3's `store.ts`. Separately, this file pins the CLOSED
// vocabulary of INJECTED memory surfaces as a SUBSET of the contracts-owned `InjectionKind` (imported,
// NEVER forked). Transcribed from method-tags-mem:28-33 (INV-MEM-2 down-model) + atlas-memory:39-58.

import type { InjectionKind } from '@atlas/contracts';
import type { MemoryEntry, MemoryRecord } from './types.js';

/**
 * The store-partition discriminant (MEM-2) — Memory vs Knowledge over the ONE Atlas. This is a DISTINCT
 * axis from `MemoryKind` (task|pr|project|logbook): `AtlasKind` decides WHICH kind of the Atlas a write
 * belongs to; `MemoryKind` sub-types a Memory entry.
 */
export type AtlasKind = 'memory' | 'knowledge';

/**
 * The CLOSED vocabulary of INJECTED memory surfaces — the memory-owned subset of the contracts-owned
 * `InjectionKind`. Transcribed as an `Extract` over the frozen union (atlas-memory §3.1 injects exactly
 * Awareness · Orientation · Rules(=projectMem)); IMPORTED + narrowed, NEVER forked.
 *
 * [FLAG — memory-only kinds NOT in the injection vocab] The CONSULTABLE memory kinds `task` / `pr` /
 * `logbook` are deliberately ABSENT from `InjectionKind` (MEM-4/8: never auto-injected). They are memory
 * kinds with NO injection surface — flagged so no future edit adds them to the injected drop-order.
 */
export type MemInjectionKind = Extract<InjectionKind, 'awareness' | 'orientation' | 'projectMem'>;

export interface KindsApi {
  /** Route a write on the `AtlasKind` discriminant into the matching partition of the ONE store; a
   *  memory→knowledge or knowledge→memory store is REJECTED (MEM-2). Reuses KERNEL-3 `store.ts`.
   *  (method-tags-mem:32)
   *
   *  [PINNED — updated-store return] no post-write store projection is frozen; the minimal honest shape
   *  the reference implies is the `MemoryRecord` actually written (owner-scoped, kind-partitioned) — the
   *  knowledge partition is out of this package's surface. */
  put(kind: AtlasKind, entry: MemoryEntry): MemoryRecord;

  /** The partition an entry belongs to; the reference asserts `partition(entry) == entry.kind` for every
   *  write (0 conflation — MEM-2). (method-tags-mem:32) */
  partition(entry: MemoryEntry): AtlasKind;
}
