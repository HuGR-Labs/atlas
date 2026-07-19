// @atlas/grounding — test/wp-4.10-c-grd.test.ts   (WP-4.10-c.GROUND · ground() anchor-builder successor)
//
// RED→GREEN transcription of the VISIBLE goldens CARVED from WP-4.10-a for the `ground(node, src)` verb —
// the anchor builder whose groundable-unit `node` type was DEFINE-parked (oracle-pin-map §5 pinned only
// `src = Axes`) and is here PINNED FROM THE REFERENCE (atlas-grounding:128, :38-44): a groundable unit
// carries its CITATION TARGETS (the anchor coordinates minus the re-derived `subtreeHash` drift oracle),
// and `ground` re-derives each anchor@src, DROPPING any citation whose unit/path is gone (GROUND-3
// fail-closed), never throwing. `node` is NOT invented — a `Citation` is a `GroundingEntry`/`StructRef`
// (atlas-grounding:39-44) with the one field `ground` re-derives (`subtreeHash`) removed.
//
// Transcribed (visible -1 goldens):
//   - SCN-GROUND-3a-1 (guard) — `ground()` drops a dangling citation (E_gone filtered, only E_arr remains).
//   - SCN-GROUND-3c-1 (guard) — a corner-biased fuzz stream over `ground()`/`driftDetect()` returns a value
//                                on every case (drop / DRIFTED) — 0 exceptions thrown (totality).
//
// The held-out `-2` fixtures (SCN-GROUND-3a-2 / 3c-2) are NOT read. `isGrounded`/`driftDetect` are the
// SEALED sibling co-verbs (WP-4.10-a) — imported, never redefined. Runtime imported DIRECTLY from
// ../src/ground.js (the barrel is wired by the lead at SEAL).

import { describe, it, expect } from 'vitest';
import { asSubtreeHash } from '@atlas/kernel';
import type { Axes, IndexNode } from '@atlas/index';
import { driftDetect, isGrounded } from '../src/drift.js';
import { ground } from '../src/ground.js';
import type { Citation, GroundableUnit } from '../src/ground.js';

// ── fixture builders (mirroring wp-4.10-a-grd) ─────────────────────────────────────────────────────────
const node = (key: string, sh: string, children: IndexNode[] = []): IndexNode => ({
  axis: 'spatial',
  level: 'item',
  key,
  subtreeHash: asSubtreeHash(sh),
  children,
  objects: [],
});
const axesWith = (leaves: IndexNode[]): Axes => ({
  spatial: node('repo', 'root', leaves),
  territory: node('repo', 'empty'),
  dependency: node('repo', 'empty'),
  edges: [],
});
/** A CITATION TARGET — a groundable-unit's anchor coordinates MINUS the re-derived `subtreeHash`. */
const cite = (qp: string, displayLines?: string): Citation => {
  const path = qp.split('#')[0] ?? qp;
  const base = { kind: 'symbol' as const, qualifiedPath: qp, path };
  return displayLines === undefined ? base : { ...base, displayLines };
};
const unit = (...citations: Citation[]): GroundableUnit => ({ citations });

// The cited unit `U_arr = billing.ts › computeArr()` — resolvable in `src` at subtreeHash `sh-arr-01`.
const QP_ARR = 'billing.ts#computeArr';
const src = axesWith([node(QP_ARR, 'sh-arr-01')]); // E_arr resolves; deleted.ts#gone is absent

describe('WP-4.10-c.GROUND — ground() anchor builder: re-derive@src, drop unresolvable (visible goldens)', () => {
  it('SCN-GROUND-3a-1: ground() drops a dangling citation (E_gone filtered, only E_arr remains)', () => {
    // a fact whose grounding cites E_gone (deleted.ts#gone — unit/path deleted) alongside resolvable E_arr.
    const f = unit(cite(QP_ARR, '40-52'), cite('deleted.ts#gone', '5-9'));
    const g = ground(f, src);
    // teeth (breaks-on "ground() retains the unresolvable entry — a dangling citation persists as anchored"):
    expect(g.entries).toHaveLength(1);
    expect(g.entries[0]?.anchor.qualifiedPath).toBe(QP_ARR);
    // the retained anchor carries the RE-DERIVED current subtreeHash from `src` (the drift oracle).
    expect(g.entries[0]?.anchor.subtreeHash).toBe(asSubtreeHash('sh-arr-01'));
    // the built grounding is real and reads FRESH against the source it was re-derived from (co-verb reuse).
    expect(isGrounded(g)).toBe(true);
    expect(driftDetect(g, src)).toBe('FRESH');
  });

  it('SCN-GROUND-3a-1 (kind pass-through): the re-derived anchor preserves the citation kind, not a hardcoded default', () => {
    // a citation with a NON-'symbol' kind — only `subtreeHash` is re-derived from `src`; `kind` MUST ride
    // through from the citation (it is un-derivable from the index, which carries axis/level not StructRef.kind).
    const f = unit({ kind: 'block' as const, qualifiedPath: QP_ARR, path: 'billing.ts' });
    const g = ground(f, src);
    expect(g.entries).toHaveLength(1);
    // teeth (breaks-on "ground() stamps a hardcoded kind instead of carrying the citation's"):
    expect(g.entries[0]?.anchor.kind).toBe('block');
    expect(g.entries[0]?.anchor.subtreeHash).toBe(asSubtreeHash('sh-arr-01'));
  });

  it('SCN-GROUND-3c-1: a corner-biased fuzz stream over ground()/driftDetect() returns a value, 0 throws', () => {
    // deterministic LCG — a corner-biased stream of arbitrary/malformed/absent citations (no clock, no IO).
    let seed = 0x9e3779b9 >>> 0;
    const rnd = (): number => (seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000;
    const KINDS = ['symbol', 'block', 'file', 'repo', 'project'] as const;
    const CORNERS = ['', QP_ARR, 'deleted.ts#gone', 'a/b/c#deeply.nested.absent', 'uniçode#mängled', '  '];
    const genCite = (): Citation => {
      const qp = rnd() < 0.6 ? (CORNERS[(rnd() * CORNERS.length) | 0] ?? '') : `x${(rnd() * 1e6) | 0}#s`;
      const c = { kind: KINDS[(rnd() * KINDS.length) | 0]!, qualifiedPath: qp, path: qp.split('#')[0] ?? qp };
      return rnd() < 0.5 ? c : { ...c, displayLines: `${(rnd() * 99) | 0}-${(rnd() * 99) | 0}` };
    };

    for (let i = 0; i < 10_000; i++) {
      const n = (rnd() * 5) | 0; // corner: 0-citation units included
      const f = unit(...Array.from({ length: n }, genCite));
      // ground() and driftDetect() are TOTAL — every case RETURNS, never throws (GROUND-3).
      // teeth (breaks-on "an absent-path / unicode-mangled citation raises instead of being dropped"):
      let g!: ReturnType<typeof ground>;
      expect(() => (g = ground(f, src))).not.toThrow();
      expect(Array.isArray(g.entries)).toBe(true);
      // every SURVIVING entry resolved in `src` (the absent/dangling ones were DROPPED, not retained).
      for (const e of g.entries) {
        expect(e.anchor.qualifiedPath).toBe(QP_ARR);
        expect(e.anchor.subtreeHash).toBe(asSubtreeHash('sh-arr-01'));
      }
      // the built grounding re-checks total under the sealed co-verbs (drop ⇒ empty ⇒ DRIFTED, never throw).
      expect(() => driftDetect(g, src)).not.toThrow();
      expect(() => isGrounded(g)).not.toThrow();
      expect(driftDetect(g, src)).toBe(g.entries.length === 0 ? 'DRIFTED' : 'FRESH');
    }
  });
});
