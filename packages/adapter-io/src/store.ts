// @atlas/adapter-io — src/store.ts  (ADAPT-STORE-1/3: disk-backed CAS + projection rehydration)
//
// The raw store adapter: a disk-backed realization of the frozen `StoreApi` (@atlas/kernel) and the
// rehydration of a `StoreProjection` (@atlas/knowledge) from it. Implemented — WP-9.2.3.STORE (tests: store.test.ts).
//
// NOTE (scaffold widening, lead-decided at exec): the kernel `StoreApi` (put/get by content-hash) has no
// enumerate/list and cannot LOCATE a content-addressed projection, so it cannot alone discharge ADAPT-STORE-3
// (rehydrate the current-node map) or 12b (reconstruct WITHOUT re-running routing). STORE therefore OWNS a
// durable projection format + the `persistProjection`/`loadProjection` primitives (the format the later
// KNOWLEDGE flush CALLS and rehydrate READS back), and `rehydrateProjection` takes the widened `DiskStore`.
// The kernel `StoreApi` stays frozen — this widening is additive and lives only in this adapter package.
//
// STAGING (ADR-0008 / KNOW-8): the store owns a SECOND sidecar of the same shape at a DIFFERENT path — the
// CANDIDATE store the explorer (`atlas mine`) writes. KNOW-8 says the explorer may write only candidates and
// never self-commits; what was missing is that staging had nowhere to live, so the explorer wrote the only
// durable place there was — the knowledge projection. `persistStaging`/`loadStaging` give it that place. The
// two sidecars share ONE implementation (`writeSidecar`/`readSidecar`) so their totality discipline cannot
// drift apart; they differ ONLY in the file they name. A candidate is promoted into knowledge solely by
// passing a governed door, so nothing in this file reads staging back into the projection.

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

/** The mutable STAGING sidecar filename — the explorer's CANDIDATE store (ADR-0008). Same shape as the
 *  projection, DELIBERATELY a different file: a candidate is not a fact, and keeping the two in one place is
 *  exactly what let an ungoverned mine pass destroy, then mutate, governed knowledge. */
const STAGING_FILE = 'staging.json';

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

/** The STAGING sidecar path: `<dirname(casPath)>/staging.json` — beside the projection, never the same file.
 *  This ONE line is what makes mining structurally unable to reach knowledge (ADR-0008): point it back at
 *  `PROJECTION_FILE` and the whole guarantee is gone, which is precisely the mutant the suites kill. */
function stagingPath(casPath: CasPath): string {
  return join(dirname(casPath), STAGING_FILE);
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
  readonly builtAt?: string; // N11 freshness watermark (HEAD sha at persist); absent ⇒ unknown (old sidecars)
}

/**
 * Write a `StoreProjection` to ONE mutable sidecar file. Shared verbatim by the projection and the staging
 * door (ADR-0008) so the two can differ only in WHICH file they name — a second hand-copied implementation
 * would be free to drift in its stamping or its atomicity.
 *
 * N11: STAMP the freshness watermark at persist — `builtAt` = the HEAD this projection's stored per-fact
 * freshness reflects. The injected `headSha` seam is authoritative (git lives in the composition root), so
 * the store re-derives it on every persist rather than trusting a caller-set field; when the seam is absent
 * (tests / non-git) or resolves undefined, no stamp is written (the reader then treats the watermark as
 * "unknown"). JSON drops an undefined key, so an unstamped projection round-trips to `undefined` exactly as
 * before this field existed (deepEqual-preserving).
 */
function writeSidecar(path: string, projection: StoreProjection, builtAt: string | undefined): void {
  const wire: WireProjection = {
    current: [...projection.current.entries()],
    cas: [...projection.cas],
    ...(builtAt !== undefined ? { builtAt } : {}),
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(wire), 'utf8');
}

/**
 * Is `e` a well-formed `[nodeKey, CurrentNode]` entry — one whose MAP KEY IS the row's OWN `nodeKey`?
 *
 * THE representation invariant of `StoreProjection.current` ("nodeKey → the ONE current node", KNOW-4g). Every
 * in-process producer holds it by construction: `upsert` only ever `current.set(req.nodeKey, {nodeKey:
 * req.nodeKey, …})`, and `linkSameAs` re-sets rows at the key it fetched them by. NOTHING re-established it
 * across the disk round-trip, and `new Map(wire.current)` accepts any entry array whatsoever — so a row
 * written at key `M` declaring `nodeKey: B` rehydrated into a typed `StoreProjection` that no producer could
 * have made, and every consumer downstream reads one of the two identities without knowing the other exists.
 * Measured consequence: `sameAsClassOf` SEEDS on the map key but EXPANDED on `nodeKey`, so `classOf(M)`
 * collapsed to the singleton `[M]` and `governed-link.ts:147` resolved ZERO class members — pricing its authz
 * and its ratify gates over nothing. Class SHRINKAGE is the bypass direction.
 *
 * This is IN the threat model, not out of it: `@atlas/knowledge` `ratify/tier.ts` names this very file as
 * untrusted input ("a CAS blob out of a COMMITTED `.atlas/` directory … none of those is trusted and none was
 * validated"). `isTier` exists because of that sentence; the same reasoning covers every other field the
 * projection carries, `nodeKey` included.
 */
function isKeyedEntry(e: unknown): e is readonly [string, CurrentNode] {
  if (!Array.isArray(e) || e.length !== 2) return false;
  const [key, row] = e as readonly unknown[];
  if (typeof key !== 'string' || row === null || typeof row !== 'object') return false;
  // `nodeKey === key` also settles its TYPE (`key` is a string) — no separate typeof needed, and no coercion:
  // `===` is byte-exact, so no case-folding, no trimming, no Unicode normalization can smuggle a mismatch.
  return (row as { readonly nodeKey?: unknown }).nodeKey === key;
}

/**
 * Read ONE mutable sidecar file back. Shared verbatim by the projection and the staging door (ADR-0008).
 *
 * TOTAL (mirrors `get` below): a missing OR corrupt/unparseable/shape-invalid sidecar reads as "none
 * persisted" (`undefined`) — NEVER a throw. A throw here would crash `rehydrateProjection` (and thus BOTH
 * bins) at boot, since composeRuntime rehydrates at startup. The staging door inherits that discipline by
 * CONSTRUCTION rather than by a promise: it is the same code.
 *
 * ALL-OR-NOTHING, deliberately: one invariant-violating row rejects the WHOLE sidecar, exactly as one corrupt
 * byte or one wrong-shaped `current` already does. Dropping only the offending ROW would be the strictly worse
 * design — it hands an attacker who can write this file a SELECTIVE "make this node non-current" primitive,
 * and `governed-link.ts` deliberately SKIPS a class member that is not a current node (a retired key is
 * nobody's authority), so a targeted drop is exactly the under-pricing this guard exists to stop. Rejecting
 * the file routes a NEW corruption class into the EXISTING failure mode — `rehydrateProjection` degrades to
 * `emptyStore()`, under which every write door fails closed on `unknown node` and no gate is priced over a
 * partial class — so the blast radius is unchanged and no new degradation path is introduced.
 */
function readSidecar(path: string): StoreProjection | undefined {
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
  // MEASURED: this line alone is defence-in-depth — deleting it keeps the suite GREEN, because the
  // try/catch below also catches the `new Map(5)` TypeError. It stays as the cheap, explicit rejection
  // (and it is the reason the catch is a narrow last resort rather than the only shape check).
  if (!wire || !Array.isArray(wire.current) || !Array.isArray(wire.cas)) return undefined;
  // INTEGRITY guard (unlike the line above, this one is a TOOTH, not defence-in-depth): every entry must be a
  // `[key, row]` pair whose key IS `row.nodeKey`. `new Map(wire.current)` accepts ANY entry array, so without
  // this the disk round-trip is the one producer in the system that can mint a `StoreProjection` violating its
  // own representation invariant. See `isKeyedEntry` for the measured bypass and for why one bad row rejects
  // the whole file rather than just itself.
  if (!wire.current.every(isKeyedEntry)) return undefined;
  // deserialize back: entry-array → Map, array → Set — defended in case an entry itself is non-iterable.
  // N11: carry the watermark back only when a string was persisted (a non-string wire value ⇒ omit ⇒
  // "unknown", the conservative reader default) — keeps the projection shape honest, never a bad type.
  try {
    const builtAt = typeof wire.builtAt === 'string' ? { builtAt: wire.builtAt } : {};
    return { current: new Map(wire.current), cas: new Set(wire.cas), ...builtAt };
  } catch {
    return undefined; // malformed entries (e.g. a non-[k,v] element)
  }
}

/**
 * The widened disk store: the frozen kernel `StoreApi` (durable put/get, ADAPT-STORE-1) PLUS the durable
 * sidecar primitives STORE owns (ADAPT-STORE-3). `persistProjection` is the primitive the later KNOWLEDGE
 * flush calls; `loadProjection` is the read side `rehydrateProjection` composes over. `persistStaging`/
 * `loadStaging` are the SAME pair over the candidate sidecar (ADR-0008) — same shape, different file, so the
 * explorer has a durable place of its own and no longer has to borrow the knowledge projection. Kernel
 * `StoreApi` is unchanged (this only ADDS methods in the adapter layer).
 */
export interface DiskStore extends StoreApi {
  /** Persist the whole `StoreProjection` durably (the mutable sidecar, NOT content-addressed). */
  persistProjection(projection: StoreProjection): void;
  /** Read the durable `StoreProjection` back; `undefined` when none has been persisted yet. */
  loadProjection(): StoreProjection | undefined;
  /** Persist the CANDIDATE projection to the staging sidecar — never the knowledge projection (ADR-0008). */
  persistStaging(projection: StoreProjection): void;
  /** Read the staged candidates back; `undefined` when nothing has been staged yet. Total, like `loadProjection`. */
  loadStaging(): StoreProjection | undefined;
}

/**
 * Construct a disk-backed content-addressed store conforming to the frozen `StoreApi` (ADAPT-STORE-1).
 *
 * `headSha` (N11, OPTIONAL) is the injected freshness-watermark seam — a pure `() => currentHEAD | undefined`
 * supplied by the composition root (which owns git; the store stays git-ignorant). When present, every
 * `persistProjection` STAMPS the projection with the HEAD its stored per-fact freshness reflects, so a later
 * query can cheaply detect a behind-HEAD (⇒ unverified ⇒ honestly `stale`) read. Absent (tests / non-git) ⇒
 * no stamp ⇒ `builtAt` stays `undefined` and the reader treats the watermark as "unknown" (never a false
 * flag). Injected here (not at each write door) so EVERY persist site — governed emit onto the projection,
 * the mine driver onto staging — stamps uniformly with zero change to their code.
 */
export function createDiskStore(casPath: CasPath, headSha?: () => string | undefined): DiskStore {
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
      writeSidecar(projectionPath(casPath), projection, headSha?.());
    },

    loadProjection(): StoreProjection | undefined {
      return readSidecar(projectionPath(casPath));
    },

    persistStaging(projection: StoreProjection): void {
      // The candidate sidecar. Identical machinery, identical stamping (a staged candidate's freshness is
      // read at the HEAD it was mined at) — the ONLY difference from `persistProjection` is the file.
      writeSidecar(stagingPath(casPath), projection, headSha?.());
    },

    loadStaging(): StoreProjection | undefined {
      // Total on exactly the same branches as `loadProjection` — it IS `loadProjection`'s reader. A missing,
      // corrupt or shape-invalid staging sidecar reads back as "nothing staged", never a throw: `mine`
      // rehydrates staging at pass start, so a throw here would abort the pass on a half-written file.
      return readSidecar(stagingPath(casPath));
    },
  };
}

/** Rehydrate the territory `StoreProjection` from a disk-backed store, minting nothing (ADAPT-STORE-3). */
export function rehydrateProjection(store: DiskStore): StoreProjection {
  // pure read-back: reconstruct the projection from the durable sidecar, minting nothing — NEITHER
  // routeWrite/upsert NOR put. Missing sidecar ⇒ the empty projection (adapt-store-3, 12b).
  return store.loadProjection() ?? emptyStore();
}
