// @atlas/kernel — ref/log.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The append-only, content-keyed event log (KERNEL-4/9). `append` is a set-insert by event id
// (idempotent on equal id). The `RefLog` reference model (fspec-merge:109-135) is the executable
// oracle reused verbatim as the unit-test mock; its surface is transcribed here as pure types. Static
// ops (`id`, `merge`) are split into `RefLogStatics` since an instance interface cannot carry statics.

import type { Hash } from '@atlas/contracts';
import type { Event, EventLog } from './types.js';

/** The kernel log API: set-insert by event id, idempotent on equal id (atlas-kernel:101, 111). */
export interface LogApi {
  /** Set-insert by event id; idempotent on equal id. (atlas-kernel:101) */
  append(ev: Event): EventLog;
}

/**
 * The `RefLog` reference model surface — instance ops (fspec-merge:110-135). An OR-Set log = a set of
 * ids + a version map; grow-only, idempotent (KERNEL-9).
 */
export interface RefLog {
  /** Set-insert; idempotent on equal id — re-append of equal bytes is a no-op. (fspec-merge:113-116) */
  append(e: Event): RefLog;
  /** Relabel `seq` only — the KERNEL-9 seq-invariant oracle; id drops seq ⇒ keyset + fold unchanged.
   *  (fspec-merge:120-127) */
  reseq(relabel: (e: Event) => number): RefLog;
  /** The version map's events. (fspec-merge:134) */
  events(): readonly Event[];
}

/**
 * The `RefLog` static ops (fspec-merge:117-119, 128-133). Split out because TypeScript instance
 * interfaces cannot declare `static` members; these are the constructor-side ops of the RefLog class.
 */
export interface RefLogStatics {
  /** Identity = content, `seq` EXCLUDED from the preimage (KERNEL-9, cf KERNEL-8). (fspec-merge:117-119) */
  id(e: Omit<Event, 'id'>): Hash;
  /** Plain set-union; commutative / associative / idempotent (KERNEL-9/11). (fspec-merge:128-133) */
  merge(a: RefLog, b: RefLog): RefLog;
}
