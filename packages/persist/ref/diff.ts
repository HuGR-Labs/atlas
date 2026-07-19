// @atlas/persist — ref/diff.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Version-delta = read-only fold-diff (PERSIST-14). `diff(shaA, shaB)` partitions the facts into a
// total, disjoint {added, edited, superseded, decayed}, each entry carrying its provenance. It is a
// PURE READ (0 mutation), byte-identical across runs, well-defined regardless of fold/event order —
// computed by comparing two folded AtlasStates, NOT a stored/materialized diff
// (atlas-persist:90-95; method-tags-pst:122-127).
//
// `shaA`/`shaB` are typed `Hash` exactly as the task pins the signature. [NOTE] atlas-persist:94 frames
// `diff(shaA, shaB)` over commit SHAs; the frozen param type here is `Hash` per the task — transcribed
// as given.

import type { Hash } from '@atlas/contracts';

/**
 * One fact in a partition, carrying its provenance (PERSIST-14: "each entry carrying its provenance").
 * OPAQUE-BY-DESIGN (kept `unknown`, flagged): NO ref/golden/consumer freezes either the fact-payload
 * shape or the provenance shape — genuinely opaque at this layer, left honestly `unknown`. The
 * `provenance`-carrying membership requirement is the only frozen part.
 */
export interface VersionDeltaEntry {
  readonly fact: unknown;
  readonly provenance: unknown;
}

/**
 * The read-only fold-diff result: a total, disjoint partition of the facts (method-tags-pst:125).
 */
export interface VersionDelta {
  readonly added: readonly VersionDeltaEntry[];
  readonly edited: readonly VersionDeltaEntry[];
  readonly superseded: readonly VersionDeltaEntry[];
  readonly decayed: readonly VersionDeltaEntry[];
}

export interface DiffApi {
  /** Read-only fold-diff over the event log between two commit states. (atlas-persist:94) */
  diff(shaA: Hash, shaB: Hash): VersionDelta;
}
