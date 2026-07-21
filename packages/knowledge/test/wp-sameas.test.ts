// @atlas/knowledge — test/wp-sameas.test.ts  (WP-SAMEAS · #43 · deriveSameAs + linkSameAs goldens)
//
// The pure core of the human-asserted `sameAs` equivalence: the read-side union-find fold (`deriveSameAs`)
// and the write-side symmetric reducer (`linkSameAs`). Fast white-box teeth — a red→green guard on the
// union-find + reducer INDEPENDENT of the ~27s s16 subprocess blackbox (coverage parity with the sibling
// `wp-dedup-2.subsumes.test.ts`). Each `it` pins one frozen clause and names the mutant it kills.

import { describe, it, expect } from 'vitest';
import { deriveSameAs } from '../src/read/sameas.js';
import type { SameAs } from '../src/read/sameas.js';
import { linkSameAs } from '../src/write/link.js';
import type { CurrentNode, StoreProjection } from '../src/write/router.js';

/** A minimal current node keyed `key`, carrying an optional `sameAs` edge list (the only fields the fold +
 *  reducer read). family/contentHash/claims are inert filler the shapes require. */
function node(key: string, sameAs?: readonly string[]): CurrentNode {
  return { nodeKey: key, family: 'advisory', contentHash: `ch-${key}`, claims: [], ...(sameAs ? { sameAs } : {}) };
}

/** A projection over the given nodes (cas/builtAt inert — the fold/reducer never read them). */
function proj(...nodes: readonly CurrentNode[]): StoreProjection {
  return { current: new Map(nodes.map((n) => [n.nodeKey, n])), cas: new Set() };
}

const pairs = (es: readonly SameAs[]): string[] => es.map((e) => `${e.a}=${e.b}`);

describe('deriveSameAs — union-find equivalence fold (WP-SAMEAS read side)', () => {
  it('a symmetric edge A↔B yields exactly the one canonical pair {a<b}', () => {
    const p = proj(node('kA', ['kB']), node('kB', ['kA']));
    expect(pairs(deriveSameAs(p))).toEqual(['kA=kB']); // a<b canonical, emitted once (not kB=kA too)
  });

  it('TRANSITIVE closure: A≡B, B≡C ⇒ the fold derives A≡C (the union-find tooth)', () => {
    // Only A-B and B-C are stored; A-C is NEVER a stored edge. A plain edge-lister would emit 2 pairs;
    // the union-find fold must emit all THREE intra-class canonical pairs.
    const p = proj(node('kA', ['kB']), node('kB', ['kA', 'kC']), node('kC', ['kB']));
    expect(pairs(deriveSameAs(p))).toEqual(['kA=kB', 'kA=kC', 'kB=kC']); // sorted, transitive, no dups
  });

  it('a dangling edge to a NON-current nodeKey is ignored — no throw, no phantom class', () => {
    const p = proj(node('kA', ['kGHOST'])); // kGHOST is not in `current`
    expect(deriveSameAs(p)).toEqual([]); // singleton after ignoring the dangling peer
  });

  it('a node with no sameAs is a singleton — emits nothing', () => {
    expect(deriveSameAs(proj(node('kA'), node('kB')))).toEqual([]);
  });

  it('two DISJOINT classes each emit their own pair, globally sorted', () => {
    const p = proj(
      node('kA', ['kB']), node('kB', ['kA']),
      node('kC', ['kD']), node('kD', ['kC']),
    );
    expect(pairs(deriveSameAs(p))).toEqual(['kA=kB', 'kC=kD']);
  });
});

describe('linkSameAs — pure symmetric reducer (WP-SAMEAS write side)', () => {
  it('a===b is a total no-op (a node never names itself)', () => {
    const p = proj(node('kA'));
    expect(linkSameAs(p, 'kA', 'kA')).toBe(p); // unchanged reference OR structurally equal — no self-edge
    expect(deriveSameAs(linkSameAs(p, 'kA', 'kA'))).toEqual([]);
  });

  it('an absent endpoint is a total no-op (the door decides rejection; the reducer stays total)', () => {
    const p = proj(node('kA'));
    expect(deriveSameAs(linkSameAs(p, 'kA', 'kGHOST'))).toEqual([]); // kGHOST absent ⇒ no edge written
  });

  it('links SYMMETRICALLY: both endpoints gain the peer, and the fold then derives the pair', () => {
    const p = proj(node('kA'), node('kB'));
    const next = linkSameAs(p, 'kB', 'kA'); // order-independent
    expect(next.current.get('kA')?.sameAs).toEqual(['kB']);
    expect(next.current.get('kB')?.sameAs).toEqual(['kA']);
    expect(pairs(deriveSameAs(next))).toEqual(['kA=kB']);
  });

  it('is IDEMPOTENT and INPUT-PURE: re-linking changes nothing and never mutates the input projection', () => {
    const p = proj(node('kA'), node('kB'));
    const once = linkSameAs(p, 'kA', 'kB');
    const twice = linkSameAs(once, 'kA', 'kB');
    expect(twice.current.get('kA')?.sameAs).toEqual(['kB']); // no duplicate peer
    expect(p.current.get('kA')?.sameAs).toBeUndefined(); // the ORIGINAL projection was never mutated
  });
});
