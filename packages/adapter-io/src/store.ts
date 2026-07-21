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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Hash } from '@atlas/contracts';
import { asHash, id } from '@atlas/kernel';
import type { CasObject, StoreApi } from '@atlas/kernel';
import { emptyStore } from '@atlas/knowledge';
import type { CurrentNode, StoreProjection } from '@atlas/knowledge';

/** A filesystem path to the on-disk CAS root (D4: value files at `<casPath>/<h[0:2]>/<h>`). */
export type CasPath = string;

/** The honest-empty content handle: a malformed put stores nothing and returns this non-resolving key
 *  (mirrors kernel/store.ts:26 — `asHash('')`, the sole EMPTY sentinel). */
const EMPTY: Hash = asHash('');

/** The mutable projection sidecar filename — NOT content-addressed; lives beside the CAS root (D4). */
const PROJECTION_FILE = 'projection.json';

/** The sharded, content-addressed value path for `H`: `<casPath>/<H[0:2]>/<H>` (D4). */
function valuePath(casPath: CasPath, h: Hash): string {
  return join(casPath, h.slice(0, 2), h);
}

/** The projection sidecar path: `<dirname(casPath)>/projection.json` — OUTSIDE the `cas/` root. */
function projectionPath(casPath: CasPath): string {
  return join(dirname(casPath), PROJECTION_FILE);
}

/**
 * The durable wire shape of a `StoreProjection`: the `current` Map as entry-array, the `cas` Set as array
 * — the single source of truth (no dir-walk). "Byte-identical" is asserted as `deepEqual` after the JSON
 * round-trip; the only lossy corner is explicit `undefined`-valued properties (dropped consistently). The
 * `put`-accepted canonical domain excludes Date/Map/Set/bigint, so no non-JSON CasObject reaches here.
 */
interface WireProjection {
  readonly current: ReadonlyArray<readonly [string, CurrentNode]>;
  readonly cas: readonly string[];
}

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
  return {
    put(obj: CasObject): Hash {
      let h: Hash;
      try {
        // canonicalize → hash via the sealed seam; the caller never supplies the key (KERNEL-1/2a).
        h = id(obj);
      } catch {
        // malformed input (float / bigint / symbol / cyclic) → honest empty, write nothing, never throw.
        return EMPTY;
      }
      const path = valuePath(casPath, h);
      // content-keyed dedup: equal content already on disk ⇒ store nothing new (idempotent).
      if (!existsSync(path)) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, JSON.stringify(obj), 'utf8');
      }
      return h;
    },

    get(h: Hash): CasObject | undefined {
      // total: any miss/malformed/tampered read ⇒ `undefined`, never a throw (KERNEL-7a).
      const path = valuePath(casPath, h);
      let raw: string;
      try {
        raw = readFileSync(path, 'utf8');
      } catch {
        return undefined; // ENOENT / miss
      }
      let parsed: CasObject;
      try {
        parsed = JSON.parse(raw) as CasObject;
      } catch {
        return undefined; // corrupt bytes
      }
      let rehash: Hash;
      try {
        rehash = id(parsed);
      } catch {
        return undefined;
      }
      // tamper-safe: the mandatory re-hash-on-read — bytes whose `id !== key` read as absent (adapt-store-1).
      if (rehash !== h) return undefined;
      return parsed;
    },

    persistProjection(projection: StoreProjection): void {
      // serialize the mutable sidecar: Map → entry-array, Set → array (single source of truth, no dir-walk).
      const wire: WireProjection = {
        current: [...projection.current.entries()],
        cas: [...projection.cas],
      };
      const path = projectionPath(casPath);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(wire), 'utf8');
    },

    loadProjection(): StoreProjection | undefined {
      // total (mirrors `get` above): a missing OR corrupt/unparseable/shape-invalid sidecar reads as
      // "none persisted" (`undefined`) — NEVER a throw. A throw here would crash `rehydrateProjection`
      // (and thus BOTH bins) at boot, since composeRuntime rehydrates at startup.
      const path = projectionPath(casPath);
      let raw: string;
      try {
        raw = readFileSync(path, 'utf8');
      } catch {
        return undefined; // ENOENT / none persisted yet
      }
      let wire: WireProjection;
      try {
        wire = JSON.parse(raw) as WireProjection;
      } catch {
        return undefined; // corrupt / truncated bytes
      }
      // shape guard: the entry-array and value-array must be arrays before Map/Set construction, else a
      // valid-JSON-but-wrong-shape sidecar (e.g. `{}`, `[]`, `{current:5}`) throws in `new Map(...)`.
      if (!wire || !Array.isArray(wire.current) || !Array.isArray(wire.cas)) return undefined;
      // deserialize back: entry-array → Map, array → Set — defended in case an entry itself is non-iterable.
      try {
        return { current: new Map(wire.current), cas: new Set(wire.cas) };
      } catch {
        return undefined; // malformed entries (e.g. a non-[k,v] element)
      }
    },
  };
}

/** Rehydrate the territory `StoreProjection` from a disk-backed store, minting nothing (ADAPT-STORE-3). */
export function rehydrateProjection(store: DiskStore): StoreProjection {
  // pure read-back: reconstruct the projection from the durable sidecar, minting nothing — NEITHER
  // routeWrite/upsert NOR put. Missing sidecar ⇒ the empty projection (adapt-store-3, 12b).
  return store.loadProjection() ?? emptyStore();
}
