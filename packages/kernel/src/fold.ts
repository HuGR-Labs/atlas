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
