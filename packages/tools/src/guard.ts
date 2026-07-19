// @atlas/tools — src/guard.ts   (WP-7.26-a.TOOLS — TOOLS-1 / TOOLS-15, INV-TOOLS-1 / INV-TOOLS-15)
//
// The SINGLE-WRITE-DOOR — a STORE-LEVEL, STRUCTURAL guard (not a documented rule). TOOLS-10 leaves the
// CLI unscoped and shell-reachable, so a seat with `Bash` + filesystem write could otherwise mutate the
// store directly and bypass `atlas-emit`'s fail-closed grounding check (TOOLS-7). This closes that hole
// with TWO structural legs, both keyed off the SEALED @atlas/kernel `id` content-address (never a
// hand-rolled digest):
//   • append-only / permissioned WRITE — the store medium admits a row ONLY when its key IS the content
//     address of its value (`key == id(value)`), exactly what `atlas-emit`'s grounded path produces; a
//     back-channel row (forged/mismatched key) is refused and nothing lands, and an existing row is never
//     overwritten in place (append-only).
//   • content-address integrity READ — every read recomputes the address and REJECTS any row whose bytes
//     were NOT produced by the grounded path (an un-emitted / tampered / directly-injected row), so it is
//     never served.
// A direct write that skips `atlas-emit` therefore either cannot land (write leg) or is rejected at read
// (read leg) — it never surfaces as a served fact. Transcribed against the FROZEN oracle `../ref/guard.ts`
// (`GuardApi` / `GuardVerdict` / `StoreRow`); goldens SCN-TOOLS-1c-1 / 1d-1 / 15a-1 / 15b-1 / 15c-1.
//
// SCOPE (this facet): the FUNCTIONAL refusal only. Adversarial security-exploitability of this door (a
// shell-armed seat red-teaming the append-only / permission model) is billy / FR-12 (FORTRESS), NOT here.

import { id } from '@atlas/kernel';
import type { CasObject } from '@atlas/kernel';
import type { GuardApi, GuardVerdict, StoreRow } from '../ref/guard.js';

/** Structural refusal reasons (the `rejected` leg of `GuardVerdict`). */
const REFUSED_WRITE =
  'append-only/permission: key is not the content address of value — not produced by atlas-emit (TOOLS-15)';
const REJECTED_READ =
  'integrity-check: recomputed content address does not match key — ungrounded row (TOOLS-15)';

/**
 * Is this row content-addressed — i.e. was it produced by `atlas-emit`'s grounded path? True iff its key
 * IS `id(value)`, reached ONLY through the sealed kernel seam (no raw hashing). Total: a canonical-form
 * violation (float / bigint / symbol / cyclic value) can never be a grounded row, so it fails closed.
 */
function contentAddressed(row: StoreRow): boolean {
  try {
    return id(row.value as CasObject) === row.key;
  } catch {
    return false;
  }
}

/**
 * The pure single-write-door verdict (INV-TOOLS-15 reference-model). It carries NO write authority of its
 * own — it is a verdict on whether a row may be admitted (write) or served (read). Conforms EXACTLY to the
 * frozen `GuardApi`.
 */
export function createGuard(): GuardApi {
  return {
    admitOnWrite(row: StoreRow): GuardVerdict {
      return contentAddressed(row) ? { admitted: true } : { admitted: false, rejected: REFUSED_WRITE };
    },
    admitOnRead(row: StoreRow): GuardVerdict {
      return contentAddressed(row) ? { admitted: true } : { admitted: false, rejected: REJECTED_READ };
    },
  };
}

/** A read-only projection handle over one node (RETR-5 / TOOLS-10). It exposes `read` and NOTHING that
 *  mutates the store — it is NOT a fifth write path (TOOLS-1d). */
export interface ReadProjection {
  readonly key: string;
  /** Resolve this node through the read-time integrity check (ungrounded ⇒ `undefined`). */
  read(): StoreRow | undefined;
}

/** The append-only / permissioned store medium fronted by the single write-door (TOOLS-1 / TOOLS-15). */
export interface GovernedStore {
  /** THE single write-door — the ONLY store-mutating entry point (`atlas-emit` routes here, `writePaths==1`).
   *  Append-only: a grounded row for a fresh key is appended; an existing key is never overwritten in place;
   *  an ungrounded / forged-key row is refused (nothing lands). Returns the guard verdict. */
  write(row: StoreRow): GuardVerdict;
  /** Read with the content-address integrity check — an un-emitted / tampered / directly-injected row is
   *  rejected and never served (`undefined`). Read-only. */
  read(key: string): StoreRow | undefined;
  /** A read-only projection handle for one node — carries NO write authority (TOOLS-1d / TOOLS-10). */
  project(key: string): ReadProjection;
}

/**
 * Construct the append-only / permissioned store over an injected backing `medium` (the raw storage a
 * shell could tamper) and the single-write-door `guard`. The write-door is the ONLY sanctioned mutation;
 * a back-channel that mutates `medium` directly is caught at read by the integrity check. Pure + total:
 * no clock, no IO, no throw.
 */
export function createGovernedStore(
  medium: Map<string, StoreRow> = new Map<string, StoreRow>(),
  guard: GuardApi = createGuard(),
): GovernedStore {
  const read = (key: string): StoreRow | undefined => {
    const row = medium.get(key);
    if (row === undefined) return undefined;
    // read-time integrity: an ungrounded row (never produced by atlas-emit) is rejected, never served.
    return guard.admitOnRead(row).admitted ? row : undefined;
  };
  return {
    write(row: StoreRow): GuardVerdict {
      const verdict = guard.admitOnWrite(row);
      if (!verdict.admitted) return verdict; // refused — nothing lands
      // append-only: never overwrite an existing key in place. Since key == id(value) for every admitted
      // row, a re-emit of identical content is an idempotent no-op and prior rows are byte-preserved.
      if (!medium.has(row.key)) medium.set(row.key, row);
      return verdict;
    },
    read,
    project(key: string): ReadProjection {
      return { key, read: () => read(key) };
    },
  };
}

// differential-vs-oracle (compile-time): the guard conforms to the frozen `GuardApi` (../ref/guard.ts).
const _guardConforms: GuardApi = createGuard();
void _guardConforms;
