// @atlas/adapter-io — src/memory-store.ts  (the DURABLE per-seat Memory store — CAMPAIGN-11 W2)
//
// ── REFERENCE MODEL — NO PRODUCTION CALLERS ──────────────────────────────────────────────────────────
// Nothing in `packages/*/src` calls `createDurableMemory` yet. The doors that will are later work packages
// in the same campaign: W4 (the governed write door) and W6 (the read doors). This is DECLARED in
// `harness/gates/reference-model-guard.mjs` rather than pre-wired, because wiring a door early to clear
// that gate is exactly the stub the gate exists to refuse — and a door with no gates behind it is worse
// than no door. The entry goes stale the moment W4 composes this, and the ledger's STALE leg says so out
// loud when it does.
//
// It is a reference model in CALLERS only, not in rigour: the acceptance items it owns (A1-A4) are driven
// against the real filesystem, and A4 with eight real subprocesses.
//
// Memory persists as an APPEND-ONLY, content-keyed JSONL log at `.atlas/memory.jsonl`: one record per line,
// each line's `id` its own content hash (KERNEL-12b/12c). Reading is parse → fold → `respawnFromRecord`;
// writing is a single `O_APPEND` write of one line. Nothing is ever rewritten, moved, or truncated.
//
// ── WHY NOT THE KNOWLEDGE SIDECAR PROTOCOL, WHICH THE PLAN SAID TO REUSE ─────────────────────────────────
// The CAMPAIGN-11 plan said this WP would reuse `sidecar-commit.ts` unmodified. It should not, and the
// reason is a property of the data rather than a preference. `sidecar.ts` exists because the knowledge
// projection is the ONE MUTABLE CELL in the product: every governed write is a read-modify-WHOLE-FILE-write,
// which is why it needed a `link(2)` compare-and-swap and a whole-decision retry, and why the lost-update
// leg it fixes was measured at 1-5 nodes lost per 8 concurrent writers.
//
// Memory has no such cell. MEM-10a already models it as the SEALED kernel INSERT-ONLY log — grow-only,
// first-write-wins by content id — and MEM-7f forbids deletion outright (an evicted rule is archived, not
// removed). An append-only log does not have a lost update to lose: two writers appending two lines produce
// both lines under any interleaving, with no snapshot read in between. Bending the CAS protocol onto it
// would import a retry loop guarding a race this shape cannot have, and would put memory's durability on
// the most intricate code in the tree for no property gained. `commitSidecar` is also typed to
// `StoreProjection`, so "unmodified" was never available — the choice was between generalising the hardest
// file in the repo and using the append-only primitive the kernel already ships for exactly this.
//
// ── THE CONCURRENCY CLAIM, AND ITS HONEST BOUND ──────────────────────────────────────────────────────────
// A record is appended by ONE `writeFileSync(path, line, { flag: 'a' })` — a single `write(2)` on a fd
// opened `O_APPEND`, where the seek-to-end and the write are atomic with respect to other writers. That is
// what makes two concurrent appends safe WITHOUT a lock. The bound, stated rather than left to be found:
// atomicity of a single append is guaranteed by POSIX for a local filesystem; it is NOT guaranteed for an
// arbitrarily large write over NFS, and a `logbook` entry is prose and can be large.
//
// So the reader does not TRUST the bound, it CHECKS it. Every line self-verifies: the line's stored `id` is
// its own content hash, so a torn or interleaved line either fails to parse or fails `isContentKeyed`, and
// is detectable rather than silently served. A rejected line is COUNTED and named in the read result —
// never dropped in silence, which is the failure the knowledge sidecar's leg 2 was ("the file looked
// corrupt" and "there is no knowledge" were the same value). A torn append is thus visible data loss with a
// count, not invisible data loss with an exit code of 0.
//
// ── TRAVEL (MEM-10a) ─────────────────────────────────────────────────────────────────────────────────────
// The file is git-tracked (`.gitignore` re-includes it under the `.atlas/*` deny-by-default rule) and the
// JSONL form is what makes a plain git text merge SAFE: whole lines union or duplicate and can never splice
// two records together, and a duplicate is deduped by content id on the fold. That is KERNEL-12b's
// safe-degrade line merge, and it is why a fork inherits the whole log with 0 records lost.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { combine, createLog, eventId, isContentKeyed } from '@atlas/kernel';
import type { Event, EventLog } from '@atlas/kernel';
import { respawnFromRecord, versioned } from '@atlas/memory';
import type { MemoryRecord, MemoryStore } from '@atlas/memory';

/** The tracked log's path under a repo root. One file; no generations, because nothing is ever replaced. */
export const memoryLogPath = (repoPath: string): string => join(repoPath, '.atlas', 'memory.jsonl');

/**
 * What a read found. `rejected` is the load-bearing field: a line that failed to parse or failed its own
 * content-key check is counted here, so a caller can surface partial data as PARTIAL rather than as all
 * there is.
 */
export interface MemoryRead {
  readonly store: MemoryStore;
  readonly log: EventLog;
  /** Lines that did not parse, or whose stored `id` is not their content hash. Never silently discarded. */
  readonly rejected: number;
}

/** The durable store's surface. Deliberately two verbs: memory is appended and folded, never mutated. */
export interface DurableMemory {
  readonly path: string;
  /** Fold the tracked log into a store. Total — a missing file is an empty store, not an error. */
  read(): MemoryRead;
  /** Append one record. Idempotent by content id: appending the same record twice folds to one. */
  append(record: MemoryRecord): void;
}

/**
 * Parse one line, TOTALLY. Returns `undefined` for anything that is not a content-keyed event — a torn
 * append, a partial line, a hand-edited row. `JSON.parse` throws, so the catch is what makes this total;
 * without it one bad byte would make a whole store unreadable, which is the amplification the knowledge
 * sidecar was rewritten to end.
 */
function parseLine(line: string): Event | undefined {
  const trimmed = line.trim();
  if (trimmed.length === 0) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== 'object') return undefined;
  const ev = parsed as Event;
  // The self-verification. A line whose id is not its own content hash was not written by this door — it
  // was torn, spliced, or edited — and is refused rather than folded in as a record.
  if (typeof ev.id !== 'string' || !isContentKeyed(ev)) return undefined;
  return ev;
}

export function createDurableMemory(repoPath: string): DurableMemory {
  const path = memoryLogPath(repoPath);

  function read(): MemoryRead {
    if (!existsSync(path)) return { store: [], log: new Map(), rejected: 0 };
    let text: string;
    try {
      text = readFileSync(path, 'utf8');
    } catch {
      // An unreadable file is NOT an empty store. Reporting it as one is precisely how the knowledge
      // sidecar turned a torn read into a total loss, so the whole file counts as one rejection and the
      // caller sees a non-zero count against an empty store.
      return { store: [], log: new Map(), rejected: 1 };
    }
    const log = createLog();
    let snapshot: EventLog = new Map();
    let rejected = 0;
    for (const line of text.split('\n')) {
      if (line.trim().length === 0) continue;
      const ev = parseLine(line);
      if (ev === undefined) {
        rejected += 1;
        continue;
      }
      // `combine` is the content-keyed set-union (KERNEL-9): a duplicated line — which a git line-merge can
      // legitimately produce — folds to one record, first-seen-wins.
      snapshot = combine(snapshot, log.append(ev));
    }
    return { store: respawnFromRecord(snapshot), log: snapshot, rejected };
  }

  function append(record: MemoryRecord): void {
    // The record is versioned through `@atlas/memory` rather than event-shaped here, so the identity seam
    // stays the sealed kernel one and this adapter mints no ids of its own.
    const [ev] = [...versioned([record]).values()];
    if (ev === undefined) return;
    if (eventId(ev) !== ev.id) {
      // Unreachable through `versioned`, and asserted rather than assumed: a line that is not content-keyed
      // would be rejected by this module's own reader, so writing one would mean writing data that can
      // never be read back — a silent black hole with an exit code of 0.
      throw new Error('memory-store: refusing to append a line that is not content-keyed (KERNEL-12c)');
    }
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(ev)}\n`, { flag: 'a' });
  }

  return { path, read, append };
}
