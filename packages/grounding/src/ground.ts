// @atlas/grounding — src/ground.ts   (WP-4.10-c.GROUND · GROUND-3 · the ground() anchor builder)
//
// The anchor-builder front door carved from WP-4.10-a: `ground(node, src)` RE-DERIVES the grounding
// anchor for a groundable unit against the BUILT-index snapshot `src` (Owner-DEFINE pin: `Axes`,
// oracle-pin-map §5). For each of `node`'s CITATION TARGETS it resolves the unit's CURRENT `subtreeHash`
// by walking the axes hierarchy on the citation's `qualifiedPath` (the same resolution the sealed sibling
// `driftDetect` uses); a citation whose unit is gone / whose path is absent is DROPPED — fail-closed
// (GROUND-3), never a throw. Pure + total (no clock, no IO). Conforms to the frozen `GroundApi.ground`
// (`GroundApi` in `./types.ts`, atlas-grounding:128), pinning `node` from the reference data model.
//
// `node` (SIG-TBD in the frozen oracle) is PINNED HERE, not guessed. The reference gives `ground` no
// concrete `node` shape but its OUTPUT is fully pinned: a `Grounding` of `GroundingEntry`s each carrying an
// `anchor: StructRef = { kind, qualifiedPath, subtreeHash }` (atlas-grounding:38-44). Since `ground`
// RE-DERIVES the `subtreeHash` (the drift oracle) from `src`, the groundable unit must carry every anchor
// coordinate EXCEPT that one: `kind`, `qualifiedPath` (the resolution key), the human `path`, and the
// optional `displayLines` nav hint. A `Citation` is therefore exactly a `GroundingEntry`/`StructRef` minus
// the re-derived oracle — the minimal faithful shape the reference implies, NOT invented. The upward
// `@atlas/knowledge` `GroundedFact` is deliberately NOT imported (it would invert the layer DAG).
//
// SCOPE: `isGrounded` is the SEALED co-verb (WP-4.10-a, ../src/drift.ts) — imported/reused, never
// redefined. `findByKey`/`resolveCurrent` are module-local in the sealed `drift.ts` (not exported); the
// minimal axes walk is replicated here rather than editing the sealed sibling.

import type { StructRef, SubtreeHash } from '@atlas/contracts';
import type { Axes, IndexNode } from '@atlas/index';
import type { Grounding, GroundingEntry } from './types.js';

/**
 * A CITATION TARGET on a groundable unit: the anchor coordinates `ground` re-resolves — everything a
 * resolved `GroundingEntry`/`StructRef` (atlas-grounding:39-44) carries EXCEPT the `subtreeHash` drift
 * oracle, which `ground` re-derives from `src`. `qualifiedPath` is the axes resolution key (GROUND-1:
 * `displayLines`/line-ranges are NEVER the oracle, only an optional nav hint).
 */
export interface Citation {
  readonly kind: StructRef['kind'];
  readonly qualifiedPath: string;
  readonly path: string;
  readonly displayLines?: string;
}

/** The groundable unit `ground` re-derives an anchor for: a bag of citation targets. */
export interface GroundableUnit {
  readonly citations: readonly Citation[];
}

/** Resolve a unit's CURRENT subtreeHash under `n` by its qualified key. Total: an absent unit returns
 *  `undefined` (unresolvable), never a throw. Replicates the sealed `drift.ts` walk (not exported there). */
function findByKey(n: IndexNode, key: string): SubtreeHash | undefined {
  if (n.key === key) return n.subtreeHash;
  for (const child of n.children) {
    const hit = findByKey(child, key);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/** The current subtreeHash of `qualifiedPath` across the built-index axes, or `undefined` if the unit is
 *  gone/unresolvable (GROUND-3 fail-closed). `displayLines`/line-ranges are never consulted (GROUND-1). */
function resolveCurrent(src: Axes, qualifiedPath: string): SubtreeHash | undefined {
  for (const root of [src.spatial, src.territory, src.dependency]) {
    const hit = findByKey(root, qualifiedPath);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/**
 * GROUND-3 anchor builder. RE-DERIVES the grounding anchor for `node` against the built-index `src`:
 * for each citation target, resolve its CURRENT `subtreeHash` (the re-derived drift oracle, read from the
 * already-hashed index — never re-hashed locally) and emit a `GroundingEntry`; an unresolvable citation
 * (unit gone / path absent) is DROPPED — fail-closed, never a throw. Pure + total. Conforms to the frozen
 * `GroundApi.ground`, with `node` pinned to `GroundableUnit`.
 */
export function ground(node: GroundableUnit, src: Axes): Grounding {
  const entries: GroundingEntry[] = [];
  for (const c of node.citations) {
    const subtreeHash = resolveCurrent(src, c.qualifiedPath);
    if (subtreeHash === undefined) continue; // GROUND-3: drop the unresolvable citation, never throw.
    const anchor: StructRef = { kind: c.kind, qualifiedPath: c.qualifiedPath, subtreeHash };
    entries.push(
      c.displayLines === undefined
        ? { anchor, path: c.path }
        : { anchor, path: c.path, displayLines: c.displayLines },
    );
  }
  return { entries };
}
