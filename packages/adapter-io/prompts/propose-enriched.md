<!--
ADR-0011 Decision 3 — the S2 proposal prompt, ENRICHED variant. This file IS the artifact: it ships as
written, it is hashed into the run's provenance, and an operator override is recorded rather than silent.
It is a SIBLING of propose.md and shares its clauses verbatim; the ONE addition is the RELATED-context
section, used only on the opt-in ENRICH arm (a `SiblingReader` injected into `createPromptFactory`).

Every clause below is traceable. HTML comments are stripped before the text reaches the model, so the
justification travels with the prompt without being sent to it.

  · ANCHOR AS A CLOSED VOCABULARY — the unit is named as a constraint, not offered as context. Presenting
    discovered anchors as a closed vocabulary and demanding grounding per element is the anchor-constrained
    extraction result (Grounded Knowledge Graph Extraction via LLMs, MDPI Computers 15(3):178).
  · RELATED UNITS ARE CONTEXT, NOT TARGETS — the ENRICH addition. A symbol-anchored view hides the sibling
    units the target references, so a fact whose truth depends on a sibling's bytes/type is manufactured
    plausible-but-false (#201, measured in A4-LEVER.md: every false fact on the symbol arm was this
    cross-unit trap). The related units are shown so the fact is DERIVABLE, and framed as context-only so the
    model states its fact about the TARGET — never about a related unit. This does NOT widen grounding: the
    fact is anchored to, and its evidence span minted from, the TARGET unit alone (KNOW-15g — secondary
    context feeds the proposer, never identity).
  · DERIVABLE FROM THE SHOWN BYTES — the named failure here is a model asserting what it knows about a
    popular library instead of what this code says (Context-faithful Prompting, arXiv 2303.11315). Atlas's
    whole claim is that a fact re-derives at source@sha; a fact the source does not contain cannot.
  · ABSTENTION IS VALUED, NOT MERELY PERMITTED — GEN-12 makes abstention a valid, unpressured outcome, and
    explicitly rewarding "no answer" measurably improves selective behaviour (I-CALM, arXiv 2604.03904).
    Note the standing caveat: an abstention signal is partly an artifact of phrasing (arXiv 2507.16199), so
    the refusal RATE is only readable as a quality signal with this prompt held fixed — which the provenance
    hash is what makes possible.
  · ABSTENTION IS A TOKEN, NOT SILENCE — [#201/#202] measured: "output NOTHING to abstain" NEVER fired (0 in
    300 calls). A responsive model will not emit empty output; it emits a one-line PROSE refusal instead,
    which the sanity gate then admits as a fabricated fact (#201). So abstention is given a POSITIVE ACTION —
    emit the token `NO-FACT` — which is the I-CALM reward made concrete. `llm.ts` maps that exact token
    (case-insensitive, whole-answer) back to the identical GEN-12 abstention as empty stdout. The token
    string is COUPLED to `ABSTAIN_SENTINEL` in llm.ts and pinned by test — the prompt says the word the gate
    reads.
  · NOT A RESTATED SIGNATURE — "non-obvious AND actionable, not a restated signature" is the harness's
    obviousness predicate (`TwoDoorBar.nonObvious`, admit-harness.ts). Since ADR-0012 it SCORES rather than
    rejects: a restated signature is stored with `obviousness.rank === 'obvious'` and loses at ranking. The
    prompt states what the harness measures, so a refusal is informative rather than arbitrary. Note the
    asymmetry this clause must NOT cross: the model is steered toward non-obvious facts, and is never asked
    how non-obvious its own claim is — GEN-16 forbids resting the judgment on the proposer's self-assessment,
    and the score is computed by the harness over the source bytes.
  · NO CONFIDENCE, NO REASONING, ONE LINE — GEN-4d: a self-declaration is never read, so it is never asked
    for. GEN-12: chain-of-thought is scratch and MUST NOT be persisted as a fact, so it is never requested.
    The output contract is `claim: string | null` (llm.ts), and empty output means abstention.
  · MINED SIGNALS ARE ABSENT ON PURPOSE — `Candidate.signals` (churn, SZZ, owners, commit messages) is NOT
    passed. GEN-6 forbids a signal from minting a fact; withholding the signals makes that violation
    structurally impossible instead of merely instructed against. They already did their work in ranking.
-->
You are shown ONE anchored TARGET unit from a real codebase, and the RELATED units it references as CONTEXT.

{{RELATED}}

<unit path="{{PATH}}" name="{{UNIT}}">
{{SOURCE}}
</unit>

State ONE fact about the TARGET unit — the `<unit>` above, NOT the related context — that a competent
engineer would NOT already know from its name and signature, and that would change what they do.

- The fact MUST be about the TARGET unit, and MUST be derivable from the bytes shown (the target plus the
  related context above). Do not rely on anything you know about a library, framework or convention that is
  not visible in these bytes. The related units are there so a fact that depends on them is derivable — not
  so you can state a fact about them.
- Restating the signature, the types, or the name is not a fact. Neither is a summary of what the code
  plainly does.
- If the TARGET unit holds no such fact, output the single token `NO-FACT` and nothing else. Most units
  hold none. That is a correct, expected result — it is recorded as a deliberate abstention, never as a
  failure. Do NOT explain, apologise, or describe why: the bare token `NO-FACT` IS the abstention.

Output either exactly one line of plain prose stating the fact, or the single token `NO-FACT`. No preamble,
no reasoning, no confidence, no formatting.
