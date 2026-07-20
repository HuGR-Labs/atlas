// @atlas/adapter-io — src/store.ts  (ADAPT-STORE-1/3: disk-backed CAS + projection rehydration)
//
// The raw store adapter: a disk-backed realization of the frozen `StoreApi` (@atlas/kernel) and the
// rehydration of a `StoreProjection` (@atlas/knowledge) from it. SKELETON — signatures frozen, bodies deferred.
//
// NOTE (scaffold widening, lead-decided at exec): the kernel `StoreApi` (put/get by content-hash) has no
// enumerate/list and cannot LOCATE a content-addressed projection, so it cannot alone discharge ADAPT-STORE-3
// (rehydrate the current-node map) or 12b (reconstruct WITHOUT re-running routing). STORE therefore OWNS a
// durable projection format + the `persistProjection`/`loadProjection` primitives (the format the later
// KNOWLEDGE flush CALLS and rehydrate READS back), and `rehydrateProjection` takes the widened `DiskStore`.
// The kernel `StoreApi` stays frozen — this widening is additive and lives only in this adapter package.

import type { StoreApi } from '@atlas/kernel';
import type { StoreProjection } from '@atlas/knowledge';

/** A filesystem path to the on-disk CAS root (D4: value files at `<casPath>/<h[0:2]>/<h>`). */
export type CasPath = string;

/**
 * The widened disk store: the frozen kernel `StoreApi` (durable put/get, ADAPT-STORE-1) PLUS the two
 * durable-projection primitives STORE owns (ADAPT-STORE-3). `persistProjection` is the primitive the later
 * KNOWLEDGE flush calls; `loadProjection` is the read side `rehydrateProjection` composes over. Kernel
 * `StoreApi` is unchanged (this only ADDS methods in the adapter layer).
 */
export interface DiskStore extends StoreApi {
  /** Persist the whole `StoreProjection` durably (the mutable sidecar, NOT content-addressed). */
  persistProjection(projection: StoreProjection): void;
  /** Read the durable `StoreProjection` back; `undefined` when none has been persisted yet. */
  loadProjection(): StoreProjection | undefined;
}

/** Construct a disk-backed content-addressed store conforming to the frozen `StoreApi` (ADAPT-STORE-1). */
export function createDiskStore(casPath: CasPath): DiskStore {
  void casPath;
  return {
    put(): never {
      throw new Error('unimplemented: ADAPT-STORE-1 — disk-backed CAS put');
    },
    get(): never {
      throw new Error('unimplemented: ADAPT-STORE-1 — disk-backed CAS get');
    },
    persistProjection(): never {
      throw new Error('unimplemented: ADAPT-STORE-3 — persist the durable StoreProjection');
    },
    loadProjection(): never {
      throw new Error('unimplemented: ADAPT-STORE-3 — read the durable StoreProjection');
    },
  };
}

/** Rehydrate the territory `StoreProjection` from a disk-backed store, minting nothing (ADAPT-STORE-3). */
export function rehydrateProjection(store: DiskStore): StoreProjection {
  void store;
  throw new Error('unimplemented: ADAPT-STORE-3 — rehydrate StoreProjection from disk');
}
