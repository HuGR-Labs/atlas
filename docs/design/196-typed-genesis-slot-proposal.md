# Typed genesis output — the predicate-slot classification proposal (#196)

> **Status: PROPOSAL, awaiting owner ratification.** The task is explicit: this is a design question, not
> an execution card — do not dispatch a build before the owner has ratified the approach. This document
> states the problem as measured, the one genuine design fork, a recommendation, and the blast radius, so
> the decision can be made from evidence.

## 1. The problem, measured

`packages/knowledge/src/types.ts:283` declares `PredicateSlot` as a **closed, normative** 12-member
vocabulary (transcribed from `atlas-knowledge:166-179`): `invariant · contract · precondition ·
postcondition · sideeffect · ownership · perf-bound · security-property · gotcha · rationale · dependency ·
definition`. Each slot binds to exactly one write template (KNOW-10). The list being closed is what makes
"same topic" decidable and what makes `nodeKey = hash(primaryAnchorId ‖ predicateSlot)` **collide** — the
collision is the mechanism that forces UPDATE/union instead of letting facts proliferate.

Measured on the 200 clean facts of RUN2 (master `e4882a3`): `predicateSlot` is **absent in 200/200** — not
empty, absent from the stored node shape. And 200 distinct anchors for 200 facts = exactly **1 fact per
place**. With the slot absent, the identity leg collapses onto the anchor: two facts of *different types*
about the same place (an `ownership` fact and a `security-property` fact about the same function) collide
and evict each other instead of coexisting. The ceiling isn't only a budget effect — it is enforced by
identity. Two downstream consequences already live in the tree: `own-source.ts` filters on
`predicateSlot === 'definition'`, a read path that currently matches nothing; and KNOW-10's closed-slot gate
(#152) has nothing to enforce because no producer emits a slot.

Atlas was designed for **typed** knowledge (12 types, including `ownership` and `security-property`).

> **CORRECTION (measured on current master `7de5faf`, added after the first draft — the #196 card measured
> the stale `e4882a3`).** The root cause is NOT a missing classifier. The typed-slot admission ENGINE exists
> and is tested (`genesis/src/admit-harness.ts`, GEN-12k; #225 E&V + #229 completed its legs): a proposer
> proposes a `PredicateProposal` with a `slot`, the harness mints `predicateSlot: p.slot`, and
> `governed-emit.ts` folds it into `nodeKey`. What is unwired is the SHIPPED `atlas mine`: it proposes
> **advisories only** (`mine-gate.ts` `makeAdmitGate`) and its admission supply
> (`compose-mine-admission.ts:75`) hands the engine **fail-closed stub oracles** (`expressible: () => false`,
> `synthesize: () => null`), documented there as "a predicate path wired later must supply real ones." So no
> predicate is admitted-with-slot and facts fall back to slotless advisory — a **reference-model-vs-shipped**
> gap. The two-seal design below is still the right target; the work is WIRING real oracles + the validated
> leg, not designing/building the engine.

## 2. The one genuine design fork

Assigning a slot is a **classification**. The hard, honest fact is that the 12 slots do **not** all admit
the same kind of check:

- **Structurally PROVABLE (a mechanical oracle exists or is cheap to build):**
  - `dependency` — `verifyDependency` already decides this soundly: `reverseCallers(target) ∩ scope ≠ ∅` is
    a positive existence, **sound in any world** (no closed-world assumption), verdict `proven | abstain`.
  - `definition` — the SCIP index knows whether an anchor is a definition site.
  - (possibly `precondition`/`postcondition` where a contract/assert exists at the site — needs a probe.)
- **Only SEMANTICALLY judgeable (about what the prose MEANS, not derivable from code structure):**
  `invariant · contract · sideeffect · ownership · perf-bound · security-property · gotcha · rationale`.
  No mechanical oracle can prove "this sentence is an *ownership* claim rather than a *rationale*." A
  sound gate (the negation pattern) is **impossible** here in principle.

So the fork is: **what do we do with the ~8 semantic slots that cannot be soundly proven?** Everything else
(the nodeKey change, the absent-tolerant field, the read-side grouping) follows mechanically once this is
decided.

## 3. Recommendation — the two-seal framework (already in the owner's ratified thinking)

This maps exactly onto the seal distinction the owner has already reasoned about (memory:
*sound-genesis-on-enforcer* — "validate by the NATURE of the fact, pay by VALUE: two seals — **proven**
(program) vs **validated** (independent LLM-ensemble, ~0-FP but not sound), they NEVER mix").

Concretely for slots:

1. Genesis **proposes** a `predicateSlot` per fact — the cheap DeepSeek proposer (the #150 arm), one
   classification call, `$0.0003`-class cost. The proposer is fallible; the gate, not the model, decides.
2. **PROVEN slots** (`dependency`, `definition`, and any other with a mechanical oracle): admit the slot
   **iff** the oracle discharges it (`verifyDependency`-style, `proven | abstain`). A wrong proposal
   cannot produce a false-typed fact — it abstains. These carry the **`proven`** seal. This is exactly the
   #99 sound-gate pattern, reused.
3. **VALIDATED slots** (the ~8 semantic ones): admit **iff** an *independent* LLM-ensemble agrees with the
   proposed slot (the adjudication panel from #226, distinct model family, majority), ~0-FP but explicitly
   **not sound**. These carry the **`validated`** seal. The seal is stored on the fact so a reader (and the
   pack) always knows *how* a slot was decided; the two seals never merge into one number.
4. **nodeKey carries the slot** as designed (`hash(anchor ‖ slot)`), so an `ownership` and a
   `security-property` fact about the same place now get distinct identities and coexist.

**Why not the alternatives:**
- *Proven-only (abstain on every semantic slot)* — sound, but genesis would leave ~8/12 slot classes
  permanently untyped, i.e. it would type almost nothing on real mined prose (most mined facts are
  ownership/rationale/gotcha-shaped, not dependency edges). It re-creates the ceiling for the semantic
  majority. Rejected as too weak to be worth the change.
- *LLM-classify-all with only a write-template shape check* — types everything, but a single fallible model
  self-certifying its own classification is exactly the "prompt-typed ≠ true" failure the negation work
  (#201/#202) already burned us on. Rejected: no independent check.

The two-seal path is the only one that both closes the identity collapse **and** stays honest about which
typings are proven vs judged.

## 4. Blast radius / migration

- **The field is ADDITIVE and absent-tolerant**, exactly like `obviousness` (ADR-0012) and `builtAt`/`sameAs`
  (#75): old data stays readable, no migration, no fabricated default. Totality ("every *newly* mined fact
  carries a slot + seal") is enforced behaviourally at the emit path and its goldens, not by making the type
  field required (which would make ~200 pre-existing facts unreadable).
- **nodeKey identity change is forward-only**: facts minted before this land keep their anchor-collapsed
  identity; facts minted after get the slot-qualified identity. No rewrite of stored nodes.
- **Read side**: `own-source.ts`'s `predicateSlot === 'definition'` filter starts matching; the pack's
  read-side grouping (KNOW-4g) becomes meaningful; KNOW-10's closed-slot gate (#152) finally has a producer
  to enforce against.
- **The proven/validated seal is a new stored field** on the fact (parallel to `obviousness`), same
  additive discipline.

## 5. If ratified — the build shape (NOT dispatched yet)

A campaign, cold-reviewed, in order: (a) a `slot-oracle` map (which slots are proven-able + their oracles —
`dependency`→`verifyDependency`, `definition`→SCIP def-site; probe precondition/postcondition); (b) the
proposer emits a proposed slot; (c) the proven gate (reuse `admit-harness`/`verify-*`) + the validated
panel (reuse #226); (d) the seal field + nodeKey leg + absent-tolerant goldens; (e) a benchmark on real
mined facts — per-slot precision, 0 false-**proven**, measured false-rate on **validated**. lucy cold-review
on the identity/seal change before merge.

## 6. The decision requested of the owner

Ratify the **approach**: two seals (`proven` for structurally-checkable slots, `validated` for semantic
slots via independent ensemble), nodeKey carries the slot, additive/absent-tolerant field. On ratification I
write the full ADR and dispatch the build campaign. Alternatives in §3 if the owner wants a different bar.
