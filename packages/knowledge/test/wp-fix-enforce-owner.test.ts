// @atlas/knowledge — test/wp-fix-enforce-owner.test.ts  (#178 · WP-fix-enforce-owner)
//
// KNOW-11a says every fact carries owner + scope. `scope` was genuinely enforced (`isScope`/`inScope`,
// fail-closed); `owner` was enforced by NOTHING — `template.ts` said "enforced fail-closed by the sibling
// authz facet", `authz.ts` said "not re-checked here". Both were true about the OTHER file and false about
// itself. This is a NEW file (never edits `wp-5.14-know.lifecycle.test.ts`, which another seat may own).
//
// What is pinned here, mirroring the SCN-KNOW-11 family style already used by the sibling suite:
//   1. The coercion table for `isOwner` — the exact counterpart of `isScope`'s discipline (typeof-first).
//   2. `authz('write', …)` now fails closed on an ABSENT owner even when scope is well-formed and the
//      actor is genuinely in scope — the gap #178 named. RED on the pre-fix `authz.ts` (proven below by
//      restoring the pre-fix file byte-for-byte and watching this go red).
//   3. The negative direction: a write WITH a well-formed owner still succeeds (not a refuse-everything
//      guard), and a READ of an owner-less fact still succeeds (KNOW-11b universal read, untouched).

import { describe, it, expect } from 'vitest';
import { asNodeKey, asSubtreeHash } from '@atlas/kernel';
import type { AdvisoryNode } from '@atlas/knowledge';
import type { Grounding } from '@atlas/grounding';
import { authz, isOwner } from '../src/write/authz.js';

const grounding = (n: string): Grounding => ({
  entries: [{ anchor: { kind: 'symbol', qualifiedPath: `fn ${n}`, subtreeHash: asSubtreeHash(`st-${n}`) }, path: 'src/x.ts' }],
});

/** An `AdvisoryNode` fixture with an explicit (possibly absent) `owner`/`scope`, mirroring the sibling
 *  suite's `advisoryNode` builder. `owner`/`scope` are R3-optional — genuinely absent when omitted. */
const advisoryNode = (nk: string, opts: { owner?: string; scope?: string } = {}): AdvisoryNode => ({
  kind: 'advisory',
  id: asNodeKey(nk),
  tier: 'T2',
  claimNorm: `cn-${nk}`,
  grounding: grounding(nk),
  freshness: 'FRESH',
  claims: [],
  authoring: 'ADVISORY',
  ...(opts.owner !== undefined ? { owner: opts.owner } : {}),
  ...(opts.scope !== undefined ? { scope: opts.scope } : {}),
});

describe('#178 — KNOW-11a owner fence: isOwner coercion surface', () => {
  // The coercion table — printed so a reviewer can read the whole validity product at a glance. Only a
  // non-empty string may pass; every coercion-hazard shape (property-key coercion, `toString`/`valueOf`
  // objects, falsy-but-typed values) must fail CLOSED, exactly as `isScope`/`isTier` already require.
  const cases: ReadonlyArray<readonly [string, unknown, boolean]> = [
    ['undefined', undefined, false],
    ['null', null, false],
    ["''", '', false],
    ['0', 0, false],
    ['false', false, false],
    ['{}', {}, false],
    ['[]', [], false],
    ["['seat/forge']", ['seat/forge'], false], // array coercion hazard — reads as the string via property-key coercion elsewhere, must NOT pass isOwner
    ["{toString:() => 'seat/forge'}", { toString: () => 'seat/forge' }, false], // valueOf/toString coercion hazard
    ["'seat/forge'", 'seat/forge', true], // the one legal shape
  ];

  it.each(cases)('isOwner(%s) → %s', (_label, value, expected) => {
    expect(isOwner(value)).toBe(expected);
  });

  it('prints the full coercion table (for the review record)', () => {
    const table = cases.map(([label, value, expected]) => ({ input: label, isOwner: isOwner(value), expected }));
    // eslint-disable-next-line no-console
    console.log(table);
    for (const row of table) expect(row.isOwner).toBe(row.expected);
  });
});

describe('#178 — KNOW-11a owner fence folded into authz() write branch', () => {
  it('a write with well-formed owner AND scope still succeeds (not a refuse-everything guard)', () => {
    const fact = advisoryNode('nk-owned', { owner: 'seat/forge', scope: 'A' });
    expect(authz('write', 'A', fact)).toBe(true);
  });

  it('THE GAP — a write with well-formed scope, actor genuinely in scope, but NO owner now fails closed', () => {
    // Before #178 this returned `true`: `authz`'s write branch read only `inScope(actor, fact.scope)` and
    // never looked at `fact.owner` at all — the exact defect the tech-lead brief names (template.ts pointed
    // at authz.ts, authz.ts said "not re-checked here"). This is the assertion that is RED on the pre-fix
    // file and GREEN after — see the byte-level round trip recorded in the seat's report.
    const unowned = advisoryNode('nk-unowned', { scope: 'A' }); // scope present, owner ABSENT
    expect(authz('write', 'A', unowned)).toBe(false);
  });

  it('an owner that is present but malformed (empty string) also fails closed', () => {
    const emptyOwner = advisoryNode('nk-empty-owner', { owner: '', scope: 'A' });
    expect(authz('write', 'A', emptyOwner)).toBe(false);
  });

  it('READ STAYS UNIVERSAL — a read of an owner-less (and scope-less) fact still succeeds (KNOW-11b, untouched)', () => {
    const bare = advisoryNode('nk-bare'); // no owner, no scope at all
    expect(authz('read', 'anyone', bare)).toBe(true);
    expect(authz('read', '', bare)).toBe(true); // even an empty actor string reads fine — read is universal
  });

  it('a well-formed owner does not override the scope leg — a wrong-scope actor is still denied', () => {
    const fact = advisoryNode('nk-owned-b', { owner: 'seat/forge', scope: 'A' });
    expect(authz('write', 'B', fact)).toBe(false); // B is not in scope A, regardless of owner well-formedness
  });
});
