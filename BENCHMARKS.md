# Atlas — measured results

Every number in this file links to the committed artifact that derives it. A figure whose
derivation you cannot re-open does not belong here. Method: [`docs/design/95-benchmark-methodology.md`](docs/design/95-benchmark-methodology.md).

Atlas ships knowledge under two seals, and they are measured differently:

| seal | what it means | how it is measured |
| --- | --- | --- |
| **`proven`** | a mechanical witness exists; the admission gate *refuses* anything it cannot prove | judge-free mutation bench against an independent `tsc` oracle — no LLM anywhere in the label or scoring path |
| **`justified`** (advisory) | LLM-mined prose, grounded in cited bytes, never marked proven | blind LLM panel adjudication + planted subject-tests + an out-of-instrument fourth seat |

The design bet: *grow the proven tier, keep the advisory tier honest about being advisory.*

---

## 1 — The proven tier: false-admission (the headline)

Planted-mutation bench: each FALSE claim is one edit-distance-1 mutation of a TRUE base;
the label comes from an independent `ts.createProgram` oracle, never from the gate under test.
Operating build state (`tsc -b` before `scip-typescript index`).
Artifact: [`harness/probes/adjudicate/calibration-report.a4-planted.md`](harness/probes/adjudicate/calibration-report.a4-planted.md) (+ `.json`).

| arm | false admits | recall (true, groundable) |
| --- | --- | --- |
| `dependency` | **0 / 23,702** | 163/163 = 100% |
| `count` | **0 / 163** | 163/163 = 100% |
| `negation` | **0 / 163** | 428/1200 = 35.7% |

- Figures are reported under **two named definitions**. Definition A is the gate's own
  documented predicate (witnessed reference-existence): 0-false on all three arms.
  Definition B is the bench's stricter call-only label: 318 mismatch rows, **all 318
  adjudicated line-by-line — 0 genuine unsoundness** (every one is a real SCIP reference
  witness that is not a call). Both definitions and the full adjudication are in the artifact.
- Negation recall is the price of the 0-false floor: the gate proves absence only where a
  mechanical escape analysis closes the world, and abstains elsewhere. With the gate off,
  the same corpus false-admits 132/163 (81%) — the gate is what buys the zero.
- The legacy `relation` arm states **no truth predicate** (it admits all 452/452 by design)
  and is not counted as sound. It is superseded by the `depends-on` projection below.

## 2 — The proven tier vs. an established tool (deterministic, $0)

`atlas derive-relations` (proven `depends-on`, witnessed SCIP references) vs. **madge 6.1.0**
on a third-party repo, zod v3.23.8. Both sides mechanical; zero LLM tokens.
Artifact: [`harness/probes/adjudicate/xrepo-zod-sota-comparator.json`](harness/probes/adjudicate/xrepo-zod-sota-comparator.json).

| | edges |
| --- | --- |
| Atlas proven | 231 |
| madge | 129 |
| intersection | **129 — Atlas misses nothing madge finds (100% recall vs. madge)** |
| Atlas-only | 102 — semantic symbol→definition edges through re-export barrels, which an import-statement graph structurally cannot represent |

The definitional gap (semantic vs. syntactic) is the finding. Caveat as recorded in the
artifact: the barrel-piercing mechanism was verified and sampled; not all 102 extra edges
were individually hand-traced.

## 3 — A1: precision of the advisory tier (LLM-judged)

Frozen v3 propose prompt, capture/replay, proposer `claude-sonnet-5`, three blind
`claude-sonnet-5` judges, majority-of-3, full grid, no gaps.

| run | precision | 95% CI (Wilson) | artifact |
| --- | --- | --- | --- |
| Atlas-on-Atlas, 657 facts | **93.8%** (616/657) | [91.6, 95.4] | [`a1-dogfood-fullrepo.json`](harness/probes/adjudicate/a1-dogfood-fullrepo.json) |
| Cross-repo (zod v3.23.8), 76 facts | **86.8%** (66/76) | [77.4, 92.7] | [`xrepo-zod-a1.json`](harness/probes/adjudicate/xrepo-zod-a1.json) |

- The ~7-point drop off home turf is real proposer hallucination, not judge noise
  (67/76 unanimous; two FALSEs mechanically verified — one inverted boolean, one test that
  does not exist). **86.8% is the more externally valid figure.**
- Same-family caveat, stated as a limit: proposer and panel share a model family, so the
  grid alone measures agreement, not ratified precision. Two independent checks bound it:
  - **Out-of-instrument fourth seat** (83-item systematic sample of the home run): panel
    precision **98.7%** (75/76); the single over-credit is a genuinely false fact the bench
    then caught mechanically; the other 5 discordances are all in the conservative
    direction (the panel under-credits truth). Artifact:
    [`gold-seat4.json`](harness/probes/adjudicate/gold-seat4.json).
  - **Judge-free planted subject-test** (10 true + 10 planted-false): false-admit 1/10,
    Wilson [0.02, 0.40]; 0/10 true facts rejected. Artifact:
    [`calibration-report.a1-subject.md`](harness/probes/adjudicate/calibration-report.a1-subject.md).
- Cheap free-tier LLM judges were tried and **rejected as instruments**: mistral scored
  κ ≈ −0.02 against the fourth seat (worse than chance); another rubber-stamps ~100%.
  Recorded in `gold-seat4.json` — a cross-family panel is not a matter of any second model,
  it has to be a competent one.

## 4 — A2: staleness (does the graph notice the code moved?)

Perturb→detect over labeled byte pairs, driven through the shipped oracle.
Instruments: [`harness/probes/a2-staleness.mjs`](harness/probes/a2-staleness.mjs),
teeth: [`harness/probes/a2-staleness-teeth.mjs`](harness/probes/a2-staleness-teeth.mjs).

- Invalidating edits caught: **6/6**; preserving edits kept fresh: **4/4** (0 false-stale).
- The teeth probe keeps this honest: the 6/6 invalidating rows are near-tautological (an
  "any byte changed" dumb checker also wins them); the discriminating power is the four
  **preserving** rows — import added above, header spacing, sibling-unit edit, Unicode
  normalization — where dumb checkers false-alarm and the oracle does not.
- Deeper tier: `A2r` re-proof ([`a2r-reproof.mjs`](harness/probes/a2r-reproof.mjs)) drives
  the shipped `reverifyFact` over a scratch worktree with real edits and a fresh build —
  staleness answered by *re-proof*, not by timestamp.

## 5 — A3: cost

Metered sidecar, `claude-sonnet-5`, prompt-cache-assisted, per-site advisory mining.
Artifact: [`harness/probes/a3-cost-sidecar.jsonl`](harness/probes/a3-cost-sidecar.jsonl).

- Measured: 10 metered calls, **$0.96 total, ≈$0.10/site**.
- Independent pilot on 31 sites: $3.22 (≈$0.10/site) — consistent.
- The proven tier and the graph build cost **0 LLM tokens** — indexing is SCIP +
  deterministic projection; proofs are mechanical.

## 6 — How far can the advisory tier shrink?

Shape census of all 76 cross-repo advisory facts (single-classifier estimate, recorded as
such): **22/76 (~29%)** are structural claims a new sound shape could move to the proven
tier; **54/76 (~71%)** are irreducibly semantic. The largest structural cluster
(test-vacuity, ~9 claims) has since shipped as a sound shape (`atlas test-vacuity`,
0-false-proven end-to-end) — the census is a roadmap, and it is being executed.
Artifact: [`xrepo-zod-shape-census.json`](harness/probes/adjudicate/xrepo-zod-shape-census.json).

---

## Honest limits

Stated as limits, not footnotes. In order of how much they matter:

1. **The fourth seat's provenance is recorded UNRESOLVED** (human or strong non-Sonnet
   model). It is out-of-instrument and blind either way, which breaks same-family
   circularity — but until it is named, the 98.7% corroboration is weaker than it looks.
2. **The cross-repo number has no fourth seat.** The most externally valid figure (86.8%)
   currently has the weakest corroboration chain.
3. **n = 1 foreign repo** (zod, one tag), TypeScript only. No cross-language evidence.
4. **The subject-test is n = 20.** Its CI is honest and wide.
5. **Negation recall is build-state sensitive** (8× swing dist-absent vs. dist-form). The
   trap and the exact recipe are documented in the A4 artifact; both states are reported.
6. **A3 is measured on 10–31 sites on one model.** Full-repo cost is extrapolation.
7. **No shared public benchmark with adjacent tools.** Memory-retrieval suites (LOCOMO,
   LongMemEval) measure conversational-memory QA — a different axis; scores are not
   comparable in either direction. The only measured external comparison here is the
   deterministic madge superset (§2). A common code-KG precision benchmark does not exist
   yet; building one is open work.
