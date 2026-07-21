// @atlas/knowledge — src/write/link.ts  (WP-SAMEAS · the symmetric sameAs write reducer)
//
// The pure write reducer for the human-asserted `sameAs` equivalence (H1). `linkSameAs(projection, a, b)`
// asserts `a ≡ b` by adding the SYMMETRIC edge — `b` onto `a`'s `sameAs` set AND `a` onto `b`'s — so the
// read-side union-find fold (`deriveSameAs`) is local from either endpoint. Returns a NEW projection (inputs
// untouched — pure). TOTAL: `a === b`, or EITHER key absent from `current`, returns the projection UNCHANGED
// (a structural no-op; the governed door, not this reducer, decides REJECTION). Each node's `sameAs` is kept
// SORTED + de-duped (the same lexicographic order the read fold + subsumes use). `cas`/`builtAt`/other nodes
// are untouched. No clock, no random, no LLM.

import type { CurrentNode, StoreProjection } from './router.js';

/** Add `peer` to `node.sameAs`, kept SORTED + de-duped — idempotent (already-present peer ⇒ node unchanged).
 *  Spread preserves every other field (family/contentHash/claims/anchor/slot/…). */
function withPeer(node: CurrentNode, peer: string): CurrentNode {
  const existing = node.sameAs ?? [];
  if (existing.includes(peer)) return node; // already asserted — no-op (idempotent)
  const sameAs = [...existing, peer].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  return { ...node, sameAs };
}

/**
 * Assert `a ≡ b` — the SYMMETRIC `sameAs` edge. Pure: returns a NEW projection, inputs untouched. TOTAL:
 *   • `a === b` ⇒ UNCHANGED (a node never names itself; the door rejects this, this reducer no-ops).
 *   • EITHER key absent from `current` ⇒ UNCHANGED (the door rejects the unknown node; this reducer no-ops).
 * Otherwise both endpoints gain the peer (sorted + de-duped) and the rest of the projection — `cas`, the
 * freshness `builtAt` watermark, every other node — is preserved verbatim.
 */
export function linkSameAs(projection: StoreProjection, a: string, b: string): StoreProjection {
  if (a === b) return projection; // no self-equivalence — total no-op
  const nodeA = projection.current.get(a);
  const nodeB = projection.current.get(b);
  if (nodeA === undefined || nodeB === undefined) return projection; // absent endpoint — total no-op
  const current = new Map(projection.current);
  current.set(a, withPeer(nodeA, b));
  current.set(b, withPeer(nodeB, a));
  return { ...projection, current }; // preserve cas + builtAt (only `current` changes)
}
