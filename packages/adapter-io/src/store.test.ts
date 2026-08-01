// @atlas/adapter-io — test/store.test.ts   (WP-9.2.3.STORE — EPIC-3, REQ-ADAPTER-6a/6b/6c + 12a/12b)
//
// Acceptance suite for the durable, tamper-safe disk StoreApi + cross-process StoreProjection rehydrate
// (ADAPT-STORE-1/3). Transcribes the frozen goldens (docs/requirements/goldens-adapters.md) VERBATIM:
//   • SCN-ADAPTER-6a-1  — put/get round-trips under the content hash                       (happy)
//   • SCN-ADAPTER-6b-1  — put in process A is get-retrievable in a fresh process B          (happy)
//   • SCN-ADAPTER-6c-1  — a tampered on-disk value reads as absent                          (guard)
//   • SCN-ADAPTER-12a-1 — a fresh process rehydrates the flushed fact byte-identically       (happy)
//   • SCN-ADAPTER-12b-1 — rehydrate reconstructs state only, minting nothing                (guard)
// Plus the ADR-0008 STAGING sidecar (persistStaging/loadStaging): the candidate store round-trips, is TOTAL
// on a missing/corrupt/wrong-shape file, and never writes `projection.json`.
//
// Harness (per fs.test.ts convention): a temp CAS dir per test + afterEach cleanup. `casPath` is the CAS
// ROOT — value files land at `<casPath>/<H[0:2]>/<H>` and the projection sidecar beside it (outside cas/).

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { asHash, id } from '@atlas/kernel';
import { upsert, emptyStore } from '@atlas/knowledge';
import type { WriteRequest } from '@atlas/knowledge';
import { createDiskStore, rehydrateProjection } from '../src/store.js';

let tmp: string | undefined;

/** A fresh temp workspace; returns the CAS root (`<tmp>/cas`) so the projection sidecar lands at `<tmp>/`. */
function freshCasDir(): string {
  tmp = mkdtempSync(join(tmpdir(), 'atlas-store-'));
  return join(tmp, 'cas');
}

afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = undefined;
  vi.restoreAllMocks();
});

/** The genuine routing-input for fact `F` — built through the REAL knowledge `upsert`, never hand-forged. */
function reqF(): WriteRequest {
  return {
    nodeKey: 'claim:fix-cov',
    contentHash: id({ claim: 'fix-cov', v: 1 }), // opaque CAS id for content `c1`
    family: 'advisory',
    claimNorm: 'coverage on the fix path',
  };
}

describe('createDiskStore — ADAPT-STORE-1 durable, tamper-safe disk CAS', () => {
  it('SCN-ADAPTER-6a-1 — put/get round-trips under the content hash (happy)', () => {
    const dir = freshCasDir();
    const s = createDiskStore(dir);
    const O = { kind: 'fact', body: 'coverage fix', n: 42 };
    const H = s.put(O);
    expect(s.get(H)).toEqual(O);
    // teeth: a `put` storing `O` under a random-uuid filename would miss the sharded content-addressed path.
    expect(existsSync(join(dir, H.slice(0, 2), H))).toBe(true);
  });

  it('SCN-ADAPTER-6b-1 — an object put in process A is get-retrievable in a fresh process B (happy)', () => {
    const dir = freshCasDir();
    const O = { kind: 'fact', body: 'durable across processes' };
    const sA = createDiskStore(dir);
    const H = sA.put(O);
    // fresh instance over the same dir = a new process with NO shared memory.
    const sB = createDiskStore(dir);
    // teeth: a memory-only Map never flushes → sB.get(H) is undefined (the load-bearing durability tooth).
    expect(sB.get(H)).toEqual(O);
  });

  it('SCN-ADAPTER-6c-1 — a tampered on-disk value reads as absent (guard)', () => {
    const dir = freshCasDir();
    const s = createDiskStore(dir);
    const O = { kind: 'fact', body: 'genuine' };
    const H = s.put(O);
    // overwrite the on-disk bytes with a different object whose id !== H.
    const other = { kind: 'fact', body: 'tampered' };
    expect(id(other)).not.toBe(H);
    writeFileSync(join(dir, H.slice(0, 2), H), JSON.stringify(other), 'utf8');
    // teeth: returning the file's bytes without re-hashing (`id(value) === key`) serves the tampered value.
    expect(s.get(H)).toBeUndefined();
  });

  it('put of a malformed CasObject is total — empty handle, writes nothing, never throws (KERNEL-7b)', () => {
    const dir = freshCasDir();
    const s = createDiskStore(dir);
    // a value the sealed `id` seam rejects (BigInt is non-canonicalizable) → honest-empty, no write, no throw.
    const bad = { kind: 'fact', n: 10n } as unknown;
    let H = 'sentinel' as ReturnType<typeof s.put>;
    // teeth: dropping the malformed-put try/catch (returning `id(obj)` directly) throws here.
    expect(() => {
      H = s.put(bad as never);
    }).not.toThrow();
    expect(H).toBe(''); // the non-resolving empty handle (asHash(''))
    // and it persisted nothing — the CAS root was never even created by the rejected put.
    expect(existsSync(dir)).toBe(false);
  });

  it('get over corrupt (non-JSON) on-disk bytes is total — undefined, never throws', () => {
    const dir = freshCasDir();
    const s = createDiskStore(dir);
    const H = s.put({ kind: 'fact', body: 'genuine' });
    // corrupt the bytes to NON-JSON — distinct from 6c's valid-JSON-different-object (rehash-mismatch) path;
    // this exercises the disk-adapter-specific JSON.parse-failure branch the in-mem kernel store never has.
    writeFileSync(join(dir, H.slice(0, 2), H), '{ this is not json ', 'utf8');
    let out: unknown = 'sentinel';
    // teeth: dropping the get JSON.parse try/catch throws on the corrupt read instead of returning undefined.
    expect(() => {
      out = s.get(H);
    }).not.toThrow();
    expect(out).toBeUndefined();
  });

  it('N13 — a symlink planted in CAS pointing OUTSIDE the root reads as absent (escape guard; red→green)', () => {
    const dir = freshCasDir();
    const s = createDiskStore(dir);
    // C is a genuine CasObject; its JSON is written to a file OUTSIDE the CAS root. A symlink is planted at the
    // content-addressed path `<cas>/<xx>/<H>` (H = id(C), so the filename passes the 64-hex charset gate AND the
    // bytes re-hash to H). PRE-N13 the read-before-verify FOLLOWS the symlink, reads the out-of-cas file, and —
    // id matches — SERVES it: a successful escape (get(H) === C). The realpath sandbox now rejects it.
    const C = { kind: 'advisory', tier: 'T1', freshness: 'FRESH', body: 'ESCAPED-OUT-OF-CAS' };
    const H = id(C) as string;
    const outside = join(tmp!, 'outside.json');
    writeFileSync(outside, JSON.stringify(C), 'utf8');
    const shardDir = join(dir, H.slice(0, 2));
    mkdirSync(shardDir, { recursive: true });
    symlinkSync(outside, join(shardDir, H));
    // teeth: pre-N13 this returned `C` (the escape succeeded); the realpath-resolved cas-root sandbox is a miss.
    expect(s.get(asHash(H))).toBeUndefined();
  });

  it('N13 — a symlink in CAS to a NON-REGULAR target is a total miss (portable smoke of the isFile() branch)', () => {
    const dir = freshCasDir();
    const s = createDiskStore(dir);
    // HONEST teeth note: this DIRECTORY case is NOT a red→green for the DoS — a directory read throws EISDIR
    // pre-N13 too, so it is a total miss on BOTH sides. It is a portable, CI-safe smoke check that a non-regular
    // target is rejected fast by `statSync` → `isFile()` false BEFORE any read handle opens. The genuine OOM
    // closure — a symlink → /dev/zero (unbounded read) or → a FIFO (blocking read) — is un-CI-able (it would
    // hang/OOM the PRE-fix code) and is verified out-of-band by an adversarial harness, not by this suite.
    // The real red→green tooth for N13 is the ESCAPE case above (pre-fix SERVED the out-of-cas object).
    const H = 'a'.repeat(64);
    const targetDir = join(tmp!, 'a-directory');
    mkdirSync(targetDir, { recursive: true });
    const shardDir = join(dir, H.slice(0, 2));
    mkdirSync(shardDir, { recursive: true });
    symlinkSync(targetDir, join(shardDir, H));
    const t0 = Date.now();
    expect(s.get(asHash(H))).toBeUndefined();
    expect(Date.now() - t0).toBeLessThan(2000); // fast — non-regular target rejected without an unbounded read
  });

  it('N14 — a symlink at the CAS final component to an IN-CAS object that re-hashes to the addr is a MISS (fd O_NOFOLLOW; red→green)', () => {
    const dir = freshCasDir();
    const s = createDiskStore(dir);
    // The residual TOCTOU that N13 did NOT close: N13 only rejected symlinks whose target escapes cas. A
    // symlink whose target is a REGULAR file INSIDE cas whose bytes re-hash to the addr passed EVERY N13 gate
    // (statSync→isFile true, realpathSync→inside cas, readFileSync→bytes re-hash to H) and was SERVED — the
    // exact primitive a race-attacker uses to slip a swapped inode past the path-based checks. N14 opens the
    // final component with O_NOFOLLOW, so the symlink ITSELF fails to open (ELOOP) ⇒ MISS, regardless of where
    // it points. Genuine red→green vs the pre-fix statSync/realpath code: pre-N14 this returned `C`.
    const C = { kind: 'advisory', tier: 'T1', freshness: 'FRESH', body: 'IN-CAS-SYMLINK-TARGET' };
    const H = id(C) as string;
    // the symlink TARGET: a regular file that lives INSIDE the cas root (so N13's realpath sandbox passes).
    const inCasTarget = join(dir, 'target.json');
    mkdirSync(dir, { recursive: true });
    writeFileSync(inCasTarget, JSON.stringify(C), 'utf8');
    // plant the symlink AT the content-addressed final component `<cas>/<xx>/<H>` (filename passes charset).
    const shardDir = join(dir, H.slice(0, 2));
    mkdirSync(shardDir, { recursive: true });
    symlinkSync(inCasTarget, join(shardDir, H));
    // teeth: pre-N14 the path-based statSync/realpath/readFileSync chain SERVED `C` (all three gates passed);
    // the fd O_NOFOLLOW open refuses the final-component symlink itself ⇒ a plain miss.
    expect(s.get(asHash(H))).toBeUndefined();
  });

  it('N14 — a FIFO AT the CAS final component is a FAST fd-based miss (O_NONBLOCK non-block + fstat-on-fd non-regular)', () => {
    const dir = freshCasDir();
    const s = createDiskStore(dir);
    // A FIFO planted directly at `<cas>/<xx>/<H>` (NOT a symlink — a named pipe at the final component). This
    // is the un-CI-able OOM/hang vector made CI-safe: without O_NONBLOCK, openSync(read) of a FIFO BLOCKS
    // until a writer appears (the test would hang forever); with O_NONBLOCK the open returns immediately, then
    // fstatSync on the OPEN fd sees isFIFO() (isFile() false) and rejects — proving the reject is decided by
    // fstat-on-fd on the pinned inode, not a path stat. Skip only if `mkfifo` is unavailable.
    const H = 'b'.repeat(64);
    const shardDir = join(dir, H.slice(0, 2));
    mkdirSync(shardDir, { recursive: true });
    const fifoPath = join(shardDir, H);
    try {
      execFileSync('mkfifo', [fifoPath]);
    } catch {
      return; // no mkfifo on this host (both CI targets have it) — skip rather than false-fail
    }
    const t0 = Date.now();
    expect(s.get(asHash(H))).toBeUndefined(); // if O_NONBLOCK were missing this line would never return
    expect(Date.now() - t0).toBeLessThan(2000); // fast — the FIFO open did not block, fstat rejected it
  });
});

describe('rehydrateProjection — ADAPT-STORE-3 cross-process rehydrate, minting nothing', () => {
  it('SCN-ADAPTER-12a-1 — a fresh process rehydrates the flushed fact byte-identically (happy)', () => {
    const dir = freshCasDir();
    // ARRANGE: build a genuine StoreProjection by running the REAL knowledge `upsert` from emptyStore().
    const { store: projection } = upsert(emptyStore(), reqF());
    const expected = projection.current.get('claim:fix-cov');
    expect(expected).toBeDefined(); // head('claim:fix-cov') == F
    const s = createDiskStore(dir);
    s.persistProjection(projection);

    // ACT: a fresh process reconstructs the current-node map from the durable sidecar.
    const s2 = createDiskStore(dir);
    const p = rehydrateProjection(s2);

    // teeth: rehydrating from an in-memory snapshot s2 never had would leave F missing.
    expect(p.current.get('claim:fix-cov')).toEqual(expected);
  });

  it('ADJACENCY-A — the added primaryAnchor + slot round-trip through the durable projection sidecar', () => {
    const dir = freshCasDir();
    // a genuine projection carrying the ADDITIVE adjacency fields (via the REAL knowledge upsert).
    const req: WriteRequest = {
      nodeKey: 'claim:fix-cov',
      contentHash: id({ claim: 'fix-cov', v: 1 }),
      family: 'advisory',
      claimNorm: 'coverage on the fix path',
      primaryAnchor: 'pkg::mod::fix',
      slot: 'invariant',
    };
    const { store: projection } = upsert(emptyStore(), req);
    const s = createDiskStore(dir);
    s.persistProjection(projection);

    // a fresh process reconstructs the current-node map from the durable sidecar.
    const rehydrated = rehydrateProjection(createDiskStore(dir)).current.get('claim:fix-cov')!;
    // teeth: a WireProjection that dropped the whole-node stringify (or filtered fields) loses these.
    expect(rehydrated.primaryAnchor).toBe('pkg::mod::fix');
    expect(rehydrated.slot).toBe('invariant');
  });

  it('ADJACENCY-A — an OLD sidecar without the fields rehydrates with them ABSENT (forward/back compat)', () => {
    const dir = freshCasDir();
    // a projection minted with NO adjacency fields (the pre-ADJACENCY-A shape).
    const { store: projection } = upsert(emptyStore(), reqF());
    const s = createDiskStore(dir);
    s.persistProjection(projection);
    const node = rehydrateProjection(createDiskStore(dir)).current.get('claim:fix-cov')!;
    // the absent optionals stay absent — no explicit undefined injected by the round-trip.
    expect(node.primaryAnchor).toBeUndefined();
    expect(node.slot).toBeUndefined();
  });

  it('loadProjection over corrupt (non-JSON) sidecar bytes is total — emptyStore rehydrate, never throws', () => {
    const dir = freshCasDir();
    const s = createDiskStore(dir);
    // persist a genuine projection, then corrupt the sidecar to NON-JSON (truncated write on disk).
    s.persistProjection(upsert(emptyStore(), reqF()).store);
    writeFileSync(join(tmp!, 'projection.json'), '{ "current": [ truncated', 'utf8');
    let out: unknown = 'sentinel';
    // MUTANT: the unwrapped `JSON.parse(raw) as WireProjection` in loadProjection (store.ts) — a corrupt
    // sidecar throws there, and since composeRuntime rehydrates at boot, that throw crashes BOTH bins.
    expect(() => {
      out = createDiskStore(dir).loadProjection();
    }).not.toThrow();
    expect(out).toBeUndefined();
    // and rehydrate degrades to the empty projection — no boot crash, no minting.
    const p = rehydrateProjection(createDiskStore(dir));
    expect([...p.current.keys()]).toEqual([]);
    expect([...p.cas]).toEqual([]);
  });

  it('loadProjection over valid-JSON-but-wrong-shape sidecar is total — emptyStore, never throws', () => {
    const dir = freshCasDir();
    createDiskStore(dir).persistProjection(upsert(emptyStore(), reqF()).store);
    // valid JSON whose `current` is NOT the [k,v] entry-array — `new Map(5)` / `new Map({})` would throw.
    writeFileSync(join(tmp!, 'projection.json'), JSON.stringify({ current: 5, cas: {} }), 'utf8');
    let p: ReturnType<typeof rehydrateProjection> | undefined;
    // MUTANT: dropping the Array.isArray shape guard (and its try/catch) — the wrong-shape wire reaches
    // `new Map(wire.current)` and throws, again crashing rehydrate at boot.
    expect(() => {
      p = rehydrateProjection(createDiskStore(dir));
    }).not.toThrow();
    expect([...p!.current.keys()]).toEqual([]);
    expect([...p!.cas]).toEqual([]);
  });

  it('SCN-ADAPTER-12b-1 — rehydrate reconstructs state only, minting nothing (guard)', () => {
    const dir = freshCasDir();
    const { store: projection } = upsert(emptyStore(), reqF());
    const s = createDiskStore(dir);
    s.persistProjection(projection);

    const s2 = createDiskStore(dir);
    const putSpy = vi.spyOn(s2, 'put');
    rehydrateProjection(s2);
    // teeth: re-running routing (routeWrite/upsert) or `put` during rehydrate mints a fresh fact/pointer.
    expect(putSpy).toHaveBeenCalledTimes(0);

    // static guard: store.ts must not IMPORT the routing seam at all (reconstruct-only by construction).
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'store.ts'), 'utf8');
    const imports = src.split('\n').filter((l) => l.trimStart().startsWith('import')).join('\n');
    expect(imports).not.toMatch(/routeWrite/);
    expect(imports).not.toMatch(/\bupsert\b/);
  });
});

// ── ADR-0008 — the STAGING sidecar: same shape, DIFFERENT file ─────────────────────────────────────────
//
// `atlas mine` is the explorer: no truth gate, no KNOW-11 authz, no KNOW-8 ratification. KNOW-8 lets it
// write only CANDIDATES — but staging had nowhere to live, so it wrote the only durable place there was,
// the knowledge projection, and three defects followed (destroy → mutate-a-ratified-T0 → unwritable rows).
// `persistStaging`/`loadStaging` give candidates their own file. These cases pin the two properties that
// make that real: the candidate store ROUND-TRIPS, and it NEVER touches `projection.json`.
describe('persistStaging / loadStaging — the ADR-0008 candidate sidecar', () => {
  it('round-trips a projection through the staging sidecar in a fresh process', () => {
    const dir = freshCasDir();
    const { store: candidates } = upsert(emptyStore(), reqF());
    createDiskStore(dir).persistStaging(candidates);
    // a fresh instance over the same dir = a new process with NO shared memory.
    const back = createDiskStore(dir).loadStaging();
    expect(back?.current.get('claim:fix-cov')).toEqual(candidates.current.get('claim:fix-cov'));
    expect([...back!.cas]).toEqual([...candidates.cas]);
  });

  it('MUTANT (stagingPath → PROJECTION_FILE): staging writes its OWN file and leaves projection.json alone', () => {
    const dir = freshCasDir();
    const s = createDiskStore(dir);
    // a governed projection is already on disk — exactly the state a mine pass runs against.
    s.persistProjection(upsert(emptyStore(), reqF()).store);
    const governedBytes = readFileSync(join(tmp!, 'projection.json'), 'utf8');
    // stage a DIFFERENT node: if staging resolved to the projection path, this write would replace the file.
    s.persistStaging(upsert(emptyStore(), { ...reqF(), nodeKey: 'claim:a-candidate' }).store);

    // teeth: point `stagingPath` at PROJECTION_FILE and the next two lines both go RED.
    expect(readFileSync(join(tmp!, 'projection.json'), 'utf8')).toBe(governedBytes); // byte-identical, untouched
    expect(existsSync(join(tmp!, 'staging.json'))).toBe(true); //                      its own file exists
    // and the two stores read back DISJOINT sets — a candidate is not visible as a fact, nor a fact as one.
    expect([...s.loadProjection()!.current.keys()]).toEqual(['claim:fix-cov']);
    expect([...s.loadStaging()!.current.keys()]).toEqual(['claim:a-candidate']);
  });

  it('loadStaging over corrupt sidecar bytes is total — undefined, never throws', () => {
    const dir = freshCasDir();
    createDiskStore(dir).persistStaging(upsert(emptyStore(), reqF()).store);
    writeFileSync(join(tmp!, 'staging.json'), '{ "current": [ truncated', 'utf8');
    let out: unknown = 'sentinel';
    // MUTANT: unwrap the `JSON.parse` try/catch in `readSidecar` (store.ts). `mine` rehydrates staging at
    // pass start, so a throw here aborts the pass on a half-written file instead of starting from nothing.
    expect(() => {
      out = createDiskStore(dir).loadStaging();
    }).not.toThrow();
    expect(out).toBeUndefined();
  });

  it('loadStaging is total on a MISSING and on a wrong-shape sidecar (same discipline as loadProjection)', () => {
    const dir = freshCasDir();
    expect(createDiskStore(dir).loadStaging()).toBeUndefined(); // nothing staged yet — not a throw
    createDiskStore(dir).persistStaging(upsert(emptyStore(), reqF()).store);
    // valid JSON whose `current` is NOT the [k,v] entry-array — `new Map(5)` would throw without the guard.
    writeFileSync(join(tmp!, 'staging.json'), JSON.stringify({ current: 5, cas: {} }), 'utf8');
    let out: unknown = 'sentinel';
    // MUTANT (measured, both halves needed): drop the `Array.isArray` guard AND the try/catch around the
    // Map/Set construction in `readSidecar` ⇒ `TypeError: number 5 is not iterable`. Dropping the guard
    // ALONE leaves this green — the catch covers it — so the guard is defence-in-depth, not the tooth.
    expect(() => {
      out = createDiskStore(dir).loadStaging();
    }).not.toThrow();
    expect(out).toBeUndefined();
  });
});
