// @atlas/knowledge — src/read/sameas.ts  (WP-SAMEAS · derive `sameAs` equivalence on read)
//
// The READ-side human-asserted equivalence relation. `sameAs` edges are STORED symmetrically on each node
// (CurrentNode.sameAs — a HUMAN asserts "nodeKey A names the SAME fact as nodeKey B" at unrelated code
// sites, H1), but the OBSERVABLE relation is their TRANSITIVE closure: a union-find fold over the current
// projection. For each equivalence class of size ≥2 among current nodes, EVERY canonical intra-class pair
// {a,b} (a<b) is emitted — so A≡B and B≡C surface A≡C too. This is a NON-destructive observability edge
// (like `subsumes`), never a merge. Pure + total — no throw, no clock, no LLM (A1).
//
// Mirrors `read/subsumes.ts`: sorted output, pure+total, dangling edges ignored (a `sameAs` peer NOT in
// `current` never throws — it is simply not unioned, so a stored-but-since-retired peer degrades cleanly).

import { asNodeKey } from '@atlas/kernel';
import type { NodeKey } from '@atlas/contracts';
import type { StoreProjection } from '../write/router.js';

/** A derived symmetric equivalence edge — two current nodes a human asserted name the SAME fact.
 *  CANONICAL: `a < b` lexicographically, so each unordered pair is emitted exactly once. */
export interface SameAs {
  readonly a: NodeKey;
  readonly b: NodeKey;
}

/** Lexicographic string comparator (the same one subsumes sorts by) — total, no locale. */
function cmp(x: string, y: string): number {
  return x < y ? -1 : x > y ? 1 : 0;
}

/**
 * Derive the FULL transitive equivalence relation over the projection's current nodes (WP-SAMEAS). Union-find
 * over `projection.current` keys: for each node, `union(node.nodeKey, peer)` for every `peer` in its stored
 * `sameAs` ONLY IF `peer` is ALSO a current node (a dangling edge to a retired/absent nodeKey is ignored,
 * never a throw). Then group by root; for every class of size ≥2 emit ALL canonical intra-class pairs
 * `{a,b}` with `a<b`. Result is SORTED by `(a,b)` ascending — total, self-pair-free, each pair once. Pure +
 * total, no clock/LLM. A node with no `sameAs` is a singleton (contributes nothing).
 */
export function deriveSameAs(projection: StoreProjection): readonly SameAs[] {
  const keys = [...projection.current.keys()];
  const present = new Set(keys);
  const parent = new Map<string, string>();
  for (const k of keys) parent.set(k, k);

  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r) as string;
    return r;
  };
  const union = (x: string, y: string): void => {
    const rx = find(x);
    const ry = find(y);
    if (rx === ry) return;
    // Attach the LARGER root under the SMALLER — the class root is deterministic (the min key), independent
    // of edge/iteration order, so the fold is a pure function of the stored relation.
    if (rx < ry) parent.set(ry, rx);
    else parent.set(rx, ry);
  };

  for (const node of projection.current.values()) {
    if (node.sameAs === undefined) continue;
    for (const peer of node.sameAs) {
      if (present.has(peer)) union(node.nodeKey, peer); // dangling peer (not current) ⇒ ignored (total)
    }
  }

  // Group the current keys by their union-find root — one bucket per equivalence class.
  const classes = new Map<string, string[]>();
  for (const k of keys) {
    const root = find(k);
    const bucket = classes.get(root);
    if (bucket === undefined) classes.set(root, [k]);
    else bucket.push(k);
  }

  const edges: SameAs[] = [];
  for (const members of classes.values()) {
    if (members.length < 2) continue; // a singleton class asserts no equivalence
    const sorted = [...members].sort(cmp);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        edges.push({ a: asNodeKey(sorted[i]!), b: asNodeKey(sorted[j]!) }); // i<j ⇒ a<b (canonical)
      }
    }
  }
  edges.sort((x, y) => cmp(String(x.a), String(y.a)) || cmp(String(x.b), String(y.b)));
  return edges;
}

/**
 * The members of `key`'s equivalence class — `key` itself plus every node TRANSITIVELY equated to it by the
 * stored relation. `key` need not be a current node; an unknown key is its own singleton.
 *
 * Why a write door needs this: the relation this module folds is TRANSITIVE, so the security boundary is the
 * CLASS, not the edge. A door that gates a new `a~b` link on the classes of `a` and `b` ALONE is gating on
 * one edge of a graph whose reachability it just extended. That was a live two-hop bypass: billy legitimately
 * equates a `T0` node A with a `T2` node B; afterwards ANY in-scope actor holding ANY non-empty ratifier
 * links B to their own node M, and the derived relation contains `{A, M}` — the attacker's node is inside the
 * `T0` node's class, and every read fold walks it, without billy ever signing that.
 *
 * Pure + total, no clock/LLM — the same union-find `deriveSameAs` folds, so the two can never disagree.
 */
export function sameAsClassOf(projection: StoreProjection, key: string): readonly string[] {
  const members = new Set<string>([key]);
  // Transitive closure by repeated expansion over the SYMMETRIC stored edges. The relation is stored on both
  // endpoints (the link door writes it symmetrically), but a peer is followed from EITHER direction here so a
  // half-written edge still widens the class — the conservative reading for a gate.
  let grew = true;
  while (grew) {
    grew = false;
    for (const node of projection.current.values()) {
      const peers = node.sameAs;
      if (peers === undefined) continue;
      const touches = members.has(node.nodeKey) || peers.some((p) => members.has(p));
      if (!touches) continue;
      for (const k of [node.nodeKey, ...peers]) {
        if (!members.has(k)) {
          members.add(k);
          grew = true;
        }
      }
    }
  }
  return [...members].sort(cmp);
}
