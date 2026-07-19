// @atlas/adapter-io — src/store.ts  (ADAPT-STORE-1/3: disk-backed CAS + projection rehydration)
//
// The raw store adapter: a disk-backed realization of the frozen `StoreApi` (@atlas/kernel) and the
// rehydration of a `StoreProjection` (@atlas/knowledge) from it. SKELETON — signatures frozen, bodies deferred.

import type { StoreApi } from '@atlas/kernel';
import type { StoreProjection } from '@atlas/knowledge';

/** A filesystem path to the on-disk CAS directory (ring shape). */
export type CasPath = string;

/** Construct a disk-backed content-addressed store conforming to the frozen `StoreApi` (ADAPT-STORE-1). */
export function createDiskStore(casPath: CasPath): StoreApi {
  void casPath;
  return {
    put(): never {
      throw new Error('unimplemented: ADAPT-STORE-1 — disk-backed CAS put');
    },
    get(): never {
      throw new Error('unimplemented: ADAPT-STORE-1 — disk-backed CAS get');
    },
  };
}

/** Rehydrate the territory `StoreProjection` from a disk-backed store (ADAPT-STORE-3). */
export function rehydrateProjection(store: StoreApi): StoreProjection {
  void store;
  throw new Error('unimplemented: ADAPT-STORE-3 — rehydrate StoreProjection from disk');
}
