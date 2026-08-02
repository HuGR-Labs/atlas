# ADR-0011 — the model is an operator-supplied command, and every constant is a governed default

- **Status:** Proposed (2026-08-02). Closes the **D5** impl-DEFINE (`reference/atlas-adapters.md:203`,
  `invariant-register-adapters.md:176`), which has been `[DEFINE-pending → owner]` since S0. Three findings
  surfaced by the analysis are named in §"What this ADR does NOT close" and are **not** closed here.
- **Spec author:** lead, grounded against `87c23cd` (master).
- **Implements:** `ADAPT-LLM-1` / `INV-ADAPTER-11` (the frozen `SiteProposer` seam), `GEN-2`, `GEN-12`,
  `GEN-13`.
- **Amends:** nothing frozen *in this ADR's decisions 1–4*. `ModelClient`, `SiteProposer`, `CompletionResult`
  and `LlmBudget` signatures are unchanged; `GOVERNANCE_SURFACE` and `WRITE_PATHS` are untouched. Two
  **proposed** amendments (the batch seam, and an additive `quote` on a grounding entry) are stated in
  §"What the owner still has to ratify" and are **not** applied by this ADR.
- **Scope of this seat:** `packages/adapter-io/src/llm.ts` (the model adapter), a new config resolution
  module, `packages/genesis/prompts/**`, and the docs above. It does **not** touch any governed write door.

## Context — measured, not hypothesised

Every claim below was run against master at `87c23cd`.

**The vendor-neutral abstraction already exists and is frozen.** `packages/adapter-io/src/llm.ts` declares
`ModelClient` — one method, `complete(prompt, budget) → { claim: string | null }` — and `createSiteProposer`
over it. This is exactly the "thin port + pluggable adapter" pattern that the field converged on; there is no
formally standardised LLM interface, only the de-facto OpenAI-compatible shape. **Building an abstraction
layer on top of this one would be pure over-engineering.** D5 therefore decides an *adapter and its
configuration*, nothing more.

**Nothing is wired, and nothing is vendored.**

```
grep -rn "anthropic|openai|@ai-sdk|ollama" packages/*/package.json  →  0 matches
packages/adapter-io/src/wire.ts:269   void [createForge, createHistorySource, createSiteProposer];
                                      // "the DAG-pin references NOT wired as handler legs"
packages/cli/src/mine.ts:125          defaultProposer() → { propose: () => null }   // fail-closed
```

`atlas mine .` consequently reports `0 candidates — no proposer model wired`, `llmCalls 0`. That is honest,
tested behaviour (WP-F6), and this ADR preserves it as the zero-config default.

**The escalation ladder is decided and never executed.** `decideMechanisms` (`cost-policy.ts:85`) returns a
closed `Mechanism` set — `types.ts:212`: `'self-consistency' | 'refuter' | 'check-synthesis' | 'codeql'` —
and `escalate()` has **zero production consumers** (`grep '\.mechanisms|escalate('` over `packages/*/src`
returns only the declaration and the binder). Separately, `createSiteProposer` makes exactly one call with no
loop, and `llm.test.ts:61` pins it (`expect(rec.calls).toBe(1)`, teeth: *"a retrying propose records >1"*).
**So no seam in the system can run an escalated site.** This ADR ships the cheap pass only, and says so.

**~40 tuning constants are hardcoded.** Measured across `packages/*/src`: `DAMPING=0.85`,
`PPR_ITERATIONS=64`, `MIN_COMMITS=2`, `BLAME_CONCENTRATION_MAX=0.9`, `CEILING_CAP=200`,
`MARGINAL_WINDOW=20`, `MARGINAL_MIN_ADMITS=4`, `DEFAULT_SAMPLES=1`, `DEFAULT_CEGIS_K=1`,
`INTERVIEW_CAP=20`, `OWN_CAP=1500`, `PACK_CAP=2000`, `MAX_HOPS=2`, `K=8`, `HOTSPOT_MIN_CHURN=2`,
`COUPLING_MIN_SUPPORT=2`, `MEMBER_TOK_CAP=500`, `DECAY_PER_WAVE=0.5`, and others. Some are ratified, some are
spec-declared *defaults*, and some were never examined by anything. Today a reader cannot tell which is which.

**There is already a precedent for a tuning knob in config, and it is in the wrong file.**
`.atlas/policy.json` carries `nearDup.claimNormThreshold`. `policy.json` is admin-owned governance; a
near-duplicate threshold is tuning. The loader (`adapter-io/src/policy.ts:130`) is total and fail-closed,
which is the pattern this ADR reuses.

**The evidence on prompting.** Three results bear directly on the prompt contract D5 must pin:

1. *LLM Abstention Can Be a Prompt Artifact, in Addition to Genuine Uncertainty* (arXiv 2507.16199) — an
   abstention signal is not necessarily faithful to the model's internal uncertainty; part of it is an
   artifact of phrasing. **This is load-bearing for Atlas twice over.** It means a refusal *rate* is partly a
   property of the prompt, so it may not be read as a quality signal unless the prompt is held fixed and
   identified. And it independently *validates* the architecture: because admission is mechanical and GEN-4d
   discards self-declaration, Atlas does not depend on the abstention being faithful. Most extraction systems
   do.
2. *Grounded Knowledge Graph Extraction via LLMs: An Anchor-Constrained Framework with Provenance Tracking*
   (MDPI Computers 15(3):178) — present discovered anchors as a **closed vocabulary** and require explicit
   grounding per element, rather than letting the model generate freely. Atlas's `StructRef` already **is**
   that closed vocabulary; the consequence for the prompt is that the anchor is a *constraint*, not context.
3. *Learning Fine-Grained Grounded Citations for Attributed Large Language Models* (arXiv 2408.04568) —
   requiring the model to extract the **supporting quote** from the source measurably reduces hallucination.
   Atlas has no carrier for one: a grounding entry is `{ anchor, path }`. See §"What the owner still has to
   ratify".

Additionally, *Context-faithful Prompting* (arXiv 2303.11315) names the exact failure mode here — a model
asserting what it knows about a well-known library instead of what the shown bytes say.

## Decision 1 — the model is an operator-supplied command, and Atlas ships no vendor

The concrete `ModelClient` is a **subprocess adapter**: `execFileSync`, **no shell**, argv never
interpolated, stdout/stderr captured — mirroring the `run-git.ts:25` seam the repo already proved.

- **It is the only option that honours the frozen synchronous contract.** `ModelClient.complete` is
  synchronous. Any HTTP or SDK adapter would require amending a frozen signature or blocking on
  `Atomics.wait`. Amending a frozen contract for implementation convenience is what the constitution exists
  to prevent.
- **Atlas adds no dependency and never handles a credential.** In a repo that ships a credential scrubber,
  never being in the credential path is a security property, not hygiene.
- **Atlas's source names no vendor.** Any provider-agnostic CLI, a local runtime, or a two-line `curl`
  wrapper against an OpenAI-compatible endpoint satisfies it equally. Substitution is a config edit, not a
  code change.

Two rules make the adapter's verdicts unambiguous:

- **Empty stdout ⇒ abstention.** No JSON, no parser, no parse-failure mode. This matches GEN-12: abstention
  is a valid, unpressured outcome.
- **Non-zero exit ⇒ error, never abstention.** A broken configuration MUST NOT be able to present itself as
  "this repo has no facts". That confusion is the fail-silent shape this repo has already been bitten by
  (#118, #123, #130), and it is the one failure that would invalidate a whole genesis run invisibly.

## Decision 2 — every constant is configurable; invariants are protected by visibility, not prohibition

**Every tuning constant becomes configurable. There is no exempt set.**

The distinction between a spec-pinned value and a spec-declared default is **not** whether an operator may
change it. It is what the system does when they do:

| | changing a **default** | changing a **spec-pinned** value |
|---|---|---|
| permitted | yes | **yes** |
| effect | none | the run **records the deviation** in its provenance, and `atlas doctor` reports it as running off-constitution |

The rejected alternative was to forbid overriding a spec-pinned constant. It was rejected because the
property this system sells is that it *cannot confidently lie*, not that it *cannot be driven*. A silent
override is the defect; a loud one is a legitimate experiment — and the benchmark programme (#95) requires
sweeping exactly these knobs, so a hard prohibition would make Atlas unmeasurable against itself.

**Two configuration scopes, and the second exists only for safety:**

- `.atlas/config.json` — the tuning knobs. Travels with the repo, which is what A-16 requires of everything
  else. **Numbers and enums only; it can never name an executable.**
- `~/.config/atlas/model.json` (overridable by `$ATLAS_MODEL_CONFIG`) — the model command, and nothing else.
  It is **operator-scoped and never read from the repo**, because a command sourced from a committed file
  means cloning a hostile repository and running `atlas mine` executes arbitrary code. Env-scoped operator
  settings are already the repo's idiom (`ATLAS_ACTOR`, `ATLAS_RATIFY_TOKEN` — `compose.ts:158,163`).

Shape, with `args` as an **array** so nothing is ever shell-split:

```json
{ "roles": { "propose": { "cmd": "…", "args": ["…"] } }, "timeoutMs": 60000, "costCap": 0.05 }
```

`roles` is keyed by the mechanism that issues the call. Only `propose` is populated: `refuter` requires a
different (small) model per GEN-13f, so the role key exists from the start and adding it later is a config
entry plus a template file, never a refactor. **No empty role is shipped** — the shape accommodates them, the
delivery does not fabricate them.

**Absent or malformed config ⇒ today's behaviour**: the fail-closed default proposer, abstaining at every
site. Zero-config runs, and nobody has to write a file to use Atlas.

**`atlas config`** prints every knob with its value, its **source** (default / repo / operator), and whether
it is spec-pinned. Discovering what is tunable must not require reading the source.

**Every knob is an INTEGER, and the canonicalizer is why.** `kernel/canonical.ts:41` forbids a non-integer
number outright — it throws. So a config carrying `0.85` could not be canonicalized, could not reach the
sealed `id` seam, and could not be hashed into provenance at all. A ratio is therefore expressed as a
numerator/denominator pair, which is not a workaround: `rank.ts` already computes the damping in exact
integer fixed-point precisely so a run is byte-identical across machines. The config shape follows the
implementation instead of fighting it.

**Consequence for determinism, and it strengthens the claim.** GEN-1 requires S0+S1 to reproduce a
byte-identical skeleton and ranking at a pinned commit. With the ranking knobs configurable, two operators
with different configs would diverge on the same commit. Therefore **the resolved configuration is hashed
into the run's provenance**, and the guarantee is stated as *byte-identical for the same rev **and** the same
config hash* — which is how Nix and Bazel state reproducibility. This is stronger than the status quo, where
the guarantee is implicit because the numbers are hidden in source.

> **This paragraph originally named `DAMPING` as the worked example, and that was wrong in a way worth
> recording.** `DAMPING = 0.85` had **zero `src` readers**: `pprScores` computed with a private `D_NUM`/`D_DEN`
> pair, and the only assertion anywhere was `expect(DAMPING).toBe(0.85)`, which pinned the decorative copy.
> Exposing `DAMPING` through config would therefore have changed **nothing** in the ranking — the promise
> would have been a lie by omission. Measured before the fix: setting the real damping to `0.50` passed
> **780 tests** (genesis 140, e2e + adapter-io 640). A guard reporting green where it should report red is
> one of the two conditions that stops the line, so it was fixed here rather than filed: the integer pair is
> now the single declaration, the decimal is derived from it, and `ppr-damping-teeth.test.ts` pins the
> ranking OUTPUT. The same mutation is now red — and the pre-existing golden `SCN-GEN-11b-1` recovered its
> teeth as a side effect, having been vacuous for the same reason.

`nearDup.claimNormThreshold` migrates from `policy.json` to `config.json`: it is tuning, and it should not
require admin to adjust.

## Decision 3 — the prompt is a versioned artifact with per-clause justification, not a string literal

The prompt lives at `packages/genesis/prompts/propose.md`, versioned, diffable, reviewable, and **hashed into
the run's provenance**. It is overridable by config, and an override is **recorded, never silent**.

The prompt carries GEN-12 (abstention is valid), GEN-4d (no self-declaration), GEN-6 (a mined signal is not a
fact) and door-2 (non-obvious ∧ actionable, not a restated signature). A prompt that is freely editable *and*
invisible turns those invariants into suggestions. Recording the hash is what keeps it a default rather than
an assumption.

Every clause of the prompt is traceable to an invariant or to a cited result. The load-bearing ones:

- **The anchored subtree is presented as a closed vocabulary; the claim must derive from the shown bytes**
  (MDPI 15(3):178; arXiv 2303.11315). The named failure is asserting library knowledge over shown code.
- **`Candidate.signals` is NOT passed to the model.** GEN-6 forbids churn/SZZ from minting a fact. Withholding
  the signals makes that violation *structurally impossible* rather than instructed against — the signals
  already did their work in ranking, and showing them can only contaminate.
- **Abstention is explicitly valued, not merely permitted** (arXiv 2604.03904). Combined with GEN-4d, the
  model is never asked for a confidence and its self-declaration is never read.
- **No chain-of-thought is persisted** (GEN-12: scratch only).

One placeholder substitution. No templating engine.

## Decision 4 — a default is not shipped until it is justified

Configurability does not discharge the obligation to have a good default; it makes it easier to hide a bad
one. The default is the product for nearly everyone who runs Atlas.

Every constant is therefore classified by **what justifies its default**, and the classification is recorded
next to the value:

| class | justification | examples |
|---|---|---|
| **A — literature** | a citation | `DAMPING_NUM/DAMPING_DEN = 85/100` (the canonical PageRank damping, Brin & Page 1998) |
| **B — spec-pinned** | the ratified invariant | `MARGINAL_WINDOW=20` / `MARGINAL_MIN_ADMITS=4` (GEN-2); `DEFAULT_SAMPLES=1`, `DEFAULT_CEGIS_K=1` (GEN-13); `MAX_HOPS=2` and `K=8` (RETR-11, `atlas-retrieval.md:128-132`, RATIFIED at `invariant-register.md:216`); `OWN_CAP=1500` / `PACK_CAP=2000` / `POKE_CAP=150` (RETR-7/12, RATIFIED at `invariant-register.md:212,217`, with a golden asserting `own == 1500` "not `~1.6K`" at `goldens-ret.md:344`) |
| **C — unexamined** | **none yet** | `PPR_ITERATIONS=64`, `HOTSPOT_MIN_CHURN=2`, `COUPLING_MIN_SUPPORT=2`, `MIN_COMMITS=2`, `BLAME_CONCENTRATION_MAX=0.9`, `INTERVIEW_CAP=20`, `EDGE_CAP=8`, `FINER_CAP=16`, `MANIFEST_CAP=12`, `LOGBOOK_SECTION_CAP=280`, `DECAY_PER_WAVE=0.5`, `NEAR_ZERO_FRECENCY=0.1`, `GIT_MAX_ATTEMPTS=4`, `MAX_CAS_BYTES=64MiB` |
| **N — not a knob** | a stated invariant or a format version, not a tunable | `PUSH_GRANTS_REQUIRED=0`, `RECONCILE_MODEL_CALLS=0`, `ASSIGN_MODEL_CALLS=0`, `OKF_VERSION=1`, `FP=1e9` |

**This table was wrong in its first draft, and the correction is the point of the exercise.** It originally
placed `K=8`, `MAX_HOPS=2` and `OWN_CAP=1500` in class C. All three were already through the S0 ratification
gate: `atlas-retrieval.md:128-132` states `maxHops = 2` and `K = 8` in MUST clauses, `invariant-register.md`
marks RETR-7/11/12 **RATIFIED** with those exact numbers as acceptance criteria, and `goldens-ret.md:344`
carries a golden with teeth against the `own` cap drifting off `1500`. Writing the rule is not the same as
applying it; the classification is only worth anything done against the register, file by file.

**Two constants resist all four classes, and the rubric should grow rather than mislabel them.**
`MAX_ATTEMPTS=64` (`sidecar-commit.ts:42`) is justified by an in-repo stress measurement recorded in its own
comment — no external citation (not A), no ratified doc clause (not B), but demonstrably not unexamined.
`RETAINED_GENERATIONS=4` is stronger still: the code states its **correctness** depends on the exact value,
and that boundary is enforced by unit tests rather than by any `docs/` artifact. Both are provisionally
recorded as C with a note; a fifth class (**test-pinned / measured-in-repo**) is the honest fix and is left
for the classification WP rather than invented here.

A class-C value is labelled **provisional**, never "default", until measured. Its measurement comes from the
genesis run over Atlas itself — which is what the calibration stage is for, and it closes the loop: the
dogfood run produces the evidence that fixes the defaults.

**A knob whose default nobody can justify is a finding**: either it does not matter, and it should not be a
knob, or it does, and it must be measured. `PPR_ITERATIONS = 64` is already suspect under this rule — the
standard practice in power iteration is to iterate to a residual tolerance, not a fixed count, so a fixed
count is either wasteful or insufficient depending on the repository, and neither is currently observable.

## What this ADR does NOT close

Three findings surfaced while measuring D5. None is closed here; each is recorded so it is found by
reading rather than by rediscovery.

1. **The GEN-13 escalation ladder is planned and never executed.** `escalate()` has zero production
   consumers, and `createSiteProposer` structurally cannot run an escalated site (one call, golden-pinned).
   The `check-synthesis` path is a CEGIS state machine — synthesize → compile → HOLDS-on-current-code →
   TEETH-flip-on-a-mutant, with a bounded refine (`K≤1`) and **two distinct terminals** (`drop` for
   un-repairable and `drop` for vacuous, which must not be conflated or the anti-vacuity clause becomes
   decoration). It needs a sibling seam, and `INV-ADAPTER-11` states flatly that `SiteProposer.propose` is
   *the only place a model is invoked in the whole system*. That invariant must be amended, or re-read as
   scoped to the cheap pass, before escalation can land. When it does, the modelling idiom is already in the
   repo: `align.ts:69` models its ratify router as a closed edge set so that *"no auto-promote transition is
   expressible"* — an illegal transition should not typecheck.
2. **A `T0` candidate marked `certain` receives the cheap pass.** `decideMechanisms` returns `[]` on
   `!(highValue ∧ uncertain)` **before** it ever reads the tier, so `runsRefuter(tier)` is unreachable unless
   both legs already hold. GEN-13 says high-value is *"(tier/blast)"*, implying `T0 ⇒ highValue`, but
   `highValue` arrives from an injected `SignalOracle` and **nothing enforces the implication** — the binding
   exists in prose, not in mechanism. This is the ARCH-9 shape (a seam that reads as a closure). It is
   **dormant**, because nothing consumes `escalate()`. The open question is whether `T0` forces escalation or
   a certain `T0` may pass cheap; it is an owner decision, and it belongs to the escalation work.
3. **`EscalationDecision` overloads the word "tier" inside a single type.** `readonly tier: Tier` is the
   *governance* class (`T0`/`T1`/`T2`), while the same interface's doc comment uses "base tier" for the
   *cost* level. They are independent, and conflating them is precisely how a highest-criticality site gets
   read as cheap. Prose in this repo should say **cheap pass / escalated pass** for cost, and reserve "tier"
   for the governance class.

## What the owner still has to ratify

Neither item is applied by this ADR.

1. **The batch seam (a frozen-contract amendment).** The cheap pass is strictly serial: `execFileSync`
   blocks, so ~200 sites run one after another. The constraint is the synchronous contract, not the adapter
   — every adapter behind a synchronous port is serial. The spec supplies the fix: GEN-2's marginal-value
   stop is a **trailing window of 20**, so the window *is* the natural unit of parallelism. A seam shaped
   `complete(prompts[]) → results[]` keeps the stop's sequential admit-rate feedback per window while letting
   the adapter run the window concurrently — roughly an order of magnitude of wall-clock on the cheap pass,
   with no change to "one bounded call per site". It amends `ModelClient` and the `expect(rec.calls).toBe(1)`
   golden, so it is a ratification, not a WP decision.
2. **An additive `quote` on a grounding entry.** The strongest evidence-backed lever available (arXiv
   2408.04568) is to require the model to extract the supporting span. A grounding entry carries
   `{ anchor, path }` and has nowhere to put one. The proposal is an **optional additive** field, precedented
   by `cost?` / `resumeToken?` on `GenesisReport`. Claimed benefits are hallucination reduction at proposal
   time and legibility for a human reading the node. **No drift-precision benefit is claimed** — that would
   need measuring, and the "false drift on reformat" family (#125) is exactly where this repo has overclaimed
   before.

## Alternatives rejected

- **An HTTP client against the OpenAI-compatible shape.** Rejected: it is the de-facto standard, not a
  standard, so "vendor-neutral" would in practice mean "OpenAI-shaped or proxied" — Anthropic's own API is
  not that shape. It would also put Atlas in the credential path and force a frozen-signature amendment for
  async, buying nothing the subprocess does not already give.
- **An SDK or a unified-provider library.** Rejected as over-engineering on measured grounds: `ModelClient`
  is already the vendor-neutral port such libraries provide. Adding one would be an abstraction over an
  abstraction, plus a dependency, plus a vendor list in `package.json`.
- **Shipping a default model.** Rejected: any default names a vendor in Atlas's source. Fail-closed
  abstention is already the tested behaviour and is the honest zero-config state.
- **Forbidding overrides of spec-pinned constants.** Rejected — see Decision 2. Visibility, not prohibition.
- **Leaving the constants hardcoded and calling them "the defaults".** Rejected: it conflates *studied* with
  *unexamined*, and it makes the benchmark measure a point instead of a curve.
