// @atlas/kernel — src/log.ts  (the append-only, content-keyed event log — KERNEL-4 / KERNEL-7)
//
// `EventLog = Map<Hash, Event>` keyed by the event's own `id` (identity computation is CONSUMED from
// WP-1.1, never redefined here). `append` is a set-insert by id: idempotent on an equal id and STRICTLY
// append-only — an id already present is never overwritten (an in-place mutate is rejected; a correction is
// a new event) and nothing is ever removed (a delete is rejected). `size` is therefore monotone
// non-decreasing (KERNEL-4a/4b). Each `append` returns a fresh point-in-time snapshot, so a previously
// returned log is immutable and mutating one never touches the authoritative state. `append` is total: a
// malformed event is a no-op rejection, never a throw (KERNEL-7a/7b).

import type { Event, EventLog } from '../ref/types.js';
import type { LogApi } from '../ref/log.js';

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
