// @atlas/knowledge — test/wp-owner-not-required.test.ts  (#187 · WP-SEC-3.KNOW)
//
// #178/PR#105 folded an `isOwner` guard into `authz()`'s write branch and pinned it in
// `wp-fix-enforce-owner.test.ts`. #187 (owner-ratified 2026-08-03) reverses that fold-in — `owner` is
// removed from KNOW-11a's MUST; `scope` is the SOLE ownership anchor — and the pinning test file is
// deleted along with the code it pinned. This is a NEW file, not an edit of `wp-fix-enforce-owner.test.ts`
// (deleted) or `wp-5.14-know.lifecycle.test.ts` (another seat's frozen-golden suite, edited only to drop
// the now-nonexistent `owner` field from its fixtures/assertions — see that file's own diff).
//
// What is pinned here, so the scope half of the fence does not lose coverage because the owner half left:
//   1. The coercion table for `isScope` — re-run and printed, exactly as tight as `isOwner`'s was.
//   2. THE FENCE, both directions: a well-formed scope + in-scope actor ⇒ write SUCCEEDS; an absent OR
//      malformed scope ⇒ write REFUSED (fail-closed, unconditionally — `isScope`'s path is untouched by
//      #187); an out-of-scope actor ⇒ write REFUSED.
//   3. READ IS UNIVERSAL: a read of a scope-less fact succeeds for ANY actor, including `''`.

import { describe, it, expect } from 'vitest';
import { asNodeKey, asSubtreeHash } from '@atlas/kernel';
import type { AdvisoryNode } from '@atlas/knowledge';
import type { Grounding } from '@atlas/grounding';
import { authz, inScope, isScope } from '../src/write/authz.js';

const grounding = (n: string): Grounding => ({
  entries: [{ anchor: { kind: 'symbol', qualifiedPath: `fn ${n}`, subtreeHash: asSubtreeHash(`st-${n}`) }, path: 'src/x.ts' }],
});

/** An `AdvisoryNode` fixture with an explicit (possibly absent) `scope`. No `owner` leg — the field no
 *  longer exists on the frozen `GroundedFact` (#187). */
const advisoryNode = (nk: string, opts: { scope?: string } = {}): AdvisoryNode => ({
  kind: 'advisory',
  id: asNodeKey(nk),
  tier: 'T2',
  claimNorm: `cn-${nk}`,
  grounding: grounding(nk),
  freshness: 'FRESH',
  claims: [],
  authoring: 'ADVISORY',
  ...(opts.scope !== undefined ? { scope: opts.scope } : {}),
});

describe('#187 — KNOW-11a scope fence: isScope coercion surface (re-pinned, unchanged by the amendment)', () => {
  // The coercion table — printed so a reviewer can read the whole validity product at a glance. Only a
  // non-empty string may pass; every coercion-hazard shape (property-key coercion, `toString`/`valueOf`
  // objects, falsy-but-typed values) must fail CLOSED. `isScope` itself is untouched by #187 — this table
  // is a RE-RUN, not a new claim, so the surviving guard is pinned as tightly as the removed `isOwner` was.
  const cases: ReadonlyArray<readonly [string, unknown, boolean]> = [
    ['undefined', undefined, false],
    ['null', null, false],
    ["''", '', false],
    ['0', 0, false],
    ['false', false, false],
    ['{}', {}, false],
    ['[]', [], false],
    ["['core']", ['core'], false], // array coercion hazard — reads as the string via property-key coercion elsewhere, must NOT pass isScope
    ["{toString:() => 'core'}", { toString: () => 'core' }, false], // valueOf/toString coercion hazard
    ["'core'", 'core', true], // the one legal shape
  ];

  it.each(cases)('isScope(%s) → %s', (_label, value, expected) => {
    expect(isScope(value)).toBe(expected);
  });

  it('prints the full coercion table (for the review record)', () => {
    const table = cases.map(([label, value, expected]) => ({ input: label, isScope: isScope(value), expected }));
    // eslint-disable-next-line no-console
    console.log(table);
    for (const row of table) expect(row.isScope).toBe(row.expected);
  });
});

describe('#187 — the scope fence, standing alone (owner is not a gate input)', () => {
  it('a write with a well-formed scope by an in-scope actor SUCCEEDS', () => {
    const fact = advisoryNode('nk-scoped', { scope: 'A' });
    expect(authz('write', 'A', fact)).toBe(true);
    expect(inScope('A', 'A')).toBe(true);
  });

  it('a write with an ABSENT scope is REFUSED — fail-closed, no ownership anchor', () => {
    const scopeless = advisoryNode('nk-scopeless'); // no scope at all
    expect(authz('write', 'A', scopeless)).toBe(false);
    expect(inScope('A', undefined)).toBe(false);
  });

  it('a write with a MALFORMED scope (empty string) is REFUSED — fail-closed', () => {
    const emptyScope = advisoryNode('nk-empty-scope', { scope: '' });
    expect(authz('write', 'A', emptyScope)).toBe(false);
    expect(inScope('A', '')).toBe(false);
  });

  it('a write by an OUT-OF-SCOPE actor is REFUSED, even though the fact IS well-formed', () => {
    const fact = advisoryNode('nk-scoped-b', { scope: 'A' });
    expect(authz('write', 'B', fact)).toBe(false); // B is not in scope A
    expect(inScope('B', 'A')).toBe(false);
  });

  it('READ IS UNIVERSAL — a read of a scope-less fact succeeds for ANY actor, including the empty string', () => {
    const bare = advisoryNode('nk-bare'); // no scope at all
    expect(authz('read', 'anyone', bare)).toBe(true);
    expect(authz('read', '', bare)).toBe(true); // even an empty actor string reads fine — read is universal
    // a scoped fact reads the same way for a caller OUTSIDE its scope — the read leg never inspects scope.
    const scoped = advisoryNode('nk-scoped-c', { scope: 'A' });
    expect(authz('read', 'B', scoped)).toBe(true);
    expect(authz('read', '', scoped)).toBe(true);
  });
});
