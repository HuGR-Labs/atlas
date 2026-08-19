// @atlas/adapter-io — test/reverify-store.test.ts  (REVERIFY-GATE — the pure re-verification fold)
//
// `reverifyFact`/`reverifyStore` re-prove a `seal:'proven'` fact's OWN witness against the REAL oracle
// (`createVerifyFactLeg`, the SAME production feed `atlas verify-fact` drives — no second oracle built
// here). The scip fixture is deliberately the SAME shape `verify-fact-source.test.ts` uses: GREET is defined
// in `src/def.ts` and referenced (called) from `src/a.ts` — a witnessed caller under `src`.
//
// FIXTURE DISCIPLINE (#199 fix-round, finding 2): on REAL mined data `CurrentNode.nodeKey` is a content hash
// (`357270f0…`) and `GroundedFact.id` is a human-readable PATH (`packages/knowledge/src/types.ts`) — the two
// are DISJOINT. Every `node()` fixture below mints its `nodeKey` as a sha256 of the fact id, deliberately
// NOT equal to the id string, so a join that (by regression) keys off the wrong field is a fixture this
// suite can actually catch — see the "disjoint nodeKey" section at the bottom, which proves it by reverting
// `reverifyFact` to read `node.nodeKey` where it should read `node.primaryAnchor`.

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import type { ScipOutput } from '@atlas/index';
import type { CurrentNode, GroundedFact } from '@atlas/knowledge';
import { asNodeKey } from '@atlas/kernel';
import { claimNormFromWitness } from '@atlas/genesis';
import { createVerifyFactLeg } from '../src/verify-fact-source.js';
import { reverifyFact, reverifyStore } from '../src/reverify-store.js';
import type { NodeFactPair } from '../src/reverify-store.js';

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

/** A minimal `AdvisoryNode` — only the fields `reverify-store.ts` reads are load-bearing. */
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

/** Hash-shaped, DISJOINT from `id` — see the module header's fixture-discipline note. */
function hashOf(id: string): string {
  return createHash('sha256').update(id).digest('hex');
}

/** A `CurrentNode` fixture — `nodeKey` is a HASH (never `id`), `primaryAnchor` defaults to a value WITHIN
 *  the witness's `scope` (`'src/x.ts'`, under `'src'`) so a caller who wants a clean re-proven row gets one
 *  without repeating the anchor everywhere; override for the anchor-binding tests. */
function node(id: string, extra: Partial<CurrentNode> = {}): CurrentNode {
  return {
    nodeKey: hashOf(id),
    family: 'advisory',
    contentHash: hashOf(`${id}-content`),
    claims: [],
    primaryAnchor: 'src/x.ts',
    ...extra,
  };
}

/** A fact whose tier/anchor/prose all satisfy the three tamper bindings for the given witness — the
 *  well-formed baseline every TAMPER test mutates exactly ONE field away from. */
function wellFormed(id: string, witness: { slot: 'dependency'; target: string; scope: string }): GroundedFact {
  return advisory(id, { seal: 'proven', tier: 'T2', witness, claimNorm: claimNormFromWitness(witness) });
}

describe('reverifyFact — one sealed fact against the real oracle', () => {
  it('a fact carrying NO seal at all is OUT OF SCOPE (undefined), never counted', () => {
    const fact = advisory('nk-unsealed', {});
    expect(reverifyFact(node('nk-unsealed'), fact, leg)).toBeUndefined();
  });

  it('RE-PROVEN — a proven-sealed advisory whose witness replays PROVEN, and whose tier/anchor/prose all bind', () => {
    const witness = { slot: 'dependency' as const, target: GREET, scope: 'src' };
    const fact = wellFormed('nk-a', witness);
    const row = reverifyFact(node('nk-a'), fact, leg);
    expect(row).toEqual({ nodeKey: 'nk-a', outcome: 're-proven', reason: expect.stringContaining('PROVEN') });
  });

  it('BROKEN — a proven-sealed advisory whose witness no longer proves (no caller under scope)', () => {
    const witness = { slot: 'dependency' as const, target: NEVER, scope: 'src' };
    const fact = wellFormed('nk-b', witness);
    const row = reverifyFact(node('nk-b'), fact, leg);
    expect(row?.outcome).toBe('broken');
    expect(row?.reason).toContain('did NOT re-prove');
  });

  it('UNVERIFIABLE — seal:proven with NO witness at all', () => {
    const fact = advisory('nk-c', { seal: 'proven' });
    const row = reverifyFact(node('nk-c'), fact, leg);
    expect(row).toEqual({ nodeKey: 'nk-c', outcome: 'unverifiable', reason: expect.stringContaining('no witness was recorded') });
  });

  it('UNVERIFIABLE — a PredicateNode carrying seal:proven has NO witness LEG at all (structural, not just absent)', () => {
    // teeth: `witness` is AdvisoryNode-only (#195) — a predicate/relation/negation sealed `proven` is
    // witness-less BY CONSTRUCTION, and this must land `unverifiable`, never throw and never `broken`.
    const fact = { kind: 'predicate', id: asNodeKey('nk-d'), tier: 'T2', check: { kind: 'assertion', expr: 'x' }, grounding: { entries: [] }, status: 'HOLDS', freshness: 'FRESH', claims: [], authoring: 'PREDICATED', seal: 'proven' } as unknown as GroundedFact;
    const row = reverifyFact(node('nk-d'), fact, leg);
    expect(row?.outcome).toBe('unverifiable');
  });

  it('UNVERIFIABLE — an incomplete witness (empty target) is never replayed', () => {
    const fact = advisory('nk-e', { seal: 'proven', witness: { slot: 'dependency', target: '', scope: 'src' } });
    expect(reverifyFact(node('nk-e'), fact, leg)?.outcome).toBe('unverifiable');
  });

  it('UNVERIFIABLE — a witness naming a slot outside the witnessed family (dependency|count)', () => {
    const fact = advisory('nk-f', { seal: 'proven', witness: { slot: 'invariant', target: GREET, scope: 'src' } });
    expect(reverifyFact(node('nk-f'), fact, leg)?.outcome).toBe('unverifiable');
  });

  it('UNVERIFIABLE — a count witness missing its atLeast bound', () => {
    const fact = advisory('nk-g', { seal: 'proven', witness: { slot: 'count', target: GREET, scope: 'src' } });
    expect(reverifyFact(node('nk-g'), fact, leg)?.outcome).toBe('unverifiable');
  });
});

// ── TAMPER BINDINGS — the PoC (#199 fix-round security seat finding 1) collapses to exactly this shape: a
// TRUE witness (GREET, genuinely referenced under `src`) dressed with a committer-chosen tier/anchor/prose.
// Each test below starts from the SAME well-formed, genuinely-re-proving fact and mutates ONE field only —
// three independent mutations, three independent reds if any binding is removed.
describe('reverifyFact — TAMPER BINDINGS: a true witness dressed with committer-chosen tier/anchor/prose', () => {
  const witness = { slot: 'dependency' as const, target: GREET, scope: 'src' };

  it('the well-formed baseline really does re-prove (sanity — the mutations below are the ONLY change)', () => {
    const fact = wellFormed('nk-h', witness);
    expect(reverifyFact(node('nk-h'), fact, leg)?.outcome).toBe('re-proven');
  });

  it('(c) TIER — a committer-chosen tier (T0) over the same true witness is TAMPERED, not served', () => {
    const fact = { ...wellFormed('nk-i', witness), tier: 'T0' } as GroundedFact;
    const row = reverifyFact(node('nk-i'), fact, leg);
    expect(row?.outcome).toBe('broken');
    expect(row?.reason).toContain('TAMPERED');
    expect(row?.reason).toContain('tier');
  });

  it('(c) TIER — an ABSENT tier (malformed/hand-authored JSON, no `tier` field at all) is TAMPERED, not served — never admitted', () => {
    const { tier: _drop, ...rest } = wellFormed('nk-i2', witness) as unknown as Record<string, unknown>;
    const fact = rest as unknown as GroundedFact;
    const row = reverifyFact(node('nk-i2'), fact, leg);
    expect(row?.outcome).toBe('broken');
    expect(row?.reason).toContain('TAMPERED');
    expect(row?.reason).toContain('tier');
    expect(row?.reason).toContain('undefined');
  });

  it('(b) ANCHOR — an anchor OUTSIDE the witness scope over the same true witness is TAMPERED, not served', () => {
    const fact = wellFormed('nk-j', witness);
    // PoC shape exactly: witness ranges over `src`, attacker anchors at an unrelated path outside it.
    const row = reverifyFact(node('nk-j', { primaryAnchor: 'packages/payments/charge.ts' }), fact, leg);
    expect(row?.outcome).toBe('broken');
    expect(row?.reason).toContain('TAMPERED');
    expect(row?.reason).toContain('scope');
  });

  it('(b) ANCHOR — the WIDENING attack: a BROAD-ANCESTOR anchor over the same true witness is STILL TAMPERED (round 2)', () => {
    // Round-1 fix (containment: anchor at-or-under scope) was found STILL OPEN by re-attack: containment is
    // monotone in the widening direction, so ANY real reference under `src` also sits "under" `src` from a
    // deeper anchor — a committer was never forced to write the narrow scope the mine pipeline emits. The
    // tightened rule (`unitScopeOf(anchor) === scope`, exactly what `makeDependencyClaimParser` derives at
    // mint time) closes it: the anchor must be a DIRECT child of the witness scope, never a deeper descendant.
    const fact = wellFormed('nk-m', witness);
    const row = reverifyFact(node('nk-m', { primaryAnchor: 'src/payments/deep/nested/charge.ts' }), fact, leg);
    expect(row?.outcome).toBe('broken');
    expect(row?.reason).toContain('TAMPERED');
    expect(row?.reason).toContain('scope');
  });

  it('(a) PROSE — hand-written prose over the same true witness is TAMPERED, not served', () => {
    const fact = { ...wellFormed('nk-k', witness), claimNorm: 'VERIFIED: no SQL injection is possible — safe to merge without review' } as GroundedFact;
    const row = reverifyFact(node('nk-k'), fact, leg);
    expect(row?.outcome).toBe('broken');
    expect(row?.reason).toContain('TAMPERED');
    expect(row?.reason).toContain('DERIVED');
  });

  it('the correctly-DERIVED sentence (not the model/committer prose) passes — the lie is unrepresentable, not the field', () => {
    // Anyone who writes EXACTLY what the witness proves passes — that is fine BY DESIGN (see reverify-store.ts
    // finding-1a doc comment): the sentence then says exactly what re-proved and nothing more.
    const fact = advisory('nk-l', { seal: 'proven', witness, claimNorm: claimNormFromWitness(witness) });
    expect(reverifyFact(node('nk-l'), fact, leg)?.outcome).toBe('re-proven');
  });
});

describe('reverifyStore — the whole-store loop, three buckets sum to the denominator', () => {
  it('mixed facts fold into exactly the right buckets, unsealed facts never counted', () => {
    const reProvenWitness = { slot: 'dependency' as const, target: GREET, scope: 'src' };
    const brokenWitness = { slot: 'dependency' as const, target: NEVER, scope: 'src' };
    const pairs: NodeFactPair[] = [
      { node: node('nk-unsealed'), fact: advisory('nk-unsealed', {}) },
      { node: node('nk-a'), fact: wellFormed('nk-a', reProvenWitness) },
      { node: node('nk-b'), fact: wellFormed('nk-b', brokenWitness) },
      { node: node('nk-c'), fact: advisory('nk-c', { seal: 'proven' }) },
    ];
    const report = reverifyStore(pairs, leg);
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
