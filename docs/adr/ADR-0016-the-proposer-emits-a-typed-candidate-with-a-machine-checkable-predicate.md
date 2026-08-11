# ADR-0016 — the proposer emits a typed candidate carrying a machine-checkable predicate

- **Status:** Proposed (2026-08-11). The *principle* is the already-ratified `INV-GEN-12`; what is **new and
  requires owner ratification** is (a) widening the shipped output contract that `ADR-0011` froze, and (b) the
  measured blast radius below. This ADR is written so the owner ratifies a **measured scope**, not a summary.
- **Spec author:** lead, grounded against master `4bb54a5`.
- **Resolves:** the standing gap where the SHIPPED proposer path (`{ claim: string | null }`, "no reasoning,
  one line") is **strictly narrower than its own ratified invariant** `INV-GEN-12`, which mandates *typed
  candidates* + a *synthesized mechanical check* + a *HOLDS-then-mutation-flip* admission. The shipped path is
  a degradation of the constitution, not a faithful implementation of it. This is the same gap tasks #96
  (output contract), #196 (12 fact types emitted by none), and #99 (cannot ground negation/relation/
  transition) each name from a different angle.
- **Amends (ratified surface — the ONE thing that needs ratification):** `ADR-0011` **Decision 1**, the model
  output contract `ModelClient.complete(prompt, budget) → { claim: string | null }` and its gloss "the model's
  only contribution is `claimNorm` (a string)". It becomes a **typed candidate**. The shipped artifact
  `packages/adapter-io/prompts/propose.md` (hashed into provenance by `ADR-0011` Decision 3) changes with it.
- **Conforms to, does NOT amend:** `INV-GEN-12`, `INV-GEN-4`, `INV-GEN-13`, `ADR-0015`. Each is quoted below
  showing the new path *satisfies* it — "it survives" is defended, not assumed.
- **Does NOT touch:** the `ADR-0011` transport decision (the model is still an operator-supplied subprocess;
  the seam stays price-blind and command-shaped), `INV-GEN-5` (candidate-only + human interview), `ADR-0012`
  (obviousness scored, never gated), the ratify router (`align.ts`).

## Context — the shipped path diverged from its own invariant

`INV-GEN-12` (`docs/requirements/method-tags-gen.md:95`), **ratified**, already specifies exactly the machine
this ADR ships. Quoted, not paraphrased:

> "proposer-in-a-harness, never an oracle: in S2 the LLM only *proposes* **typed candidates** and admission is
> **mechanical** — a predicate is admitted iff its synthesized `check` **compiles**, returns **HOLDS** on
> current code, **and flips to BROKEN on a mechanically-mutated counterfactual** of the anchored subtree (the
> teeth / anti-vacuity gate); a failing check → REFINE ≤K then drop, never force; … **chain-of-thought is
> never persisted; abstention is a valid outcome**; a predicate is labelled a *machine-checked likely
> invariant*, never a proof; a type-expressible slot prefers the sound type-checker / LSP over a synthesized
> query"

The SHIPPED path implements a strict subset of this and nothing more:

- `packages/adapter-io/src/llm.ts` — `CompletionResult.claim: string | null`. One line of prose or an
  abstention. **No typed candidate, no synthesized check.**
- `packages/adapter-io/prompts/propose.md` — "NO CONFIDENCE, NO REASONING, ONE LINE … Output either exactly
  one line of plain prose … or the single token `NO-FACT`." **CoT is not merely un-persisted; it is
  forbidden** — which `INV-GEN-12` never asked for (it forbids *persisting* CoT, not *doing* it).
- `packages/genesis/src/admit-harness.ts` — the `compile→HOLDS→mutate→BROKEN` engine `INV-GEN-12`'s down-model
  names **exists as a reference model**, but the shipped `mine` admit path does not synthesize or run a check;
  it admits on the grounding (about-ness) door alone.

The consequence was **measured**, not asserted (bench #95, 2026-08-11, `atlas mine` over its own repo):

- Shipped path: **31/40 = 77.5% precision, 22.5% hallucination** — 9 false facts passed the grounding door
  and were seeded. Grounding proves a claim is *about* the anchored bytes; it does **not** prove it *true*.
  Dominant failure: the one-line-no-reasoning model reads a stale/past-tense **comment** as current code.

## Decision

**1. The proposer output becomes a typed candidate.** `ModelClient.complete` returns, in place of
`{ claim: string | null }`, a structured candidate or an abstention:

```
{ claim: string,               // one atomic sentence (the human-readable fact)
  factClass: 'PRESENCE' | 'RELATION' | 'ABSENCE' | 'TRANSITION' | 'RATIONALE',   // ADR-0015 shape
  anchors: string[],           // identifiers/symbols the fact is about; each MUST occur in the shown bytes
  evidence: string,            // the CODE (not a comment) the claim re-derives from
  predicate?: MachineCheck }   // an optional check the deterministic engine can decide (INV-GEN-12)
| NO-FACT                       // the GEN-12 abstention, unchanged in meaning
```

The model **reasons freely in a discarded scratch region and then emits the structured candidate** —
constraining the *format*, never the *thinking*. This satisfies `INV-GEN-12`'s "chain-of-thought is never
persisted" exactly (the scratch is discarded before storage) while removing the shipped prompt's *extra*
"NO REASONING" clause, which the measurement shows is the direct cause of the 22.5% hallucination.

**2. Admission runs the two-layer verifier `INV-GEN-12` already prescribes, in cost order:**
- **Deterministic engine first (zero model):** the candidate's `predicate` is evaluated —
  compile → HOLDS on current bytes → **flip to BROKEN on a mechanically-mutated counterfactual** (the ratified
  teeth gate). A predicate that HOLDS-and-flips admits its fact; one that survives its own mutation is
  vacuous and dropped (`INV-GEN-12` anti-vacuity). This is the `admit-harness.ts` engine, **wired into the
  shipped path** — see the reachability requirement below.
- **Context-isolated fallback for the ~77% a single predicate cannot encode** (cross-file, counts, relations,
  type-shape, rationale): a COLD agent that never sees the proposer's context re-derives the verdict from the
  bytes. Decorrelation is by *context isolation* (Chain-of-Verification), not model family — no external
  provider is required.

**3. Abstention, obviousness, and the ratify router are unchanged.** `NO-FACT` still means GEN-12 abstention;
obviousness is still scored, never gated (`ADR-0012`); genesis still writes candidates only and a T0/contested
fact still reaches `ratified` only through the batched human interview (`INV-GEN-5`).

## Why the invariants are CONFORMED, not amended

- **`INV-GEN-12`** — the new path *is* its down-model: typed candidate, synthesized check, HOLDS + mutation
  flip, CoT discarded, abstention valid, sound-oracle-first (the deterministic engine runs before any LLM
  fallback). The shipped path was the subset; this closes it to the whole. **No text changes.**
- **`INV-GEN-4`** ("grounded from birth; no seed self-declares true; obviousness never rejects, only scores")
  — the candidate is still grounded at `source@sha`; the model never self-certifies (the deterministic engine
  and the isolated agent decide, not the proposer); obviousness stays a stored score. **Conformed.**
- **`INV-GEN-13`** (cost discipline — one call at base tier) — still one proposer call per site; the
  deterministic engine is free (no model); the isolated-agent fallback is the escalation, gated on the
  predicate being NA. Measured cost 1.6× the baseline per site (reasoning tokens), reported per stage.
  **Conformed** (escalation is value-gated, not default-on).
- **`ADR-0015`** (grounding tokens typed by fact shape) — `factClass` is exactly its taxonomy; this ADR is
  the first *producer* of it. **Realizes, does not amend.**

## The reachability requirement (non-negotiable — the trap this repo has hit before)

A check-engine that is rigorously tested **as a reference model** but never **reached** by the shipped admit
path guards nothing (the "reference model vs shipped path" failure, memory `reference-model-vs-shipped-path`;
D5, task #155). Therefore this ADR is not satisfied by wiring `admit-harness.ts` into `mine` — it is satisfied
only when a **black-box subprocess test** proves that a **known-false fact is REJECTED on the shipped `atlas
mine` path** (not in a unit test of the harness). The 9 measured baseline hallucinations are the ready-made
adversarial set; the gate must show `mine` now drops them.

## Consequences

- **Precision:** measured 77.5% → **100%** (88/88 grounded+true, 0 hallucination) across 90 sites, two
  samples, verified by coached + blind + context-isolated-panel adjudication (Fleiss κ = 0.877, catch 9/9 on
  planted falses, 0 false-alarm). Numbers and method: `#95` benchmark artifacts.
- **Cost:** +≈60% per site (reasoning tokens), within `INV-GEN-13`'s ceiling reporting.
- **Recall:** the deterministic engine operates at the STRICT point (emit a predicate only when it encodes the
  claim EXACTLY, else defer to the isolated agent) — 100% sound / 0 false-alarm on what it decides, so it
  never strips a true fact. A false-alarm that rejects a true fact is the worst outcome and is designed out.
- **Migration:** the `{ claim: string | null }` contract is widened, not broken — an operator command that
  still emits one line is read as `{ claim, factClass: 'PRESENCE', anchors: [], predicate: undefined }` and
  routes entirely to the isolated-agent fallback, so no operator integration hard-fails on day one.

## What the owner still has to ratify

1. **Amend `ADR-0011` Decision 1**: the proposer output contract widens from `{ claim: string | null }` to the
   typed candidate above. (ADR-0011's *transport* decision — model-as-subprocess — is untouched.)
2. **Replace the shipped `prompts/propose.md`** with the reason-freely→emit-structured prompt (measured
   `propose-v2`), removing the "NO REASONING, ONE LINE" clause.
3. **Accept the reachability gate** as a merge requirement: `mine` must be shown, black-box, to reject the 9
   known-false facts.

Nothing merges until (1)–(3) are ratified by the owner (admin), and the `gate` CI check is green. The lead
does not self-ratify a ratified surface.
