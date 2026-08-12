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

/**
 * [#201/#202] The explicit abstention token. Measured: with a real model, "output NOTHING to abstain"
 * NEVER fired — 0 abstentions in 300 calls across two prompts (#202), because a model resists producing
 * empty output and instead emits a one-line PROSE refusal ("No fact qualifies", "Nothing non-obvious here"),
 * which the sanity gate below then admits as a fabricated CLAIM (#201). An empty answer is not a channel a
 * responsive model will use. So the prompt gives it a POSITIVE abstention ACTION — emit this token — and the
 * gate maps that token back to the same GEN-12 model-abstained outcome as empty stdout. This is the I-CALM
 * lever the prompt already cites (explicitly rewarding "no answer" improves selective behaviour): the token
 * IS the reward.
 *
 * MATCHING — `isAbstainToken` below. Compared case-INSENSITIVELY, and only after stripping surrounding
 * FORMATTING/PUNCTUATION from the ends (backticks, quotes, asterisks, brackets, trailing period). That end-
 * strip is not cosmetic: it was MEASURED (#201/#202 sentinel probe, 2026-08-11) — Sonnet 4.6 abstained on
 * 5/6 trivial units with a bare `NO-FACT` and on the 6th emitted the same token wrapped in markdown
 * backticks (`` `NO-FACT` ``), which a whole-answer equality check would have miscounted as a fabricated
 * fact. The strip touches only the ENDS, so an answer with any real WORDS beyond the token (e.g. "NO-FACT is
 * returned when the cache is cold") keeps a non-empty remainder and stays a CLAIM — there is no substring
 * path that could swallow a genuine fact.
 *
 * COUPLING: both shipped prompt templates MUST instruct this exact token; `llm.test.ts` and `prompt.test.ts`
 * pin that (the prompt says the word, the gate reads the word — change one, a test goes red).
 */
export const ABSTAIN_SENTINEL = 'NO-FACT';

/** True iff the whole answer is the abstain sentinel, ignoring case and surrounding formatting/punctuation
 *  (see `ABSTAIN_SENTINEL`). Interior words survive the end-strip, so only a bare (optionally wrapped) token
 *  abstains — never an answer that merely mentions it. */
export function isAbstainToken(answer: string): boolean {
  const stripped = answer.trim().replace(/^[\s`'"*.[\](){}]+|[\s`'"*.[\](){}]+$/g, '');
  return stripped.toUpperCase() === ABSTAIN_SENTINEL;
}

/** The bounded spend envelope for the one call — a hard cost cap + a wall-clock timeout (ADAPT-LLM-1). */
export interface LlmBudget {
  readonly costCap: number;
  readonly timeoutMs: number;
}

/**
 * The raw model verdict at a site: a claim, or `null` when the model ABSTAINED here (GEN-12).
 *
 * [#195 leg (c) / ADR-0017] The claim is only produced AFTER the admission gate (`admitModelAnswer`) passes on
 * the raw stdout bytes. Two provenance carriers ride alongside it so W-MINE can trace a fact back to what
 * produced it, and W-MINE can build a grounded abstention when it cannot:
 *   - `rawAnswer` — the VALIDATED stdout bytes decoded as a string, present ONLY when `claim !== null`. Under
 *     ADR-0017 the model REASONS FREELY and then emits one fenced `atlas-fact` block, so these bytes are the
 *     WHOLE envelope (the free reasoning plus the emitted block), NOT a one-line claim. `claim` is the parsed
 *     `claim` field of that block — it is NO LONGER a trimmed projection of `rawAnswer`. Downstream (W-MINE)
 *     scrubs this whole envelope and puts it to CAS; this seam does not scrub and never touches CAS.
 *   - `abstainReason` — on a MALFORMED-answer abstention, the sub-reason a grounded `WhyNot('answer-malformed')`
 *     is built from (`'answer-malformed:not-utf8'` | `'answer-malformed:multi-response'` | `'answer-malformed:unparseable'`).
 *     The plain GEN-12 model-abstained case (empty / whitespace-only stdout, the abstain sentinel, or free
 *     reasoning that emitted NO fact block) stays UNTAGGED (`undefined`): declining to answer is not a
 *     corruption of an answer.
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
      if (r.claim === null) {
        // [#195c] Split the abstention so the MALFORMED case is OBSERVABLE. A tagged `abstainReason` (the
        // sanity gate's `answer-malformed:*`) returns a DISTINCT `{ abstain }` the driver builds a greppable
        // grounded WhyNot from; an UNTAGGED null (empty / model-declined) stays the plain GEN-12 abstention.
        return r.abstainReason !== undefined ? { abstain: r.abstainReason } : null;
      }
      // [#195c] Forward the VALIDATED answer bytes on the now-TYPED `SeedProposal.rawAnswer` field so W-MINE
      // scrubs-and-puts them to CAS as the fact's `answerRef`; this seam does not scrub and never touches CAS.
      const seed: SeedProposal = {
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
 * The verdict rules are what keep the result unambiguous (ADR-0017 — the proposer reasons freely, then emits
 * a parseable candidate block):
 *   - **The output carries EXACTLY ONE fenced `atlas-fact` block ⇒ its parsed `claim` is the claim.** The free
 *     reasoning above the block is scratch and is NEVER persisted as a fact (it rides only inside the scrubbed
 *     `rawAnswer` receipt).
 *   - **NO block (empty stdout, the `ABSTAIN_SENTINEL` token, or free reasoning that declined to emit one) ⇒
 *     abstention** (`claim: null`, untagged GEN-12). Abstention is a valid, unpressured outcome; the presence
 *     of a fact block — not any sentinel word — is the fact signal.
 *   - **≥ 2 blocks, or a malformed/oversize/claimless single block ⇒ a TAGGED `answer-malformed` abstention**
 *     (never a throw, never a fabricated claim). The ≥2-block rule is the 2026-08-04 concurrent-answer splice
 *     guard, now a STRUCTURAL block count rather than a fragile line count.
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

/** [ADR-0017] The fixed byte cap on the parsed candidate block. A fact claim is one sentence; the free
 *  reasoning above the block is NOT parsed, so the object handed to `JSON.parse` is bounded regardless of how
 *  long the model reasoned. (The whole-stdout `execFileSync` `maxBuffer` overflow stays a hard
 *  `ModelCommandError` by design — an operator-broke-config, not a model abstain — ADR-0011's non-zero rule.) */
const MAX_FACT_BLOCK_BYTES = 8 * 1024;

/**
 * [ADR-0017] Every fenced `atlas-fact` candidate block in the raw stdout. The proposer reasons freely and then
 * emits its claim in a fenced block tagged `atlas-fact` — a distinct info string (rather than a bare ```json
 * fence) so incidental code fences inside the free reasoning are never mistaken for the candidate. The lazy
 * `[\s\S]*?` capture is linear (no ReDoS). The COUNT is the admission signal — see `admitModelAnswer`.
 */
function factBlocks(text: string): string[] {
  const fence = /```atlas-fact[^\n]*\n([\s\S]*?)\n```/g;
  const bodies: string[] = [];
  for (const m of text.matchAll(fence)) bodies.push(m[1]!);
  return bodies;
}

/**
 * [#195 leg (c) / ADR-0017] The admission gate on the model's raw stdout bytes, BEFORE they can become a claim.
 * Fail-closed: any failure returns a grounded ABSTENTION, never a fabricated claim.
 *   1. VALID UTF-8 — round-trip the raw bytes (`Buffer.from(text).equals(buf)`). Reading stdout as a Buffer
 *      is what makes this observable: `encoding:'utf8'` would already have replaced bad bytes with U+FFFD.
 *      Fail ⇒ `answer-malformed:not-utf8`.
 *   2. NON-EMPTY — an empty / whitespace-only answer is the model DECLINING to answer (GEN-12), not a
 *      corruption. It stays `{ claim: null }` UNTAGGED, preserving the existing abstention semantics.
 *   2b. NOT THE ABSTAIN SENTINEL — [#201/#202] a bare `ABSTAIN_SENTINEL` (via `isAbstainToken`) is the model
 *      taking the explicit abstention ACTION the prompt offers — the SAME UNTAGGED GEN-12 outcome as empty.
 *   3. INTERLEAVE — a C0 control byte a single answer never carries (byte-overlapping concatenation of
 *      concurrent writers racing one pipe, the 2026-08-04 class). Fail ⇒ `answer-malformed:multi-response`.
 *   4. BLOCK COUNT (ADR-0017, replacing the old line-count heuristic):
 *      - 0 blocks ⇒ UNTAGGED GEN-12 abstention. The model reasoned and declined (or botched the format) —
 *        the safe direction is a miss, never a fabrication; the presence of a block, not any word, is the signal.
 *      - ≥ 2 blocks ⇒ `answer-malformed:multi-response`. Two concatenated answers carry two blocks — the
 *        splice guard, now STRUCTURAL rather than a fragile line count.
 *      - exactly 1 block ⇒ bounded-parse it: oversize / non-JSON / missing-or-empty `claim` ⇒
 *        `answer-malformed:unparseable`; otherwise the trimmed `claim` field is the claim.
 * On a claim the WHOLE validated stdout envelope (free reasoning + block) rides back as `rawAnswer`; `claim`
 * is the parsed block field, NOT a trimmed projection of those bytes.
 */
function admitModelAnswer(buf: Buffer): CompletionResult {
  const text = buf.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(buf)) return { claim: null, abstainReason: 'answer-malformed:not-utf8' };
  const whole = text.trim();
  if (whole === '') return { claim: null }; //                    empty ⇒ GEN-12 model-abstained, untagged
  if (isAbstainToken(whole)) return { claim: null }; //           [#201/#202] explicit abstain token ⇒ GEN-12, untagged
  if (isSplicedAnswer(text)) return { claim: null, abstainReason: 'answer-malformed:multi-response' }; // (a) interleave
  const blocks = factBlocks(text);
  if (blocks.length === 0) return { claim: null }; //             reasoned-then-declined / botched-format ⇒ untagged abstain
  if (blocks.length > 1) return { claim: null, abstainReason: 'answer-malformed:multi-response' }; // ≥2 blocks = splice
  const body = blocks[0]!;
  if (Buffer.byteLength(body, 'utf8') > MAX_FACT_BLOCK_BYTES) return { claim: null, abstainReason: 'answer-malformed:unparseable' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { claim: null, abstainReason: 'answer-malformed:unparseable' };
  }
  const field = (parsed as { claim?: unknown } | null)?.claim;
  if (typeof field !== 'string' || field.trim() === '') return { claim: null, abstainReason: 'answer-malformed:unparseable' };
  return { claim: field.trim(), rawAnswer: text }; //            rawAnswer = the whole validated envelope
}

/**
 * The INTERLEAVE fingerprint (#195 §4). ADR-0017 kept leg (a) verbatim and RETIRED leg (b): under
 * reason-freely, a well-formed answer is MULTI-LINE by construction (free reasoning + a fenced block), so the
 * old "> 1 non-empty line ⇒ splice" heuristic would reject every conforming answer. The concurrent-answer
 * splice guard now lives STRUCTURALLY in `admitModelAnswer` as "≥ 2 `atlas-fact` blocks ⇒ multi-response".
 *   (a) INTERLEAVE — a C0 control byte a single answer never carries (anything below U+0020 except TAB/LF/CR).
 *       Concurrent writers racing one pipe inject stray control/NUL bytes at the splice seam.
 */
function isSplicedAnswer(text: string): boolean {
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) return true; // (a) C0 control byte (not TAB/LF/CR) = interleave seam
  return false; // (b) REMOVED (ADR-0017): the fragile line count is replaced by the STRUCTURAL block count in
  //                admitModelAnswer (≥2 `atlas-fact` blocks ⇒ splice). Leg (a) above stays the interleave check.
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
