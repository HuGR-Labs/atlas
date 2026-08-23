// @atlas/genesis — src/verify-fact-relation.test.ts  (#99 sound relation, ADR-0018 — WP-96-R2)
//
// The relation oracle `verifyRelation` over the SAME in-memory `SymbolReverseApi` fake + identity `pathOfHash`
// the dependency oracle's tests use (verify-fact.test.ts). Pure unit tests: no store, no disk, no model —
// `verifyRelation` alone. Pins the acceptance items the oracle owns: AR-1 (proven depends-on), AR-3
// (local/unresolvable target → abstain), AR-5 (calls never provable), AR-17 (reflection/dynamic/cross-language
// unresolvable edge is a NAMED honest boundary, not a proof).

import { describe, it, expect } from 'vitest';
import type { Hash } from '@atlas/contracts';
import type { SymbolReverseApi } from '@atlas/index';
import { verifyRelation } from './verify-fact.js';
import type { RelationClaim } from './verify-fact.js';

const TARGET = 'scip:B#'; // a GLOBAL SCIP symbol under endpointB (not `local `)
const SOURCE = 'src/a'; // endpointA's verify-scope the witnessed reference must lie under

/** identity `pathOfHash`: the "hash" of a path IS the path (mirrors verify-fact.test.ts). */
const pathOfHash = (h: Hash): string | undefined => String(h);

/** `isLocal`: the real `local ` SCIP-symbol grammar (mirrors `@atlas/index`'s `isLocalSymbol`). */
const isLocal = (sym: string): boolean => sym.startsWith('local ');

/** A fake N0 feed: `reverseCallers(target)` names paths (identity-hashed); `resolves(target)` defaults true. */
function feed(opts: { callers?: readonly string[]; resolvesTarget?: boolean }): SymbolReverseApi {
  const { callers = [], resolvesTarget = true } = opts;
  return {
    reverseCallers: (sym: string) => (sym === TARGET ? (callers as unknown as readonly Hash[]) : []),
    holeSources: () => [],
    opaqueRefSources: () => [],
    resolves: (sym: string) => sym === TARGET && resolvesTarget,
    definesAt: (sym: string) => (sym === TARGET && resolvesTarget ? ('src/b.ts' as unknown as Hash) : undefined),
  };
}

const claim = (over: Partial<RelationClaim> = {}): RelationClaim => ({
  relationKind: 'depends-on',
  target: TARGET,
  sourceScope: SOURCE,
  ...over,
});

describe('verifyRelation — the directed-edge oracle of the PROVEN family (#99, ADR-0018)', () => {
  it('AR-1 proven: a resolved reference to the target lies under sourceScope ⇒ a proven depends-on edge', () => {
    const reverse = feed({ callers: ['src/a/uses-b.ts'] });
    expect(verifyRelation(claim(), reverse, pathOfHash, isLocal)).toEqual({
      verdict: 'proven',
      oracle: 'symbol-reverse',
    });
  });

  it("AR-5 abstain('relation-kind-not-provable'): a `calls` relation is NEVER provable — SCIP has no call-role", () => {
    // Same fixture that PROVES depends-on above — only the kind changes. Proves the KIND is what gates, not the
    // edge: `calls` cannot be proven distinct from a reference from the frozen projection (§2.3).
    const reverse = feed({ callers: ['src/a/uses-b.ts'] });
    expect(verifyRelation(claim({ relationKind: 'calls' }), reverse, pathOfHash, isLocal)).toEqual({
      verdict: 'abstain',
      reason: 'relation-kind-not-provable',
      oracle: 'symbol-reverse',
    });
  });

  it("AR-3 abstain('target-not-global'): a `local ` (document-scoped, #189) target ⇒ no proven relation", () => {
    const reverse = feed({ callers: ['src/a/uses-b.ts'] });
    expect(verifyRelation(claim({ target: 'local 7' }), reverse, pathOfHash, isLocal)).toEqual({
      verdict: 'abstain',
      reason: 'target-not-global',
      oracle: 'symbol-reverse',
    });
  });

  it("AR-3 abstain('target-unresolvable'): a target with no in-index definition (a phantom) ⇒ no proven relation", () => {
    const reverse = feed({ callers: ['src/a/uses-b.ts'], resolvesTarget: false });
    expect(verifyRelation(claim(), reverse, pathOfHash, isLocal)).toEqual({
      verdict: 'abstain',
      reason: 'target-unresolvable',
      oracle: 'symbol-reverse',
    });
  });

  it("AR-17 honest boundary: a reflection/dynamic-dispatch/cross-language edge (`to` never resolves) is NOT provable — abstain, never a proof", () => {
    // A dynamic/reflected/FFI edge presents to the index as an UNRESOLVABLE target (§3.3 `to: null`): there is no
    // definition to witness a reference against, so the oracle abstains. Pinned as a NAMED non-behaviour: the
    // honest boundary, distinct from a generic malformed claim.
    const dynamicEdge = feed({ callers: ['src/a/reflects.ts'], resolvesTarget: false });
    expect(verifyRelation(claim(), dynamicEdge, pathOfHash, isLocal)).toEqual({
      verdict: 'abstain',
      reason: 'target-unresolvable',
      oracle: 'symbol-reverse',
    });
    const crossLanguage = feed({ callers: [], resolvesTarget: false });
    expect(verifyRelation(claim({ target: 'scip:python:mod#f' }), crossLanguage, pathOfHash, isLocal).verdict).toBe(
      'abstain',
    );
  });

  it("abstain('no-caller-in-scope'): a resolved reference exists but in a SIBLING dir that only STRING-prefixes sourceScope (#153 teeth)", () => {
    // A referrer in `src/abc` must NOT count as under `src/a` (segment-wise, never substring). Kills the
    // `underScope`→`.includes` drift mutant that would fabricate a proven edge.
    const reverse = feed({ callers: ['src/abc/uses-b.ts'] });
    expect(verifyRelation(claim(), reverse, pathOfHash, isLocal)).toEqual({
      verdict: 'abstain',
      reason: 'no-caller-in-scope',
      oracle: 'symbol-reverse',
    });
  });

  it("abstain('malformed'): an empty target or sourceScope ⇒ abstain, never a throw", () => {
    const reverse = feed({ callers: ['src/a/uses-b.ts'] });
    expect(verifyRelation(claim({ target: '' }), reverse, pathOfHash, isLocal).reason).toBe('malformed');
    expect(verifyRelation(claim({ sourceScope: '' }), reverse, pathOfHash, isLocal).reason).toBe('malformed');
  });
});
