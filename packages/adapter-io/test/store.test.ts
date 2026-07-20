// @atlas/adapter-io — test/store.test.ts   (WP-9.2.3.STORE — EPIC-3, REQ-ADAPTER-6a/6b/6c + 12a/12b)
//
// Acceptance suite for the durable, tamper-safe disk StoreApi + cross-process StoreProjection rehydrate
// (ADAPT-STORE-1/3). Transcribes the frozen goldens (docs/requirements/goldens-adapters.md) VERBATIM:
//   • SCN-ADAPTER-6a-1  — put/get round-trips under the content hash                       (happy)
//   • SCN-ADAPTER-6b-1  — put in process A is get-retrievable in a fresh process B          (happy)
//   • SCN-ADAPTER-6c-1  — a tampered on-disk value reads as absent                          (guard)
//   • SCN-ADAPTER-12a-1 — a fresh process rehydrates the flushed fact byte-identically       (happy)
//   • SCN-ADAPTER-12b-1 — rehydrate reconstructs state only, minting nothing                (guard)
//
// Harness (per fs.test.ts convention): a temp CAS dir per test + afterEach cleanup. `casPath` is the CAS
// ROOT — value files land at `<casPath>/<H[0:2]>/<H>` and the projection sidecar beside it (outside cas/).

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { id } from '@atlas/kernel';
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
