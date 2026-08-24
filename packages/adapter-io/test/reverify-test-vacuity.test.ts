// @atlas/adapter-io — test/reverify-test-vacuity.test.ts  (#95 · ADR-0015 D5 — the test-vacuity reverify arm)
//
// The read-side re-proof of a `seal:'proven'` test-vacuity fact. `reverifyFact` routes `kind:'test-vacuity'` to
// `reverifyTestVacuity`, which RE-RUNS `scanTestVacuity` over the unit at HEAD (the injected `replay` leg): a
// fact with (shape, testName) still present ⇒ `re-proven`; absent (the test changed / vanished) ⇒ `broken`; a
// witness-less proven seal, or no replay leg wired, ⇒ `unverifiable` (the trust-me-it-was-proved shape, never a
// pass). A `justified`/unsealed test-vacuity is OUT of the proven-only gate (undefined, uncounted).

import { describe, it, expect } from 'vitest';
import type { CurrentNode, GroundedFact } from '@atlas/knowledge';
import { reverifyFact, reverifyTestVacuity, type TestVacuityReplay } from '../src/reverify-store.js';

const UNIT = 'src/foo.test.ts';
const NAME = 'swallows the rejection';

const fact = (over: Partial<GroundedFact> = {}): GroundedFact => ({
  kind: 'test-vacuity',
  id: 'tvk' as unknown as GroundedFact['id'],
  tier: 'T2',
  unitKey: UNIT,
  testName: NAME,
  shape: 'assertion-only-in-catch',
  grounding: { entries: [] },
  freshness: 'FRESH',
  claims: [],
  authoring: 'PROVEN',
  seal: 'proven',
  witness: { shape: 'assertion-only-in-catch', testName: NAME },
  ...over,
} as GroundedFact);

const node: CurrentNode = { nodeKey: 'tvk', family: 'test-vacuity', contentHash: 'ch', claims: [], primaryAnchor: UNIT } as unknown as CurrentNode;

/** The proven fact with a named key OMITTED entirely (never set to `undefined` — exactOptionalPropertyTypes). */
const factWithout = (key: 'witness' | 'seal'): GroundedFact => {
  const { [key]: _dropped, ...rest } = fact() as unknown as Record<string, unknown>;
  return rest as unknown as GroundedFact;
};

// the SCIP oracle / existence stubs are NEVER consulted for a test-vacuity (it routes to reverifyTestVacuity
// before them) — a throwing leg proves they are not reached.
const THROW_LEG = (() => { throw new Error('SCIP oracle must NOT be called for a test-vacuity'); }) as never;
const STUBS = [() => true, () => true] as const;

const STILL_HOLDS: TestVacuityReplay = () => 'proven';
const CHANGED: TestVacuityReplay = () => 'abstain';

describe('reverifyTestVacuity — re-run scanTestVacuity at HEAD', () => {
  it('the test STILL HOLDS the shape at HEAD ⇒ re-proven', () => {
    const row = reverifyFact(node, fact(), THROW_LEG, STUBS[0], STUBS[1], STILL_HOLDS);
    expect(row?.outcome).toBe('re-proven');
    expect(row?.reason).toMatch(/still holds/);
  });

  it('the test CHANGED (no longer proven at HEAD) ⇒ broken', () => {
    const row = reverifyFact(node, fact(), THROW_LEG, STUBS[0], STUBS[1], CHANGED);
    expect(row?.outcome).toBe('broken');
    expect(row?.reason).toMatch(/no longer appears/);
  });

  it('a proven seal with NO witness ⇒ unverifiable (nothing to replay — never a pass)', () => {
    const row = reverifyFact(node, factWithout('witness'), THROW_LEG, STUBS[0], STUBS[1], STILL_HOLDS);
    expect(row?.outcome).toBe('unverifiable');
  });

  it('no replay leg wired ⇒ unverifiable (fail-closed, never a false re-prove)', () => {
    const row = reverifyFact(node, fact(), THROW_LEG, STUBS[0], STUBS[1]); // replay omitted
    expect(row?.outcome).toBe('unverifiable');
  });

  it('a justified/unsealed test-vacuity is OUT of the proven-only gate ⇒ undefined (uncounted)', () => {
    expect(reverifyFact(node, fact({ seal: 'justified' }), THROW_LEG, STUBS[0], STUBS[1], STILL_HOLDS)).toBeUndefined();
    expect(reverifyFact(node, factWithout('seal'), THROW_LEG, STUBS[0], STUBS[1], STILL_HOLDS)).toBeUndefined();
  });

  it('reverifyTestVacuity directly: incomplete witness (empty testName) ⇒ unverifiable', () => {
    const row = reverifyTestVacuity('tvk', fact({ witness: { shape: 'assertion-only-in-catch', testName: '' } }) as never, STILL_HOLDS);
    expect(row.outcome).toBe('unverifiable');
  });
});
