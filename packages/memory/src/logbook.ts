// @atlas/memory — src/logbook.ts  (WP-6.25-b.MEM · MEM-8)
//
// The logbook discipline — the diary stays a LEDGER (MEM-8, atlas-memory:94-107 / 122). Six laws over the
// orchestrator's decision journal, all fail-closed:
//   · orchestrator-ONLY (v0) — a non-orchestrator author's write is REJECTED; only `orch` writes.
//   · ONE append-only entry per PR — a second entry for an extant `prId` is rejected; the extant entry is
//     never edited in place.
//   · templated + capped fixed sections — each write fills the fixed sections within a per-section cap
//     (reuses the MEM-5 gate in src/template.ts); an over-cap OR unfilled section is rejected.
//   · CONSULTABLE, never injected — the store exposes ONLY a `consult` read path (by PR / date / territory);
//     it carries NO inject method, so the logbook cannot auto-inject on a running turn (MEM-4, enforced by
//     the SEALED ref/inject.ts — NOT imported here).
//   · supersede BY LINK — a correction appends a supersede POINTER to a past decision; the extant entry's
//     bytes are NEVER rewritten (0 history rewrites).
//
// SEAM (SEALED @atlas/kernel, KERNEL-4): the entry log's append-only floor + record identity go through the
// kernel `createLog` / `id` seam ALONE — no hand-rolled digest. Implements the FROZEN ref/logbook.ts
// `LogbookApi`. Types-only imports from ref/* + the co-facet src/template.ts (this WP's MEM-5 gate).
//
// BIND (disciplined judgment vs the FROZEN ref/logbook.ts oracle):
//   · `LOGBOOK_AUTHOR = 'orch'` — the goldens name the sole authorized writer `orch`; no `MemberId` brand
//     is frozen (ref PIN), so the seat is a bare string, used as given.
//   · `LOGBOOK_SECTION_CAP` — atlas-memory:106-107 pins "per-section soft cap + hard per-entry cap" with NO
//     magnitude frozen; carried as a named pinned bound (PROSE→constant, the WP-6.25-a `~500`/`~800`
//     discipline). No unpinned SIG-TBD / OWNER-DEFINE MUST-field ⇒ no STOP.
//   · the `append` reject payload is PINNED-not-frozen — rejection is a fail-closed precondition returning
//     the append-only log UNCHANGED (the entry never persists), NOT an invented error record.
//   · `consult`'s `query` is OPAQUE-BY-DESIGN (ref pins `unknown`) — narrowed defensively behind `unknown`.

import { id, createLog } from '@atlas/kernel';
import type { Event, EventLog } from '@atlas/kernel';
import type { Hash } from '@atlas/contracts';
import type { LogbookEntry, MemberId, Ref } from '../ref/types.js';
import type { LogbookApi, LogbookLog } from '../ref/logbook.js';
import { validate } from './template.js';

// re-export the vocabulary the test builds fixtures over (barrel wired at SEAL — test imports src directly).
export type {
  LogbookEntry,
  MemberId,
  Ref,
  MemoryEntry,
  MemoryKind,
  MemoryRecord,
  MemoryStore,
  ProjectMemoryEntry,
} from '../ref/types.js';
export type { LogbookLog } from '../ref/logbook.js';

// ── ratified pinned bounds (PROSE → named constants) ─────────────────────────────────────────────────────

/** The sole authorized logbook author (MEM-8, v0 orchestrator-only). A non-`orch` write is rejected. */
export const LOGBOOK_AUTHOR: MemberId = 'orch';

/** The five FIXED prose sections (atlas-memory:98-102) — prose is confined WITHIN each, per-section capped. */
export const LOGBOOK_SECTIONS = ['shipped', 'decisions', 'tradeoffs', 'risks', 'openThreads'] as const;

/**
 * The hard per-section char cap (MEM-8, atlas-memory:106-107 — magnitude not frozen, a pinned bound). A
 * section over this cap, or an unfilled (empty) section, is a STRUCTURED rejection — never a silent dump.
 */
export const LOGBOOK_SECTION_CAP = 280;

// ── MEM-8c: the section validator (fills the MEM-5 gate + the per-section caps) ───────────────────────────

/** The fail-closed section verdict — `valid:false` rejects the write (the reject shape is PINNED-not-frozen). */
export interface LogbookVerdict {
  readonly valid: boolean;
  readonly reasons: readonly string[];
}

/**
 * MEM-5 + MEM-8c — validate a logbook entry: (a) the MEM-5 templated-write gate (all fixed fields present,
 * no out-of-section prose — src/template.ts), AND (b) every fixed prose section is FILLED and WITHIN its
 * per-section cap. An unfilled or over-cap section is rejected fail-closed. Pure + total.
 */
export function validateLogbookEntry(entry: LogbookEntry): LogbookVerdict {
  const reasons: string[] = [...validate('logbook', entry).reasons];
  const rec = entry as unknown as Record<string, unknown>;
  for (const section of LOGBOOK_SECTIONS) {
    const value = rec[section];
    const text = typeof value === 'string' ? value : '';
    if (text.trim() === '') reasons.push(`unfilled section: ${section}`);
    else if (text.length > LOGBOOK_SECTION_CAP) reasons.push(`section over cap: ${section}`);
  }
  return { valid: reasons.length === 0, reasons };
}

// ── MEM-8e: the supersede-by-link pointer ─────────────────────────────────────────────────────────────────

/** An append-only supersede pointer: a later correction LINKS to a past decision's `prId` — never rewrites it. */
export interface SupersedeLink {
  readonly prId: string;
  readonly link: Ref;
}

// ── the append-only logbook store (SEALED kernel insert-only log, KERNEL-4) ───────────────────────────────

/**
 * The runtime logbook store. `append` is guarded (orchestrator-only + one-per-PR + section-validated) and
 * fail-closed — a rejected write returns the log UNCHANGED. `supersede` appends a link pointer, leaving the
 * entry log untouched. `consult` is the SOLE read path (by PR / date / territory); there is NO inject method.
 */
export interface LogbookStore {
  append(author: MemberId, entry: LogbookEntry): LogbookLog;
  supersede(prId: string, link: Ref): LogbookLog;
  consult(query: unknown): LogbookLog;
  entries(): LogbookLog;
  supersessions(): readonly SupersedeLink[];
  size(): number;
}

/** Wrap an entry as a content-keyed kernel `Event` (KERNEL-4 log entry); identity via the SEALED `id` seam. */
function toEvent(entry: LogbookEntry): Event {
  const contentHash: Hash = id(entry);
  return { id: contentHash, seq: 0, contentHash, fresh: true, supersedes: [], payload: entry };
}

/** The runtime narrowing of the OPAQUE `consult` query (ref/logbook.ts pins `query: unknown`). */
interface ConsultFilter {
  readonly prId?: string;
  readonly date?: string;
  readonly territory?: string;
}

function asConsultFilter(query: unknown): ConsultFilter {
  if (typeof query !== 'object' || query === null) return {};
  const q = query as Record<string, unknown>;
  const f: { prId?: string; date?: string; territory?: string } = {};
  if (typeof q.prId === 'string') f.prId = q.prId;
  if (typeof q.date === 'string') f.date = q.date;
  if (typeof q.territory === 'string') f.territory = q.territory;
  return f;
}

/**
 * MEM-8 — the append-only logbook store over the SEALED kernel insert-only log (KERNEL-4). The entry log
 * grows only (a landed entry's bytes are never rewritten ⇒ supersede-by-link, MEM-8e), the one-per-PR
 * guard bounds it to `≤1 entry/prId`, and only `orch` may append (MEM-8a). `consult` is the sole read path
 * (MEM-8d); the store exposes NO inject method, so the logbook cannot auto-inject (MEM-4).
 */
export function makeLogbookStore(): LogbookStore {
  const log = createLog();
  let snapshot: EventLog = new Map();
  const prIds = new Set<string>();
  const links: SupersedeLink[] = [];

  const entries = (): LogbookLog => [...snapshot.values()].map((ev) => ev.payload as LogbookEntry);

  return {
    append(author: MemberId, entry: LogbookEntry): LogbookLog {
      // fail-closed preconditions: orchestrator-only ∧ one-per-PR ∧ section-validated
      if (author !== LOGBOOK_AUTHOR) return entries(); // MEM-8a — non-orchestrator write rejected
      if (prIds.has(entry.prId)) return entries(); // MEM-8b — ≤1 append-only entry per PR
      if (!validateLogbookEntry(entry).valid) return entries(); // MEM-5 + MEM-8c — untemplated/over-cap rejected
      snapshot = log.append(toEvent(entry)); // append-only: the versioned floor grows, never rewrites
      prIds.add(entry.prId);
      return entries();
    },
    supersede(prId: string, link: Ref): LogbookLog {
      links.push({ prId, link }); // MEM-8e — a link pointer; the extant entry's bytes are NEVER touched
      return entries();
    },
    consult(query: unknown): LogbookLog {
      const f = asConsultFilter(query);
      if (f.prId === undefined && f.date === undefined && f.territory === undefined) return [];
      return entries().filter(
        (e) =>
          (f.prId === undefined || e.prId === f.prId) &&
          (f.date === undefined || e.at === f.date) &&
          (f.territory === undefined || e.territories.includes(f.territory)),
      );
    },
    entries,
    supersessions: () => [...links],
    size: () => snapshot.size, // the append-only entry-log length — monotone, unchanged by supersede
  };
}

// ── the frozen-`LogbookApi` binding (author bound once — the frozen `append(entry)` carries no author arg) ─

/**
 * Bind the logbook surface to the FROZEN ref/logbook.ts `LogbookApi`. The author is bound at construction
 * (the frozen `append(entry)` carries no author arg), defaulting to `orch` (orchestrator-only). The bound
 * API exposes EXACTLY `append` / `supersede` / `consult` — no inject path (consultable-never-injected).
 */
export function makeLogbook(author: MemberId = LOGBOOK_AUTHOR): LogbookApi {
  const store = makeLogbookStore();
  return {
    append: (entry) => store.append(author, entry),
    supersede: (prId, link) => store.supersede(prId, link),
    consult: (query) => store.consult(query),
  };
}

// differential-vs-oracle (compile-time): the built surface conforms EXACTLY to the FROZEN `LogbookApi`.
const _logbookCheck: (a?: MemberId) => LogbookApi = makeLogbook;
void _logbookCheck;
