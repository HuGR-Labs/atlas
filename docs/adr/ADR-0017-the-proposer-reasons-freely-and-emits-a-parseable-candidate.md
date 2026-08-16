# ADR-0017 — the S2 proposer reasons freely and emits a parseable candidate (the prompt-precision ship)

- **Status:** Proposed (2026-08-11, revised after cold review round 1). Grounded against master `4bb54a5`.
  Needs owner (admin) ratification of the ratified-surface amendments named in "What the owner ratifies",
  plus a green `gate` CI check, before it merges. The lead does not self-ratify a ratified surface.
- **Spec author:** lead.
- **Relationship to the withdrawn `ADR-0016`:** ADR-0016 tried to ship the *whole* `INV-GEN-12` machine (typed
  candidate **plus** a deterministic synthesized-check admission engine **plus** an LLM fallback) in one step,
  and failed cold review with a T0 self-certification hole and a ~5-surface blast radius (ADR-0016
  §Review findings). This ADR is the **smaller, measured** subset: it improves the **proposer** and nothing
  else. Cold review round 1 (three seats) CONFIRMED the smaller scope genuinely closes ADR-0016's T0
  (no model-supplied predicate), its INV-ADAPTER-11 violation (no second model call), and its ADR-0015
  over-reach (nothing new persisted) — see §Review round 1. It also caught one real under-scoping (the
  answer-admission gate) and a vacuous DoD, both fixed in this revision. The deterministic-check engine
  remains the separate future track, explicitly OUT of scope here. ADR-0016 is retained as the record of
  the rejected design.

## What this ADR is, in one sentence

It swaps the shipped S2 prompt for the one **measured** to eliminate the hallucination, and adapts the model
answer-admission seam to read that prompt's output. It is a **better proposer, not a new verifier** — read the
honesty section before assuming otherwise.

## Scope — the PROPOSE step and the answer-admission seam that reads it

- **Amends (ratified / provenance surface):** `ADR-0011` **Decision 1**, in two coupled ways:
  1. its rule *"Empty stdout ⇒ abstention. **No JSON, no parser, no parse-failure mode.**"* → a bounded parser
     (Decision 2);
  2. its single-response **answer-admission gate** `admitModelAnswer` / `isSplicedAnswer`
     (`packages/adapter-io/src/llm.ts:203-225`, teeth-pinned `test/llm-command-client.test.ts:135`), whose
     leg (b) *"> 1 non-empty line ⇒ multi-response ⇒ abstain"* rejects any multi-line answer. A reason-freely
     answer is multi-line by construction, so this gate MUST change with the parser. This is a #195-provenance
     and 2026-08-04-splice-guard surface; it is now listed (cold review round 1 caught it unlisted). The
     replacement (Decision 2) preserves concurrent-answer splice detection **by structure**, not by line count.
- **Everything else in ADR-0011 Decision 1 is unchanged:** the model is an operator-supplied subprocess;
  non-zero exit ⇒ error (never abstention); the truncated-output salvage; leg (a) of `isSplicedAnswer` (the
  C0-control-byte concatenation check) stays as-is.
- **Does NOT change** the frozen `CompletionResult` shape. `claim` stays `string | null`; `rawAnswer?`,
  `abstainReason?` unchanged (`abstainReason` is a free `string`, so the new `answer-malformed:unparseable`
  sub-reason needs no signature change — verified `extract.ts:188`). `ModelClient`, `SiteProposer`,
  `LlmBudget` signatures untouched.
- **Does NOT** introduce a model-supplied `predicate`/machine-check (no self-certification T0 — the model
  never supplies the object that would admit its own claim; confirmed round 1).
- **Does NOT** wire any admission engine, synthesize any check, or run any teeth/mutation gate.
  `compose-mine-admission.ts`'s predicate legs stay the fail-closed no-ops they are today.
- **Does NOT** add any second model call. Still exactly one `SiteProposer.propose` per site, zero out-of-band
  calls — `INV-ADAPTER-11` untouched (confirmed round 1: the one place this ADR correctly sheds ADR-0016's
  blast radius).
- **Does NOT** persist `factClass`, `anchors`, or `evidence`. They are reasoning scaffolding the prompt uses
  and the harness discards; they ride only inside the already-scrubbed `rawAnswer` receipt, never become fact
  identity legs, never separate CAS objects, and grounding still comes from `reground(cand.site)`. `ADR-0015`'s
  four shapes and the `kind` discriminant are not reopened (confirmed round 1).

## Context — the number and the ablation, both measured

`bench #95` over Atlas's own repo, `claude-sonnet-4-6`, same 40 whole-file sites, byte-identical bytes:

- **Shipped path (baseline):** 31/40 = **77.5% precision, 22.5% hallucination** — 9 false facts passed the
  grounding door and were seeded. Grounding proves a claim is *about* the anchored bytes; not that it is *true*.
  Dominant failure: the shipped prompt's *"NO REASONING, ONE LINE"* clause makes the model read a stale/
  past-tense **comment** as current code and state it as a fact (task #201).
- **Redesigned prompt (`propose-v2`, reason-freely → emit-structured, distrust comment/name/prior):** 40/40 =
  **100%, 0 hallucination**, verified by coached + blind + context-isolated-panel adjudication (Fleiss κ =
  0.877, catch 9/9 on planted falses, 0 false-alarm). Broader 90-site run: 88/88 grounded+true, 2 correct
  abstentions.
- **Ablation (2026-08-11) — the envelope is load-bearing, not just the clauses.** A variant with the identical
  sharpened clauses but SILENT reasoning and a claim-only wire (the *pure* current D1 contract, no parser)
  scored **92.5% (37/40), 3 hallucinations, 0 abstention**. The three falses were an over-claim resting on a
  comment, a claim about another unit's internals, and a run-on claim that inverted its own logic — exactly the
  failure modes the visible reason-then-refute step and the structured atomic-claim emission suppress. So the
  100% requires the reason-freely + emit-parseable envelope; the clause-only degradation leaves a residual 7.5%
  hallucination, which the owner's 0-hallucination floor rejects.
  (Full: `scratchpad/s2-ablation/ABLATION-RESULT.md`.)

**Measurement caveat (round-1 honesty).** The 100% was measured by a research harness that parsed the *last*
fenced JSON block of each answer and did NOT run the shipped `admitModelAnswer` gate. The shipped admission
rule below is **exactly-one-block** (stricter than last-block), so the DoD re-runs the number through the
SHIPPED path/rule; the 100% transfers only if the shipped rule reconfirms it. Labeled, not assumed.

**The D1 "no parser" premise was already dead.** Task #202 measured empty-stdout abstention NEVER fires
(0/300) — which is why the shipped path already bolted on the `NO-FACT` sentinel + an end-strip matcher.
D1 is already a patchwork around a premise that did not hold. Amending it to a bounded, structure-checked
parser that measurably delivers 100% + honest abstention is the honest correction.

## Decision

**1. Replace the shipped prompt.** `packages/adapter-io/prompts/propose.md` becomes the measured `propose-v2`:
reason freely in a discarded scratch region, actively refute the candidate against the bytes, then emit
**exactly one** fenced-JSON block, or no block at all to abstain. The prompt is a versioned artifact hashed
into provenance (`ADR-0011` Decision 3), so the swap is a governed change; what is new is that its output is
parsed.

**2. Admission-by-block-count, then a bounded parse.** In `packages/adapter-io/src/llm.ts`, replace leg (b) of
`isSplicedAnswer` (the line-count heuristic) with a **fenced-JSON-block count** over the raw stdout:
- **0 blocks ⇒ GEN-12 abstention** (`claim = null`, untagged). This covers "reasoned, then declined" cleanly —
  the presence of a fact block, not the `NO-FACT` word, is the fact signal. A prose answer that botched the
  format also lands here: abstain (safe direction — a miss, never a fabrication).
- **exactly 1 block with a non-empty `claim` field ⇒** parse it; `claim` = that field.
- **exactly 1 block with a missing/empty `claim`, OR ≥ 2 blocks ⇒** `answer-malformed` abstention (tagged
  `answer-malformed:unparseable` / `:multi-response`). **≥ 2 blocks preserves and strengthens the 2026-08-04
  concurrent-answer splice guard**: two concatenated answers carry two blocks and are rejected — a structural
  detector, not a fragile line count. Leg (a) (C0-control-byte concatenation) is kept unchanged.
- A **hard size bound** on the parsed block (a fixed byte cap, e.g. 8 KiB — a fact claim is one sentence; the
  reasoning scratch is not parsed). `execFileSync`'s `maxBuffer` overflow stays a hard `ModelCommandError`
  by design (operator-broke-config, not a model abstain — ADR-0011's non-zero-exit rule). `JSON.parse` is
  linear (no ReDoS). Parse/shape failure ⇒ tagged abstention, never a hard run failure.
- `rawAnswer` stays the raw stdout bytes (the full envelope), reaching CAS only through `answerReceipt`, which
  **scrubs before CAS** (`mine-decide.ts:184-188`, `mine-answer.ts:47-56`; #207 verified round 1). No new
  unscrubbed path.

**3. Persist nothing new.** The stored fact is the same `advisory` shape, its `claimNorm` derived from the
parsed `claim` (scrubbed at `mine-decide.ts:140`). `factClass`/`anchors`/`evidence` are dropped after the
parse. Wiring them into typed nodes (#196) and building the deterministic check engine (`INV-GEN-12`) are
separate, later tracks with their own ADRs.

## Honesty — what this does and does not buy

- It closes the hallucination **at the source (generation)**: measured 77.5% → 100% on the benchmark set. That
  is the whole win, real and shippable on its own.
- It is **not a mechanical admission gate.** The shipped `mine` still admits on the grounding/about-ness door;
  this ADR makes the model *generate* better facts, it does not *reject* a bad one. A future model regression
  emitting a grounded-but-false claim would still pass. The mechanical gate that would catch it is
  `INV-GEN-12`'s deterministic typed-candidate + harness-synthesized check + teeth engine — the real bulk of
  ADR-0016, still unbuilt, still the future track. This ADR neither delivers nor claims it. (Round 1 confirmed
  this section is accurate against `compose-mine-admission.ts`.)
- **Forward-compat debt (named, round 1):** the provenance-hashed prompt now commits to a JSON output contract
  (field names). The future INV-GEN-12 engine track must stay compatible with it or force a re-measurement of
  the number. Small, but real, and stated here rather than discovered later.
- **Measured vs projected:** every number is **measured** (the redesigned prompt, adjudicated by panels); the
  DoD reconfirms it under the shipped exactly-one-block rule. Nothing is projected onto an unbuilt path.

## Definition of Done — split into what CI can mechanize and what it cannot

A prompt swap is a *generation* change, so the gates are generation gates. Round 1 caught the original DoD
passing vacuously on an all-abstain run; this splits and closes it.

**Mechanizable (the `gate` CI check must all pass):**
1. **Retention leg (fixes the vacuity hole):** a black-box `atlas mine` (new prompt wired) over the 40 baseline
   sites ADMITS a **non-empty** set of grounded facts — an all-abstain run FAILS the gate. (Without this leg an
   engine that abstains on everything passes trivially — ADR-0016 §Review F4, reproduced-and-now-fixed.)
2. **Regression leg:** none of the 9 known baseline hallucination claim-strings reappears among the admitted
   facts. (Stated honestly as a fixed-set regression guard, not a precision measurement — a generation change
   could still introduce *new* grounded-but-false claims this leg cannot see; that residual is the
   not-a-mechanical-gate limit above.)
3. **Splice/parse legs (unit):** two concatenated fenced-JSON answers ⇒ abstain (`:multi-response`, the
   2026-08-04 guard, now block-count based); malformed/oversize/missing-claim ⇒ abstain, never throw; a single
   valid block ⇒ the claim. The teeth-pinned `llm-command-client.test.ts` splice test is updated to the
   block-count rule, not deleted.

**Non-mechanizable (offline gate, human/panel — labeled as such, NOT a CI assertion):**
4. The **precision** number (adjudicated true, 0 hallucination) is re-derived by the context-isolated panel
   (κ / catch-rate) over a fresh `atlas mine` run through the shipped exactly-one-block rule, confirming the
   100% transfers from the research harness to the shipped path. This needs a paid, nondeterministic model call
   + panel adjudication; it cannot live in `gate` CI and is not claimed to.

## What the owner ratifies

1. **Amend `ADR-0011` Decision 1** (a) the *"no JSON, no parser, no parse-failure mode"* rule → the bounded
   parser of Decision 2; **and** (b) the `admitModelAnswer`/`isSplicedAnswer` single-response gate → the
   block-count admission of Decision 2 (splice detection preserved by structure). (ADR-0011's model-as-subprocess
   transport decision, non-zero-exit rule, and salvage are untouched.)
2. **Replace `prompts/propose.md`** with the measured `propose-v2`, removing the *"NO REASONING, ONE LINE"*
   clause.
3. Accept the **DoD split** above: the three mechanizable legs as `gate` merge requirements, the precision
   re-adjudication as a labeled offline gate.

Nothing else on any ratified surface changes. Nothing merges until (1)–(3) are owner-ratified and `gate` is
green. Also updates the now-false #195 provenance comments (`llm.ts:65`, `extract.ts:41`: `claim` is the
parsed `claim` field, no longer the trimmed projection of `rawAnswer`) — a doc-truth fix, not a ratified
surface.

## §Review round 1 (cold review 2026-08-11 — three seats: billy T0, lucy spec-conformance, bobby architecture)

**Confirmed sound (all three, with code evidence):** no model-supplied predicate ⇒ ADR-0016 F1 T0 closed
(`admit-proposals.ts:26-36` + RED test `admit-harness.no-fabricated-check.test.ts`); INV-ADAPTER-11 intact,
exactly one in-process call, no fallback (`llm.ts:95-97`); `CompletionResult` shape unchanged; parse-fail→
abstain design sound (linear parse, no ReDoS); `rawAnswer`→`answerReceipt` scrubs before CAS
(`mine-answer.ts:47-56`) and grounding = `reground(cand.site)` so no forgery (`mine-gate.ts:114-117`); evidence
rides the scrubbed receipt, closing ADR-0016's evidence-scrub concern; factClass/anchors/evidence not persisted,
ADR-0015 untouched; honesty section accurate; 100% not attributed to an unbuilt path.

**Fixed in this revision:**
- **BLOCKER (all 3):** "amends ONLY D1" was false — the multi-line answer is rejected by the unlisted
  `isSplicedAnswer` single-response gate (`llm.ts:222-225`, teeth `llm-command-client.test.ts:135`), a #195/
  splice-guard surface. → Now listed (Scope item 2) and replaced by the block-count rule (Decision 2) that
  preserves splice detection structurally.
- **MAJOR/security (billy):** "take the last block" + a relaxed guard ⇒ cross-site claim-lift. → Replaced by
  **exactly-one-block-or-abstain**; ≥2 blocks abstains.
- **MAJOR (bobby+lucy):** DoD passed vacuously on all-abstain. → Added the **retention leg** (non-empty admit
  required) + split mechanizable vs offline; regression leg re-labeled as a fixed-set guard, not a precision proof.
- **MINOR (billy):** the "existing answer-size envelope" did not exist. → Replaced with a concrete byte cap;
  `maxBuffer` overflow stays a hard error by design.
- **MINOR (lucy):** the #195 "claim is rawAnswer's trimmed projection" comments become false. → Comment-truth
  fix listed under "What the owner ratifies".
- **MINOR (bobby):** forward-compat debt of the JSON output contract. → Named in the honesty section.
