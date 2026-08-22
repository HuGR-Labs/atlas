# #95 — Benchmark results: Atlas on four axes, with every number's denominator

**Status:** rewritten 2026-08-18 to reconcile with four artifacts that landed AFTER the first version of this
document (2026-08-16) and contradicted it: the honest A2 re-report (#190), the `proven`-is-reference
correction (#191), the judge-free planted A4 recall report (#196b/WP-B2+C3), and the dead-assertion repair in
the semantic bench (#192). Method: [`95-benchmark-methodology.md`](95-benchmark-methodology.md) — the LLM is
the SUBJECT, ground truth is planted by construction, and no LLM judge sits in a correctness loop where a
mechanical oracle exists. Model held at `claude-sonnet-5` wherever a model is in the loop.

**Reading rule for this document:** every figure appears as `numerator/denominator` with the file it is read
from, so it can be re-derived rather than quoted. Where a figure is a *derivation* from a published percentage
rather than a printed count, it says so. Where the source is a branch not yet merged to `master`, the branch is
named.

## The scoreboard

| Axis | The number, with its denominator | Source artifact (read, not remembered) |
| --- | --- | --- |
| **A1 — advisory precision** (planted subject-test, no judge in the correctness loop) | false-admit **1/10**, catch **9/10**, false-alarm **0/10**; n=20 fixtures; Wilson95% on false-admit **[0.018, 0.404]** | `harness/probes/adjudicate/calibration-report.a1-subject.md` |
| **A2 — staleness** (TWO numbers, never blended) | non-touching precision **4/4** (0 false-drift, real and discriminating) · semantic cross-file staleness **NOT SUPPORTED** (named limitation) | `docs/design/95b-staleness-a2-methodology.md` §6.2/§6.3 |
| **A3 — cost** | **$0.964233 / 10 sites = $0.0964 per site**; 0 errors, 1 abstention, all 10 rows `claude-sonnet-5` | `harness/probes/a3-cost-sidecar.jsonl` (10 records; sum re-derived 2026-08-18) |
| **A4 — recall, judge-free** (4 oracle-bearing shapes, planted mutations, `tsc` oracle) | dist-form index: count **163/163**, dependency **163/163**, negation **428/1200 = 35.67%**; dist-absent misbuild: count **7/163**, dependency **7/163**, negation **51/1200 = 4.25%** | `harness/probes/adjudicate/calibration-report.a4-planted.md` (`master`, merged in #193; numbers re-verified on `master` 2026-08-22) |
| **A4 — agreement@pool (NOT recall)** | atlas **10/64** · ungated raw-LLM lister **63/64** · comment-extractor **2/64**, where the denominator 64 is 100% same-family-LLM-judge `GROUNDED_TRUE` verdicts | `harness/probes/a4-agreement-pool-pilot.json` |
| **Sound-gate false-admit** (the strong claim) | Definition A (gate's own witnessed-reference predicate): dependency **0/23702**, count **0/163**, negation **0/163** | `calibration-report.a4-planted.md` Table 2 (`master`) |

There is no cross-vendor SOTA column. The only comparator this program has ever run is the ungated raw-LLM
lister inside the agreement pool, and its figures are the same uncalibrated judge's opinion as everything else
in that row — see A4-agreement below.

## The one honest sentence

**Atlas's defensible claim is soundness on the shapes that have a mechanical oracle, plus a re-runnable
byte-level freshness check — not recall, and not semantic freshness.** On the four oracle-bearing shapes the
admission gate is 0-false-admit under its own documented predicate (dependency 0/23702, count 0/163, negation
0/163), which no ungated lister can claim at all; the drift oracle adds 0 false-drift on 4/4 non-touching
edits, a property a plain list of sentences structurally cannot have. Everything outside that: advisory prose
has no oracle (its precision is the 1/10 planted false-admit, n=20), recall on advisory prose has never been
measured judge-free, and semantic cross-file staleness is **not detected at all**.

## Per-axis detail and caveats

### A1 — advisory precision (`master`)

The subject-test scores one faculty — the LLM's ability to reject a false claim about code — against
**planted-false** fixtures, scored by string-compare against the planted label, so no LLM judge decides
correctness. From `calibration-report.a1-subject.md`: false-admit **1/10 = 0.100** (Wilson95%
[0.018, 0.404]), catch **9/10**, false-alarm **0/10**, n=20 (10 true + 10 planted-false). Frozen instrument:
`harness/probes/adjudicate/fixtures.mjs`, sha256[:16] `01c7bc130eb7f384`. The single leak is `F03`
(`const ABSTAIN = 'NO-FACT'` mis-read as sentinel `"ABSTAIN"` — the name-vs-value confusion class).

**Correction to the 2026-08-16 version of this document.** It reported *"A1 precision **1.00** on real facts
(10/10 adjudicated true)"* as a headline. That figure is `harness/probes/a4-agreement-pool-pilot.json`:
10 of 10 atlas-sourced clusters were called `GROUNDED_TRUE` by the same-family judge described below. It is
**judge agreement on 10 clusters, not measured precision**, and it is not a headline. Retained here as what it
is: `judge_called_true_per_miner.atlas = 10/10` in that artifact.

Caveats that stand: n=20; fixtures are synthetic-clean by design (you can only plant a false if you know the
truth); the interval, not the point, is the claim.

### A2 — staleness (`master`, per #190)

**Report two numbers, never one blended score** (`95b-staleness-a2-methodology.md` §6):

1. **non-touching precision `4/4` (0 false-drift) — MEASURED and discriminating.** All four fact-preserving
   edits (line added above the unit, non-contiguous header comment, sibling-unit edit, Unicode NFD→NFC
   rewrite) stayed FRESH under the shipped `driftDetect` via real `reDerives`. This is the real number:
   §6.2's teeth show every dumb byte-level mutant fails at least one of these four, and `P4` (NFD→NFC, where
   the bytes literally differ but the string is canonically equal) is failed by every mutant that looks at
   bytes at all.
2. **semantic cross-file staleness: NOT SUPPORTED — a named limitation with a falsifying example.**
   `driftDetect` folds only the anchor's own subtree hash and never scans the dependency axis, so a fact can
   become FALSE with its anchored bytes byte-for-byte unchanged and `reDerives` still reports FRESH. §6.3's
   counter-example: a fact "`sortedNames()` returns sorted" whose sorting actually happens in a delegated
   helper — drop the helper's `.sort()` and the fact is false while its anchor's hash is identical.

**Correction to the 2026-08-16 version of this document.** It headlined *"true-stale caught 6/6"* as evidence
the oracle catches staleness and called this axis "the moat". §6.1 retires that reading: every `invalidating`
corpus entry is by construction a byte edit inside the hashed extent, so `bytes changed ⇒ hash changed ⇒
DRIFTED` holds for any hash function — and the committed teeth matrix shows a trivial `always-DRIFTED`
constant, which never looks at its input, scoring the identical **6/6**. `6/6` is a theorem about the corpus's
own construction, not a measurement of the oracle, and must not be published on its own. Re-derive both the
matrix and this claim: `node harness/probes/a2-staleness-teeth.mjs` (and the confusion matrix itself with
`node harness/probes/a2-staleness.mjs`).

Scope, unchanged: n=10 corpus, own-anchor byte granularity only; the callee/interface `freshness()` leg is
excluded because it has zero production callers (§3); negation staleness is out of corpus (§3).

### A3 — cost (`master`)

`harness/probes/metered-claude.mjs` is a drop-in `propose.cmd` running the real
`claude -p ... --output-format json` and recording the CLI's own `total_cost_usd` per site;
`harness/probes/cost-sum.mjs` rolls it up. Re-derived from the 10 committed records in
`harness/probes/a3-cost-sidecar.jsonl` on 2026-08-18: **sum $0.964233 over 10 sites = $0.0964/site**,
`is_error` true on **0/10**, `abstained` true on **1/10**, `model` = `claude-sonnet-5` on 10/10.

Caveat, load-bearing: **cost is operator-config-dependent.** $0.0964/site is the figure for a `claude -p`
(Claude Code CLI) `propose.cmd`, which carries its own large system prompt; a bare-API operator would be
cheaper. The price is the CLI's own reported cost, not an assumed rate card. An earlier hand estimate of
~$0.003/site was wrong-low by ~32×, which is why this axis is measured rather than estimated.

### A4 — recall, the judge-free number (`master`, merged in #193)

The citable recall figures are the planted ones: ground truth planted by **edit-distance-1 mutation** and
labelled by an **independent `tsc` oracle** (`ts.createProgram`), with zero LLM in the label or scoring path.
Read from `harness/probes/adjudicate/calibration-report.a4-planted.md` (on `master`; measured at git sha
`9eb4d7f`; node v22.17.1, TypeScript 5.9.3, `@sourcegraph/scip-typescript` 0.4.0; recall rates re-verified
identical on `master` 2026-08-22):

| arm | recall (dist-FORM index, the operating state) | recall (dist-ABSENT index, a misbuild) | false-admit, Definition A | false-admit, Definition B |
| --- | --- | --- | --- | --- |
| count | 163/163 = 100% | 7/163 = 4.29% | 0/163 | 9/163 = 5.52% |
| dependency | 163/163 = 100% | 7/163 = 4.29% | 0/23702 | 309/23702 = 1.30% |
| negation | 428/1200 = 35.67% | 51/1200 = 4.25% | 0/163 | 0/163 |
| relation | 452/452 = 100% (construction artifact) | 452/452 = 100% | n/a — `admitRelation` states no truth predicate | 452/452 = 100% |

Three things this table needs to be read correctly:

- **The two false-admit definitions are not interchangeable.** *Definition A* is unsoundness under the gate's
  own documented predicate: admitted while `tsc` finds ZERO reference occurrence of the target in the flipped
  scope. *Definition B* is a mismatch against the bench's stricter, undocumented CALL-only label (`isCallee`,
  `packages/adapter-io/test/support/neg-bench-lib.ts:81-84`). All **318** Definition-B rows (309 dependency +
  9 count) were adjudicated line-by-line in that report and **0/318 are genuine unsoundness** — each has a
  real in-scope SCIP `reference` witness and no in-scope call.
- **`proven` means witnessed REFERENCE existence, not a call graph** (#191,
  `95-benchmark-methodology.md`): `reverseCallers` (`packages/index/src/symbol-reverse.ts`) counts any SCIP
  `reference` occurrence — imports, type-only positions, `instanceof` operands, re-exports. The oracle proves
  "B is referenced from scope A", never "A calls B". Definition B exists precisely because the bench asked a
  question the gate never claimed to answer.
- **Recall is index-BUILD-dependent by roughly an order of magnitude** (count/dependency 4.29% → 100%,
  negation 4.25% → 35.67%). A bare recall percentage without its build recipe (`npx tsc -b` BEFORE
  `scip-typescript index`) is not citable. `relation`'s 100%/100% is a construction artifact: `admitRelation`
  applies no direction door, so every driven proposal is admitted (904 driven / 904 admitted) and the two
  columns restate one count.

Not covered by this instrument: advisory/predicate prose, which has no sound oracle — see A1.

### A4 — agreement@pool, formerly reported as "recall" (`master`, relabelled here)

The 2026-08-16 pilot: 10 real atlas units, 3 miners (atlas `propose.md` advisory / ungated raw-LLM lister /
mechanical comment extractor), 101 adjudicated clusters, of which **64** were called `GROUNDED_TRUE`.

| miner | clusters in the judge-true pool | agreement@pool |
| --- | --- | --- |
| atlas (`propose.md`, advisory) | 10/64 | 15.6% |
| ungated raw-LLM lister | 63/64 | 98.4% |
| comment extractor | 2/64 | 3.1% |

By shape, of the judge-true pool: predicate 9/44 atlas vs 43/44 lister; advisory 1/9 vs 9/9; dependency 0/4,
negation 0/6, relation 0/1 for atlas (that run drove only the advisory miner). All of these re-derive by
arithmetic from the committed `adjudicated_clusters` rows (verified 2026-08-18).

**Three corrections to the 2026-08-16 version of this document:**

1. **It is agreement, not recall.** The denominator is 100% same-family LLM-judge `GROUNDED_TRUE` verdicts
   from an uncalibrated judge (same model family as the miner; never scored against a mechanical oracle on
   this corpus). By the repo's own ratified methodology — which demotes a 29/30 = 96.7% self-verified figure
   to non-citable for exactly this reason — that measures *agreement*, not truth, and therefore not recall.
   Report it as **agreement@pool(3)**; never as recall, and never bare.
2. **The instrument attribution was false.** The old scoreboard credited the run to `harness/probes/a4-pool.mjs`.
   That driver never ran live: its own test (`a4-pool.test.mjs`) stated live mode was "PENDING and out of this
   WP's scope", it only exercised `mode:'fake'`, it keyed its corpus on FILES while the pilot artifact keys on
   `path::symbol` units, and its output shape (`{mode, modeNote, files, counts, atlasRun, pairCalls,
   adjudicated, recall}`) shares no field with the artifact. The pilot is a **hand-tallied** record of per-unit
   sub-agent runs whose producing driver is not recoverable from this repo. That driver has now been deleted
   (see below).
3. **The baseline-precision figures were wrong and are judge opinion anyway.** The old text claimed the
   baseline was "~0.6 precision (one unit 13/14 false, another 8/11)". Re-derived from the artifact: the
   lister's worst unit is **13/13** false (not 13/14), the next is **8/11**, and overall the judge called
   **37/100** lister clusters false (judge-true 63/100 = 0.63). Atlas 10/10 and comment-extractor 2/2 were
   judge-true. Every one of those is the uncalibrated judge's verdict, so they belong in this section, not in
   the A1 precision row.

**Auditability limit, why this can never be upgraded in place:** `adjudicated_clusters` stores only
`{true, sources, shape}` per cluster — no fact text, no prompt, no per-call verdict log. The tallies are
arithmetic-checkable; not one verdict is adjudication-checkable. Re-measuring means a new run, not a re-score.

What survives as a *finding* rather than a metric: on this corpus a miner asked for **one** high-value fact per
unit surfaced 10 of the 64 things a miner asked for **all** facts surfaced, while the same judge called 37 of
that lister's 100 clusters false. The design axis (frontier selection vs exhaustive listing), not the
percentage, is the transferable part.

## The A4 pooling instrument was deleted, deliberately

`harness/probes/a4-pool.mjs`, `harness/probes/a4-pool.test.mjs` and the two non-Atlas pool members it was the
only consumer of (`baseline-lister.mjs`, `comment-extractor.mjs`) are **removed** on this branch. Reasoning:

- It never measured anything. No live run exists in this repo, its own test declared live mode out of scope,
  and the only committed A4 pool artifact was demonstrably not its output (shape and corpus granularity both
  mismatch).
- Its design is method-obsolete, not merely weak: its recall denominator is an LLM dedup judge plus an LLM
  truth judge. Under the ratified methodology that pipeline cannot produce a citable recall number for any
  shape — and for the four shapes where an oracle exists, `calibration-report.a4-planted.*` already produces
  a judge-free one.
- Left in place it is a trap with a green test: the next reader finds a runnable "recall driver", spends real
  tokens on `mode:'live'`, and publishes an agreement number as recall — the exact error this document just
  had to correct.
- Deleting the driver orphaned its two pool members (no consumer, no coverage), so they went with it.

Kept instead: `harness/probes/a4-agreement-pool-pilot.json` (the renamed pilot), because its 101 committed
cluster rows re-derive every published tally exactly and it is the only cross-miner comparison the program
has. Its `kind`, `NOT_RECALL`, `AUDITABILITY_LIMIT` and `PRODUCER` fields say all of the above in-artifact, so
the number cannot be picked up as recall by someone who never reads this document. The deleted code remains in
git history at commit `b531755`.

## Sound-gate teeth: what proves the 0-false-admit is earned (`master`, merged via #192)

A 0 is only worth reporting if something could have made it non-zero. Per #192
(`packages/adapter-io/test/semantic-bench.test.ts`), three assertions guarding these headlines could not fail
and were replaced with teeth proven to bite:

- **Negation non-vacuity is now `judgeCallersBlind` = 14.72%** (re-verified `14.46%` on `master` 2026-08-22;
  the small drift is the negation-FALSE population growing with the codebase, the teeth still bite `> 0`) — the byte-identical shipped door handed a
  `symbol-reverse` whose `reverseCallers` is `[]`, blinding the exact leg the door's soundness argument names.
  It is **asserted**. The denominator is the 163 tsc-FALSE negation rows (`bench-scorer.ts`:
  `falseAdmit = |admitted∧FALSE| / |FALSE|`); the branch prints the percentage, not the raw numerator, so
  `≈24/163` is a derivation, not a printed count.
- **The old teeth, `judgeGateOff` = 0.00%, is retained as a REPORTED diagnostic**, not as the proof. On a
  dist-form index `canonicalizeSymbol` (#189), not the #99 opaque-local gate, carries the soundness, so
  turning that gate off converts abstains into refutes (134 scope-open → 122 refute, measured) and never into
  admits — `expect(0).toBeGreaterThan(0)`, a dead assertion. Keeping the number printed is what keeps the
  staleness claim checkable in the artifact.
- Honest scope of the teeth: it proves the 0 is earned for the rows the door decides by **refutation**. The
  134 scope-open / 5 escape-open rows are conservative refusals, not proofs, and this mutation does not
  disturb them.

## Provenance (every file cited above)

- A1: `harness/probes/adjudicate/calibration-report.a1-subject.{md,json}`, fixtures `adjudicate/fixtures.mjs`
  (sha256[:16] `01c7bc130eb7f384`). `master`.
- A2: `docs/design/95b-staleness-a2-methodology.md`; re-derive with `node harness/probes/a2-staleness.mjs`
  and `node harness/probes/a2-staleness-teeth.mjs`. `master`.
- A3: `harness/probes/a3-cost-sidecar.jsonl` (10 records, one per site, `total_cost_usd` from the CLI);
  `harness/probes/cost-sum.mjs`. `master`.
- A4 recall + sound-gate false-admit: `harness/probes/adjudicate/calibration-report.a4-planted.{md,json}` —
  `master` (merged in #193); recall rates re-verified identical on `master` 2026-08-22. Instrument:
  `packages/adapter-io/test/semantic-bench.test.ts` + `test/support/bench-scorer.ts`.
- A4 agreement: `harness/probes/a4-agreement-pool-pilot.json`. This branch.
- Teeth: `packages/adapter-io/test/semantic-bench.test.ts` — `master` (merged via #192); the
  `judgeCallersBlind` teeth assertion is live and passes (`14.46% > 0`, re-verified on `master` 2026-08-22).
- Method: `docs/design/95-benchmark-methodology.md` (`proven` = witnessed reference existence),
  `docs/design/95a-recall-a4-methodology.md` (pooling design sketch — the pooling *instrument* it sketches no
  longer exists in the tree).

## What this is NOT

- **Not an absolute-recall claim, and not any recall claim for advisory prose.** The judge-free recall figures
  cover four oracle-bearing shapes on planted mutations of a fixture, not arbitrary real facts. Advisory prose
  has no oracle and no judge-free recall number at all.
- **Not a cross-vendor comparison.** No non-Atlas SOTA system has been run under a fixed model with a shared
  denominator. The lister column is a same-corpus baseline scored by an uncalibrated judge.
- **Not a claim that Atlas detects staleness.** It detects byte drift inside a fact's own anchored extent with
  0 false-drift on 4/4 non-touching edits; semantic cross-file staleness is NOT SUPPORTED (§6.3).
- **Not build-independent.** Recall swings ~8-23× with whether `packages/*/dist` declarations existed before
  `scip-typescript index` ran. Soundness (0-false-admit under Definition A) holds across both builds measured.
