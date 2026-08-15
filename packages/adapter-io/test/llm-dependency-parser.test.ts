// @atlas/adapter-io — test/llm-dependency-parser.test.ts   (ADR-0017 dependency slot — the PROPOSER arm)
//
// The dependency mining arm turns a model's `DEPENDS-ON: <target> @ <scope>` line into a TYPED dependency
// `PredicateSeed{ slot:'dependency', target, scope }` the sound oracle proves-or-drops, and ABSTAINS on
// anything else (never a fabricated advisory). This suite pins:
//   • the grammar → typed seed (with the ` @ ` last-delimiter rule for an `@`-bearing target)
//   • malformed / empty legs ⇒ grounded abstention (DEP_UNPARSEABLE_REASON)
//   • rawAnswer provenance rides through (#195c)
//   • the DEFAULT arm (advisoryClaimParser) is byte-identical to the shipped advisory shape
//   • createSiteProposer routes a parser's abstention exactly like a GEN-12 model abstention

import { describe, it, expect } from 'vitest';
import type { Candidate } from '@atlas/genesis';
import type { SubtreeHash } from '@atlas/contracts';
import {
  advisoryClaimParser,
  createSiteProposer,
  dependencyClaimParser,
  DEP_UNPARSEABLE_REASON,
} from '../src/llm.js';
import type { CompletionResult, LlmBudget, ModelClient } from '../src/llm.js';

const cand: Candidate = {
  site: { kind: 'symbol', qualifiedPath: 'src/pay/charge.ts::charge', subtreeHash: 'st-charge' as unknown as SubtreeHash },
  signals: { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] },
  ppr: 0,
  rank: 0,
};

const budget: LlmBudget = { costCap: 1, timeoutMs: 1000 };
const buildPrompt = (c: Candidate): string => `describe ${c.site.qualifiedPath}`;
function spyClient(result: CompletionResult): ModelClient {
  return { complete: () => result };
}

// The `cand` site is `src/pay/charge.ts::charge` (below) ⇒ the derived unit scope is `src/pay`.
describe('dependencyClaimParser — #196a candidate-grounded: DEPENDS-ON: <name> → typed dependency seed', () => {
  it('a well-formed line ⇒ predicate seed with the selected name as target and the UNIT DIR as scope', () => {
    const seed = dependencyClaimParser('DEPENDS-ON: ledgerModule', cand, 'DEPENDS-ON: ledgerModule');
    expect(seed).toStrictEqual({
      kind: 'predicate',
      slot: 'dependency',
      target: 'ledgerModule',
      scope: 'src/pay', // DERIVED from cand.site (src/pay/charge.ts::charge), never asked of the model
      cand,
      claim: 'DEPENDS-ON: ledgerModule',
      rawAnswer: 'DEPENDS-ON: ledgerModule',
    });
  });

  it('the prefix is case-insensitive and rawAnswer is optional', () => {
    const seed = dependencyClaimParser('depends-on: foo', cand);
    expect(seed).toStrictEqual({ kind: 'predicate', slot: 'dependency', target: 'foo', scope: 'src/pay', cand, claim: 'depends-on: foo' });
    expect(seed).not.toHaveProperty('rawAnswer'); // absent when the caller passes none (#195c)
  });

  it('a trailing " @ scope" is NOT parsed — the model emits only a NAME (a stray scope makes the line unparseable)', () => {
    // teeth: the old ` @ scope` grammar is gone; a two-token line does not match `DEPENDS-ON: <single name>`.
    expect(dependencyClaimParser('DEPENDS-ON: foo @ lib', cand)).toStrictEqual({ abstain: DEP_UNPARSEABLE_REASON });
  });

  it('a prose line that is not the grammar ⇒ grounded abstention, NEVER a fabricated advisory', () => {
    expect(dependencyClaimParser('charge() validates the amount before persisting', cand)).toStrictEqual({
      abstain: DEP_UNPARSEABLE_REASON,
    });
  });

  it('an empty name ⇒ abstain', () => {
    expect(dependencyClaimParser('DEPENDS-ON:   ', cand)).toStrictEqual({ abstain: DEP_UNPARSEABLE_REASON });
  });
});

describe('advisoryClaimParser — the DEFAULT arm stays byte-identical to the shipped advisory shape', () => {
  it('every claim is an advisory seed { cand, claim } (+ rawAnswer when present)', () => {
    expect(advisoryClaimParser('greet returns a greeting', cand)).toStrictEqual({ cand, claim: 'greet returns a greeting' });
    expect(advisoryClaimParser('x', cand, 'x-raw')).toStrictEqual({ cand, claim: 'x', rawAnswer: 'x-raw' });
  });
});

describe('createSiteProposer — the injected parser shapes the seed and routes its abstention', () => {
  it('with dependencyClaimParser: a DEPENDS-ON answer ⇒ a typed dependency seed (scope derived from the site)', () => {
    const proposer = createSiteProposer({ client: spyClient({ claim: 'DEPENDS-ON: foo', rawAnswer: 'DEPENDS-ON: foo' }), budget, buildPrompt, parseClaim: dependencyClaimParser });
    expect(proposer.propose(cand)).toMatchObject({ kind: 'predicate', slot: 'dependency', target: 'foo', scope: 'src/pay' });
  });

  it('with dependencyClaimParser: a non-grammar claim ⇒ { abstain } (routed like a GEN-12 abstention)', () => {
    const proposer = createSiteProposer({ client: spyClient({ claim: 'just prose', rawAnswer: 'just prose' }), budget, buildPrompt, parseClaim: dependencyClaimParser });
    expect(proposer.propose(cand)).toStrictEqual({ abstain: DEP_UNPARSEABLE_REASON });
  });

  it('with NO parser: the advisory default is unchanged (a plain { cand, claim } seed)', () => {
    const proposer = createSiteProposer({ client: spyClient({ claim: 'greet returns a greeting' }), budget, buildPrompt });
    expect(proposer.propose(cand)).toStrictEqual({ cand, claim: 'greet returns a greeting' });
  });
});
