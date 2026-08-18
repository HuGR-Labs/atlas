// @atlas/adapter-io — test/reverify-store.test.ts  (REVERIFY-GATE — the pure re-verification fold)
//
// `reverifyFact`/`reverifyStore` re-prove a `seal:'proven'` fact's OWN witness against the REAL oracle
// (`createVerifyFactLeg`, the SAME production feed `atlas verify-fact` drives — no second oracle built
// here). The scip fixture is deliberately the SAME shape `verify-fact-source.test.ts` uses: GREET is defined
// in `src/def.ts` and referenced (called) from `src/a.ts` — a witnessed caller under `src`.

import { describe, it, expect } from 'vitest';
import type { ScipOutput } from '@atlas/index';
import type { GroundedFact } from '@atlas/knowledge';
import { asNodeKey } from '@atlas/kernel';
import { createVerifyFactLeg } from '../src/verify-fact-source.js';
import { reverifyFact, reverifyStore } from '../src/reverify-store.js';

const GREET = 'scip-ts npm fixture 1.0.0 `greet`().';
const NEVER = 'scip-ts npm fixture 1.0.0 `never`().'; // defined, but referenced nowhere ⇒ no witnessed caller

const scip: ScipOutput = {
  documents: [
    { relativePath: 'src/def.ts', occurrences: [
      { symbol: GREET, role: 'definition' },
      { symbol: NEVER, role: 'definition' },
    ] },
    { relativePath: 'src/a.ts', occurrences: [{ symbol: GREET, role: 'reference' }] },
  ],
};

const leg = createVerifyFactLeg(scip);

/** A minimal `AdvisoryNode` — only the fields `reverify-store.ts` reads (`kind`, `id`, `seal`, `witness`)
 *  are load-bearing; grounding/freshness are structurally present but never inspected by this module. */
function advisory(id: string, extra: Partial<GroundedFact>): GroundedFact {
  return {
    kind: 'advisory',
    id: asNodeKey(id),
    tier: 'T2',
    claimNorm: 'x',
    grounding: { entries: [] },
    freshness: 'FRESH',
    claims: [],
    authoring: 'ADVISORY',
    ...extra,
  } as unknown as GroundedFact;
}

describe('reverifyFact — one sealed fact against the real oracle', () => {
  it('a fact carrying NO seal at all is OUT OF SCOPE (undefined), never counted', () => {
    const fact = advisory('nk-unsealed', {});
    expect(reverifyFact(fact, leg)).toBeUndefined();
  });

  it('RE-PROVEN — a proven-sealed advisory whose witness replays PROVEN over the live oracle', () => {
    const fact = advisory('nk-a', { seal: 'proven', witness: { slot: 'dependency', target: GREET, scope: 'src' } });
    const row = reverifyFact(fact, leg);
    expect(row).toEqual({ nodeKey: 'nk-a', outcome: 're-proven', reason: expect.stringContaining('PROVEN') });
  });

  it('BROKEN — a proven-sealed advisory whose witness no longer proves (no caller under scope)', () => {
    const fact = advisory('nk-b', { seal: 'proven', witness: { slot: 'dependency', target: NEVER, scope: 'src' } });
    const row = reverifyFact(fact, leg);
    expect(row?.outcome).toBe('broken');
    expect(row?.reason).toContain("did NOT re-prove");
  });

  it('UNVERIFIABLE — seal:proven with NO witness at all', () => {
    const fact = advisory('nk-c', { seal: 'proven' });
    const row = reverifyFact(fact, leg);
    expect(row).toEqual({ nodeKey: 'nk-c', outcome: 'unverifiable', reason: expect.stringContaining('no witness was recorded') });
  });

  it('UNVERIFIABLE — a PredicateNode carrying seal:proven has NO witness LEG at all (structural, not just absent)', () => {
    // teeth: `witness` is AdvisoryNode-only (#195) — a predicate/relation/negation sealed `proven` is
    // witness-less BY CONSTRUCTION, and this must land `unverifiable`, never throw and never `broken`.
    const fact = { kind: 'predicate', id: asNodeKey('nk-d'), tier: 'T2', check: { kind: 'assertion', expr: 'x' }, grounding: { entries: [] }, status: 'HOLDS', freshness: 'FRESH', claims: [], authoring: 'PREDICATED', seal: 'proven' } as unknown as GroundedFact;
    const row = reverifyFact(fact, leg);
    expect(row?.outcome).toBe('unverifiable');
  });

  it('UNVERIFIABLE — an incomplete witness (empty target) is never replayed', () => {
    const fact = advisory('nk-e', { seal: 'proven', witness: { slot: 'dependency', target: '', scope: 'src' } });
    expect(reverifyFact(fact, leg)?.outcome).toBe('unverifiable');
  });

  it('UNVERIFIABLE — a witness naming a slot outside the witnessed family (dependency|count)', () => {
    const fact = advisory('nk-f', { seal: 'proven', witness: { slot: 'invariant', target: GREET, scope: 'src' } });
    expect(reverifyFact(fact, leg)?.outcome).toBe('unverifiable');
  });

  it('UNVERIFIABLE — a count witness missing its atLeast bound', () => {
    const fact = advisory('nk-g', { seal: 'proven', witness: { slot: 'count', target: GREET, scope: 'src' } });
    expect(reverifyFact(fact, leg)?.outcome).toBe('unverifiable');
  });
});

describe('reverifyStore — the whole-store loop, three buckets sum to the denominator', () => {
  it('mixed facts fold into exactly the right buckets, unsealed facts never counted', () => {
    const facts: GroundedFact[] = [
      advisory('nk-unsealed', {}),
      advisory('nk-a', { seal: 'proven', witness: { slot: 'dependency', target: GREET, scope: 'src' } }),
      advisory('nk-b', { seal: 'proven', witness: { slot: 'dependency', target: NEVER, scope: 'src' } }),
      advisory('nk-c', { seal: 'proven' }),
    ];
    const report = reverifyStore(facts, leg);
    expect(report).toEqual({
      sealedProven: 3,
      reProven: 1,
      broken: 1,
      unverifiable: 1,
      rows: [
        { nodeKey: 'nk-a', outcome: 're-proven', reason: expect.stringContaining('PROVEN') },
        { nodeKey: 'nk-b', outcome: 'broken', reason: expect.stringContaining('did NOT re-prove') },
        { nodeKey: 'nk-c', outcome: 'unverifiable', reason: expect.stringContaining('no witness was recorded') },
      ],
    });
  });

  it('an EMPTY store folds to the honest all-zero report, never a throw', () => {
    expect(reverifyStore([], leg)).toEqual({ sealedProven: 0, reProven: 0, broken: 0, unverifiable: 0, rows: [] });
  });
});
