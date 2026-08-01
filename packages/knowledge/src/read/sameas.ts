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
 * over `projection.current` keys: for each entry, `union(key, peer)` for every `peer` in its stored `sameAs`
 * ONLY IF `peer` is ALSO a current node (a dangling edge to a retired/absent nodeKey is ignored, never a
 * throw), plus `union(key, node.nodeKey)` — a no-op under KNOW-4g's `key === nodeKey` invariant, and the
 * conservative reading of a row that violates it. Then group by root; for every class of size ≥2 emit ALL
 * canonical intra-class pairs `{a,b}` with `a<b`. Result is SORTED by `(a,b)` ascending — total,
 * self-pair-free, each pair once. Pure + total, no clock/LLM. A node with no `sameAs` is a singleton
 * (contributes nothing). `find` is TOTAL over off-domain keys — see the comment on it; the partial version
 * spliced unrelated classes through a shared `undefined` parent slot.
 */
export function deriveSameAs(projection: StoreProjection): readonly SameAs[] {
  const keys = [...projection.current.keys()];
  const present = new Set(keys);
  const parent = new Map<string, string>();
  for (const k of keys) parent.set(k, k);

  // TOTAL `find` — a key with NO entry in `parent` is its OWN root, and NOTHING is written for it.
  // The previous `while (parent.get(r) !== r) r = parent.get(r) as string` was PARTIAL: for an off-domain key
  // the first `parent.get` returned `undefined`, `undefined !== undefined` is false, so the walk STOPPED on
  // `undefined` and returned it as a root. `union` then stored that root as a KEY (`parent.set(undefined, …)`),
  // and the NEXT off-domain `find` walked into that one shared `undefined` slot and came back with a root from
  // a COMPLETELY UNRELATED class — splicing two classes together on an edge nobody stored. Measured: it also
  // broke PROP-SAMEAS-1 (the spliced pair is derived-equal yet outside the door class), the one direction the
  // link gate may never lose.
  const find = (x: string): string => {
    let r = x;
    for (;;) {
      const p = parent.get(r);
      if (p === undefined || p === r) return r; // absent ⇒ its own root (total); self-parent ⇒ the root
      r = p;
    }
  };
  const union = (x: string, y: string): void => {
    const rx = find(x);
    const ry = find(y);
    if (rx === ry) return;
    // Attach the LARGER root under the SMALLER — the class root is deterministically the MIN member of the
    // class, independent of edge/iteration order, so the fold is a pure function of the stored relation.
    // (MEMBER, not "current key": a divergent row's declared `nodeKey` below may be off-domain and may be that
    // minimum. It never reaches the OUTPUT — the grouping pass below enumerates `keys` only — it merely roots
    // the bucket, and it is chosen by the same min rule, so determinism is unchanged.)
    if (rx < ry) parent.set(ry, rx);
    else parent.set(rx, ry);
  };

  for (const [key, node] of projection.current) {
    // A row has TWO identities: the ADDRESS it is stored at (`key` — what every reader and every write door
    // looks it up by) and the identity it declares about ITSELF (`node.nodeKey`). KNOW-4g makes them the same
    // string, and `readSidecar` (adapter-io) now REFUSES a whole sidecar in which any row diverges — but this
    // fold is a pure library function over ANY `StoreProjection`, so it relates BOTH identities instead of
    // silently trusting one. Under the invariant `key === node.nodeKey` and this union is a no-op, so nothing
    // about a well-formed projection changes; under a divergent row the class only ever WIDENS (the
    // conservative direction), and in particular the edges stored AT `key` are never lost — losing them is
    // class SHRINKAGE, which is the bypass direction the door is priced against.
    union(key, node.nodeKey);
    if (node.sameAs === undefined) continue;
    for (const peer of node.sameAs) {
      if (present.has(peer)) union(key, peer); // dangling peer (not current) ⇒ ignored (total)
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
 * The class is expanded on ALL THREE of a row's identities — the map key it is STORED at, the `nodeKey` it
 * DECLARES, and its stored peers. Seeding on the key while expanding only on `nodeKey` was a live class
 * SHRINKAGE: for a row written at key `M` declaring `nodeKey: B, sameAs: [A]`, `classOf(M)` came back the
 * singleton `[M]`, so `governed-link.ts` resolved ZERO members and priced its authz and ratify gates over
 * nothing. That row shape needs write access to `.atlas/projection.json`, which is squarely IN the threat
 * model (see `ratify/tier.ts` on the projection as untrusted input) — `readSidecar` now refuses such a
 * sidecar outright, and this fold degrades conservatively if one ever arrives by another route.
 *
 * Pure + total, no clock/LLM. NOT the same fold as `deriveSameAs`: that one is a union-find that SKIPS
 * non-current peers, this one is a fixed-point expansion that follows them. So the two DO disagree — a
 * retired peer bridging two live nodes merges them here and not there. The divergence is a deliberate,
 * property-tested SOUND OVER-APPROXIMATION (`PROP-SAMEAS-1`): the derived class is always a SUBSET of this
 * one. Larger means a link asks for a stronger signature than strictly needed; smaller would be a bypass.
 * (This docstring previously asserted the two "can never disagree" — false on both halves.)
 */
export function sameAsClassOf(projection: StoreProjection, key: string): readonly string[] {
  const members = new Set<string>([key]);
  // Transitive closure by repeated expansion over the SYMMETRIC stored edges. The relation is stored on both
  // endpoints (the link door writes it symmetrically), but a peer is followed from EITHER direction here so a
  // half-written edge still widens the class — the conservative reading for a gate.
  let grew = true;
  while (grew) {
    grew = false;
    for (const [rowKey, node] of projection.current) {
      // THREE identities per row, all of them followed: the ADDRESS the row is stored at (`rowKey` — what
      // this query is SEEDED with, and what the door then looks members up by), the identity the row DECLARES
      // (`node.nodeKey` — what the expansion used to run on, exclusively), and its stored peers. KNOW-4g makes
      // the first two the same string, so under a well-formed projection this is exactly the old fold. When
      // they DIVERGE, seeding on one and expanding on the other made the endpoint's own edges invisible and
      // COLLAPSED the class to a singleton — `classOf(M) = [M]` for a row at `M` declaring `B ~ A` — which is
      // class shrinkage, i.e. the gate prices its authz and ratify checks over nothing. Following all three
      // can only ever WIDEN, and a wider class merely asks a link for a stronger signature.
      const peers = node.sameAs ?? [];
      const touches = members.has(rowKey) || members.has(node.nodeKey) || peers.some((p) => members.has(p));
      if (!touches) continue;
      for (const k of [rowKey, node.nodeKey, ...peers]) {
        if (!members.has(k)) {
          members.add(k);
          grew = true;
        }
      }
    }
  }
  return [...members].sort(cmp);
}
