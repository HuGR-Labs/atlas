// @atlas/memory — src/kinds.ts  (WP-6.23.MEM · MEM-2)
//
// The kind partition (implements the FROZEN ref/kinds.ts `KindsApi`). Memory and Knowledge live in the ONE
// Atlas on the same index/format, yet a Memory entry MUST NOT route into the shared-Knowledge partition and
// a Knowledge fact MUST NOT route into Memory — 0 conflations (MEM-2). `partition(entry)` computes an
// entry's TRUE `AtlasKind` and `put` rejects any write whose claimed kind disagrees.
//
// NO memory↔knowledge crossover: this file NEVER stores a Memory entry as Knowledge or vice versa — it is
// the gate that forbids exactly that. The discriminant is STRUCTURAL, no raw hashing, no @atlas/kernel seam.

import type { AtlasKind, KindsApi } from '../ref/kinds.js';
import type { MemoryEntry, MemoryRecord } from '../ref/types.js';

/**
 * Raised when a write's claimed `AtlasKind` disagrees with the entry's true partition — the MEM-2 gate
 * rejects it fail-closed (never stored on the wrong side of the Memory/Knowledge boundary).
 */
export class KindConflationError extends Error {
  readonly claimed: AtlasKind;
  readonly actual: AtlasKind;
  constructor(claimed: AtlasKind, actual: AtlasKind) {
    super(
      `MEM-2 kind conflation: write claimed AtlasKind '${claimed}' but the entry's true partition is ` +
        `'${actual}' — rejected (0 Memory↔Knowledge conflation)`,
    );
    this.name = 'KindConflationError';
    this.claimed = claimed;
    this.actual = actual;
  }
}

/**
 * The partition an entry belongs to (MEM-2). A Knowledge `GroundedFact` (`AdvisoryNode | PredicateNode`,
 * @atlas/knowledge) carries a top-level `kind` discriminant of `'advisory' | 'predicate'`; NO `MemoryEntry`
 * shape (project / task / pr / logbook) has a top-level `kind` field (the Memory kind lives on the
 * `MemoryRecord` envelope, not the entry). That asymmetry is the partition oracle — structural, not hashed.
 */
export function partition(entry: MemoryEntry): AtlasKind {
  const disc = (entry as { readonly kind?: unknown }).kind;
  if (disc === 'advisory' || disc === 'predicate') return 'knowledge';
  return 'memory';
}

/**
 * Route a write on the `AtlasKind` discriminant (MEM-2). A memory→knowledge or knowledge→memory write is
 * REJECTED fail-closed: `partition(entry)` MUST equal the claimed `kind`.
 *
 * [OWNER-DEFINE-parked — matched-partition write projection] on a MATCHED kind the reference's return is a
 * `MemoryRecord`, but `put` receives NO `owner` and the reference freezes NO owner-source (oracle-pin-map:
 * memory "kinds put-return genuinely open"). No acceptance golden exercises the matched branch (both MEM-2
 * goldens are rejections), so rather than fabricate an `owner` the matched write projection is fail-closed
 * — NOT invented. When the owner-source is ratified, the matched branch materializes the record.
 */
export function put(kind: AtlasKind, entry: MemoryEntry): MemoryRecord {
  const actual = partition(entry);
  if (actual !== kind) throw new KindConflationError(kind, actual);
  throw new Error(
    'MEM-2 put: matched-partition write projection is OWNER-DEFINE-parked (no `owner` input to `put`; ' +
      'oracle-pin-map). Not invented.',
  );
}

// differential-vs-oracle (compile-time): the free functions conform EXACTLY to the FROZEN `KindsApi`.
const _kinds: KindsApi = { put, partition };
void _kinds;
