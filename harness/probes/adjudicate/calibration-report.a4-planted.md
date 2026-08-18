# A4 planted recall — derived report (#196b sound mutation-bench, judge-free)

WP-B2. Method: [`docs/design/95-benchmark-methodology.md`](../../../docs/design/95-benchmark-methodology.md).
This is the JUDGE-FREE recall number for the four oracle-bearing shapes (`count`, `relation`, `dependency`,
`negation`). Ground truth is **planted by edit-distance-1 mutation** and labelled by an **independent `tsc`
oracle** (`ts.createProgram`) — zero LLM anywhere in the label or scoring path. This supersedes
`harness/probes/a4-recall-pilot.json` as a recall number for these four shapes: that pilot's denominator was
100% same-family-LLM-judge `GROUNDED_TRUE` verdicts (judge = same model family as the miner, never calibrated
live) and it stored no fact text, so it cannot even be re-scored. Per the ratified methodology, a same-family
judge measures *agreement*, not recall.

**Not covered:** advisory / predicate prose has no sound oracle; it is out of scope here (see
`docs/design/95-benchmark-methodology.md` and the `calibration-report.a1-subject.*` planted subject-test for
that shape's separate, judge-in-the-loop-for-generation-but-not-scoring precision number).

## Instrument (reused as-is, nothing new built)

- `packages/adapter-io/test/semantic-bench.test.ts` (#196b WP-1) drives the SHIPPED admission gate over planted
  claims on atlas-self.
- `packages/adapter-io/test/support/bench-scorer.ts` computes, per arm: `falseAdmit = |admitted∧FALSE|/|FALSE|`
  and `recallTrue = |admitted∧TRUE|/|TRUE, groundable|`. Verified independent of the gate: it imports no symbol
  from `admit-harness.ts` / `verify-fact-source.ts` (AC-6, re-checked by the test itself).
- `packages/adapter-io/test/support/mutation-contract.ts` plants each FALSE by a single edit-distance-1 mutation
  from a TRUE base; label comes from the tsc witness, never from the admission gate.
- Fixture self-proof pinned: `semantic-bench-fixture.json`, md5 `daa42ed88403e13b8ab1197adab9f0d3`
  (`semantic-bench-fixture.pin.json`).

## THE index-build trap (why two tables, not one)

`docs/design/95-benchmark-methodology.md` (~L79-102) documents that negation's recall swung 32.5% → 4.25% (8x)
purely from whether `packages/*/dist` declarations existed before `scip-typescript index` ran. The literal
recipe printed in the test file's own header (`scip-typescript index --output .atlas/index.scip` with no
mention of building first) is ambiguous about which state it means — and running it literally, on a repo where
`npm install` alone does not populate `dist/`, reproduces the **dist-absent misbuild**, not the intended
operating state. Per the brief's instruction, both states were run and are reported, labelled, below.

Git sha for both runs: `9eb4d7feaec5eada3df2f33f691c5fe3f8ca5350` (branch `bench/a4-planted`, from `master`).
Tool versions: node v22.17.1, npm 10.9.2, TypeScript 5.9.3, vitest 2.1.9, `@sourcegraph/scip-typescript` 0.4.0.

### Reproduction recipe (run twice for each state — see verification note below)

```
npm install
npx tsc -b                                            # populates packages/*/dist
scip-typescript index --output .atlas/index.scip      # run AFTER tsc -b for dist-form; BEFORE for dist-absent
ATLAS_SEM_BENCH=1 npx vitest run packages/adapter-io/test/semantic-bench.test.ts
```

**Verified by a second independent run:** yes, for BOTH build states — `.atlas/index.scip` deleted and rebuilt
from scratch, then the vitest run repeated. Every numerator/denominator was identical across the two runs of
each state. A third dist-form index rebuild (done to extract raw numerator/denominator counts, since the
shipped test only `console.log`s the percentage) produced a slightly different `.scip` file size (16,994,791 vs
16,980,163 bytes, likely non-deterministic ordering/timestamps in the indexer) but **identical** bench numbers —
so the metric itself is stable even where the raw artifact bytes are not.

## Table 1 — dist-ABSENT index (misbuild; literal test-header recipe as written)

`.atlas/index.scip` = 16,306,497 bytes. `targets=1333 scopes=19`.

| arm | falseAdmit | recallTrue | n |
| --- | --- | --- | --- |
| count | 0/163 = 0.00% | 7/163 = 4.29% | 326 |
| relation | 452/452 = 100.00% | 452/452 = 100.00% | 904 |
| dependency | 18/23702 = 0.08% | 7/163 = 4.29% | 23865 |
| negation | 0/163 = 0.00% | 51/1200 = 4.25% | 1363 |

Negation TEETH (opaque cross-package-collapse gate forced OFF, non-vacuity check): 132/163 = 80.98% false-admit
— confirms the door's 0% above is *earned* by the gate, not vacuous (matches the door's historically-adjudicated
~80.86% pre-fix regime). **Shipped test suite result on this build: GREEN.**

## Table 2 — dist-FORM index (operating/intended state per the methodology doc)

`.atlas/index.scip` = 16,980,163 / 16,980,163 / 16,994,791 bytes across three independent builds. `targets=1333
scopes=19`.

| arm | falseAdmit | recallTrue | n |
| --- | --- | --- | --- |
| count | 9/163 = 5.52% | 163/163 = 100.00% | 326 |
| relation | 452/452 = 100.00% | 452/452 = 100.00% | 904 |
| dependency | 309/23702 = 1.30% | 163/163 = 100.00% | 23865 |
| negation | 0/163 = 0.00% | 428/1200 = 35.67% | 1363 |

Negation TEETH (gate OFF): 0/163 = 0.00% (near-zero — matches the doc's characterization that on a dist-form
index `canonicalizeSymbol` bridges most cross-package refs so the opaque gate rarely fires; the doc's own figure
for this is 0.66% on an earlier snapshot, this run measured 0.00%, same direction/order of magnitude).

**Shipped test suite result on this build: RED.** `AC-6` fails: `dependency false-admit on a CALL-ELIGIBLE
symbol (isGrounded) ... expected 1 to be +0`. A follow-up scan (not gated by the assertion, which stops at the
first violation) found **2 of the 309** dependency false-admits are call-eligible (`callFiles>0`, i.e. tsc
witnesses a real caller somewhere): `isGrounded` and `DegenerateAnchorError`, each `callFiles=1`. The other 307
are the documented type/reference-symbol oracle-definition gap (never a callee anywhere). `count`'s 9/163 =
5.52% is also nonzero; the shipped `it()` never reaches that assertion because it throws earlier on the
dependency check, but the printed number is real.

## The critical finding this run surfaced

**On the dist-form (operating, intended) index at git sha `9eb4d7f`, the shipped door is not 0-false-admit for
`dependency` or `count`.** This contradicts `docs/design/95-benchmark-methodology.md`'s claim ("Dependency and
count are 0-false-admit by a witnessed-existence oracle, sound in any world") for these two arms at this
build+rev. `negation` remains 0-false-admit in both build states measured. This is reported as a measured fact,
not diagnosed or fixed here — WP-B2 is measurement, not a build task. The fixture pin's `substrate.rev` field
(`e35dcce`) is an older commit than this worktree's HEAD; nothing in the instrument enforces the checked-out src
matches that annotation (only the synthetic self-proof fixture bytes are hash-pinned), so this drift between the
pinned rev and current master is the likely reason the shipped AC-6 comments (citing `17/23577` residual
dependency false-admits, all oracle-gap) no longer match this run (`18/23702` dist-absent, `309/23702`
dist-form, 2 of the latter genuinely call-eligible).

## Scope-limit disclaimer (from `bench-scorer.ts`, `SCOPE_LIMIT_DISCLAIMER`)

> SOUND HEADLINE = structural arms only (count / dependency / negation vs the independent tsc oracle). The
> relation arm is MEASURED, not guaranteed (no direction oracle). Semantic slots (invariant / sideeffect / …)
> tsc cannot witness are NOT sound-labeled and are routed to the labeled spot-audit, never the sound headline.

`relation`'s 100%/100% in both tables is a construction artifact: `admitRelation` has no direction check, so a
reversed edge grounds identically to the true one and is always admitted — this is neither evidence of
soundness nor unsoundness, just the shape of a gate that does not check direction.

## Honest limits

- This is recall over **planted mutations on a fixture**, not recall over arbitrary real-world facts.
- Covers only the 4 oracle-bearing shapes. Advisory/predicate prose has **no sound oracle** and is not measured
  here — see `calibration-report.a1-subject.md` for that shape's separate precision number (planted subject-test,
  not this instrument).
- Recall is index-build-dependent by roughly an order of magnitude (count/dependency 4.29% → 100%, negation
  4.25% → 35.67%), confirming the doc's warning holds at this rev too — a bare recall percentage without its
  build recipe is not a citable number.
- This report measures ONE git sha and TWO index builds (the two states the doc's own example names); it does
  not sweep git history or alternate indexers.
- Not diagnosed or fixed: why `isGrounded`/`DegenerateAnchorError` false-admit on a dist-form index, or why
  `count`'s false-admit is nonzero there. Flagged for the code owner.

## What the brief got wrong (framing errors against the code)

1. The brief said the test "currently only `console.log`s these" numbers and asked for the smallest capture
   change. That's accurate — the shipped test prints only percentages + `n`, no numerator/denominator. Rather
   than editing the shipped test, I added two throwaway, **uncommitted** vitest files under
   `packages/adapter-io/test/_tmp-*.test.ts` that re-implement the exact same accumulation `bench-scorer.ts`
   already does (to recover the raw numerators the console.log omits), ran them, captured stdout, then deleted
   them before this commit — **zero diff to the shipped instrument** (smaller than even a comment-only edit).
2. The brief framed the dist-form/dist-absent trap as being about RECALL swinging (per the doc's own example).
   That's true, but this run surfaced a second, more serious effect the brief did not anticipate: on the
   dist-form (operating) index at current `HEAD`, the door is **no longer 0-false-admit** for `dependency` and
   `count` — a soundness finding, not just a recall swing. That is the single most important number in this
   report and the brief's framing undersold what "run both and report both" would turn up.
3. The fixture pin's `substrate.rev: e35dcce` is stale relative to this worktree's `master` (`9eb4d7f`); nothing
   in the instrument enforces that match (only the synthetic fixture bytes are hash-pinned). This report is for
   `9eb4d7f`, and the mismatch vs the shipped test's own code-comment numbers (`17/23577` etc.) traces to that
   drift plus the real soundness regression above, not to an error in this report's method.
