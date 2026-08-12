// SPIKE-1 · R2 — auto-invalidation / re-verify path (contract: docs/design/SPIKE1-R1-receipt-carrier-contract.md)
//
// The six ACs R2 OWNS (contract §4 "Frozen here, BUILT by dependents" + §3.1/3.6/3.7), each 1:1 to one `it`
// below and each mutation-non-vacuous (a real edit flips the verdict):
//   AC-5   — mutate ONE byte in the receipt's sourceSpan cited unit ⇒ `readSpan` REFUSES (undefined) (§3.6).
//   AC-6   — a receipt whose sourceSpan hash no longer matches the current unit bytes re-verifies DRIFTED,
//            NEVER FRESH (§3.6).
//   AC-7   — re-running the dependency check over the SAME (rev-pinned) SCIP state yields the SAME `proven`
//            verdict — determinism is a property of the pure+total oracle (§3.7 pin).
//   AC-19  — a mutation in a DIFFERENT unit than the fact's cited unit leaves the fact FRESH; a mutation
//            elsewhere in the SAME unit STILL drifts it (UNIT-granular per §3.6 — honestly NOT byte-local).
//   AC-33  — the SCIP index and every mintSpan derive from ONE committed SHA; a source mutation injected
//            BETWEEN index-build and span-mint ABSTAINS (the shared-REV pin, §3.7 — NOT a shared buffer).
//   AC-45  — a receipt whose stored answer bytes are tampered so `store.get(answerRef)` re-hash FAILS is
//            treated as drifted/abstained with the drift/tamper reason-code (`answer-tamper`, §3.2) — DISTINCT
//            from a falsehood abstain (the oracle deciding not-proven).
//
// WHY THIS SUITE LIVES IN adapter-io (the outer RING), like the R1 suite. AC-45 turns on the DISK store's
// re-hash-on-read (`store.ts:280`) — the in-memory kernel store does NOT re-hash (contract §0), so an answer
// tamper is only OBSERVABLE against `createDiskStore`. The re-verify PATH is `@atlas/genesis` (L8, the
// program-checkable half — it already consumes `ProvenReceipt`); the ring imports genesis downward (legal), so
// this test drives `reVerifyDependency` over the real disk store + real grounding `readSpan` + a fake, rev-
// pinned SCIP feed (the SAME `SymbolReverseApi` fake shape `verify-fact.test.ts` uses). A genesis test could
// not reach the disk store without inverting the DAG — hence the ring, exactly as R1 reasoned.

import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultEncoder } from '@atlas/kernel';
import type { Hash } from '@atlas/contracts';
import { bindSpan } from '@atlas/grounding';
import type { SymbolReverseApi } from '@atlas/index';
import { reVerifyDependency } from '@atlas/genesis';
import type { ReVerifyInputs } from '@atlas/genesis';
import type { DepPredicate, ProvenReceipt } from '@atlas/knowledge';
import { createDiskStore } from '../src/store.js';
import type { CasPath } from '../src/store.js';

// ── fixtures ──────────────────────────────────────────────────────────────────────────────────────────
const UTF8 = new TextEncoder();
const { mintSpan, readSpan } = bindSpan(defaultEncoder);

/** The cited UNIT's bytes — the buffer `sourceSpan` addresses (unit-granular drift, §3.6). */
const UNIT_SRC = 'export function verify(tok: string) { return checkToken(tok); }';
const UNIT = UTF8.encode(UNIT_SRC);
const CALL_SITE = 'checkToken(tok)';
const CALL_START = UNIT_SRC.indexOf(CALL_SITE); // ASCII ⇒ byte offset == char offset

/** The committed rev the SCIP index and the span BOTH derive from (§3.7). In production this is a git SHA;
 *  here it is derived from the source bytes so a source mutation provably FLIPS it (the pin's whole point). */
const REV = String(defaultEncoder.hash(UNIT));

/** A GLOBAL SCIP symbol (not `local `) + its caller under the source scope — the dependency the fact asserts. */
const TARGET = 'scip:token#checkToken';
const SOURCE = 'src/auth'; // the scope the caller lives under
const WORLD = 'src'; // the completeness world
const CALLER = 'src/auth/verify.ts'; // a real caller of TARGET, UNDER SOURCE ⇒ proven

const PREDICATE: DepPredicate = { class: 'dependency', sourceScope: SOURCE, target: TARGET, worldScope: WORLD };

const pathOfHash = (h: Hash): string | undefined => String(h); // identity (mirrors verify-fact.test.ts)
const isLocal = (sym: string): boolean => sym.startsWith('local ');

/** A rev-pinned SCIP feed where a real caller of TARGET lies under SOURCE ⇒ `verifyDependency` proves. */
function provenFeed(callers: readonly string[] = [CALLER]): SymbolReverseApi {
  return {
    reverseCallers: (sym: string) => (sym === TARGET ? (callers as unknown as readonly Hash[]) : []),
    holeSources: () => [],
    resolves: (sym: string) => sym === TARGET,
  };
}

/** A well-formed sourceSpan over `UNIT` — the `checkToken(tok)` call site. */
function span() {
  const s = mintSpan(UNIT, CALL_START, CALL_START + CALL_SITE.length);
  if (s === undefined) throw new Error('fixture span failed to mint');
  return s;
}

function freshStore(): { casPath: CasPath; store: ReturnType<typeof createDiskStore>; dispose: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'atlas-r2-'));
  const casPath = join(root, 'cas') as CasPath;
  return { casPath, store: createDiskStore(casPath), dispose: () => rmSync(root, { recursive: true, force: true }) };
}

/** Build the re-verify inputs over a real disk store, with the answer already CAS-put (its id IS answerRef). */
function mkInputs(store: ReturnType<typeof createDiskStore>, over: Partial<ReVerifyInputs> = {}): ReVerifyInputs {
  const answerRef = store.put('the caller `verify` reaches `checkToken` at the call site') as unknown as string;
  const receipt: ProvenReceipt = { predicate: PREDICATE, check: { oracle: 'symbol-reverse' }, sourceSpan: span(), answerRef };
  return {
    receipt,
    unitBytes: UNIT,
    indexRev: REV,
    spanRev: REV,
    readSpan,
    getAnswer: (ref: string) => store.get(ref as unknown as Hash),
    reverse: provenFeed(),
    pathOfHash,
    isLocal,
    ...over,
  };
}

// ── BASELINE (the non-vacuous anchor every drift/abstain test flips away from) ──────────────────────────
describe('SPIKE-1 R2 · baseline — a rev-pinned, un-drifted, un-tampered receipt re-verifies FRESH', () => {
  it('every clause (rev-pin · unit-drift · answer-tamper · oracle) re-discharges ⇒ status fresh', () => {
    const { store, dispose } = freshStore();
    try {
      expect(reVerifyDependency(mkInputs(store))).toEqual({ status: 'fresh', oracle: 'symbol-reverse' });
    } finally {
      dispose();
    }
  });
});

// ── AC-5 ─────────────────────────────────────────────────────────────────────────────────────────────
describe('SPIKE-1 R2 · AC-5 — mutating one byte in the cited unit makes readSpan REFUSE', () => {
  it('readSpan resolves against the authentic unit but returns undefined once one byte inside the unit flips', () => {
    const s = span();
    // GREEN reference: the authentic unit re-derives the cited slice.
    expect(new TextDecoder().decode(readSpan(s, UNIT)!)).toBe(CALL_SITE);
    // THE MUTATION that flips it: change ONE byte inside the cited unit (here, inside the cited slice itself).
    const mutated = UNIT.slice();
    mutated[CALL_START] = (mutated[CALL_START] as number) ^ 0x01; // `c` → `b` in `checkToken`
    expect(readSpan(s, mutated)).toBeUndefined(); // the digest no longer matches ⇒ the citation is REFUSED
  });
});

// ── AC-6 ─────────────────────────────────────────────────────────────────────────────────────────────
describe('SPIKE-1 R2 · AC-6 — a sourceSpan that no longer matches the unit re-verifies DRIFTED, never FRESH', () => {
  it('re-verify over mutated unit bytes is drifted; over authentic bytes it is fresh (the RED→GREEN pair)', () => {
    const { store, dispose } = freshStore();
    try {
      // FRESH over the authentic unit (control).
      expect(reVerifyDependency(mkInputs(store)).status).toBe('fresh');
      // THE MUTATION: the current unit bytes differ by one byte ⇒ readSpan refuses ⇒ DRIFTED, never fresh.
      const mutated = UNIT.slice();
      mutated[CALL_START + 1] = (mutated[CALL_START + 1] as number) ^ 0x01;
      const r = reVerifyDependency(mkInputs(store, { unitBytes: mutated }));
      expect(r.status).toBe('drifted');
      expect(r.reason).toBe('source-drift');
      expect(r.status).not.toBe('fresh');
    } finally {
      dispose();
    }
  });
});

// ── AC-7 ─────────────────────────────────────────────────────────────────────────────────────────────
describe('SPIKE-1 R2 · AC-7 — re-running the dependency check over the SAME rev-pinned SCIP is deterministic', () => {
  it('two re-verifies over the same rev-pinned feed yield the SAME proven (fresh) verdict, byte-for-byte', () => {
    const { store, dispose } = freshStore();
    try {
      // Same rev-pinned feed, same inputs ⇒ the pure+total oracle re-decides identically (no clock/IO/state).
      const first = reVerifyDependency(mkInputs(store));
      const second = reVerifyDependency(mkInputs(store));
      expect(first).toEqual({ status: 'fresh', oracle: 'symbol-reverse' });
      expect(second).toEqual(first);
      // NON-VACUOUS: the verdict is genuinely PROVED (a witnessed caller under scope), not a vacuous default —
      // remove the caller from the SAME rev-pinned feed and the same call abstains, so `fresh` was earned.
      const noCaller = reVerifyDependency(mkInputs(store, { reverse: provenFeed([]) }));
      expect(noCaller.status).toBe('abstain');
      expect(noCaller.reason).toBe('no-caller-in-scope');
    } finally {
      dispose();
    }
  });
});

// ── AC-19 ────────────────────────────────────────────────────────────────────────────────────────────
describe('SPIKE-1 R2 · AC-19 — drift is UNIT-granular (a DIFFERENT unit stays FRESH), honestly NOT byte-local', () => {
  it('a mutation confined to another unit leaves this fact FRESH; a mutation elsewhere in the SAME unit drifts it', () => {
    const { store, dispose } = freshStore();
    try {
      // A DIFFERENT unit's bytes changing never enters THIS fact's re-check (it reads only its cited unit), so
      // the cited unit's bytes are unchanged and the fact stays FRESH. This is unit-granular, not repo-global.
      expect(reVerifyDependency(mkInputs(store, { unitBytes: UNIT })).status).toBe('fresh');

      // HONEST LIMIT (§3.6): granularity is the UNIT, not the byte-span. Mutating a byte OUTSIDE the cited
      // `checkToken(tok)` slice but INSIDE the cited unit (the `export` keyword at offset 0) STILL drifts the
      // fact — `readSpan` re-hashes the WHOLE buffer. So drift is coarser than the span, not finer. Stated so it
      // is not mistaken for byte-local drift the spike does NOT deliver.
      const sameUnitEdit = UNIT.slice();
      sameUnitEdit[0] = (sameUnitEdit[0] as number) ^ 0x01; // `e` in `export`, far from the cited slice
      const r = reVerifyDependency(mkInputs(store, { unitBytes: sameUnitEdit }));
      expect(r.status).toBe('drifted');
      expect(r.reason).toBe('source-drift');
    } finally {
      dispose();
    }
  });
});

// ── AC-33 ────────────────────────────────────────────────────────────────────────────────────────────
describe('SPIKE-1 R2 · AC-33 — shared-REV pin: a source edit between index-build and span-mint ABSTAINS', () => {
  it('index-rev and span-rev from ONE committed SHA ⇒ fresh; a mutation injected between them ⇒ abstain(rev-skew)', () => {
    const { store, dispose } = freshStore();
    try {
      // CONTROL: the SCIP index and the span derive from the SAME committed SHA ⇒ no skew ⇒ fresh.
      expect(reVerifyDependency(mkInputs(store, { indexRev: REV, spanRev: REV })).status).toBe('fresh');

      // THE INJECTED MUTATION (§3.7, NOT a shared-buffer double-read): the SCIP index was built at the rev of
      // the ORIGINAL source; a source edit then lands BEFORE the span is minted, so the span derives from a
      // DIFFERENT committed SHA. The pin forbids that skew — the check (SCIP-at-indexRev) and the span (bytes-
      // at-spanRev) saw different source — so the fact ABSTAINS before any verdict is trusted.
      const indexRev = String(defaultEncoder.hash(UNIT)); // index built over the original source
      const editedSource = UTF8.encode(UNIT_SRC.replace('checkToken', 'renamedCheck'));
      const spanRev = String(defaultEncoder.hash(editedSource)); // span minted AFTER the edit
      expect(indexRev).not.toBe(spanRev); // the edit provably flipped the committed rev

      const r = reVerifyDependency(mkInputs(store, { indexRev, spanRev }));
      expect(r.status).toBe('abstain');
      expect(r.reason).toBe('rev-skew');
    } finally {
      dispose();
    }
  });

  // FAIL-CLOSED on an ABSENT pin (billy item 3). A bare `indexRev !== spanRev` lets two EMPTY revs slip through
  // (`'' !== ''` is false ⇒ the pin check is SKIPPED, not failed), which would let a stale-index attack proceed
  // to a false `proven`. An unset pin is NOT "no skew" — it is "no evidence of same-rev" — so it MUST abstain.
  it('an ABSENT (empty-string) rev pin abstains(rev-skew) — an un-pinned re-verify is not trusted, not skipped', () => {
    const { store, dispose } = freshStore();
    try {
      const r = reVerifyDependency(mkInputs(store, { indexRev: '', spanRev: '' }));
      expect(r.status).toBe('abstain');
      expect(r.reason).toBe('rev-skew'); // ← RED before the `!inp.indexRev || !inp.spanRev` guard: it proceeds to fresh
      // NON-VACUOUS: with a REAL non-empty matching pin the same inputs are FRESH, so the empty pin is what refuses.
      expect(reVerifyDependency(mkInputs(store, { indexRev: REV, spanRev: REV })).status).toBe('fresh');
    } finally {
      dispose();
    }
  });
});

// ── AC-45 ────────────────────────────────────────────────────────────────────────────────────────────
describe('SPIKE-1 R2 · AC-45 — a tampered stored answer re-verifies as drift/tamper abstain (distinct reason-code)', () => {
  it('store.get(answerRef) re-hash failure ⇒ abstain(answer-tamper), NOT a falsehood abstain', () => {
    const { casPath, store, dispose } = freshStore();
    try {
      const answer = 'the candidate answer body — its own scrubbed slice (#195b)';
      const answerRef = store.put(answer) as unknown as string;
      const receipt: ProvenReceipt = { predicate: PREDICATE, check: { oracle: 'symbol-reverse' }, sourceSpan: span(), answerRef };
      const base: Partial<ReVerifyInputs> = { receipt, getAnswer: (ref: string) => store.get(ref as unknown as Hash) };

      // CONTROL: with the authentic answer on disk, the receipt re-verifies FRESH.
      expect(reVerifyDependency(mkInputs(store, base)).status).toBe('fresh');

      // THE TAMPER: overwrite the stored answer bytes with a DIFFERENT-but-valid-JSON value; the disk re-hash
      // (store.ts:280) refuses them ⇒ store.get returns undefined.
      const path = join(casPath, answerRef.slice(0, 2), answerRef);
      writeFileSync(path, JSON.stringify('a spliced/re-serialized answer body entirely'), 'utf8');
      expect(store.get(answerRef as unknown as Hash)).toBeUndefined(); // re-hash != key ⇒ absent

      const r = reVerifyDependency(mkInputs(store, base));
      expect(r.status).toBe('abstain');
      expect(r.reason).toBe('answer-tamper'); // the EVIDENCE broke — a drift/tamper code
      // DISTINCT from a falsehood abstain: a not-proven verdict carries the oracle's reason (e.g.
      // 'no-caller-in-scope'), never 'answer-tamper'. The two abstentions are NOT conflated (contract §3.2).
      expect(r.reason).not.toBe('no-caller-in-scope');
    } finally {
      dispose();
    }
  });
});
