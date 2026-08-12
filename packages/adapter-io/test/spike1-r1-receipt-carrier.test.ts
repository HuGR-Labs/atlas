// SPIKE-1 · R1 — the per-clause receipt carrier (contract: docs/design/SPIKE1-R1-receipt-carrier-contract.md)
//
// The five ACs R1 OWNS (contract §4), each mapped 1:1 to one `it` below and each mutation-non-vacuous:
//   AC-1              — every receipt field independently RESOLVES (sourceSpan via `readSpan`, answerRef via `store.get`).
//   AC-2              — the receipt is a POINTER: it stores NO source text (no text-payload field, no readable slice).
//   AC-31             — per-candidate `answerRef` isolation, over the SCRUB-WHOLE-THEN-SLICE order (§3.3).
//   AC-32             — the two-claim admission idempotency of §3.4 (byte-identical DEDUP · fresh-answer MEMBERSHIP no-op).
//   AC-24 (receipt)   — field mutation ⇒ `id(receipt)` changes (§3.5, the grounding-preimage-exclusion boundary).
//
// WHY THIS SUITE LIVES IN adapter-io (the outer RING), not in @atlas/knowledge where the receipt TYPE lives.
// AC-24 and AC-31 turn on the DISK store's re-hash-on-read (`store.ts:280`) — the in-memory kernel store does
// NOT re-hash (contract §0), so a tamper is only OBSERVABLE against `createDiskStore`. The ring depends on
// knowledge (downward, legal), so this test imports the receipt + proven store from @atlas/knowledge and the
// real disk store locally; a knowledge test importing adapter-io would be a layer inversion (the norm every
// knowledge suite already keeps). The proven-store LOGIC is pure and lives in @atlas/knowledge; only its
// disk-backed EXERCISE lives here.

import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { id, defaultEncoder } from '@atlas/kernel';
import type { Hash } from '@atlas/contracts';
import { bindSpan } from '@atlas/grounding';
import { scrub } from '@atlas/persist';
import { bindProvenStore } from '@atlas/knowledge';
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

/** The predicate the model proposed (typed, not prose). */
const PREDICATE: DepPredicate = {
  class: 'dependency',
  sourceScope: 'src/auth.ts::verify',
  target: 'src/token.ts::checkToken',
  worldScope: 'src',
};

/** A well-formed `sourceSpan` over `UNIT` — the `checkToken(tok)` call site. `mintSpan` computes the digest
 *  from the bytes, so this span can only be minted by something actually holding the unit (span.ts). */
function span() {
  const s = mintSpan(UNIT, CALL_START, CALL_START + CALL_SITE.length); // the `checkToken(tok)` slice
  if (s === undefined) throw new Error('fixture span failed to mint');
  return s;
}

/** Make a fresh disk-backed CAS + proven store over a throwaway temp dir. */
function freshStore(): { casPath: CasPath; store: ReturnType<typeof createDiskStore>; dispose: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'atlas-r1-'));
  const casPath = join(root, 'cas') as CasPath;
  return { casPath, store: createDiskStore(casPath), dispose: () => rmSync(root, { recursive: true, force: true }) };
}

/** Count the value objects on disk in the sharded CAS (`<casPath>/<xx>/<H>`). AC-32(a) asserts a byte-
 *  identical re-admit mints NONE. */
function countCasObjects(casPath: CasPath): number {
  let n = 0;
  let shards: string[];
  try {
    shards = readdirSync(casPath);
  } catch {
    return 0; // no CAS dir yet ⇒ zero objects
  }
  for (const shard of shards) {
    const dir = join(casPath, shard);
    try {
      for (const f of readdirSync(dir)) if (statSync(join(dir, f)).isFile()) n++;
    } catch {
      /* not a shard dir */
    }
  }
  return n;
}

/** Build a receipt with a caller-chosen `answerRef` (the per-candidate CAS id). */
function receiptWith(answerRef: string): ProvenReceipt {
  return { predicate: PREDICATE, check: { oracle: 'symbol-reverse' }, sourceSpan: span(), answerRef };
}

const asH = (s: string): Hash => s as unknown as Hash;

// ── AC-1 ─────────────────────────────────────────────────────────────────────────────────────────────
describe('SPIKE-1 R1 · AC-1 — every receipt field independently RESOLVES', () => {
  it('the fetched receipt yields predicate/check inline, sourceSpan via readSpan, answerRef via store.get', () => {
    const { casPath, store, dispose } = freshStore();
    try {
      const proven = bindProvenStore(store);
      // The candidate's own scrubbed answer becomes a CAS object; its id IS `answerRef` (#195b).
      const answer = 'the caller `verify` reaches `checkToken` at the call site';
      const answerRef = store.put(answer) as unknown as string;
      const { outcome, contentHash } = proven.admit(receiptWith(answerRef));
      expect(outcome).toBe('admitted');

      // The receipt itself is content-addressed: it comes back BY its own id, re-hash-verified at rest.
      const fetched = store.get(asH(contentHash)) as ProvenReceipt | undefined;
      expect(fetched).toBeDefined();
      // predicate + check resolve inline (they ARE the receipt).
      expect(fetched?.predicate.target).toBe('src/token.ts::checkToken');
      expect(fetched?.check.oracle).toBe('symbol-reverse');
      // sourceSpan resolves against the cited UNIT's bytes — a re-derived slice, never a stored quote.
      const slice = readSpan(fetched!.sourceSpan, UNIT);
      expect(slice).toBeDefined();
      expect(new TextDecoder().decode(slice!)).toBe(CALL_SITE);
      // answerRef resolves to THIS candidate's stored answer bytes.
      expect(store.get(asH(fetched!.answerRef))).toBe(answer);

      // NON-VACUOUS: presented the WRONG unit bytes, the span refuses (it is falsifiable, not decorative).
      expect(readSpan(fetched!.sourceSpan, UTF8.encode('a different unit entirely'))).toBeUndefined();
    } finally {
      dispose();
    }
  });
});

// ── AC-2 ─────────────────────────────────────────────────────────────────────────────────────────────
describe('SPIKE-1 R1 · AC-2 — the receipt is a POINTER, storing no source text', () => {
  it('carries exactly {predicate,check,sourceSpan,answerRef}; sourceSpan is a digest+offsets, no readable unit text', () => {
    const r = receiptWith('deadbeef');
    // The frozen 4-field shape (v2 removed answerSpan). No text-payload field ever appears.
    expect(Object.keys(r).sort()).toEqual(['answerRef', 'check', 'predicate', 'sourceSpan']);
    // The span is a POINTER: a content DIGEST plus two integer offsets — never the bytes themselves.
    expect(Object.keys(r.sourceSpan).sort()).toEqual(['contentHash', 'end', 'start']);
    expect(typeof r.sourceSpan.contentHash).toBe('string');
    expect(typeof r.sourceSpan.start).toBe('number');

    // NON-VACUOUS: the readable substring of the cited unit appears in NO string the receipt carries. A
    // receipt that quoted its evidence would fail here; a pointer-only receipt cannot.
    const quoted = 'checkToken';
    const allStrings = JSON.stringify(r);
    // `checkToken` is present in the predicate.target (a SYMBOL NAME, not a source quote), so probe the SPAN
    // specifically: it must be a bare digest with no captured slice.
    expect(r.sourceSpan.contentHash).not.toContain(quoted);
    expect(allStrings).not.toContain('function verify'); // the unit's source text is nowhere in the receipt
  });
});

// ── AC-31 ────────────────────────────────────────────────────────────────────────────────────────────
describe('SPIKE-1 R1 · AC-31 — per-candidate answerRef isolation (scrub-whole-then-slice)', () => {
  it('two candidates from one envelope isolate: tampering B fails B\'s read, A still resolves; scrub precedes slice', () => {
    const { casPath, store, dispose } = freshStore();
    try {
      // SCRUB-ORDER (§3.3): scrub the WHOLE proposer envelope ONCE, THEN slice the SCRUBBED bytes per candidate.
      // Splitting BEFORE scrub would reintroduce the #97/#119 cross-boundary credential straddle. Candidate A
      // carries a real GitHub-token SHAPE so scrub is genuinely exercised (redacted to `[REDACTED]`).
      const BOUNDARY = '\n===CANDIDATE-BOUNDARY===\n';
      const candidateARaw = 'A: verify depends on checkToken; token ghp_ABCDEF123456 is here';
      const candidateBRaw = 'B: verify depends on checkToken via an alternate call path';
      const envelope = UTF8.encode(candidateARaw + BOUNDARY + candidateBRaw);

      const scrubbed = new TextDecoder().decode(scrub(envelope)); // scrub(whole) — ONCE
      const [sliceA, sliceB] = scrubbed.split(BOUNDARY); // slice the SCRUBBED output
      expect(sliceB).toBeDefined();

      // scrub actually fired: the raw secret never reaches CAS, only its placeholder does (KNOW-11).
      expect(sliceA).not.toContain('ghp_ABCDEF123456');
      expect(sliceA).toContain('[REDACTED]');

      // Per-candidate put ⇒ per-candidate answerRef, isolated by CAS id.
      const answerRefA = store.put(sliceA) as unknown as string;
      const answerRefB = store.put(sliceB) as unknown as string;
      expect(answerRefA).not.toBe(answerRefB); // isolation: distinct candidates ⇒ distinct refs

      // Tamper B's STORED bytes on disk with a DIFFERENT-but-valid-JSON value ⇒ disk re-hash refuses B's read.
      const bPath = join(casPath, answerRefB.slice(0, 2), answerRefB);
      writeFileSync(bPath, JSON.stringify('B tampered — a different answer body entirely'), 'utf8');
      expect(store.get(asH(answerRefB))).toBeUndefined(); // re-hash != key ⇒ read as absent

      // A is untouched: its ref still resolves to A's authentic scrubbed slice.
      expect(store.get(asH(answerRefA))).toBe(sliceA);

      // NON-VACUOUS: had scrub NOT preceded the slice, `sliceA` would carry the raw token — asserted absent above.
    } finally {
      dispose();
    }
  });
});

// ── AC-32 ────────────────────────────────────────────────────────────────────────────────────────────
describe('SPIKE-1 R1 · AC-32 — admission idempotency (§3.4, two honest claims)', () => {
  it('(a) byte-identical re-admit is a DEDUP no-op: one entry, no new CAS object', () => {
    const { casPath, store, dispose } = freshStore();
    try {
      const proven = bindProvenStore(store);
      const answerRef = store.put('one answer') as unknown as string;
      const r = receiptWith(answerRef);

      const first = proven.admit(r);
      expect(first.outcome).toBe('admitted');
      expect(proven.size).toBe(1);
      const casAfterFirst = countCasObjects(casPath);

      // Re-admit the BYTE-IDENTICAL receipt (retry / concurrent double-admit).
      const second = proven.admit(r);
      expect(second.outcome).toBe('dedup'); // contentHashHit=true ⇒ DEDUP no-op
      expect(second.contentHash).toBe(first.contentHash);
      expect(proven.size).toBe(1); // still exactly one entry
      expect(countCasObjects(casPath)).toBe(casAfterFirst); // NON-VACUOUS: NOT one new CAS object was minted
    } finally {
      dispose();
    }
  });

  it('(b) re-proposal with a DIFFERENT answer is a nodeKey MEMBERSHIP no-op: first receipt retained, recall counts once', () => {
    const { casPath, store, dispose } = freshStore();
    try {
      const proven = bindProvenStore(store);
      const answerRefA = store.put('answer from model call #1') as unknown as string;
      const answerRefB = store.put('answer from model call #2') as unknown as string;
      expect(answerRefA).not.toBe(answerRefB);

      const first = proven.admit(receiptWith(answerRefA));
      expect(first.outcome).toBe('admitted');

      // Same (predicate, sourceSpan), FRESH answer ⇒ different id(receipt), SAME nodeKey.
      const second = proven.admit(receiptWith(answerRefB));
      expect(second.outcome).toBe('membership'); // nodeKey-hit, NOT routed to SUPERSEDE
      expect(proven.size).toBe(1); // recall counts the nodeKey ONCE (AC-32/AC-39)
      // The FIRST receipt is RETAINED — the map still points at proof #1 (answerRefA), never proof #2.
      expect(second.contentHash).toBe(first.contentHash);
      const retained = store.get(asH(first.contentHash)) as ProvenReceipt;
      expect(retained.answerRef).toBe(answerRefA);

      // NON-VACUOUS: proof #2 genuinely DIFFERS (a different receipt id), so retaining #1 is a real choice.
      expect(id(receiptWith(answerRefB)) as unknown as string).not.toBe(first.contentHash);
    } finally {
      dispose();
    }
  });
});

// ── AC-24 (receipt-level) ───────────────────────────────────────────────────────────────────────────
describe('SPIKE-1 R1 · AC-24 (receipt-level) — field mutation ⇒ id(receipt) changes (§3.5)', () => {
  it('mutating each of {predicate,check,sourceSpan,answerRef} changes id(receipt) — the span is COVERED (not under a grounding key)', () => {
    const base = receiptWith('base-answer-ref');
    const baseId = id(base) as unknown as string;

    // Each field is part of the canonical preimage: touch it, the address moves, the disk re-hash refuses.
    const mutPredicate: ProvenReceipt = { ...base, predicate: { ...base.predicate, target: 'src/other.ts::else' } };
    const mutCheck = { ...base, check: { oracle: 'other-oracle' } } as unknown as ProvenReceipt;
    const mutSpan: ProvenReceipt = { ...base, sourceSpan: { ...base.sourceSpan, start: base.sourceSpan.start + 1 } };
    const mutAnswer: ProvenReceipt = { ...base, answerRef: 'a-different-ref' };

    expect(id(mutPredicate) as unknown as string).not.toBe(baseId);
    expect(id(mutCheck) as unknown as string).not.toBe(baseId);
    expect(id(mutSpan) as unknown as string).not.toBe(baseId); // ← the crux: sourceSpan IS covered
    expect(id(mutAnswer) as unknown as string).not.toBe(baseId);

    // §3.5 BOUNDARY EXERCISE (NON-VACUOUS): the SAME span placed under a `grounding` key is EXCLUDED from the
    // preimage by literal key name (canonical.ts:36), so mutating it there does NOT move the id. This is the
    // exact reason the receipt names its field `sourceSpan`, NOT `grounding` — the field name is load-bearing.
    const wrongShape = { predicate: base.predicate, check: base.check, grounding: base.sourceSpan, answerRef: base.answerRef };
    const wrongMut = { ...wrongShape, grounding: { ...base.sourceSpan, start: base.sourceSpan.start + 1 } };
    expect(id(wrongMut)).toBe(id(wrongShape)); // proven-excluded ⇒ id blind to it ⇒ WHY the field is `sourceSpan`
  });
});
