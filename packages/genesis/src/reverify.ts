// @atlas/genesis — src/reverify.ts  (SPIKE-1 R2 — the auto-invalidation / re-verify path)
//
// DESIGN_sound_genesis_v2 · SPIKE-1 · R2 (contract: docs/design/SPIKE1-R1-receipt-carrier-contract.md,
// ENGINEERING-FROZEN v2). R1 froze the `ProvenReceipt` — the re-runnable obligation a PROVEN dependency fact
// carries. R2 is the door that RE-RUNS it: given a stored receipt and the CURRENT world, it re-discharges
// every clause with a DETERMINISTIC check and returns FRESH / DRIFTED / ABSTAIN. "Proven" was never a durable
// stamp; it is a claim that must survive re-checking, and this is the re-check. There is no LLM here and no
// heuristic — a receipt that no longer re-derives is auto-invalidated, byte-mechanically.
//
// ── REFERENCE MODEL (declared in harness/gates/reference-model-guard.mjs) ──────────────────────────────
// Until P1 / H1a wire it, `reVerifyDependency` has ZERO production callers — SPIKE-1 R2 ships the re-verify
// PATH (rev-pin + unit-drift + answer-tamper + oracle re-run) as an executable specification: compiled,
// barrel-exported, tested (packages/adapter-io/test/spike1-r2-auto-invalidation.test.ts), but not yet reached
// from any product door. Registered in that gate's LEDGER with `shipped: null`; the row is DELETED the moment
// a dependent value-imports it (the same dead→live transition `bindProvenStore` and `verify-fact` will make).
//
// THE FOUR CLAUSES, in fail-closed order (each cites the AC + the contract § it transcribes; NONE is invented):
//   1. §3.7 SHARED-REV PIN (AC-33). The dependency oracle reads the SCIP INDEX, `mintSpan` reads SOURCE BYTES
//      (verify-fact-source.ts:19 — the index is built once at composition; there is NO shared buffer to thread,
//      billy claim-4). The invariant is a same-committed-SHA pin: the SCIP index and the sourceSpan MUST derive
//      from ONE rev. A source edit BETWEEN index-build and span-mint makes the check (over immutable SCIP-at-rev)
//      and the span (over bytes-at-admit) disagree; the pin forbids that skew, so `indexRev !== spanRev` ABSTAINS
//      before any verdict is trusted. This is NOT a shared-buffer read — the contract explicitly retired that.
//   2. §3.6 UNIT-GRANULAR SOURCE DRIFT (AC-5/6/19). `readSpan` re-hashes the WHOLE buffer it is handed — the
//      cited UNIT's bytes. A byte mutated INSIDE the cited unit changes its hash ⇒ `readSpan` returns undefined
//      ⇒ DRIFTED, never FRESH (AC-5/6). A byte mutated in a DIFFERENT unit leaves THIS unit's bytes unchanged ⇒
//      `readSpan` still resolves ⇒ FRESH (AC-19). Drift granularity is the unit, NOT the byte-span — byte-local
//      drift needs a new span type and is out of spike scope (§3.6, stated so it is not mistaken for delivered).
//   3. §3.2 ANSWER-TAMPER (AC-45). The candidate's own scrubbed answer is a CAS object addressed by `answerRef`;
//      the disk store re-hashes on read (store.ts:280), so tampered stored bytes read as ABSENT. A missing
//      `answerRef` is a DRIFT/TAMPER abstention with its OWN reason-code (`answer-tamper`) — DISTINCT from a
//      falsehood abstain (the oracle deciding not-proven), because the receipt's evidence, not the claim, broke.
//   4. THE DEPENDENCY ORACLE (AC-7). Re-run `verifyDependency` over the rev-pinned SCIP feed. It is PURE + TOTAL,
//      so re-running over the SAME (rev-pinned) `reverse` state yields the SAME `proven` verdict — determinism is
//      a property of the oracle, re-exercised here (AC-7). Not `proven` ⇒ ABSTAIN with the oracle's own reason.
// Only all four passing yields FRESH. Every refusal is a value, never a throw — pure + total, mirroring the
// oracle it wraps (no clock, no IO of its own; the two IO-bearing checks are INJECTED seams, below).
//
// ── H1a WIRING CONTRACT — the fail-closed guarantees live in the SEAMS, so H1a MUST wire the REAL ones ──
// This module is pure + total ONLY; its soundness is INHERITED from the seams the composition root supplies.
// Three of the four clauses are checked THROUGH an injected value, and each has a silent-fail-open twin if the
// WRONG value is wired — the shipped tests use the real ones (`createDiskStore` + fresh disk reads + real
// SHAs), so a mis-wire stays GREEN while the tamper/drift door hangs open. H1a's composition root MUST wire,
// and its own integration test MUST assert (this is a HARD H1a DoD, carried forward from billy item 5):
//   (a) `getAnswer` = the DISK store's re-hashing `get` (`adapter-io/src/store.ts:280`), NEVER the in-memory
//       kernel store's getter (`kernel/src/store.ts:45` does NOT re-hash) — wiring the latter makes AC-45
//       answer-tamper detection VANISH (a tampered answer re-reads as authentic and the fact stays FRESH).
//   (b) `unitBytes` = the cited unit's bytes read FRESH from disk AT re-verify time — never a cached/snapshot
//       buffer from admit time, which would re-hash EQUAL to the span and mask real source drift (AC-5/6/19).
//   (c) `indexRev`/`spanRev` = the REAL committed SHAs the SCIP index and the span each derive from, both
//       NON-EMPTY — an absent/empty pin is refused here (clause 1, fail-closed), but a pin faked to a constant
//       would defeat §3.7; the SHAs must be the genuine content pins, not placeholders.
// The seams are typed structurally (no `@atlas/grounding`/`adapter-io` edge — that would invert the DAG), so
// the TYPE system cannot force the right store here; the enforcement is the H1a integration test above.

import { verifyDependency } from './verify-fact.js';
import type { DepClaim } from './verify-fact.js';
import type { SymbolReverseApi } from '@atlas/index';
import type { Hash } from '@atlas/contracts';
import type { ProvenReceipt } from '@atlas/knowledge';

/** The re-verify verdict. `fresh` — every clause re-discharged; `drifted` — the cited SOURCE moved (AC-5/6);
 *  `abstain` — a rev-skew (AC-33), an answer-tamper (AC-45), or the oracle no longer proving (AC-7). */
export type ReVerifyStatus = 'fresh' | 'drifted' | 'abstain';

/** One re-verify outcome. `reason` discriminates the non-fresh dispositions (absent on `fresh`); `oracle`
 *  mirrors the receipt's `check.oracle` so a caller can attribute the re-check to the same deterministic door. */
export interface ReVerifyResult {
  readonly status: ReVerifyStatus;
  readonly reason?: string;
  readonly oracle: 'symbol-reverse';
}

const drifted = (reason: string): ReVerifyResult => ({ status: 'drifted', reason, oracle: 'symbol-reverse' });
const abstain = (reason: string): ReVerifyResult => ({ status: 'abstain', reason, oracle: 'symbol-reverse' });

/**
 * The two IO-bearing checks are INJECTED as seams (the codebase idiom — `bindSpan(encoder)`, the `StoreApi`
 * seam), so this module stays pure + total and layer-legal: it names the grounding span type STRUCTURALLY
 * (`ProvenReceipt['sourceSpan']`) rather than importing `@atlas/grounding` (an unneeded new edge), and reads
 * the answer CAS through a bare getter rather than a concrete store.
 */
export interface ReVerifyInputs {
  /** The stored receipt being re-checked — CONSUMED as R1 froze it, never mutated. */
  readonly receipt: ProvenReceipt;
  /** The CURRENT bytes of the cited unit (the anchor's unit) — what `sourceSpan` is re-hashed against (§3.6). */
  readonly unitBytes: Uint8Array;
  /** The committed SHA the SCIP index (`reverse`) was built at (§3.7). */
  readonly indexRev: string;
  /** The committed SHA the `sourceSpan` bytes were minted at (§3.7). A skew from `indexRev` ABSTAINS. */
  readonly spanRev: string;
  /** The grounding `readSpan` seam — re-derives the cited slice ONLY if `unitBytes` hash to the span's digest;
   *  `undefined` otherwise (fail-closed, span.ts). Injected so no `@atlas/grounding` edge is added here. */
  readonly readSpan: (span: ProvenReceipt['sourceSpan'], bytes: Uint8Array) => Uint8Array | undefined;
  /** The answer CAS re-hash-on-read seam — the disk store's `get`, which returns `undefined` on tampered bytes
   *  (store.ts:280). A missing `answerRef` is the answer-tamper abstention (§3.2, AC-45). */
  readonly getAnswer: (ref: string) => unknown;
  /** The rev-pinned SCIP feed the dependency oracle re-runs over (AC-7 determinism, §3.7 pin). */
  readonly reverse: SymbolReverseApi;
  /** hash→path lookup the oracle's scope predicate consumes (verify-fact-source.ts builds the real one). */
  readonly pathOfHash: (h: Hash) => string | undefined;
  /** `local `-symbol predicate the oracle uses to reject document-scoped targets (index `isLocalSymbol`). */
  readonly isLocal: (sym: string) => boolean;
}

/**
 * Re-run every clause of a `ProvenReceipt` against the CURRENT world and auto-invalidate it if any check no
 * longer holds. PURE + TOTAL — no throw (the injected seams are fail-closed to `undefined`), no clock, no IO of
 * its own. The order is fail-closed: an untrustworthy input (rev-skew) short-circuits BEFORE the verdict is read.
 */
export function reVerifyDependency(inp: ReVerifyInputs): ReVerifyResult {
  const { receipt } = inp;

  // 1. §3.7 shared-rev pin (AC-33). Index and span MUST derive from one committed SHA; a skew means the check
  //    and the span saw different source — the verdict cannot be trusted, so abstain before reading it. FAIL
  //    CLOSED on an ABSENT pin (billy item 3): a bare `!==` lets two EMPTY revs (`'' !== ''` is false) SKIP the
  //    check, so an un-pinned re-verify could pass a stale-index attack (SCIP at rev A, span at rev B, a third
  //    unit edited) — an unset pin is not "no skew", it is "no evidence of same-rev", which is a refusal.
  if (!inp.indexRev || !inp.spanRev || inp.indexRev !== inp.spanRev) return abstain('rev-skew');

  // 2. §3.6 unit-granular source drift (AC-5/6/19). `readSpan` re-hashes the WHOLE cited unit; a byte mutated
  //    inside it (AC-5/6) fails the read → DRIFTED. A byte mutated in ANOTHER unit leaves these bytes intact
  //    (AC-19) → the read resolves and this clause passes (unit granularity, NOT byte-local).
  if (inp.readSpan(receipt.sourceSpan, inp.unitBytes) === undefined) return drifted('source-drift');

  // 3. §3.2 answer-tamper (AC-45). The stored answer re-hashes on read; tampered bytes read as absent. This is a
  //    DRIFT/TAMPER abstention (the evidence broke), with its OWN reason-code — distinct from a falsehood abstain.
  if (inp.getAnswer(receipt.answerRef) === undefined) return abstain('answer-tamper');

  // 4. The dependency oracle (AC-7). Re-run `verifyDependency` over the rev-pinned feed; pure + total ⇒ the same
  //    state yields the same verdict (determinism). Not `proven` ⇒ abstain with the oracle's own reason.
  const claim: DepClaim = {
    sourceScope: receipt.predicate.sourceScope,
    target: receipt.predicate.target,
    worldScope: receipt.predicate.worldScope,
  };
  const verdict = verifyDependency(claim, inp.reverse, inp.pathOfHash, inp.isLocal);
  if (verdict.verdict !== 'proven') return abstain(verdict.reason ?? 'not-proven');

  // Every clause re-discharged over the CURRENT, rev-pinned world.
  return { status: 'fresh', oracle: 'symbol-reverse' };
}
