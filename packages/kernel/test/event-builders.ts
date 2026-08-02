// @atlas/kernel — test/event-builders.ts  (shared FSPEC-merge test builders — NOT a test file)
//
// The Event / Node / EventLog constructors and the insertion-order-independent serializers used by the
// FSPEC-merge cluster. Extracted so `merge-fold.test.ts` (the ∀-laws + visible goldens) and
// `fold-convergence.test.ts` (the pinned convergence witnesses) share ONE definition of "a well-formed
// event" — a second copy would let the two files drift and let a witness be quietly re-narrowed.
//
// Identity is CONSUMED from the sealed seam (`eventId`); no digest is hand-rolled here.

import type { Hash, NodeKey } from '@atlas/contracts';
import type { AtlasState, Event, EventLog, Node } from '../src/types.js';
import { createLog, eventId } from '../src/log.js';

/** One well-formed, content-keyed Event: `id = eventId(content)` (seq excluded) so `isContentKeyed` holds
 *  and a line-merge can dedup by id. `contentHash` is the OR-Set entry key; `seq` is a local hint only. */
export const mkEvent = (
  nodeKey: string | undefined,
  ch: string,
  payload: unknown,
  opts: { fresh?: boolean; supersedes?: string[]; seq?: number } = {},
): Event => {
  const content = {
    seq: opts.seq ?? 0,
    nodeKey: nodeKey === undefined ? undefined : (nodeKey as NodeKey),
    contentHash: ch as Hash,
    fresh: opts.fresh ?? true,
    supersedes: (opts.supersedes ?? []) as readonly Hash[],
    payload,
  };
  return { ...content, id: eventId(content) };
};

/** A Node on one nodeKey whose OR-Set entries are keyed by `contentHash` (the ratified slot key). */
export const node = (nodeKey: string, entries: readonly Event[]): Node => ({
  nodeKey: nodeKey as NodeKey,
  entries: new Map(entries.map((e) => [e.contentHash, e])),
});

/** Build an `EventLog` by REPLAYING through the sealed append seam, so the log is exactly what production
 *  would hold (set-insert by id, first-write-wins) — never a hand-built Map that could hide the dedup. */
export const logOf = (events: readonly Event[]): EventLog => {
  const l = createLog();
  let out: EventLog = new Map();
  for (const e of events) out = l.append(e);
  return out;
};

/** Insertion-order-independent serialization of a Node / AtlasState: entry contentHashes (and nodeKeys)
 *  sorted, so equal CONTENT ⇒ byte-identical string regardless of Map insertion order. This mirrors the
 *  ratified byte-identity notion (`canonicalForm` sorts keys — fspec-merge §DOWN closing note). */
export const serNode = (n: Node): string =>
  JSON.stringify({ nodeKey: n.nodeKey, entries: [...n.entries.keys()].sort().map((h) => n.entries.get(h)) });

export const serState = (s: AtlasState): string =>
  JSON.stringify([...s.keys()].sort().map((nk) => serNode(s.get(nk)!)));

/** The node under a nodeKey inside a folded state. */
export const nodeAt = (s: AtlasState, nk: string): Node => s.get(nk as NodeKey)!;

/** The golden event universe's colliding nodeKey (goldens-krn §event table). */
export const ARR = 'claim:acme-arr-2024';
