// @atlas/genesis — src/verify-negation.test.ts  (spike/verify-fact — the NEGATION class)
//
// `verifyNegation` over the SAME in-memory `SymbolReverseApi` fake + identity `pathOfHash` the dependency
// and count oracles use. The soundness the fixtures pin is the DUAL of the dependency oracle: REFUTE is the
// any-world-sound direction (a witnessed caller in scope), PROVE is the closed-world one (no caller AND no
// hole in the world). A phantom target abstains (#220) — never a vacuous proven.

import { describe, it, expect } from 'vitest';
import type { Hash } from '@atlas/contracts';
import type { SymbolReverseApi } from '@atlas/index';
import { verifyNegation } from './verify-negation.js';
import type { NegationClaim } from './verify-negation.js';

const TARGET = 'scip:X#';
const SOURCE = 'src/pay';
const WORLD = 'src';

const pathOfHash = (h: Hash): string | undefined => String(h);
const isLocal = (sym: string): boolean => sym.startsWith('local ');

function feed(opts: {
  callers?: readonly string[];
  holes?: readonly string[];
  resolvesTarget?: boolean;
}): SymbolReverseApi {
  const { callers = [], holes = [], resolvesTarget = true } = opts;
  return {
    reverseCallers: (sym: string) => (sym === TARGET ? (callers as unknown as readonly Hash[]) : []),
    holeSources: () => holes as unknown as readonly Hash[],
    resolves: (sym: string) => sym === TARGET && resolvesTarget,
  };
}

const claim = (over: Partial<NegationClaim> = {}): NegationClaim => ({
  sourceScope: SOURCE,
  target: TARGET,
  worldScope: WORLD,
  ...over,
});

describe('verifyNegation — the DUAL of the dependency oracle (refute any-world, prove closed-world)', () => {
  it('refuted: a witnessed caller under sourceScope — the negation is false, SOUND IN ANY WORLD (even with holes)', () => {
    const reverse = feed({ callers: ['src/pay/a.ts'], holes: ['src/pay/hole.ts'] }); // hole present, yet refute still sound
    expect(verifyNegation(claim(), reverse, pathOfHash, isLocal)).toEqual({
      verdict: 'refuted',
      oracle: 'symbol-reverse',
    });
  });

  it('proven: no caller under sourceScope AND the world is CLOSED (no hole in worldScope)', () => {
    const reverse = feed({ callers: [], holes: ['other/unrelated.ts'] }); // hole OUTSIDE world='src'
    expect(verifyNegation(claim(), reverse, pathOfHash, isLocal)).toEqual({
      verdict: 'proven',
      oracle: 'symbol-reverse',
    });
  });

  it("abstain('scope-open'): no caller, but a hole lies UNDER worldScope — an unseen caller could exist", () => {
    const reverse = feed({ callers: [], holes: ['src/pay/hole.ts'] }); // hole IS under world='src'
    expect(verifyNegation(claim(), reverse, pathOfHash, isLocal)).toEqual({
      verdict: 'abstain',
      reason: 'scope-open',
      oracle: 'symbol-reverse',
    });
  });

  it("abstain('target-unresolvable'): a phantom target (#220) — reverseCallers is [] by construction, so 'no caller' must NOT prove the negation", () => {
    const reverse = feed({ callers: [], resolvesTarget: false });
    expect(verifyNegation(claim(), reverse, pathOfHash, isLocal)).toEqual({
      verdict: 'abstain',
      reason: 'target-unresolvable',
      oracle: 'symbol-reverse',
    });
  });

  it("abstain('target-not-global'): a `local ` SCIP symbol (document-scoped, #99b v1)", () => {
    const reverse = feed({ callers: [] });
    expect(verifyNegation(claim({ target: 'local 3' }), reverse, pathOfHash, isLocal)).toEqual({
      verdict: 'abstain',
      reason: 'target-not-global',
      oracle: 'symbol-reverse',
    });
  });

  it("abstain('malformed'): an empty sourceScope/target/worldScope", () => {
    const reverse = feed({ callers: [] });
    for (const bad of [{ sourceScope: '' }, { target: '' }, { worldScope: '' }] as Partial<NegationClaim>[]) {
      expect(verifyNegation(claim(bad), reverse, pathOfHash, isLocal)).toEqual({
        verdict: 'abstain',
        reason: 'malformed',
        oracle: 'symbol-reverse',
      });
    }
  });

  // TEETH (0-FP floor): the REFUTE branch's sourceScope containment MUST be segment-wise, never a substring.
  // A caller in a SIBLING dir that only STRING-prefixes sourceScope (`src/pay` ⊂ `src/paycheck`, the #153
  // trap) is NOT under `src/pay`, so it must NOT refute the negation over `src/pay`. With the world also
  // closed (that sibling is not a hole), the honest verdict is PROVEN, not a false REFUTE. This kills the
  // `underScope`→`.includes` drift mutant (which would wrongly refute).
  it("NOT refuted: a caller in a sibling dir that only STRING-prefixes sourceScope does not refute (#153)", () => {
    const reverse = feed({ callers: ['src/paycheck/billing.ts'] }); // caller exists, but NOT under 'src/pay'
    expect(verifyNegation(claim(), reverse, pathOfHash, isLocal)).toEqual({
      verdict: 'proven', // no caller under sourceScope, world closed (the sibling is a resolved caller, not a hole)
      oracle: 'symbol-reverse',
    });
  });

  // TEETH: the same segment-wise discipline on the worldScope hole test. A hole in a sibling dir that only
  // string-prefixes worldScope must NOT open the world — else a `.includes` drift flips a provable negation
  // to a false 'scope-open' abstain.
  it("proven, not 'scope-open': a hole in a sibling dir only STRING-prefixing worldScope does not open the world (#153)", () => {
    const reverse = feed({ callers: [], holes: ['src/paycheck/hole.ts'] });
    // world='src/pay'; the hole 'src/paycheck/hole.ts' is NOT under it ⇒ world closed ⇒ negation provable.
    expect(verifyNegation(claim({ worldScope: 'src/pay' }), reverse, pathOfHash, isLocal)).toEqual({
      verdict: 'proven',
      oracle: 'symbol-reverse',
    });
  });

  it('determinism: identical inputs ⇒ identical verdict', () => {
    const reverse = feed({ callers: ['src/pay/a.ts'] });
    const a = verifyNegation(claim(), reverse, pathOfHash, isLocal);
    const b = verifyNegation(claim(), reverse, pathOfHash, isLocal);
    expect(a).toEqual(b);
  });
});
