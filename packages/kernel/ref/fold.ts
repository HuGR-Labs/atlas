// @atlas/kernel — ref/fold.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The convergent fold + CRDT OR-Set merge core (KERNEL-10/11, the one formal cluster). `fold` reduces
// the event set to `AtlasState` order-independently; `merge` is set-union on event id; `mergeNode` is
// the grow-only per-nodeKey union; `head` surfaces the single FRESH head by `contentHash` ALONE (never
// seq/clock/LLM), pinned-canonical `max`. (atlas-kernel:102-103; fspec-merge:128, 139-160)

import type { AtlasState, Event, EventLog, Node } from './types.js';

export interface FoldApi {
  /** Convergent reconstruction of current state from the set; order-independent (KERNEL-11).
   *  (atlas-kernel:103; fspec-merge:152) */
  fold(log: EventLog): AtlasState;
  /** Set-union by event id; commutative, associative, idempotent (KERNEL-9/11).
   *  (atlas-kernel:102; fspec-merge:128) */
  merge(a: EventLog, b: EventLog): EventLog;
  /** Commutative, grow-only per-nodeKey union — 0 dropped (KERNEL-10). (fspec-merge:139-143) */
  mergeNode(x: Node, y: Node): Node;
  /** The forced single head = `max-by-contentHash` among FRESH, non-superseded entries — contentHash
   *  ALONE, never seq/clock/LLM (KERNEL-10). (fspec-merge:144-147) */
  head(n: Node): Event;
}
