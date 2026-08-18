// @atlas/knowledge — test/upsert-seal-carry.test.ts  (SEAL-CARRY-WRITE-DOOR — the durable seal projection)
//
// ADR-0017's `seal` (`proven`) is set by the admit path (genesis) and rides the whole GroundedFact into
// CAS — BUT the PROJECTION ROW (`CurrentNode`) is the durable surface `atlas mine`/read paths fold over,
// and it was DROPPING `seal` on the write. Measured: across every `atlas mine` run, 0 stored facts carry
// `seal`. This file pins the CREATE + UPDATE projection carriers, mirroring the `slot`/`answerRef` carriers
// EXACTLY. `seal` is PROVENANCE ONLY — never an identity/authority leg (nodeKey non-membership is pinned by
// wp-196a-seal.test.ts SCN-196a-2), so these cases assert the VALUE round-trips through the real reducer,
// not any gate.
//
// [RED before this WP] With no `seal` carrier in `upsert` (CREATE/UPDATE) the stored `CurrentNode` never
// carries a `seal`, so every `.toBe('proven')` below reads `undefined` → RED.

import { describe, it, expect } from 'vitest';
import { emptyStore, upsert } from '../src/write/upsert.js';
import type { WriteRequest } from '../src/write/router.js';

const create = (seal?: 'proven'): WriteRequest => ({
  nodeKey: 'nk-adv',
  contentHash: 'ch-v0',
  family: 'advisory',
  claimNorm: 'cn-v0',
  ...(seal !== undefined ? { seal } : {}),
});
const update = (seal?: 'proven'): WriteRequest => ({
  nodeKey: 'nk-adv', // SAME key ⇒ routes UPDATE (a re-mine of the same anchor·slot)
  contentHash: 'ch-v1', // new bytes ⇒ not a DEDUP no-op
  family: 'advisory',
  claimNorm: 'cn-v1',
  ...(seal !== undefined ? { seal } : {}),
});

describe('upsert CREATE — SEAL-CARRY: the admit-path seal lands on the durable projection row', () => {
  it('AC-1 — a WriteRequest carrying `seal:proven` ⇒ the stored CurrentNode carries `seal:proven`', () => {
    const s = upsert(emptyStore(), create('proven')).store;
    // ⚑ RED without the CREATE seal carrier: the row has no `seal` ⇒ undefined.
    expect(s.current.get('nk-adv')!.seal).toBe('proven');
  });

  it('AC-1 — a WriteRequest with NO seal ⇒ the stored CurrentNode has NO seal (absent, not undefined-property)', () => {
    const s = upsert(emptyStore(), create(undefined)).store;
    const row = s.current.get('nk-adv')!;
    expect(row.seal).toBeUndefined(); // absent-tolerant: no fabricated default
    expect(Object.prototype.hasOwnProperty.call(row, 'seal')).toBe(false); // truly ABSENT (conditional spread)
  });
});

describe('upsert UPDATE — SEAL-CARRY: a re-write preserves / re-states the seal (never dropped)', () => {
  it('AC-5 — re-writing a node that had `seal:proven` PRESERVES the seal when the re-mine omits it (carry-forward)', () => {
    let s = upsert(emptyStore(), create('proven')).store;
    expect(s.current.get('nk-adv')!.seal).toBe('proven');
    s = upsert(s, update(undefined)).store; // a re-mine with no seal ⇒ `...prior` stands
    // ⚑ RED if UPDATE dropped `...prior`'s seal: this would read undefined.
    expect(s.current.get('nk-adv')!.seal).toBe('proven');
    expect(s.current.get('nk-adv')!.contentHash).toBe('ch-v1'); // control: the UPDATE really happened
  });

  it('AC-5 — a re-mine carrying a fresh seal RE-STATES it on UPDATE (present wins, like slot)', () => {
    let s = upsert(emptyStore(), create(undefined)).store;
    expect(s.current.get('nk-adv')!.seal).toBeUndefined();
    s = upsert(s, update('proven')).store; // absent → present is not blocked
    expect(s.current.get('nk-adv')!.seal).toBe('proven');
  });
});
