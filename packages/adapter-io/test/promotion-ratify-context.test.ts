// @atlas/adapter-io — test/promotion-ratify-context.test.ts  (the CONTEXT the write door hands to `route`)
//
// `governed-emit-route.ts` is the seam that answers "which gate does this write owe". Two fields on it are
// DOOR-DERIVED (ARCH-9): `derivedTier` (pinned by `arch9-door-derivation.test.ts`) and `origin`. This file
// pins the second, at the seam itself rather than at a literal a test wrote — because the door calls
// `ratifyCtxFor`, and a test that agrees with its own hand-built context proves nothing about the door.

import { describe, it, expect } from 'vitest';
import { route } from '@atlas/knowledge';
import type { Candidate } from '@atlas/knowledge';
import { ratifyCtxFor } from '../src/governed-emit-route.js';
import { minedFact } from './harness/promote-fixtures.js';

const staged = (): Candidate => minedFact({ anchor: 'src/pay.ts::charge', claimNorm: 'a mined claim' }) as unknown as Candidate;

describe('ARCH-9/KNOW-8 — `ratifyCtxFor` carries the origin without forging store state', () => {
  it('the AUTHORED context is byte-identical to what it always was (no origin key at all)', () => {
    // Back-compat, asserted on the WHOLE object: `wire.ts` passes no origin, so an emit through the handler
    // must build exactly the pre-existing `{contested:false, lowRisk:true}` — not that plus a defaulted key.
    expect(ratifyCtxFor(undefined)).toEqual({ contested: false, lowRisk: true });
    expect('origin' in ratifyCtxFor(undefined)).toBe(false);
    expect(ratifyCtxFor('T0')).toEqual({ contested: false, lowRisk: true, derivedTier: 'T0' });
  });

  it('the PROMOTED context adds ONE true field and changes nothing else', () => {
    // teeth: breaks-on "route the promotion by forging `contested:true`" and on "…by forging `lowRisk:false`".
    // Both would make `route` answer `full-ratify` and both would pass a test that only checked the route —
    // which is why the assertion is on the CONTEXT, by equality, and not on the routing outcome alone.
    expect(ratifyCtxFor(undefined, 'promoted')).toEqual({ contested: false, lowRisk: true, origin: 'promoted' });
    expect(ratifyCtxFor('T2', 'promoted')).toEqual({ contested: false, lowRisk: true, derivedTier: 'T2', origin: 'promoted' });
  });

  it('and that context really does take a mined candidate to FULL RATIFICATION', () => {
    // The two halves joined: the context the DOOR builds, handed to the frozen `route` the DOOR calls.
    // teeth: breaks-on "the default context is used" — pass `ratifyCtxFor(derivedTier)` at the emit door's
    // gate 2.5 and this reads `auto-accept`, i.e. no ratifier is consulted for a promotion.
    expect(route(staged(), ratifyCtxFor(undefined))).toBe('auto-accept'); // the trap, measured
    expect(route(staged(), ratifyCtxFor(undefined, 'promoted'))).toBe('full-ratify'); // the fix
    expect(route(staged(), ratifyCtxFor(undefined, 'authored'))).toBe('auto-accept'); // explicit ≡ absent
  });
});
