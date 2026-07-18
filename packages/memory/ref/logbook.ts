// @atlas/memory — ref/logbook.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The logbook discipline (MEM-8) — the diary stays a LEDGER. Orchestrator-only (v0), exactly ONE
// append-only entry per PR within the fixed sections + per-section caps, CONSULTABLE (by PR/date/
// territory) and NEVER injected. A later entry SUPERSEDES a past decision BY LINK, never by rewriting
// history (0 rewritten). Modeled as an append-only `Map<prId, LogbookEntry>` with a one-per-PR guard +
// section validator; reuses KERNEL-4's insert-only `log.ts`. Consultable-never-injected is enforced via
// the MEM-4 injector (ref/inject.ts). Transcribed from method-tags-mem:70-75 (INV-MEM-8 down-model) +
// atlas-memory:94-107.

import type { LogbookEntry, Ref } from './types.js';

/** The append-only logbook projection — one entry per `prId`, chronological, never rewritten (MEM-8). */
export type LogbookLog = readonly LogbookEntry[];

export interface LogbookApi {
  /** Append one orchestrator logbook entry — guarded ONE-per-PR + section-validated; append-only, never
   *  an in-place edit of a landed entry (MEM-8). Reuses KERNEL-4 `log.ts`. (method-tags-mem:74)
   *
   *  [SIG-TBD — rejection of a 2nd-entry / non-orchestrator / over-section write not frozen as a return
   *  shape] the guard behaviour is frozen; the reject payload is not → the append returns the updated
   *  append-only `LogbookLog`, the guard being a fail-closed precondition. */
  append(entry: LogbookEntry): LogbookLog;

  /** Supersede a past decision BY LINK: append a supersede pointer, NEVER mutate the extant entry
   *  (history is not rewritten — MEM-8). Pure (append-only). (method-tags-mem:74) */
  supersede(prId: string, link: Ref): LogbookLog;

  /** The consultable listing (by PR / date / territory) — NEVER injected (MEM-8, enforced by MEM-4).
   *
   *  [SIG-TBD — `query` shape not frozen] consulted by prId / date-range / territory / topic; no concrete
   *  query record is frozen → `unknown`, NOT invented. */
  consult(query: unknown): LogbookLog;
}
