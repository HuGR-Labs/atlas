// @atlas/index — test/resolve.test.ts  (WP-2.8-a.INDEX)
//
// RED→GREEN transcription of the VISIBLE resolve goldens SCN-INDEX-4a-1 (covering-node resolve) + the
// resolve leg of the ∀-law PROP-INDEX-4 (resolution totality: resolve(spatial,p) ≡ coveringNode(p), never
// the parent, never undefined for an in-tree path). Golden node handles are SYMBOLIC ⇒ every assertion is
// RELATIONAL (the covering node is identified by its transcribed `level`/`key`, never a hard-coded hash).
// Held-out `-2` fixtures are NOT transcribed here (GATE runs those).

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { asSubtreeHash } from '@atlas/kernel';
import type { Hash } from '@atlas/contracts';
import type { Axis, IndexNode } from '../ref/types.js';
import { createResolve, coveringPath, pathSegments, type AxisForest } from '../src/resolve.js';

// --- fixture builders (RELATIONAL; keys are the path segments, rollup roots per-axis distinct) ----------
const node = (
  axis: Axis,
  level: string,
  key: string,
  children: IndexNode[],
  objects: Hash[],
): IndexNode => ({ axis, level, key, subtreeHash: asSubtreeHash(`${axis}:${key}`), children, objects });

// spatial rail repo→crate→module→file (atlas-index:54): the covering node of "core/cas/cas.ts" is file:cas.ts.
function coreForest(): AxisForest {
  const file = node('spatial', 'file', 'cas.ts', [], []);
  const mod = node('spatial', 'module', 'cas', [file], []);
  const crate = node('spatial', 'crate', 'core', [mod], []);
  const spatial = node('spatial', 'repo', 'repo', [crate], []);
  const territory = node('territory', 'project', 'proj', [], []);
  const dependency = node('dependency', 'crate', 'dep', [], []);
  return { spatial, territory, dependency };
}

// a linear spatial chain repo→<segs…> for the ∀-property (arbitrary in-tree paths).
function chainForest(segs: readonly string[]): AxisForest {
  let current: IndexNode = node('spatial', `L${segs.length}`, segs[segs.length - 1]!, [], []);
  for (let i = segs.length - 2; i >= 0; i--) current = node('spatial', `L${i + 1}`, segs[i]!, [current], []);
  const spatial = node('spatial', 'repo', 'repo', [current], []);
  const territory = node('territory', 'project', 'proj', [], []);
  const dependency = node('dependency', 'crate', 'dep', [], []);
  return { spatial, territory, dependency };
}

// generator: unique, trimmed, slash-free segment keys (so pathSegments(seg) ≡ seg round-trips).
const chainArb = fc.uniqueArray(
  fc.string({ minLength: 1, maxLength: 6 }).filter((s) => s === s.trim() && s.length > 0 && !s.includes('/')),
  { minLength: 1, maxLength: 5 },
);

describe('INDEX-4a — resolving a path returns its covering node (visible golden)', () => {
  it('SCN-INDEX-4a-1: resolve(spatial,"core/cas/cas.ts") ⇒ file:cas.ts, not the parent module', () => {
    const { resolve } = createResolve(coreForest());
    const n = resolve('spatial', 'core/cas/cas.ts');
    expect(n).toBeDefined();
    expect(n?.key).toBe('cas.ts');
    expect(n?.level).toBe('file'); // the covering FILE node …
    expect(n?.level).not.toBe('module'); // teeth: NOT module:cas (covering-node contract violated)
    expect(n?.axis).toBe('spatial');
  });
});

describe('PROP-INDEX-4 (resolve leg) — resolution totality ∀ in-tree path', () => {
  it('∀ in-tree path p: resolve(spatial,p) ≡ the deepest matched (covering) node, never a shorter ancestor', () => {
    fc.assert(
      fc.property(chainArb, (segs) => {
        const { resolve } = createResolve(chainForest(segs));
        // every prefix path resolves to the node AT that depth (the covering node) — not the parent.
        for (let k = 1; k <= segs.length; k++) {
          const p = segs.slice(0, k).join('/');
          const n = resolve('spatial', p);
          expect(n?.key).toBe(segs[k - 1]);
        }
        // a segment that leaves the tree ⇒ a total miss (undefined), never a wrong ancestor hit.
        expect(resolve('spatial', segs.join('/') + '/__absent__')).toBeUndefined();
      }),
    );
  });

  it('pathSegments trims + drops empties (path normalization is total)', () => {
    expect(pathSegments(' a / b //c ')).toEqual(['a', 'b', 'c']);
    expect(pathSegments('')).toEqual([]);
    expect(coveringPath(coreForest().spatial, '')).toEqual([]);
  });
});
