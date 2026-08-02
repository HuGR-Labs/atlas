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

import { createCommandClient, ModelCommandError } from '../src/llm.js';
import type { LlmBudget } from '../src/llm.js';

/** A generous wall-clock for the commands that are expected to finish immediately. */
const budget: LlmBudget = { costCap: 1, timeoutMs: 10_000 };

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
  it('pipes the prompt on STDIN and returns stdout as the claim', () => {
    const client = createCommandClient({ cmd: 'cat', args: [] }); // `cat` echoes its stdin
    expect(client.complete('a non-obvious grounded claim', budget)).toStrictEqual({
      claim: 'a non-obvious grounded claim',
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
    const client = createCommandClient({ cmd: 'printf', args: ['%s', '$HOME; rm -rf /'] });
    expect(client.complete('ignored', budget)).toStrictEqual({ claim: '$HOME; rm -rf /' });
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
      const client = createCommandClient({ cmd: 'printf', args: ['%s', 'A-REAL-CLAIM'] });
      expect(client.complete(hugePrompt, budget)).toStrictEqual({ claim: 'A-REAL-CLAIM' });
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
});
