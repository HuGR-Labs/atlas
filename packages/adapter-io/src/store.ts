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

import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, sep } from 'node:path';
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

/** The upper bound on a single CAS object read (N13 DoS guard): a CAS object is a small JSON fact/skeleton
 *  (KB-scale). A value whose on-disk size exceeds this is rejected as a miss BEFORE it is read — belt for a
 *  planted oversized regular file. Generous (64 MiB) so it never trips a legitimate object, far below OOM. */
const MAX_CAS_BYTES = 64 * 1024 * 1024;

/** N14 (billy PoC — symlink TOCTOU): the open flags that make the check-and-read share ONE inode.
 *  `O_NOFOLLOW` → a symlink AT the final path component fails to open (ELOOP) atomically — the pre-N14
 *  statSync→realpathSync→readFileSync chain re-resolved the symlink THREE times, so a sub-ms swap between
 *  the checks re-opened the OOM; opening the final component with `O_NOFOLLOW` refuses it in one syscall.
 *  `O_NONBLOCK` → opening a FIFO returns immediately instead of blocking on a writer. Both exist on
 *  macOS+Linux (the CI targets); default to 0 defensively so the module still loads if ever absent. */
const O_READ_NO_SYMLINK =
  fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0) | (fsConstants.O_NONBLOCK ?? 0);

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
      // SECURITY (billy PoC — path-traversal / read-amplification DoS): `h` may be attacker-controlled (the
      // `atlas node <addr>` read door reaches here over MCP/poke). A CAS key is EXACTLY 64 lowercase hex, so
      // reject anything else BEFORE `readFileSync` — the tamper re-hash guard below runs AFTER the read, too
      // late to stop an unbounded read (a `../`-traversal to /dev/zero would hang + OOM). Belt-and-suspenders:
      // also require the resolved value path to stay INSIDE the CAS root (no escape), treating either failure
      // as a plain miss (`undefined`), never a filesystem touch.
      if (!/^[0-9a-f]{64}$/.test(h)) return undefined;
      const path = valuePath(casPath, h);
      // N14 (billy PoC — the residual symlink TOCTOU): N13 guarded with THREE separate path-based syscalls
      // (statSync → realpathSync → readFileSync), each re-resolving the symlink independently, so a concurrent
      // attacker who wins a sub-ms race could point `<cas>/<xx>/<H>` at a small in-CAS regular file during the
      // stat/realpath checks and swap it to `/dev/zero`/a FIFO before the read — re-opening the OOM. The fix is
      // an ATOMIC fd-based read: check and read share ONE inode, pinned by a single open descriptor.
      //   (1) Open the final component with O_RDONLY|O_NOFOLLOW|O_NONBLOCK. O_NOFOLLOW ⇒ a symlink AT the final
      //       component fails to open (ELOOP) ⇒ MISS — this alone kills the symlink-based OOM AND the integrity
      //       escape at the final component (in-cas OR out-of-cas target), atomically, in one syscall.
      //       O_NONBLOCK ⇒ opening a FIFO returns immediately instead of blocking on a writer.
      //   (2) fstatSync on the OPEN fd (not the path): a CAS object is ALWAYS a small REGULAR file, so a device/
      //       FIFO/dir/socket (isFile() false) or an oversized file is a MISS — decided on the pinned inode.
      //   (3) Read the bytes FROM THAT SAME fd, so a post-open symlink swap cannot redirect the read.
      //   (4) The realpathSync sandbox is KEPT for INTERMEDIATE components — O_NOFOLLOW only covers the FINAL
      //       component, so a symlinked intermediate dir `<xx>` still needs the cas-root containment check.
      // Total on every branch (→ undefined, never a throw/hang); the fd is ALWAYS closed (finally).
      let fd: number | undefined;
      try {
        fd = openSync(path, O_READ_NO_SYMLINK); // final-component symlink ⇒ ELOOP ⇒ throw ⇒ miss
        const st = fstatSync(fd); // on the pinned inode, not a re-resolved path
        if (!st.isFile() || st.size > MAX_CAS_BYTES) return undefined; // non-regular / oversized ⇒ never read
        // intermediate-component sandbox: the final component is provably NOT a symlink (O_NOFOLLOW opened it),
        // so any symlink `realpathSync` resolves is an intermediate dir — its real path must stay inside cas.
        const realCas = realpathSync(casPath);
        const real = realpathSync(path);
        if (real !== realCas && !real.startsWith(realCas + sep)) return undefined; // intermediate escapes ⇒ miss
        const raw = readFileSync(fd, 'utf8'); // FROM THE fd — the inode is pinned, no re-resolve
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
      } catch {
        return undefined; // ELOOP (final-component symlink) / ENOENT / any fs error ⇒ plain miss
      } finally {
        if (fd !== undefined) {
          try {
            closeSync(fd);
          } catch {
            /* best-effort close; the miss/hit decision above is already made */
          }
        }
      }
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
