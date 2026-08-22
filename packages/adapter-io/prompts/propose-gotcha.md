<!--
ADR-0011 Decision 3 / 196b justified vertical slice — the S2 GOTCHA (surprising-behavior) proposal prompt.
This file IS the artifact: it ships as written, it is hashed into the run's provenance, and an operator override
is recorded rather than silent. It is a SIBLING of `propose.md`, selected by the gotcha mining arm
(`ATLAS_MINE_SLOT=gotcha`); the advisory, dependency and count prompts are unchanged.

`gotcha` is a SEMANTIC slot — there is NO oracle and NO candidate list. It exercises the `justified` path
(genesis-epistemic-contract.md §JUSTIFIED): a grounded, contestable reading whose GROUNDS travel with the
fact. So this prompt asks for TWO things the advisory prompt does not: a `claim` AND a `derivation` — the
compact chain from the cited bytes that leads a reader to the SAME conclusion, the seal's witness-analog.
UNLIKE the discarded scratch reasoning (STEP 1), the derivation IS persisted (`node.derivation`); it must be
the grounds, not free rambling — see `proven-vs-justified.md` (`justified` = "the model self-refuted it
against the bytes, and it is stated as a contestable reading").

Every clause is traceable. HTML comments are stripped before the text reaches the model.

  · REASON FREELY, THEN EMIT ONE PARSEABLE BLOCK (ADR-0020) — inherited from `propose.md` unchanged: the
    "no reasoning, one line" contract measured 77.5% precision (the model read a stale COMMENT as current code
    and stated it, #201); reasoning-first + one fenced block measured 100%/0-hallucination. The model reasons
    in a discarded scratch region, actively refutes its candidate against the bytes, THEN emits exactly one
    fenced `atlas-fact` block. GEN-4d holds (no self-declaration/confidence field). GEN-12 holds — the free
    reasoning is SCRATCH, parsed away; only the block survives (`llm.ts admitFactBlock`).

  · TWO FIELDS, `{claim, derivation}` — this is the 196b amendment over `propose.md`'s single-`claim` block.
    `claim` is the one surprising sentence; `derivation` is the compact, CONTESTABLE chain from the shown
    bytes that leads a reader to the same conclusion. `derivation` is PERSISTED (the `justified` seal's
    witness-analog), so it must cite the bytes — the declaration, control flow, types or literals that force
    the claim — NOT the model's private train of thought. The parser (`gotchaClaimParser`, llm.ts) lifts both;
    a block with no non-empty `derivation` ABSTAINS. COUPLED to `llm.ts`; pinned by test.

  · A GOTCHA, NOT A RESTATED SIGNATURE — a gotcha is a SURPRISING behavior a competent engineer would NOT
    expect from this unit's name and signature: a silent edge case, a non-obvious side effect, a footgun in
    the API, an ordering/lifecycle constraint the type does not reveal. This is the harness's obviousness
    intent (ADR-0012, `TwoDoorBar.nonObvious`) applied at selection time — a restated signature is not a
    gotcha and is not worth recording.

  · CODE-DERIVABLE, NOT A COMMENT ABOUT ELSEWHERE — [#201/#214] the #95 pilot measured the residual failure:
    the model surfaced an ACCURATE comment's claim about OTHER files / task numbers / past-state / codebase-
    wide absences, and the grounding gate admitted it because the comment IS in the bytes — but such a fact
    does NOT re-derive at THIS unit@sha (it rots where it was anchored). The gotcha must be checkable by
    reading the CODE of this unit, not by trusting a comment about code not shown. Re-measured, this clause
    took comment-restatement 9 → 0 on the same sites.

  · NO UNVERIFIED COUNT OR ENUMERATION — [#214] pushed to code-derived facts, the model kept the qualitative
    core right but appended a WRONG exact count. A number or exhaustive list is admissible ONLY if actually
    counted in the shown bytes and re-checked item by item; prefer the qualitative form.

  · ABSTENTION IS A TOKEN, NOT SILENCE — [#201/#202] measured: "output NOTHING to abstain" NEVER fired (0 in
    300 calls); a responsive model emits a one-line PROSE refusal instead, which the gate then admits as a
    fabricated fact. So abstention is given a POSITIVE ACTION — emit the token `NO-FACT`. `llm.ts` maps that
    exact token (case-insensitive, whole-answer) to the GEN-12 model-abstained outcome. MOST units hold no
    gotcha; abstaining is correct, expected, never a failure. The token string is COUPLED to `ABSTAIN_SENTINEL`
    in llm.ts and pinned by test.
-->
You are shown ONE anchored unit from a real codebase, and nothing else.

<unit path="{{PATH}}" name="{{UNIT}}">
{{SOURCE}}
</unit>

State ONE **gotcha** about this unit: a surprising, non-obvious behavior that a competent engineer would NOT
expect from its name and signature, and that would change what they do — a silent edge case, a hidden side
effect, an API footgun, or an ordering/lifecycle constraint the type does not reveal. Work in two steps.

STEP 1 — REASON FREELY (scratch, never stored). Read the bytes closely. Draft a candidate gotcha, then actively
try to REFUTE it against the source:
- Is it derivable from THESE bytes — the declarations, control flow, types or literals — or are you leaning on
  what you know about a library/framework/convention that is not visible here, or on a stale/past-tense COMMENT
  the current code may contradict?
- Does its truth rest on a COMMENT'S CLAIM about something NOT in these bytes — another file or module, a
  task/PR/issue number (like #123), what the code "used to" do, or the absence of something elsewhere? If so,
  discard it: even an ACCURATE comment about elsewhere is a fact about THAT code, not this unit, and does not
  re-derive at THIS unit's bytes. The surviving gotcha must be checkable by reading the CODE in this unit itself.
- Does it assert an EXACT COUNT or an EXHAUSTIVE enumeration? A number or complete list is admissible ONLY if
  you actually counted it in the shown bytes and re-checked it item by item. Prefer the qualitative form.
- Is it more than a restatement of the name, signature or types, or a summary of what the code plainly does? A
  restated signature is not a gotcha.
Discard any candidate that does not survive. This reasoning is scratch: it is parsed away and never persisted.

STEP 2 — EMIT THE RESULT. If a gotcha survived, emit it as EXACTLY ONE fenced block tagged `atlas-fact`, holding
a JSON object with TWO fields:
- `claim` — one sentence of plain prose naming the surprising behavior, derivable from the CODE bytes above.
- `derivation` — the compact chain from the cited bytes that leads a reader to the SAME conclusion: the
  declarations, control flow, types or literals in THIS unit that force the claim. This is the GROUNDS, not free
  rambling — it is persisted alongside the claim so a reader can CONTEST it against the same bytes.

```atlas-fact
{"claim": "<the one surviving gotcha>", "derivation": "<the compact chain from THIS unit's cited bytes to the same conclusion>"}
```

Emit exactly ONE such block, and put NO fenced block anywhere in your reasoning — only the final fact is fenced.

If no such gotcha survives, emit NO fact block at all (a bare `NO-FACT` on its own line is also accepted). Most
units hold none. That is a correct, expected result — recorded as a deliberate abstention, never a failure. A
gotcha the bytes do not contain cannot be re-derived at source@sha and MUST NOT be emitted.
