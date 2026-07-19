// @atlas/kernel — src/log.ts  (the append-only, content-keyed event log — KERNEL-4 / KERNEL-7)
//
// `EventLog = Map<Hash, Event>` keyed by the event's own `id` (identity computation is CONSUMED from
// WP-1.1, never redefined here). `append` is a set-insert by id: idempotent on an equal id and STRICTLY
// append-only — an id already present is never overwritten (an in-place mutate is rejected; a correction is
// a new event) and nothing is ever removed (a delete is rejected). `size` is therefore monotone
// non-decreasing (KERNEL-4a/4b). Each `append` returns a fresh point-in-time snapshot, so a previously
// returned log is immutable and mutating one never touches the authoritative state. `append` is total: a
// malformed event is a no-op rejection, never a throw (KERNEL-7a/7b).

import type { Hash } from '@atlas/contracts';
import type { Event, EventLog } from '../ref/types.js';
import type { LogApi } from '../ref/log.js';
import { id as objectId } from './canonical.js';

/** Total structural guard — a malformed event is rejected (no-op), never allowed to throw downstream. */
function isEvent(ev: unknown): ev is Event {
  if (ev === null || typeof ev !== 'object') return false;
  const e = ev as Record<string, unknown>;
  return (
    typeof e['id'] === 'string' &&
    typeof e['seq'] === 'number' &&
    Number.isFinite(e['seq']) &&
    typeof e['contentHash'] === 'string' &&
    typeof e['fresh'] === 'boolean' &&
    Array.isArray(e['supersedes'])
  );
}

/** Construct the append-only event log — one insert-only backing set keyed by event id. */
export function createLog(): LogApi {
  const log = new Map<Event['id'], Event>();
  return {
    append(ev: Event): EventLog {
      // set-insert by id: only a well-formed, not-yet-present event is admitted (first-write-wins).
      if (isEvent(ev) && !log.has(ev.id)) {
        log.set(ev.id, ev);
      }
      // an immutable snapshot: prior returns never change, and a later append never mutates them.
      return new Map(log);
    },
  };
}

// ── KERNEL-9: content-addressed event identity, idempotent content-keyed set-union (WP-1.3-a) ──────────
//
// Identity is CONTENT, `seq` EXCLUDED (KERNEL-9a, fspec-merge §DOWN `RefLog.id`): an event's id =
// hash(canonicalForm(event)) reached ONLY through the sealed encoder seam (reuse `id` from canonical.ts —
// no digest is hand-rolled here). `seq` is a local ordering hint that lives OUTSIDE the algebra, so it is
// pinned to a constant in the preimage (⇒ any reseq leaves every id fixed), and the `id` field itself is
// dropped (a hash can never include itself). The mutable side-indexes are already excluded upstream by the
// canonicalizer (KERNEL-8). Collision/nodeKey head-resolution is EPIC-3-b (fold.ts) — deliberately NOT here.

/** Event identity = `hash(canonicalForm({ ...event, seq: 0 }))`: content-addressed, `seq` and `id` excluded
 *  from the preimage (KERNEL-9a). Reaches the digest only through the sealed encoder seam. */
export function eventId(e: Omit<Event, 'id'>): Hash {
  const { id: _drop, ...content } = e as Event; // a hash never includes itself; seq pinned out below
  return objectId({ ...content, seq: 0 });
}

/** Content-keyed set-union of two logs on the event id — grow-only, idempotent, commutative & associative
 *  on the keyset (KERNEL-9c). A shared id is deduped (first-write-wins); nothing is dropped or duplicated.
 *  This is the LOG-level union; the per-nodeKey merge/head-resolution is WP-1.3-b, not here. */
export function combine(a: EventLog, b: EventLog): EventLog {
  const out = new Map(a);
  for (const [id, ev] of b) if (!out.has(id)) out.set(id, ev);
  return out;
}

/** Relabel every event's `seq`, recomputing each id — the KERNEL-9d seq-invariant oracle. Because `id`
 *  drops `seq`, the recomputed ids are identical ⇒ the keyset and the fold are unchanged (`seq` is neither
 *  an object key nor a merge discriminator). */
export function reseq(log: EventLog, relabel: (e: Event) => number): EventLog {
  const out = new Map<Hash, Event>();
  for (const e of log.values()) {
    const { id: _drop, ...content } = e;
    const relabelled = { ...content, seq: relabel(e) };
    const newId = eventId(relabelled);
    if (!out.has(newId)) out.set(newId, { ...relabelled, id: newId });
  }
  return out;
}
