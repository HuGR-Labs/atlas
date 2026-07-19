// @atlas/kernel — src/portable.ts  (OKF open-JSON export/import of the CAS — KERNEL-6)
//
// Portability / no lock-in (KERNEL-6): the CAS exports to a self-contained OPEN JSON (OKF) dump that
// replays 1:1 into a FRESH store — no proprietary encoding, no host dependency (A-8). INVARIANT: keys
// emitted sorted (deterministic); `import` re-mints keys via `asHash` and FAILS CLOSED on a malformed bundle.

import type { Hash } from '@atlas/contracts';
import type { Cas, CasObject } from './types.js';
import { asHash } from './brand.js';

/**
 * Portability / no lock-in (frozen, KERNEL-6): the CAS exports to open JSON that replays 1:1 into a fresh
 * store — no proprietary encoding, no host dependency. (atlas-kernel:104-105, 59-60)
 */
export interface PortableApi {
  /** Open-JSON CAS dump (A-8). (atlas-kernel:104) */
  export(): string;
  /** Replays 1:1 into a fresh store. (atlas-kernel:105) */
  import(json: string): Cas;
}

/** OKF envelope tag + version — the ONLY literals the serializer adds (both host-independent). */
const OKF_FORMAT = 'atlas-okf';
const OKF_VERSION = 1;

/** The on-the-wire shape of an OKF dump: a self-describing open-JSON envelope over the CAS entries. */
interface OkfBundle {
  readonly format: string;
  readonly version: number;
  readonly objects: Record<string, CasObject>;
}

/**
 * Serialize the whole CAS to a self-contained open-JSON OKF dump. Keys are emitted in sorted order, so
 * the dump is byte-stable regardless of `Map` insertion order (deterministic, replayable). Every entry is
 * carried verbatim — nothing is dropped, no host path / external ref / proprietary encoding is introduced.
 */
export function exportCas(cas: Cas): string {
  const objects: Record<string, CasObject> = {};
  for (const key of [...cas.keys()].sort()) {
    objects[key] = cas.get(key) as CasObject;
  }
  const bundle: OkfBundle = { format: OKF_FORMAT, version: OKF_VERSION, objects };
  return JSON.stringify(bundle);
}

/**
 * Replay an OKF dump 1:1 into a FRESH store (a brand-new `Map`), preserving each content-addressed key.
 * Fails closed (throws) on a malformed bundle — non-JSON text, a missing/typed-wrong envelope, or a
 * non-object `objects` map — rather than returning a partial or fabricated store.
 */
export function importCas(json: string): Cas {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('malformed OKF bundle: not valid JSON');
  }
  if (!isOkfBundle(parsed)) {
    throw new Error('malformed OKF bundle: missing or invalid OKF envelope');
  }
  const cas: Cas = new Map<Hash, CasObject>();
  for (const key of Object.keys(parsed.objects)) {
    cas.set(asHash(key), parsed.objects[key] as CasObject);
  }
  return cas;
}

/** Structural guard for the OKF envelope — the fail-closed predicate `import` gates on. */
function isOkfBundle(v: unknown): v is OkfBundle {
  if (typeof v !== 'object' || v === null) return false;
  const b = v as Record<string, unknown>;
  return (
    b.format === OKF_FORMAT &&
    typeof b.version === 'number' &&
    typeof b.objects === 'object' &&
    b.objects !== null &&
    !Array.isArray(b.objects)
  );
}

/**
 * Bind a CAS snapshot to the frozen `PortableApi` — `export()`/`import(json)` as the
 * store-attached form the contract names. Thin adapters over the free functions above.
 */
export function makePortable(cas: Cas): PortableApi {
  return {
    export: (): string => exportCas(cas),
    import: (json: string): Cas => importCas(json),
  };
}
