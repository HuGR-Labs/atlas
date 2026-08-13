# ADR-0017 — Genesis emits typed facts via a two-seal slot classifier

**Status:** ACCEPTED — owner-ratified 2026-08-13.
**Supersedes/relates:** #196 (the measured gap), #152 (KNOW-10 closed-slot gate with no producer), #99 /
ADR-0016 (the negation sound-gate pattern this reuses), ADR-0012 (the additive/absent-tolerant field
precedent), #226 (the independent adjudication panel). Full reasoning:
`docs/design/196-typed-genesis-slot-proposal.md`.

## Context

`PredicateSlot` (`packages/knowledge/src/types.ts:283`) is a closed, normative 12-member vocabulary, and
`nodeKey = hash(primaryAnchorId ‖ predicateSlot)` is designed to collide facts of the *same* type at the
*same* place so they UPDATE/union instead of proliferating. Measured on RUN2's 200 clean facts:
`predicateSlot` is **absent in 200/200**, so identity collapses onto the anchor — two facts of *different*
types about one place (an `ownership` and a `security-property`) evict each other. Atlas was built for typed
knowledge; genesis produces untyped prose. This is a product-shape gap, bigger than #182.

The decisive constraint: the 12 slots do **not** admit one uniform check. `dependency` and `definition` are
structurally provable (a `reverseCallers ∩ scope ≠ ∅` positive existence via `verifyDependency`; a SCIP
`definition`-occurrence via `symbol-reverse.ts`). The other ~8 — `invariant, contract, precondition,
postcondition, sideeffect, ownership, perf-bound, security-property, gotcha, rationale` — are about what the
prose *means* and admit **no** sound mechanical oracle in principle.

## Decision (ratified)

Genesis emits a typed slot per fact under a **two-seal** classifier, mirroring the ratified seal distinction
(validate by the *nature* of the fact, pay by *value*; the two seals never merge):

1. **Propose** — the cheap DeepSeek proposer (the #150 arm) proposes one `predicateSlot`. Fallible by design;
   the gate, never the model, decides admission.
2. **PROVEN slots** (`dependency`, `definition`, plus any slot a mechanical oracle later covers): admitted
   **iff** the oracle discharges the proposal (`proven | abstain`, the #99 pattern — a wrong proposal
   abstains, it can never mint a false-typed fact). Sealed **`proven`**.
3. **VALIDATED slots** (the ~8 semantic): admitted **iff** an *independent* LLM-ensemble (a distinct model
   family, the #226 panel, majority) agrees with the proposed slot. ~0 false-positive but explicitly **not
   sound**. Sealed **`validated`**.
4. The seal is a stored field on the fact; the two seals are surfaced separately and never combined into one
   score. **nodeKey carries the slot** as designed, so differently-typed facts about one place coexist.
5. The `predicateSlot` and seal fields are **additive and absent-tolerant** (the ADR-0012 `obviousness` /
   #75 `builtAt` discipline): pre-existing facts stay readable, no migration, no fabricated default.
   Totality ("every *newly* mined fact carries a slot + seal") is enforced behaviourally at the emit path and
   its goldens, not by a required type field.

## Alternatives rejected

- **Proven-only** (abstain on every semantic slot): sound, but leaves ~8/12 slot classes permanently
  untyped — genesis would type almost nothing on real mined prose (mostly ownership/rationale/gotcha), which
  re-creates the ceiling for the semantic majority.
- **LLM-classify-all with only a write-template shape check**: one fallible model self-certifying its own
  classification is exactly the "prompt-typed ≠ true" failure of #201/#202. No independent check.

## Consequences

- Closes the identity collapse (#196) and gives KNOW-10's closed-slot gate (#152) a producer to enforce
  against; `own-source.ts`'s `predicateSlot === 'definition'` read filter starts matching.
- New stored fields (`predicateSlot` already in the frozen shape; a `seal` field parallel to `obviousness`).
- nodeKey identity change is forward-only: old facts keep anchor-collapsed identity, new facts get
  slot-qualified identity. No rewrite of stored nodes.
- A `validated` fact is honestly non-sound: the pack and any reader can see *how* each slot was decided.

## Build path (a separate campaign, to be decomposed + cold-reviewed)

(a) a `slot → oracle` map (proven-able slots + their oracles: `dependency`→`verifyDependency`,
`definition`→SCIP def-site; probe `precondition`/`postcondition` for an assert/contract oracle); (b) the
proposer emits a proposed slot; (c) the proven gate (reuse `admit-harness`/`verify-*`) + the validated panel
(reuse #226); (d) the seal field + nodeKey leg + absent-tolerant goldens; (e) a benchmark on real mined
facts — per-slot precision, **0 false-proven**, measured false-rate on **validated**. lucy cold-review on the
identity/seal change before merge.
