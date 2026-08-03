<!--
ADR-0011 Decision 3 — the S2 proposal prompt. This file IS the artifact: it ships as written, it is hashed
into the run's provenance, and an operator override is recorded rather than silent.

Every clause below is traceable. HTML comments are stripped before the text reaches the model, so the
justification travels with the prompt without being sent to it.

  · ANCHOR AS A CLOSED VOCABULARY — the unit is named as a constraint, not offered as context. Presenting
    discovered anchors as a closed vocabulary and demanding grounding per element is the anchor-constrained
    extraction result (Grounded Knowledge Graph Extraction via LLMs, MDPI Computers 15(3):178).
  · DERIVABLE FROM THE SHOWN BYTES — the named failure here is a model asserting what it knows about a
    popular library instead of what this code says (Context-faithful Prompting, arXiv 2303.11315). Atlas's
    whole claim is that a fact re-derives at source@sha; a fact the source does not contain cannot.
  · ABSTENTION IS VALUED, NOT MERELY PERMITTED — GEN-12 makes abstention a valid, unpressured outcome, and
    explicitly rewarding "no answer" measurably improves selective behaviour (I-CALM, arXiv 2604.03904).
    Note the standing caveat: an abstention signal is partly an artifact of phrasing (arXiv 2507.16199), so
    the refusal RATE is only readable as a quality signal with this prompt held fixed — which the provenance
    hash is what makes possible.
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
You are shown ONE anchored unit from a real codebase, and nothing else.

<unit path="{{PATH}}" name="{{UNIT}}">
{{SOURCE}}
</unit>

State ONE fact about this unit that a competent engineer would NOT already know from its name and
signature, and that would change what they do.

- The fact MUST be derivable from the source above. Do not rely on anything you know about a library,
  framework or convention that is not visible in these bytes.
- Restating the signature, the types, or the name is not a fact. Neither is a summary of what the code
  plainly does.
- If this unit holds no such fact, output NOTHING AT ALL. Most units hold none. An empty answer is a
  correct, expected result — it is recorded as a deliberate abstention, never as a failure.

Output exactly one line of plain prose, or nothing. No preamble, no reasoning, no confidence, no
formatting.
