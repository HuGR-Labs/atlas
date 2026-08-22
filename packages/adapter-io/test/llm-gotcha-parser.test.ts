// @atlas/adapter-io — test/llm-gotcha-parser.test.ts   (196b justified vertical slice — the GOTCHA arm)
//
// The gotcha mining arm is the FIRST semantic slot proven end-to-end on the `justified` path. It differs from
// the sound arms (dependency/count) in two ways this suite pins:
//   • it is a REASON-FREELY `'block'` arm (like advisory), so the model emits ONE fenced `atlas-fact` block
//     — but that block carries TWO fields, `{claim, derivation}`, not one;
//   • the DERIVATION (the compact, contestable grounds the `justified` seal persists) is lifted by
//     `gotchaClaimParser` from the raw envelope onto `PredicateSeed{ slot:'gotcha', claim, derivation }`.
// This suite pins:
//   • A4a — a captured model answer whose block carries {claim, derivation} ⇒ the typed gotcha seed, derivation populated
//   • A4b — a bare `NO-FACT` ⇒ abstain (null), exactly like the advisory path (never reaches the parser)
//   • a block with NO/empty derivation ⇒ grounded abstention (GOTCHA_NO_DERIVATION_REASON), never a bare advisory
//   • rawAnswer provenance rides through (#195c); the default advisory arm stays byte-identical
// The block-admission path is driven through the REAL `createCommandClient('block')` over `cat`, so the block
// gate (`admitFactBlock`) that extracts `claim` and the parser that lifts `derivation` are exercised together.

import { describe, it, expect } from 'vitest';
import type { Candidate } from '@atlas/genesis';
import type { SubtreeHash } from '@atlas/contracts';
import { createCommandClient, createSiteProposer, gotchaClaimParser, GOTCHA_NO_DERIVATION_REASON, advisoryClaimParser } from '../src/llm.js';
import type { CompletionResult, LlmBudget, ModelClient } from '../src/llm.js';

const cand: Candidate = {
  site: { kind: 'symbol', qualifiedPath: 'src/cache/lru.ts::get', subtreeHash: 'st-hash' as unknown as SubtreeHash },
  signals: { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] },
  ppr: 0,
  rank: 0,
};

const budget: LlmBudget = { costCap: 1, timeoutMs: 10_000 };
const buildPrompt = (c: Candidate): string => `describe ${c.site.qualifiedPath}`;
function spyClient(result: CompletionResult): ModelClient {
  return { complete: () => result };
}

// A realistic captured answer: free scratch reasoning (discarded), then ONE fenced block with BOTH fields.
const CLAIM = 'get() mutates recency order as a side effect, so a read is not a pure lookup';
const DERIVATION = 'the get branch calls touch(key) before return, moving the entry to the MRU end of the list';
const CAPTURED_GOTCHA = [
  'Let me reason. The name `get` implies a pure read, but scanning the body...',
  'the get path calls touch(key) which reorders the list. That is surprising. It survives refutation.',
  '',
  '```atlas-fact',
  JSON.stringify({ claim: CLAIM, derivation: DERIVATION }),
  '```',
].join('\n');

describe('gotchaClaimParser — 196b: the {claim, derivation} block ⇒ a typed justified gotcha seed', () => {
  it('A4a — a captured answer with a gotcha block ⇒ PredicateSeed{slot:gotcha, claim, derivation}, derivation POPULATED', () => {
    // Drive the REAL block gate: createCommandClient('block') runs `cat` (echoes the captured envelope on stdin),
    // `admitFactBlock` extracts `claim`, and the injected gotchaClaimParser lifts `derivation` from rawAnswer.
    const client = createCommandClient({ cmd: 'cat', args: [] }, 'block');
    const proposer = createSiteProposer({ client, budget, buildPrompt: () => CAPTURED_GOTCHA, parseClaim: gotchaClaimParser });
    expect(proposer.propose(cand)).toStrictEqual({
      kind: 'predicate',
      slot: 'gotcha',
      derivation: DERIVATION, // the persisted, contestable grounds — populated, never empty
      cand,
      claim: CLAIM, //           the extracted surprising sentence (admitFactBlock's projection)
      rawAnswer: CAPTURED_GOTCHA, // the whole validated envelope rides through (#195c)
    });
  });

  it('the parser called directly with the raw envelope lifts the derivation (mirrors the count/dep arm shape)', () => {
    const seed = gotchaClaimParser(CLAIM, cand, CAPTURED_GOTCHA);
    expect(seed).toStrictEqual({ kind: 'predicate', slot: 'gotcha', derivation: DERIVATION, cand, claim: CLAIM, rawAnswer: CAPTURED_GOTCHA });
  });

  it('A4b — a bare NO-FACT ⇒ abstain (null), same as the advisory path (never reaches the parser)', () => {
    // Through the REAL block gate: `printf NO-FACT` is mapped to the GEN-12 model-abstained outcome by
    // admitModelAnswer BEFORE any parser runs, so propose() returns null exactly like an advisory abstention.
    const client = createCommandClient({ cmd: 'printf', args: ['%s', 'NO-FACT'] }, 'block');
    const proposer = createSiteProposer({ client, budget, buildPrompt, parseClaim: gotchaClaimParser });
    expect(proposer.propose(cand)).toBeNull();
  });

  it('teeth: a block with NO derivation field ⇒ grounded abstention (GOTCHA_NO_DERIVATION_REASON), NOT a bare advisory', () => {
    // The whole worth of `justified` is that its grounds travel — a gotcha whose derivation does not is malformed.
    const noDeriv = ['```atlas-fact', JSON.stringify({ claim: CLAIM }), '```'].join('\n');
    expect(gotchaClaimParser(CLAIM, cand, noDeriv)).toStrictEqual({ abstain: GOTCHA_NO_DERIVATION_REASON });
  });

  it('teeth: an EMPTY / whitespace-only derivation ⇒ abstain (a hollow ground is no ground)', () => {
    const blank = ['```atlas-fact', JSON.stringify({ claim: CLAIM, derivation: '   ' }), '```'].join('\n');
    expect(gotchaClaimParser(CLAIM, cand, blank)).toStrictEqual({ abstain: GOTCHA_NO_DERIVATION_REASON });
  });

  it('a MISSING rawAnswer ⇒ abstain — the derivation lives only in the envelope, so absent envelope is no ground', () => {
    expect(gotchaClaimParser(CLAIM, cand)).toStrictEqual({ abstain: GOTCHA_NO_DERIVATION_REASON });
  });

  it('the derivation is TRIMMED (its projection, like claim) — leading/trailing whitespace is not stored', () => {
    const padded = ['```atlas-fact', JSON.stringify({ claim: CLAIM, derivation: `  ${DERIVATION}  ` }), '```'].join('\n');
    expect(gotchaClaimParser(CLAIM, cand, padded)).toMatchObject({ derivation: DERIVATION });
  });
});

describe('createSiteProposer — the injected gotcha parser routes a hollow gotcha like a GEN-12 abstention', () => {
  it('a block with no derivation ⇒ { abstain } (routed like any GEN-12 abstention, never a fabricated seed)', () => {
    const noDeriv = ['```atlas-fact', JSON.stringify({ claim: CLAIM }), '```'].join('\n');
    // The client already extracted `claim`; the parser sees the raw envelope with no derivation and abstains.
    const proposer = createSiteProposer({ client: spyClient({ claim: CLAIM, rawAnswer: noDeriv }), budget, buildPrompt, parseClaim: gotchaClaimParser });
    expect(proposer.propose(cand)).toStrictEqual({ abstain: GOTCHA_NO_DERIVATION_REASON });
  });
});

describe('advisoryClaimParser — the DEFAULT arm stays byte-identical, unaffected by the gotcha arm', () => {
  it('every claim is an advisory seed { cand, claim } (+ rawAnswer when present)', () => {
    expect(advisoryClaimParser('greet returns a greeting', cand)).toStrictEqual({ cand, claim: 'greet returns a greeting' });
    expect(advisoryClaimParser('x', cand, 'x-raw')).toStrictEqual({ cand, claim: 'x', rawAnswer: 'x-raw' });
  });
});
