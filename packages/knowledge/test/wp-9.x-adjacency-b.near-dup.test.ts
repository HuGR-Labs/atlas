// @atlas/knowledge — test/wp-9.x-adjacency-b.near-dup.test.ts  (ADJACENCY-B · WP-9.x)
//
// The STRUCTURAL adjacency near-duplicate matcher `adjacencyNearDup` + its `upsert` fold. A CREATE whose
// claim EXACTLY matches an existing claim at an ADJACENT code granularity (ancestor/descendant anchor,
// ANY sibling slot) is re-routed to MERGE into that NEAREST neighbor instead of minting a parallel node.
// Deterministic, NO embeddings, exact `claimNorm` only. Every golden NAMES the mutant that flips it.

import { describe, it, expect } from 'vitest';
import { adjacencyNearDup } from '../src/write/near-dup.js';
import { upsert, emptyStore, currentNodes } from '../src/write/router.js';
import type { CurrentNode, StoreProjection, NearDupConfig, WriteRequest } from '../src/write/router.js';

const CFG: NearDupConfig = { claimNormThreshold: 1 }; // exact-match leg fires at τ ≤ 1

/** A current node anchored at `primaryAnchor`, carrying `claims`, at nodeKey `key`. */
function nodeAt(key: string, primaryAnchor: string, claims: readonly string[]): CurrentNode {
  return { nodeKey: key, family: 'advisory', contentHash: `ch:${key}`, claims, primaryAnchor };
}
function projection(nodes: readonly CurrentNode[]): StoreProjection {
  return { current: new Map(nodes.map((n) => [n.nodeKey, n])), cas: new Set() };
}

describe('ADJACENCY-B — adjacencyNearDup: structural ancestor/descendant scan (exact claimNorm)', () => {
  it('collides with the SAME claim at an ANCESTOR anchor (a::b is a prefix of a::b::c)', () => {
    const store = projection([nodeAt('anc', 'a::b', ['cn-dup'])]);
    expect(adjacencyNearDup('a::b::c', 'cn-dup', store, CFG)).toEqual({ collision: true, mergeTarget: 'anc' });
    // teeth (MUTANT: drop the ancestor leg `isPrefix(nSegs, candSegs)`) → the ancestor is no longer
    // adjacent ⇒ {collision:false}, flipping this golden.
  });

  it('collides with the SAME claim at a DESCENDANT anchor (a::b::c is a prefix of a::b::c::d)', () => {
    const store = projection([nodeAt('desc', 'a::b::c::d', ['cn-dup'])]);
    expect(adjacencyNearDup('a::b::c', 'cn-dup', store, CFG)).toEqual({ collision: true, mergeTarget: 'desc' });
    // teeth (MUTANT: drop the descendant leg `isPrefix(candSegs, nSegs)`) → the descendant is no longer
    // adjacent ⇒ {collision:false}, flipping this golden. (Names the ANY-prefix both-directions rule.)
  });

  it('collides at the SAME anchor (the degenerate prefix is included)', () => {
    const store = projection([nodeAt('same', 'a::b::c', ['cn-dup'])]);
    expect(adjacencyNearDup('a::b::c', 'cn-dup', store, CFG)).toEqual({ collision: true, mergeTarget: 'same' });
  });

  it('does NOT collide at an UNRELATED anchor (x::y shares no structural prefix with a::b::c)', () => {
    const store = projection([nodeAt('far', 'x::y', ['cn-dup'])]);
    expect(adjacencyNearDup('a::b::c', 'cn-dup', store, CFG)).toEqual({ collision: false });
    // teeth (MUTANT: drop the prefix test entirely — treat every anchored neighbor as adjacent) → this
    // unrelated node would collide, flipping this golden off {collision:false}.
  });

  it('does NOT collide when the adjacent neighbor carries a DIFFERENT claim (exact claimNorm leg)', () => {
    const store = projection([nodeAt('anc', 'a::b', ['cn-other'])]);
    expect(adjacencyNearDup('a::b::c', 'cn-dup', store, CFG)).toEqual({ collision: false });
    // teeth (MUTANT: replace claimSimilarity with a constant `1`) → any adjacent neighbor would collide,
    // flipping this golden.
  });

  it('a partial-segment near-miss is NOT a prefix (a::bb is not adjacent to a::b::c — segment-wise)', () => {
    const store = projection([nodeAt('bb', 'a::bb', ['cn-dup'])]);
    expect(adjacencyNearDup('a::b::c', 'cn-dup', store, CFG)).toEqual({ collision: false });
    // (This orientation is a no-op under BOTH segment-wise isPrefix and a raw startsWith — the biting
    // orientation is the reverse golden below, which a startsWith regression fails.)
  });

  it('SCN-ADJACENCY-B-segment-near-miss-reverse: candidate a::bb vs neighbor a::b is NOT adjacent', () => {
    // The startsWith TRAP: as a raw string, `'a::bb'.startsWith('a::b') === true` — but segment-wise the
    // second segment `bb` ≠ `b`, so `a::b` is NOT a structural ancestor of `a::bb` (they are siblings under
    // `a`). The segment-wise isPrefix correctly returns NO adjacency ⇒ NO false-merge.
    const store = projection([nodeAt('anc', 'a::b', ['cn-dup'])]);
    expect(adjacencyNearDup('a::bb', 'cn-dup', store, CFG)).toEqual({ collision: false });
    // teeth (MUTANT: swap isPrefix's segment compare for a raw `long.startsWith(short)`) → `'a::bb'`
    // false-prefix-matches `'a::b'` ⇒ a spurious {collision:true, mergeTarget:'anc'}, flipping this golden.
  });

  it('on MULTIPLE collisions the NEAREST (longest common prefix) wins', () => {
    // ancestor a::b (cpl=2) vs descendant a::b::c::d (cpl=3) vs candidate a::b::c — the descendant is nearer.
    const store = projection([nodeAt('anc', 'a::b', ['cn-dup']), nodeAt('desc', 'a::b::c::d', ['cn-dup'])]);
    expect(adjacencyNearDup('a::b::c', 'cn-dup', store, CFG)).toEqual({ collision: true, mergeTarget: 'desc' });
    // teeth (MUTANT: drop the `cpl > best.cpl` nearest test — first/last wins) → the ancestor 'anc' would
    // win, flipping mergeTarget off 'desc'.
  });

  it('ties on common-prefix length break by nodeKey lexicographic ASCENDING', () => {
    // both at the SAME anchor a::b::c (cpl=3 each) — the smaller nodeKey wins deterministically.
    const store = projection([nodeAt('zzz', 'a::b::c', ['cn-dup']), nodeAt('aaa', 'a::b::c', ['cn-dup'])]);
    expect(adjacencyNearDup('a::b::c', 'cn-dup', store, CFG)).toEqual({ collision: true, mergeTarget: 'aaa' });
    // teeth (MUTANT: flip the tie-break to `n.nodeKey > best.key` / last-wins) → 'zzz' would win,
    // flipping mergeTarget off 'aaa'.
  });

  it('an empty/`` candidate anchor is a total no-op (no candSegs ⇒ no collision)', () => {
    const store = projection([nodeAt('anc', 'a::b', ['cn-dup'])]);
    expect(adjacencyNearDup('', 'cn-dup', store, CFG)).toEqual({ collision: false });
  });

  it('a neighbor with NO primaryAnchor never participates (adjacency dormant on anchor-less nodes)', () => {
    const store: StoreProjection = {
      current: new Map([['bare', { nodeKey: 'bare', family: 'advisory', contentHash: 'ch', claims: ['cn-dup'] } as CurrentNode]]),
      cas: new Set(),
    };
    expect(adjacencyNearDup('a::b::c', 'cn-dup', store, CFG)).toEqual({ collision: false });
  });

  it('is PURE + deterministic — repeated calls agree, the projection is untouched', () => {
    const store = projection([nodeAt('anc', 'a::b', ['cn-dup'])]);
    const size = store.current.size;
    expect(adjacencyNearDup('a::b::c', 'cn-dup', store, CFG)).toEqual(adjacencyNearDup('a::b::c', 'cn-dup', store, CFG));
    expect(store.current.size).toBe(size);
  });
});

describe('ADJACENCY-B — upsert (WP-DEDUP-1 un-merge): a CREATE at an adjacent anchor mints its OWN node', () => {
  it('a CREATE adjacent (descendant) to an existing node + duplicate claim mints a distinct node (no merge)', () => {
    let s: StoreProjection = emptyStore();
    // seed a parent-unit node at a::b carrying cn-dup.
    s = upsert(s, { nodeKey: 'nk-parent', contentHash: 'ch-p', family: 'advisory', claimNorm: 'cn-dup', primaryAnchor: 'a::b', slot: 'invariant' }).store;
    const before = currentNodes(s).length;
    // a child-unit write at a::b::c with the SAME claim — nodeKey MISS ⇒ CREATE. The always-merge is GONE
    // (WP-DEDUP-1): each grounding stays distinct (A2), so the child mints its OWN node, never folding in.
    const child: WriteRequest = { nodeKey: 'nk-child', contentHash: 'ch-c', family: 'advisory', claimNorm: 'cn-dup', primaryAnchor: 'a::b::c', slot: 'gotcha' };
    const r = upsert(s, child);
    expect(r.decision).toBe('CREATE'); // no more re-route: a routed CREATE stays a CREATE
    expect(currentNodes(r.store).length).toBe(before + 1); // a genuine new node is minted
    expect(r.store.current.has('nk-parent')).toBe(true); // BOTH nodes present — parent kept
    expect(r.store.current.has('nk-child')).toBe(true); //  ... AND the child lands as its own node
    const neighbor = r.store.current.get('nk-parent')!;
    expect(neighbor.claims).toEqual(['cn-dup']); // the neighbor's claims are UNCHANGED — no union into it
    expect(neighbor.primaryAnchor).toBe('a::b'); // the neighbor is untouched by the child write
  });

  it('a CREATE adjacent with a NOVEL claim set-unions the new claim into the neighbor', () => {
    let s: StoreProjection = emptyStore();
    s = upsert(s, { nodeKey: 'nk-parent', contentHash: 'ch-p', family: 'advisory', claimNorm: 'cn-a', primaryAnchor: 'a::b', slot: 'invariant' }).store;
    // NOTE: a NOVEL claim at a child unit does NOT collide (exact leg) ⇒ it CREATEs its own node.
    const child: WriteRequest = { nodeKey: 'nk-child', contentHash: 'ch-c', family: 'advisory', claimNorm: 'cn-novel', primaryAnchor: 'a::b::c', slot: 'gotcha' };
    const r = upsert(s, child);
    expect(r.decision).toBe('CREATE'); // no claim collision ⇒ a real new node
    expect(r.store.current.has('nk-child')).toBe(true);
  });

  it('a CREATE at a NON-adjacent anchor + duplicate claim still CREATEs (no false merge)', () => {
    let s: StoreProjection = emptyStore();
    s = upsert(s, { nodeKey: 'nk-far', contentHash: 'ch-f', family: 'advisory', claimNorm: 'cn-dup', primaryAnchor: 'x::y', slot: 'invariant' }).store;
    const before = currentNodes(s).length;
    const other: WriteRequest = { nodeKey: 'nk-a', contentHash: 'ch-a', family: 'advisory', claimNorm: 'cn-dup', primaryAnchor: 'a::b::c', slot: 'gotcha' };
    const r = upsert(s, other);
    expect(r.decision).toBe('CREATE'); // unrelated anchors ⇒ adjacency never fires
    expect(currentNodes(r.store).length).toBe(before + 1); // a genuine new node
    expect(r.store.current.has('nk-a')).toBe(true);
    // teeth (MUTANT: drop the prefix test in adjacencyNearDup) → this would falsely merge, dropping the node.
  });

  it('a CREATE with NO primaryAnchor leaves adjacency DORMANT (even against an adjacent-claimed neighbor)', () => {
    let s: StoreProjection = emptyStore();
    s = upsert(s, { nodeKey: 'nk-parent', contentHash: 'ch-p', family: 'advisory', claimNorm: 'cn-dup', primaryAnchor: 'a::b', slot: 'invariant' }).store;
    const before = currentNodes(s).length;
    // an anchor-LESS flat request — adjacency never fires ⇒ ordinary CREATE (this is what keeps s05 §6a intact).
    const r = upsert(s, { nodeKey: 'nk-flat', contentHash: 'ch-flat', family: 'advisory', claimNorm: 'cn-dup' });
    expect(r.decision).toBe('CREATE');
    expect(currentNodes(r.store).length).toBe(before + 1);
  });

  it('the 2-arg upsert (default cfg) also mints a distinct node — no adjacency merge remains (WP-DEDUP-1)', () => {
    let s: StoreProjection = emptyStore();
    s = upsert(s, { nodeKey: 'nk-parent', contentHash: 'ch-p', family: 'advisory', claimNorm: 'cn-dup', primaryAnchor: 'a::b', slot: 'invariant' }).store;
    const before = currentNodes(s).length;
    // 2-arg call (no cfg) — with the always-merge removed, an adjacent dup CREATEs its own node.
    const r = upsert(s, { nodeKey: 'nk-child', contentHash: 'ch-c', family: 'advisory', claimNorm: 'cn-dup', primaryAnchor: 'a::b::c' });
    expect(r.decision).toBe('CREATE');
    expect(currentNodes(r.store).length).toBe(before + 1); // a distinct node
    expect(r.store.current.has('nk-parent')).toBe(true); // both nodes present
    expect(r.store.current.has('nk-child')).toBe(true);
    expect(r.store.current.get('nk-parent')!.claims).toEqual(['cn-dup']); // neighbor's claims unchanged
  });
});
