// Acceptance suite for `createCommandClient` — the ONE concrete `ModelClient` (ADR-0011 Decision 1).
//
// Every case runs a REAL subprocess against POSIX binaries (`cat`/`true`/`false`/`echo`/`printf`/`sleep`),
// because the properties under test are properties of process invocation — a mocked child would assert the
// mock. No live model is involved anywhere, and no vendor is named.
//
// The two load-bearing families:
//   • ABSTENTION vs FAILURE must never be confusable. Empty stdout is an abstention (GEN-12, a valid
//     unpressured outcome); a non-zero exit / timeout / missing command THROWS. If a broken configuration
//     could return `claim: null`, a misconfigured run would be indistinguishable from "this repo has no
//     facts" — the one failure mode that invalidates a whole genesis pass invisibly.
//   • NO SHELL, and the prompt never reaches argv. Both are asserted positively, with mutations named.

import { describe, expect, it } from 'vitest';

import { ABSTAIN_SENTINEL, createCommandClient, ModelCommandError } from '../src/llm.js';
import type { LlmBudget } from '../src/llm.js';

/** A generous wall-clock for the commands that are expected to finish immediately. */
const budget: LlmBudget = { costCap: 1, timeoutMs: 10_000 };

/** [ADR-0017] The fenced `atlas-fact` candidate block the gate parses, carrying a single `claim` field. This
 *  is the wire the reason-freely prompt emits; `JSON.stringify` keeps a claim with quotes/metacharacters
 *  well-formed. A stub prints it verbatim with `printf '%s'`, so the block reaches the gate byte-for-byte. */
const factBlock = (claim: string): string => '```atlas-fact\n{"claim": ' + JSON.stringify(claim) + '}\n```\n';

/** Read the thrown error as the discriminated failure it must be — never a bare `Error`. */
function failureOf(fn: () => unknown): ModelCommandError {
  try {
    fn();
  } catch (e) {
    if (e instanceof ModelCommandError) return e;
    throw new Error(`expected a ModelCommandError, got ${String(e)}`);
  }
  throw new Error('expected a throw, got a return — a failure MUST NOT be expressible as a result');
}

describe('createCommandClient — the operator-supplied model command (ADR-0011 D1)', () => {
  it('pipes the prompt on STDIN and parses the emitted fact block into the claim', () => {
    // `cat` echoes its stdin, so feeding it an `atlas-fact` block is the simplest end-to-end of the wire the
    // reason-freely prompt emits: the block reaches the gate on stdout and its `claim` field is the claim.
    const block = factBlock('a non-obvious grounded claim');
    const client = createCommandClient({ cmd: 'cat', args: [] });
    expect(client.complete(block, budget)).toStrictEqual({
      claim: 'a non-obvious grounded claim',
      rawAnswer: block, // ADR-0017: the whole validated envelope rides back for W-MINE (never a bare claim)
    });
  });

  it('the prompt is NEVER appended to argv — a command that echoes its ARGUMENTS sees nothing', () => {
    // teeth: were the prompt passed as an argument instead of on stdin, `echo` would print it and this
    // would come back as a claim. `echo` ignores stdin, so the only way to observe the prompt is argv.
    const client = createCommandClient({ cmd: 'echo', args: [] });
    expect(client.complete('THE-PROMPT-MUST-NOT-APPEAR-IN-ARGV', budget)).toStrictEqual({ claim: null });
  });

  it('NO SHELL — an argument carrying shell metacharacters is passed through literally', () => {
    // teeth (breaks-on "the adapter is switched to `shell: true`"): a shell would EXPAND `$HOME` and treat
    // `;` as a command separator. Literal pass-through is what makes an argv array safe by construction.
    const block = factBlock('$HOME; rm -rf /');
    const client = createCommandClient({ cmd: 'printf', args: ['%s', block] });
    expect(client.complete('ignored', budget)).toStrictEqual({ claim: '$HOME; rm -rf /', rawAnswer: block });
  });

  describe('abstention (GEN-12) — a valid, unpressured outcome', () => {
    it('EMPTY stdout ⇒ abstained, never a fabricated claim', () => {
      const client = createCommandClient({ cmd: 'true', args: [] }); // exit 0, writes nothing
      expect(client.complete('anything', budget)).toStrictEqual({ claim: null });
    });

    it('WHITESPACE-ONLY stdout ⇒ abstained', () => {
      // teeth (breaks-on "the `.trim()` before the emptiness test is dropped"): without it this yields a
      // claim of `"\n"`, which the gate would then have to reject downstream instead of never seeing.
      const client = createCommandClient({ cmd: 'printf', args: ['  \\n\\t '] });
      expect(client.complete('anything', budget)).toStrictEqual({ claim: null });
    });
  });

  describe('a child that exits cleanly WITHOUT draining the prompt still yields its claim', () => {
    // Found as a load-dependent flake: `printf` exits before Node finishes writing stdin, so `execFileSync`
    // throws EPIPE on the WRITE even though the run succeeded (measured: `{code:'EPIPE', status:0,
    // stdout:'OUT'}`). Prompts here are whole source subtrees, so the write is long and the window is wide.
    /** Big enough that the child is guaranteed to exit mid-write. */
    const hugePrompt = 'x'.repeat(8 * 1024 * 1024);

    it('EPIPE with a ZERO exit status returns the stdout the child did produce', () => {
      // teeth (breaks-on "the `salvageEarlyExit` branch is removed"): the call throws `nonzero-exit`, so a
      // model command that reads a prefix and exits reports a hard failure on a run that produced a claim.
      const block = factBlock('A-REAL-CLAIM');
      const client = createCommandClient({ cmd: 'printf', args: ['%s', block] });
      expect(client.complete(hugePrompt, budget)).toStrictEqual({ claim: 'A-REAL-CLAIM', rawAnswer: block });
    });

    it('EPIPE with a NON-ZERO exit status is still a failure — the salvage is not a blanket catch', () => {
      // teeth (breaks-on "`err.status !== 0` is dropped from the salvage predicate"): a genuinely failing
      // command that also stopped reading stdin would be salvaged into a silent abstention.
      const client = createCommandClient({ cmd: 'false', args: [] });
      expect(failureOf(() => client.complete(hugePrompt, budget)).reason).toBe('nonzero-exit');
    });
  });

  describe('failure is THROWN and classified — never returned as an abstention', () => {
    it('a NON-ZERO exit throws `nonzero-exit` (the fail-silent trap)', () => {
      // teeth (breaks-on "the catch returns `{ claim: null }` instead of throwing"): that mutation makes a
      // wholly broken model config report as a repo with nothing to say — exit 0, empty graph, no signal.
      const client = createCommandClient({ cmd: 'false', args: [] });
      expect(failureOf(() => client.complete('anything', budget)).reason).toBe('nonzero-exit');
    });

    it('a MISSING command throws `not-found`, distinctly from a failing one', () => {
      // The most common misconfiguration. Collapsing it into `nonzero-exit` is what makes a typo in the
      // operator config read as "the model refused everything".
      const client = createCommandClient({ cmd: 'atlas-no-such-model-binary-xyzzy', args: [] });
      expect(failureOf(() => client.complete('anything', budget)).reason).toBe('not-found');
    });

    it("a command exceeding `budget.timeoutMs` throws `timeout` — the budget's wall-clock is enforced", () => {
      const client = createCommandClient({ cmd: 'sleep', args: ['5'] });
      const tight: LlmBudget = { costCap: 1, timeoutMs: 150 };
      // teeth (breaks-on "`timeout: budget.timeoutMs` is dropped from the spawn options"): without it the
      // call blocks for the full 5s and returns an ABSTENTION, so an unbounded model would look thrifty.
      expect(failureOf(() => client.complete('anything', tight)).reason).toBe('timeout');
    });

    it('the thrown message names the command that ran, so a failure is diagnosable without re-running it', () => {
      const client = createCommandClient({ cmd: 'atlas-no-such-model-binary-xyzzy', args: ['-m', 'x'] });
      const err = failureOf(() => client.complete('anything', budget));
      expect(err.message).toContain('atlas-no-such-model-binary-xyzzy -m x');
    });
  });

  // ── #195 leg (c): the admission SANITY GATE, exercised end-to-end through a real subprocess ────────────
  // The bytes are produced by `printf` (octal escapes for the corrupt/control cases) so the RAW-BUFFER path
  // is what is under test — a mocked child would assert the mock, not the U+FFFD masking this gate defeats.
  describe('#195c/ADR-0017 admission gate — the reason-freely envelope is parsed by BLOCK COUNT', () => {
    it('reasoning THEN exactly one fenced block ⇒ the parsed claim AND the whole envelope as rawAnswer', () => {
      // The canonical ADR-0017 shape: free reasoning above a single `atlas-fact` block. teeth: the reasoning
      // is SCRATCH — `claim` is the parsed block field, NOT the prose; `rawAnswer` is the WHOLE envelope
      // (reasoning + block), which W-MINE scrubs-and-puts to CAS.
      const envelope =
        'I weighed whether this restates the signature; it does not — it names a hidden precondition.\n\n' +
        factBlock('greet formats via a template literal');
      const client = createCommandClient({ cmd: 'printf', args: ['%s', envelope] });
      expect(client.complete('anything', budget)).toStrictEqual({
        claim: 'greet formats via a template literal',
        rawAnswer: envelope,
      });
    });

    it('free reasoning with NO fact block ⇒ the UNTAGGED GEN-12 abstention (reasoned, then declined)', () => {
      // teeth (breaks-on "0 blocks is treated as a claim / a malformed answer"): under reason-freely a decline
      // is multi-line prose with no block. It must be a plain abstention (a safe miss), never a fabricated
      // claim and never tagged as corruption. This is also what retires the old > 1-line splice heuristic.
      const client = createCommandClient({ cmd: 'printf', args: ['%s', 'On reflection nothing here is non-obvious.\nThe name already says it.\n'] });
      expect(client.complete('anything', budget)).toStrictEqual({ claim: null });
    });

    it('TWO fenced blocks ⇒ abstain `answer-malformed:multi-response` (the 2026-08-04 splice, now BLOCK-count)', () => {
      // teeth (breaks-on "the ≥2-block prong is removed"): two concatenated answers each carry a block — the
      // exact shape the broken shim delivered. The structural block count rejects them where a line count no
      // longer can (reason-freely is multi-line by construction).
      const client = createCommandClient({ cmd: 'printf', args: ['%s', factBlock('claim one') + factBlock('claim two')] });
      expect(client.complete('anything', budget)).toStrictEqual({
        claim: null,
        abstainReason: 'answer-malformed:multi-response',
      });
    });

    it('a single block with a MISSING/empty `claim` field ⇒ abstain `answer-malformed:unparseable`', () => {
      // teeth (breaks-on "the missing-claim prong admits a claimless/typeless field"): a block that parses but
      // carries no usable claim is a botched emission, not a fact.
      const client = createCommandClient({ cmd: 'printf', args: ['%s', '```atlas-fact\n{"note": "no claim here"}\n```\n'] });
      expect(client.complete('anything', budget)).toStrictEqual({ claim: null, abstainReason: 'answer-malformed:unparseable' });
    });

    it('a single block whose body is NOT valid JSON ⇒ abstain `answer-malformed:unparseable`, never a throw', () => {
      // teeth (breaks-on "JSON.parse is not guarded"): a parse failure must fail closed to a tagged abstention,
      // never crash the per-site visit.
      const client = createCommandClient({ cmd: 'printf', args: ['%s', '```atlas-fact\n{not: json,,}\n```\n'] });
      expect(client.complete('anything', budget)).toStrictEqual({ claim: null, abstainReason: 'answer-malformed:unparseable' });
    });

    it('a block body OVER the byte cap ⇒ abstain `answer-malformed:unparseable` (a fact is one sentence)', () => {
      // teeth (breaks-on "the size cap is removed"): the reasoning scratch is unbounded but the PARSED block is
      // not; an oversize block is refused before `JSON.parse`.
      const client = createCommandClient({ cmd: 'printf', args: ['%s', factBlock('x'.repeat(9000))] });
      expect(client.complete('anything', budget)).toStrictEqual({ claim: null, abstainReason: 'answer-malformed:unparseable' });
    });

    it('an interleaved answer carrying a C0 control byte ⇒ abstain `answer-malformed:multi-response`', () => {
      // \001 (0x01) is a control byte a single prose answer never carries — the byte-overlap/interleave seam
      // of concurrent writers racing one pipe. It is VALID UTF-8, so this exercises the splice prong, not the
      // utf-8 prong.
      const client = createCommandClient({ cmd: 'printf', args: ['front\\001back'] });
      expect(client.complete('anything', budget)).toStrictEqual({
        claim: null,
        abstainReason: 'answer-malformed:multi-response',
      });
    });

    it('INVALID UTF-8 bytes ⇒ abstain `answer-malformed:not-utf8` (never salvaged as a U+FFFD claim)', () => {
      // \377\376 (0xFF 0xFE) is not valid UTF-8. teeth (breaks-on "stdout is read with encoding:'utf8'"):
      // that mutation maps these bytes to U+FFFD and admits a fabricated claim instead of abstaining.
      const client = createCommandClient({ cmd: 'printf', args: ['\\377\\376'] });
      expect(client.complete('anything', budget)).toStrictEqual({
        claim: null,
        abstainReason: 'answer-malformed:not-utf8',
      });
    });

    it('EMPTY stdout stays the UNTAGGED GEN-12 abstention — an empty answer is declining, not corruption', () => {
      // teeth (breaks-on "empty is tagged answer-malformed:empty"): the model-abstained case must NOT be
      // reported as a malformed answer, or every legitimate abstention reads as contamination.
      const client = createCommandClient({ cmd: 'true', args: [] });
      expect(client.complete('anything', budget)).toStrictEqual({ claim: null });
    });
  });

  // ── #201/#202 the explicit ABSTAIN SENTINEL — a positive abstention ACTION, mapped to the same GEN-12 null
  describe('#201/#202 explicit abstain sentinel — a token, not silence', () => {
    it('the sentinel token alone ⇒ the UNTAGGED GEN-12 abstention (identical to empty stdout)', () => {
      // teeth (breaks-on "the sentinel prong is removed from admitModelAnswer"): a responsive model emits
      // this token instead of nothing, and without the prong it is admitted as a fabricated one-line CLAIM —
      // exactly the #201 prose-refusal-becomes-fact bug the sentinel exists to close.
      const client = createCommandClient({ cmd: 'printf', args: [`${ABSTAIN_SENTINEL}\\n`] });
      expect(client.complete('a trivial unit', budget)).toStrictEqual({ claim: null });
    });

    it('the sentinel is matched CASE-INSENSITIVELY on the fully-trimmed answer', () => {
      // teeth (breaks-on "the toUpperCase()/trim is dropped"): a model that lowercases or pads the token
      // would slip past a strict-equality check and its abstention would be recorded as a fact.
      const client = createCommandClient({ cmd: 'printf', args: ['  no-fact \\n'] });
      expect(client.complete('a trivial unit', budget)).toStrictEqual({ claim: null });
    });

    it('the sentinel wrapped in markdown BACKTICKS ⇒ abstain (the measured Sonnet 4.6 case, #201/#202 probe)', () => {
      // teeth (breaks-on "the end-strip in isAbstainToken is removed"): on the 2026-08-11 probe the model
      // abstained on 5/6 trivial units with a bare token and on the 6th emitted `` `NO-FACT` `` — a strict
      // whole-answer equality would have booked that abstention as a fabricated fact. The end-strip is why not.
      const client = createCommandClient({ cmd: 'printf', args: ['`NO-FACT`\\n'] });
      expect(client.complete('a trivial unit', budget)).toStrictEqual({ claim: null });
    });

    it('the sentinel MENTIONED inside a real claim is NOT an abstention — only the whole-answer token abstains', () => {
      // teeth (breaks-on "the match is `includes` instead of whole-answer equality"): a genuine fact whose
      // claim text mentions the token must survive. Substring-matching would let the sentinel eat real facts.
      const block = factBlock('NO-FACT is returned when the cache is cold');
      const client = createCommandClient({ cmd: 'printf', args: ['%s', block] });
      expect(client.complete('a real unit', budget)).toStrictEqual({
        claim: 'NO-FACT is returned when the cache is cold',
        rawAnswer: block,
      });
    });
  });
});
