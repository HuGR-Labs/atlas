// @atlas/persist — src/source.ts  (portable-source assembly + full-store OKF export path — PERSIST-1 / 9)
//
// The portable source is the tracked STORE + the commit TRAILERS (notes are a mutable overlay, not part of
// the clone-required source; the PR attachment is a PROJECTION, never a datum's sole home) — PERSIST-1,
// atlas-persist:40-43. `clone(source)` assembles that portable source: the CAS is the open-JSON (OKF) dump
// of every STORE-homed datum — serialized over the SEALED @atlas/kernel portable seam (`exportCas`), so a
// bare clone rebuilds Atlas state from {store, trailer} alone, never consulting the PR attachment. The
// sole-home check (`soleHomeViolations`) flags any datum whose ONLY home is the PR attachment (PERSIST-1-b).
// The full-store export path (`exportStore`/`importStore`) is the persist-side wiring of the KERNEL-6 OKF
// (de)serializer — no lock-in is layered on top of git; the kernel serializer is consumed verbatim, never
// re-implemented (PERSIST-9, exclusions: the open-JSON format is owned by WP-1.1-b.KERNEL).

import type { Hash } from '@atlas/contracts';
import type { Cas, CasObject } from '@atlas/kernel';
import { id, exportCas, importCas } from '@atlas/kernel';
import type { Trailer } from '../ref/types.js';
import type { PortableSource, SourceApi } from '../ref/source.js';

/** The persistence surfaces a datum may be homed on (PROP-PERSIST-1 arbitrary: each datum routed to some
 *  subset of {store, trailer, note, PR-attachment}). */
export type Home = 'store' | 'trailer' | 'note' | 'pr-attachment';

/** A datum routed to a subset of homes — the placement unit the portable source is assembled from. */
export interface Placement {
  readonly value: CasObject;
  readonly homes: readonly Home[];
}

/** The clone-required source: a set of datum placements + the committed trailers. The `source` input to
 *  `SourceApi.clone` is frozen `unknown` (ref/source.ts) — this is the local model it is narrowed to. */
export interface Source {
  readonly placements: readonly Placement[];
  readonly trailers: readonly Trailer[];
}

/** Narrow the deliberately-`unknown` clone input to the local placement model. Total: a structurally-absent
 *  field yields an empty projection, never a throw (no clock/network/mutable-cache in the path). */
function narrow(source: unknown): Source {
  const s = (typeof source === 'object' && source !== null ? source : {}) as Partial<Source>;
  return {
    placements: Array.isArray(s.placements) ? (s.placements as readonly Placement[]) : [],
    trailers: Array.isArray(s.trailers) ? (s.trailers as readonly Trailer[]) : [],
  };
}

/**
 * Assemble the portable source ({store, trailers}) for a bare clone to rebuild Atlas state from {store,
 * trailer} alone (SCN-PERSIST-1a-1). The CAS is the OKF dump of every STORE-homed datum, content-keyed via
 * the sealed `id` seam and serialized over the sealed kernel `exportCas`; the trailers travel verbatim. A
 * PR-attachment-only datum is never placed in the store, so a bare clone never surfaces it (projection).
 */
export function clone(source: unknown): PortableSource {
  const { placements, trailers } = narrow(source);
  const cas: Cas = new Map<Hash, CasObject>();
  for (const p of placements) {
    if (p.homes.includes('store')) cas.set(id(p.value), p.value);
  }
  return { store: exportCas(cas), trailers };
}

/**
 * The sole-home placement assertion `∀ datum: home ⊋ {PR-attachment}` (SCN-PERSIST-1b-1): return every
 * placement whose ONLY home is the PR attachment (empty ⇒ the whole source is valid). Such a datum would
 * be lost by a bare clone — no datum may have the PR attachment as its sole home. Total: never throws.
 */
export function soleHomeViolations(source: unknown): readonly Placement[] {
  const { placements } = narrow(source);
  return placements.filter((p) => {
    const homes = new Set(p.homes);
    return homes.size === 1 && homes.has('pr-attachment');
  });
}

/**
 * The full-store open-JSON (OKF) export path over the SEALED kernel portable seam — the whole store dumps
 * to open JSON that replays 1:1 into a fresh store (SCN-PERSIST-9a-1). No lock-in is layered on top of git:
 * the KERNEL-6 serializer is consumed verbatim (PERSIST-9, WP-1.1-b.KERNEL owns the format).
 */
export function exportStore(cas: Cas): string {
  return exportCas(cas);
}

/** Replay an OKF dump 1:1 into a FRESH store over the sealed kernel seam (the SCN-PERSIST-9a-1 inverse). */
export function importStore(json: string): Cas {
  return importCas(json);
}

// differential-vs-oracle (compile-time): `clone` conforms to the frozen SourceApi (ref/source.ts).
const _apiCheck: SourceApi = { clone };
void _apiCheck;
