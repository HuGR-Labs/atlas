// @atlas/persist — ref/source.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Portable-source assembly (PERSIST-1). The reference NAMES the behaviour — the portable source is the
// tracked store + commit trailers (notes a mutable overlay); `clone(source)` reconstructs Atlas state;
// a placement check asserts no datum's only home is the PR attachment (method-tags-pst:20-22) — but it
// freezes NO concrete signature.
//
// PINNED (oracle-pin reconciliation) — golden SCN-PERSIST-1a-1 test-models `clone(source)` rebuilding
// Atlas state from the portable source = {store, trailer} (goldens-pst:49-52). The portable source is
// transcribed as the store + the commit trailers (PERSIST-1, atlas-persist:40-43); notes are a mutable
// overlay, not part of the clone-required source. The `source` INPUT has no frozen shape → `unknown`.
// (Distinct from the PERSIST-9 export/import round-trip, which REUSES the KERNEL-6
// `kernel/ref/portable.ts` (de)serializer — method-tags-pst:78 — and therefore has no new surface here.)

import type { Trailer } from './types.js';

/** The portable, clone-required source: the tracked store + the commit trailers (PERSIST-1,
 *  atlas-persist:40-43). Notes are a mutable overlay and are NOT part of this canonical source. */
export interface PortableSource {
  readonly store: string;
  readonly trailers: readonly Trailer[];
}

export interface SourceApi {
  /** Reconstruct the portable source ({store, trailers}) for a bare clone to rebuild Atlas state from
   *  {store, trailer} alone (SCN-PERSIST-1a-1). [SIG-TBD] `source` input shape is not frozen → `unknown`. */
  clone(source: unknown): PortableSource;
}
