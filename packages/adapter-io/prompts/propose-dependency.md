<!--
ADR-0011 Decision 3 / ADR-0017 dependency slot — the S2 DEPENDENCY proposal prompt. This file IS the
artifact: it ships as written, it is hashed into the run's provenance, and an operator override is recorded
rather than silent. It is a SIBLING of `propose.md` (the advisory prompt), selected by the dependency mining
arm (`ATLAS_MINE_SLOT=dependency`); the advisory prompt is unchanged.

Every clause is traceable. HTML comments are stripped before the text reaches the model, so the
justification travels with the prompt without being sent to it.

  · WHY THE PROMPT CAN BE FUZZY — this arm carries the ADR-0017 two-seal design: what the model PROPOSES is a
    candidate `(target, scope)` pair, and admission is decided by a SOUND mechanical oracle
    (`verifyDependency`, adapter-io/src/verify-fact-source.ts) that PROVES the dependency against the SCIP
    index or DROPS it. So the prompt is tuned for RECALL — name a real dependency you can see — and the gate
    owns PRECISION. A hallucinated `target` the index cannot resolve is dropped, never minted (sound-in-any-
    world). This is why the answer is a bare pair, not a proof: the proof is the harness's job, not the model's.

  · DERIVABLE FROM THE SHOWN BYTES — the named failure is a model asserting what it knows about a popular
    library instead of what this code imports/calls (Context-faithful Prompting, arXiv 2303.11315). The
    `target` MUST be a symbol the shown unit actually references; a guess the unit does not use fails the
    oracle at `scope`.

  · SCOPE IS A DIRECTORY, NOT A FILE — the dependency witness ranges over a DIRECTORY (the ADR-0017 `scope`
    leg, the same closed-world scope the negation door reasons over). The unit's own directory is the honest
    default; the model is told it, not asked to invent one.

  · ABSTENTION IS A TOKEN, NOT SILENCE — [#201/#202] measured: "output NOTHING to abstain" NEVER fired (0 in
    300 calls). So abstention is a POSITIVE ACTION — emit `NO-FACT` — mapped by `llm.ts` (`ABSTAIN_SENTINEL`,
    case-insensitive, whole-answer) back to the identical GEN-12 abstention as empty stdout. Most units have
    no non-obvious dependency worth recording; abstaining is the correct, expected result.

  · ONE LINE, A CLOSED GRAMMAR, NO REASONING — GEN-4d/GEN-12: no self-declaration, no chain-of-thought
    persisted. The output contract is ONE line matching `DEPENDS-ON: <target> @ <scope>` OR the token
    `NO-FACT`. The ` @ ` delimiter (spaces on both sides) is what `parseDependencyClaim` (llm.ts) splits on;
    it is COUPLED to that parser and pinned by test — the prompt writes the grammar the parser reads. A line
    that does not match the grammar is treated as an unparseable answer and abstains (never a fabricated fact).
-->
You are shown ONE anchored unit from a real codebase, and nothing else.

<unit path="{{PATH}}" name="{{UNIT}}">
{{SOURCE}}
</unit>

Name ONE dependency of this unit that a competent engineer would NOT already guess from its name and
signature — a symbol (a function, class, type, or module) that the code above actually imports or calls, and
whose relationship to this unit is worth recording.

- The dependency MUST be visible in the source above. Do not name a library, framework, or symbol that is
  not referenced in these bytes.
- Restating an obvious import (the framework the file is plainly built on, a language builtin) is not worth
  recording. Name the one whose use here is non-obvious and would change what a reader does.
- The `scope` is the DIRECTORY the dependency holds over. Use the directory of the unit's own path above
  (everything before the last `/`), unless the source makes a narrower directory clearly correct.

Output EITHER exactly one line in this grammar:

    DEPENDS-ON: <target> @ <scope>

where `<target>` is the depended-on symbol and `<scope>` is the directory — the ` @ ` separator has a space
on each side — OR, if this unit has no such non-obvious dependency, output the single token `NO-FACT` and
nothing else. Most units hold none; that is a correct, expected abstention, never a failure. No preamble, no
reasoning, no confidence, no formatting.
