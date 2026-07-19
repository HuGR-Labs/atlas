// @atlas/tools — ref/guard.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The SINGLE-WRITE-DOOR — a STORE-LEVEL write-guard, structural, NOT a documented rule (TOOLS-15,
// COUPLED-with TOOLS-1). TOOLS-10 leaves the CLI unscoped and shell-reachable, so a seat with `Bash` +
// filesystem write could otherwise mutate the store directly and bypass `atlas-emit`'s fail-closed
// grounding check (TOOLS-7). To close that hole the store medium MUST be append-only / permissioned, AND
// reads MUST enforce a CONTENT-ADDRESS INTEGRITY CHECK that REJECTS any un-emitted (ungrounded) row: a
// direct write that skips the emit path either cannot land (append-only/permission) or is rejected at
// read (integrity), never surfacing as a served fact. Thus `atlas-emit`'s grounding is enforced by the
// STORAGE LAYER, not by tool convention. Transcribed from atlas-tools:30-34, 105-113, 215-217 +
// method-tags-tls:19-24, 124-129.
//
// [TOOLS-1 SACRED] This guard is what makes the write surface structurally EXACTLY FOUR: `writePaths==1`
// (→ `atlas-emit`). It carries no write authority of its own — it is a verdict on whether a row is served.

/** One row of the append-only, permissioned store medium (TOOLS-15). No concrete store-row record is
 *  frozen in a lower layer at this seam, so it is DEFINED minimally here: a content-addressed `key` and
 *  its opaque persisted `value` (the byte payload the read-time integrity check recomputes the address
 *  over). Kept minimal — the value stays `unknown` (heterogeneous persisted bytes); never invented wider. */
export interface StoreRow {
  readonly key: string;
  readonly value: unknown;
}

/** The guard's verdict on a row (TOOLS-15). `admitted:false` ⇒ the row was NOT produced by `atlas-emit`'s
 *  grounded, content-addressed path — a direct/back-channel write — and is refused (at write) or rejected
 *  (at read), never served. `rejected` names the structural reason. */
export interface GuardVerdict {
  readonly admitted: boolean;
  readonly rejected?: string; // structural refusal reason (append-only/permission | integrity-check)
}

export interface GuardApi {
  /** Write-time gate: the store medium is append-only / permissioned — a direct write that skips the emit
   *  path cannot land (TOOLS-15, method-tags-tls:128). Structural, not convention.
   *
   *  [PINNED — `row` shape] DEFINED minimally as the append-only `StoreRow` (`{key, value}`); the `value`
   *  stays opaque (`unknown`), NOT invented wider. */
  admitOnWrite(row: StoreRow): GuardVerdict;

  /** Read-time integrity check: recompute the content address and REJECT any row whose bytes were NOT
   *  produced by `atlas-emit`'s grounded path — an un-emitted (ungrounded) row fails and is not served
   *  (TOOLS-15, method-tags-tls:128). This is the second leg that closes the unscoped-CLI hole. */
  admitOnRead(row: StoreRow): GuardVerdict;
}
