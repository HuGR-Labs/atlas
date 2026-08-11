// @atlas/adapter-io — src/llm.ts  (ADAPT-LLM-1: the single bounded S2 site proposer)
//
// The raw llm adapter: the one bounded LLM entry — the S2 `SiteProposer` (@atlas/genesis), invoked once
// per visited site (the driver calls `propose` EXACTLY ONCE per site; extract.ts:105-113). This module is
// the SOLE model seam: the `ModelClient` port lives ONLY here, which is what makes golden 11a's "a model is
// invoked only via SiteProposer.propose" a mechanical module-graph audit. The prompt and the budget stay
// INJECTED — this file hardcodes no prompt and names no vendor.
//
// [ADR-0011 / D5] The ONE concrete `ModelClient` also lives here, and it must: golden 11a asserts that
// `ModelClient` is referenced by exactly ONE src module, so a sibling adapter file would turn that audit
// red. `createCommandClient` runs an OPERATOR-SUPPLIED command (`execFileSync`, NO shell, argv never
// interpolated — the `run-git.ts:25` seam's shape). Consequently this module DOES now reach a process
// primitive; it still reaches no network and no clock of its own, and it still names no model.

import { execFileSync } from 'node:child_process';

import type { Candidate, SeedProposal, SiteProposer } from '@atlas/genesis';

/** The bounded spend envelope for the one call — a hard cost cap + a wall-clock timeout (ADAPT-LLM-1). */
export interface LlmBudget {
  readonly costCap: number;
  readonly timeoutMs: number;
}

/**
 * The raw model verdict at a site: a claim, or `null` when the model ABSTAINED here (GEN-12).
 *
 * [#195 leg (c)] The claim is only produced AFTER the admission sanity gate (`admitModelAnswer`) passes on
 * the raw stdout bytes. Two provenance carriers ride alongside it so W-MINE can trace a fact back to what
 * produced it, and W-MINE can build a grounded abstention when it cannot:
 *   - `rawAnswer` — the VALIDATED answer text (the exact bytes that passed the gate, decoded as a string),
 *     present ONLY when `claim !== null`. Downstream (W-MINE) scrubs this and puts it to CAS; this seam
 *     does not scrub and never touches CAS. It is the untrimmed answer — `claim` is its trimmed projection.
 *   - `abstainReason` — on a MALFORMED-answer abstention, the sub-reason a grounded `WhyNot('answer-malformed')`
 *     is built from (`'answer-malformed:not-utf8'` | `'answer-malformed:multi-response'`). The plain GEN-12
 *     model-abstained case (empty / whitespace-only stdout) stays UNTAGGED (`undefined`): an empty answer is
 *     the model declining to answer, not a corruption of one.
 */
export interface CompletionResult {
  readonly claim: string | null; //          null ⇒ the model abstained at this site
  readonly rawAnswer?: string; //             the validated answer bytes as a string; present iff claim !== null
  readonly abstainReason?: string; //         a malformed-answer sub-reason; undefined for a plain GEN-12 abstain
}

/** The single, synchronous model seam — one bounded completion per prompt (matches the frozen sync
 *  `SiteProposer.propose`; the concrete async binding is D5/wire's concern). Referenced by ONE src module
 *  (this one) — the sole model entry point in the whole system (ADAPT-LLM-1, golden 11a). */
export interface ModelClient {
  complete(prompt: string, budget: LlmBudget): CompletionResult;
}

/** Construct the S2 `SiteProposer` — ONE bounded model call per site, abstention allowed (ADAPT-LLM-1).
 *  The `SiteProposer` return type is frozen; the model client, budget, and prompt-builder are INJECTED so
 *  this seam hardcodes no model and no prompt (D5). `propose` makes exactly one `client.complete` call —
 *  no retry, no loop — and returns a candidate proposal the driver GATES (never auto-trusted, never written
 *  to a store — GEN-4/12, golden 11c). Self-declaration fields are never read or emitted (GEN-4d). */
export function createSiteProposer(deps: {
  client: ModelClient;
  budget: LlmBudget;
  buildPrompt: (cand: Candidate) => string;
}): SiteProposer {
  return {
    propose(cand: Candidate) {
      const prompt = deps.buildPrompt(cand);
      const r = deps.client.complete(prompt, deps.budget); // EXACTLY ONE bounded call — no retry/loop
      if (r.claim === null) return null;
      // [#195c] Forward the VALIDATED answer bytes through the proposal so W-MINE can scrub-and-put them to
      // CAS. Built as a variable (not a return-position literal) so the extra field rides a `SeedProposal`
      // without a genesis-owned type change — the SiteProposer contract stays `SeedProposal | null`.
      const seed: SeedProposal & { rawAnswer?: string } = {
        cand,
        claim: r.claim,
        ...(r.rawAnswer !== undefined ? { rawAnswer: r.rawAnswer } : {}),
      };
      return seed;
    },
  };
}

// ── the one concrete ModelClient: an operator-supplied command (ADR-0011 Decision 1) ───────────────────

/** Why a model invocation FAILED — never conflated with an abstention (ADR-0011 D1). `not-found` is split
 *  out because a mistyped/absent command is the most common misconfiguration, and reporting it as a generic
 *  failure is what makes a broken setup read like a repo with nothing to say. */
export type ModelFailure = 'not-found' | 'timeout' | 'nonzero-exit';

/** A model invocation that FAILED. Thrown, never returned: `CompletionResult.claim === null` means the model
 *  ABSTAINED (a valid GEN-12 outcome), so a failure must not be expressible as one. */
export class ModelCommandError extends Error {
  constructor(
    readonly reason: ModelFailure,
    message: string,
  ) {
    super(message);
    this.name = 'ModelCommandError';
  }
}

/** The operator-supplied model command (ADR-0011 D1). `args` is an ARRAY so nothing is ever shell-split:
 *  there is no shell, and no argument is interpolated into one. Sourced from the operator-scoped config,
 *  NEVER from the repo — a command read out of a committed file would make `atlas mine` on a cloned
 *  repository an arbitrary-code-execution path. */
export interface ModelCommand {
  readonly cmd: string;
  readonly args: readonly string[];
}

/**
 * The ONE concrete `ModelClient` (ADR-0011 D1): run an operator-supplied command, prompt on stdin, claim on
 * stdout. No shell, no SDK, no network primitive here, and NO VENDOR NAMED — any provider-agnostic CLI, a
 * local runtime, or a `curl` wrapper satisfies it equally, so substitution is a config edit.
 *
 * The two verdict rules are what keep the result unambiguous:
 *   - **EMPTY stdout ⇒ abstention** (`claim: null`). No JSON, no parser, hence no parse-failure mode.
 *     Abstention is a valid, unpressured outcome (GEN-12).
 *   - **Non-zero exit / timeout / missing command ⇒ THROW.** A broken configuration MUST NOT be able to
 *     present itself as "this repo has no facts" — that fail-silent shape is the one failure that would
 *     invalidate a whole genesis run invisibly.
 *
 * `budget.timeoutMs` is enforced (`execFileSync`'s own timeout). `budget.costCap` is NOT enforceable here
 * and is deliberately not pretended: a subprocess reports no price. Spend is bounded upstream by the GEN-2
 * site ceiling and the marginal-value stop, which is where the real budget lives.
 */
export function createCommandClient(command: ModelCommand): ModelClient {
  return {
    complete(prompt: string, budget: LlmBudget): CompletionResult {
      let out: Buffer;
      try {
        out = execFileSync(command.cmd, command.args as string[], {
          input: prompt, // the prompt is piped, never placed on the command line
          // NO `encoding`: stdout is read as a RAW Buffer. With `encoding:'utf8'` Node silently maps invalid
          // bytes to U+FFFD, masking exactly the corruption the #195c sanity gate exists to reject.
          timeout: budget.timeoutMs,
          stdio: ['pipe', 'pipe', 'pipe'], // stderr CAPTURED — never inherited (the fleet-wide F7 property)
        });
      } catch (e) {
        const completed = salvageEarlyExit(e); // the child finished; only OUR stdin write lost the race
        if (completed === null) throw new ModelCommandError(classifyModelFailure(e), describeModelFailure(command, e));
        out = completed;
      }
      return admitModelAnswer(out); // #195c: the admission sanity gate — fail-closed to a tagged abstention
    },
  };
}

/**
 * [#195 leg (c)] The admission SANITY GATE on the model's raw stdout bytes, BEFORE they can become a claim.
 * Three fail-closed checks; any failure returns a grounded ABSTENTION, never a fabricated claim:
 *   1. VALID UTF-8 — round-trip the raw bytes (`Buffer.from(text).equals(buf)`). Reading stdout as a Buffer
 *      is what makes this observable: `encoding:'utf8'` would already have replaced bad bytes with U+FFFD.
 *      Fail ⇒ `answer-malformed:not-utf8`.
 *   2. NON-EMPTY — an empty / whitespace-only answer is the model DECLINING to answer (GEN-12), not a
 *      corruption. It stays `{ claim: null }` UNTAGGED, preserving the existing abstention semantics.
 *   3. SINGLE-RESPONSE — reject the splice/interleave class the 2026-08-04 contamination produced
 *      (byte-overlapping concatenation of multiple concurrent answers). See `isSplicedAnswer`.
 *      Fail ⇒ `answer-malformed:multi-response`.
 * On success the VALIDATED (untrimmed) text rides back as `rawAnswer`; `claim` is its trimmed projection.
 */
function admitModelAnswer(buf: Buffer): CompletionResult {
  const text = buf.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(buf)) return { claim: null, abstainReason: 'answer-malformed:not-utf8' };
  const claim = text.trim();
  if (claim === '') return { claim: null }; //                    empty ⇒ GEN-12 model-abstained, untagged
  if (isSplicedAnswer(text)) return { claim: null, abstainReason: 'answer-malformed:multi-response' };
  return { claim, rawAnswer: text }; //                          rawAnswer = the exact validated answer bytes
}

/**
 * The SINGLE-RESPONSE predicate (#195 §4 — specified at build time from the 2026-08-04 incident, not perfect
 * by contract, only required to REJECT a spliced fixture and ADMIT a normal single answer). The answer
 * channel is "one line of prose or an abstention" (`prompt.ts:134`), so a well-formed answer is a single
 * content block of ordinary text. Two orthogonal fingerprints of the incident's byte-overlapping
 * concatenation of concurrent answers:
 *   (a) INTERLEAVE — a C0 control byte a single prose answer never carries (anything below U+0020 except
 *       TAB/LF/CR). Concurrent writers racing one pipe inject stray control/NUL bytes at the splice seam.
 *   (b) MULTI-ENVELOPE — more than one non-empty line after trimming: a concatenation of ≥2 top-level
 *       answers, where a conforming single answer is one line of prose.
 */
function isSplicedAnswer(text: string): boolean {
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) return true; // (a) C0 control byte (not TAB/LF/CR) = interleave seam
  return text.split('\n').filter((line) => line.trim() !== '').length > 1; // (b) >1 response envelope
}

/**
 * A child that FINISHED CLEANLY but stopped reading stdin before we finished writing the prompt (`EPIPE`
 * with `status === 0`). `execFileSync` throws on the failed *write*, yet the run succeeded and the real
 * stdout is carried on the thrown error — measured: `{ code:'EPIPE', status:0, stdout:'OUT' }`.
 *
 * THE TRADEOFF, STATED. Prompts here are whole source subtrees, so the write is long and the window is
 * wide: any model command that reads a prefix and exits — or that any wrapper truncates — would otherwise
 * be reported as a hard failure on a run that actually produced a claim. This was found as a load-dependent
 * flake in the full suite (an idle-box probe of 300 runs did NOT reproduce it). But salvaging is NOT free
 * and must not be sold as pure correctness: A CLAIM MAY THEREFORE BE PRODUCED FROM A PARTIALLY DELIVERED
 * PROMPT. The child provably did not read all of it — this suite's own green case salvages a claim from a
 * command that read ZERO bytes of an 8 MiB prompt — so the claim may rest on source the model never saw.
 * That is admissible here for ONE reason, and it is the backstop the whole design leans on: what a proposer
 * returns is a PROPOSAL, and the admission gate re-derives it mechanically against the anchored bytes
 * (GEN-4/12). A claim built on an unread prefix fails that gate exactly as any other unfounded claim does.
 * This is a third adapter rule alongside "empty ⇒ abstention" and "non-zero ⇒ error", and it is written
 * into ADR-0011 Decision 1 rather than living only here.
 *
 * `null` ⇒ not salvageable, let the caller throw. `status` must be EXACTLY `0`: `null` means the child was
 * killed by a signal, and a non-zero status is a genuine failure — neither may be salvaged. Returns the raw
 * stdout BUFFER (stdout is captured with no `encoding`, so the thrown error carries it as a Buffer) — the
 * salvaged bytes pass through the same #195c sanity gate as the happy path.
 */
function salvageEarlyExit(e: unknown): Buffer | null {
  const err = e as { code?: unknown; status?: unknown; stdout?: unknown } | null;
  if (err?.code !== 'EPIPE' || err.status !== 0) return null;
  return Buffer.isBuffer(err.stdout) ? err.stdout : Buffer.alloc(0);
}

/** Classify a thrown `execFileSync` error. `ENOENT` is the absent command; `ETIMEDOUT`/`SIGTERM` is the
 *  budget's wall-clock; anything else reaching here is a non-zero exit. */
function classifyModelFailure(e: unknown): ModelFailure {
  const code = (e as { code?: unknown } | null)?.code;
  if (code === 'ENOENT') return 'not-found';
  if (code === 'ETIMEDOUT' || (e as { signal?: unknown } | null)?.signal === 'SIGTERM') return 'timeout';
  return 'nonzero-exit';
}

/** An actionable message: name the command that was actually run, and carry the child's captured stderr —
 *  without it a failure is only diagnosable by re-running by hand. */
function describeModelFailure(command: ModelCommand, e: unknown): string {
  const shown = [command.cmd, ...command.args].join(' ');
  const stderr = (e as { stderr?: unknown } | null)?.stderr;
  const detail = typeof stderr === 'string' && stderr.trim() !== '' ? stderr.trim() : String((e as Error)?.message ?? e);
  return `the configured model command failed — \`${shown}\`: ${detail}`;
}
