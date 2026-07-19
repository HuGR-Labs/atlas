// @atlas/kernel — src/fold.ts  (the fold reconstruction over the event log — KERNEL-5)
//
// `fold` reconstructs the current `AtlasState` from an `EventLog` by a PURE reduction over the set — no
// mutable in-place snapshot backs it, so replaying the log from empty rebuilds a byte-identical Atlas
// (KERNEL-5a) and every capability derives from the fold, never from a stored snapshot (KERNEL-5b). Each
// call allocates a fresh state; the function reads no clock/network/LLM and holds no module-level cache.
//
// The projection is the per-nodeKey OR-Set: an event carrying a `nodeKey` contributes its `contentHash`
// entry to that node's grow-only `entries` set; an event with no `nodeKey` is not node-forming and is
// skipped. Union is idempotent by `contentHash` (first-seen wins) — a faithful content-addressed log never
// carries two DISTINCT entries under one (nodeKey, contentHash), so the result is order-independent
// (KERNEL-11). The merge/collision head-resolution over a shared nodeKey is EPIC-3-b (WP-1.3-b), not here.

import type { AtlasState, Event, EventLog, Node } from '../ref/types.js';
import { combine } from './log.js';

/**
 * Convergent reconstruction of the current `AtlasState` from the event set (KERNEL-5a/5b, KERNEL-11).
 * Order-independent: the folded state depends only on the SET of events, not their insertion order.
 */
export function fold(log: EventLog): AtlasState {
  const state: AtlasState = new Map();
  for (const ev of log.values()) {
    const nodeKey = ev.nodeKey;
    if (nodeKey === undefined) continue; // non-node-forming event — nothing to project
    let node = state.get(nodeKey);
    if (node === undefined) {
      node = { nodeKey, entries: new Map<Event['contentHash'], Event>() };
      state.set(nodeKey, node satisfies Node);
    }
    // grow-only OR-Set union keyed by contentHash; idempotent (first-seen wins ⇒ order-independent).
    if (!node.entries.has(ev.contentHash)) node.entries.set(ev.contentHash, ev);
  }
  return state;
}

// ── KERNEL-10 / KERNEL-11: the merge / collision fold — set-union, grow-only node union, forced head ────
// (WP-1.3-b.KERNEL — the FSPEC-merge cluster). EXTENDS the sealed fold() above (KERNEL-5/11) with the
// collision-resolution surface the FoldApi names: `merge` (log set-union by event id), `mergeNode` (the
// grow-only per-nodeKey OR-Set union, 0 dropped), and `head` (the forced single head = MAX-by-contentHash
// among the FRESH, non-superseded entries — `contentHash` ALONE, never seq/clock/LLM). The head direction
// is pinned-canonical `max` (fspec-merge §UP KERNEL-10). No hash is computed here; identity + the log-level
// set-union are CONSUMED from the sealed log seam (`combine`), never re-rolled (KERNEL-9).

/**
 * Set-union of two event logs by event id — commutative, associative, idempotent (KERNEL-9/11). Reuses the
 * sealed `combine` seam: a shared id is deduped (first-write-wins), nothing is dropped or duplicated. This
 * is the log-level join `RefLog.merge`; the per-nodeKey resolution is `mergeNode` / `head` below.
 */
export function merge(a: EventLog, b: EventLog): EventLog {
  return combine(a, b);
}

/**
 * Grow-only per-nodeKey OR-Set union keyed by `contentHash` — commutative, 0 dropped (KERNEL-10a/10c,
 * fspec-merge §mergeNode). `|entries(mergeNode(x,y))| ≥ max(|x|,|y|)` and `x ⊑ mergeNode(x,y)`. A shared
 * `contentHash` is a content-identical entry, so first-seen-wins is order-independent up to the canonical
 * (contentHash-sorted) serialization. No event is ever overwritten (that would be last-writer-wins).
 */
export function mergeNode(x: Node, y: Node): Node {
  const entries = new Map(x.entries);
  for (const [h, e] of y.entries) if (!entries.has(h)) entries.set(h, e);
  return { nodeKey: x.nodeKey, entries };
}

/** Whether entry `e` is archived by some other entry's supersedes-DAG within node `n` (fspec-merge:148). */
function supersededIn(e: Event, n: Node): boolean {
  for (const o of n.entries.values()) if (o.supersedes.includes(e.contentHash)) return true;
  return false;
}

/**
 * The forced single head = MAX-by-contentHash among the FRESH, non-superseded entries — `contentHash`
 * ALONE, never seq/clock/LLM (KERNEL-10b, fspec-merge §head; direction pinned-canonical `max`). Because no
 * seq/clock enters the selection, the head is invariant under any reseq/reclock. Returns `undefined` when
 * the node has no eligible (fresh, non-superseded) entry — no head is forced over an empty candidate set.
 */
export function head(n: Node): Event | undefined {
  let winner: Event | undefined;
  for (const e of n.entries.values()) {
    if (!e.fresh || supersededIn(e, n)) continue;
    if (winner === undefined || e.contentHash > winner.contentHash) winner = e;
  }
  return winner;
}
