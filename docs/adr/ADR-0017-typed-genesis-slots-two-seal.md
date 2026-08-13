# ADR-0017 — Genesis emits typed facts via a two-seal slot classifier

**Status:** ACCEPTED — owner-ratified 2026-08-13.
**Supersedes/relates:** #196 (the measured gap), #152 (KNOW-10 closed-slot gate with no producer), #99 /
ADR-0016 (the negation sound-gate pattern this reuses), ADR-0012 (the additive/absent-tolerant field
precedent), #226 (the independent adjudication panel). Full reasoning:
`docs/design/196-typed-genesis-slot-proposal.md`.

## Context

`PredicateSlot` (`packages/knowledge/src/types.ts:283`) is a closed, normative 12-member vocabulary, and
`nodeKey = hash(primaryAnchorId ‖ predicateSlot)` is designed to collide facts of the *same* type at the
*same* place so they UPDATE/union instead of proliferating. The #196 measurement (RUN2, `e4882a3`) found
`predicateSlot` **absent in 200/200** mined facts, so identity collapses onto the anchor and two facts of
*different* types about one place evict each other.

**Corrected root cause (measured on current master `7de5faf`, not the stale card).** The gap is NOT a
missing design — the typed-slot admission ENGINE exists and is tested (`genesis/src/admit-harness.ts`,
GEN-12k; #225 E&V + #229 completed its legs): a proposer proposes a typed `PredicateProposal` carrying a
`slot`, `admit-harness` mints the fact CARRYING `predicateSlot: p.slot` (line 342), and `governed-emit.ts`
folds the slot into `nodeKey` and stores it. What is unwired is the SHIPPED `atlas mine` path: its gate
proposes **advisories only** (`cli/src/mine-gate.ts` `makeAdmitGate`), and its admission supply
(`adapter-io/src/compose-mine-admission.ts:75`) hands the engine **fail-closed STUB oracles** —
`typeOracle: { expressible: () => false, diagnose: () => 'NA' }` and `predicate: { synthesize: () => null,
… }` — explicitly documented there as "a predicate path wired later must supply real ones." So a predicate
candidate can never be admitted-with-slot; every mined fact falls back to a slotless advisory. The absent
slot is a **reference-model-vs-shipped** gap (the engine is real and inert), not an absent classifier.

The 12 slots split by *how* a slot is checkable — and the engine already models this split. `dependency`
(`verifyDependency`) and `definition` (SCIP `definition`-occurrence, `symbol-reverse.ts`) are structurally
provable; the `typeOracle`'s `expressible`/`diagnose` additionally covers the **type-expressible** slots the
compiler/LSP can decide (`admit-harness.ts` names `contract` / `ownership` / visibility) — so MORE than two
slots are provable once a real oracle is supplied. The genuinely non-expressible remainder (`gotcha`,
`rationale`, and any slot no oracle can decide) is what needs the validated leg.

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

Because the engine already exists, this is a **wiring + real-oracle** campaign, not a from-scratch build:

(a) **Supply real oracles** into `compose-mine-admission.ts` — replace the `expressible: () => false` /
`synthesize: () => null` stubs with the real type-checker/LSP `typeOracle` and the real check synthesizer
from the #225/#229 machinery, so `admit-harness`'s already-tested proven path actually runs. (b) **Wire the
predicate leg into `atlas mine`** — let `mine-gate`/the lenses forward `PredicateProposal`s (with slots), not
advisories only, so a proven fact carries its slot. (c) Add the **validated** leg (independent #226 panel) for
the non-expressible slots, with the `validated` seal. (d) The `seal` field (parallel to `obviousness`); the
nodeKey slot leg already exists in `governed-emit.ts` — add absent-tolerant goldens. (e) A benchmark on real
mined facts — per-slot precision, **0 false-proven**, measured false-rate on **validated**. lucy cold-review
on the identity/seal change before merge. NOTE — measure-first per WP: re-confirm each leg's state on the
then-current master (the #196 card measured `e4882a3`; the engine has advanced since, so trust the tree).
