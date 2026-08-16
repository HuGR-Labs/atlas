# #95 — Benchmark results: Atlas on four axes, measured by real runs

**Status:** first full four-axis measurement, 2026-08-16. Every number below came from a **real run** (no
"the suite is green" stand-ins), following the method in
[`95-benchmark-methodology.md`](95-benchmark-methodology.md) (the planted-ground-truth collapse: the LLM is
the subject, ground truth is something we control, no LLM judge in the *correctness* loop where a mechanical
oracle exists). Model held fixed at `claude-sonnet-5` where a model is in the loop.

This document reports numbers **with their caveats attached** — that is the deliverable, not a marketing line.

## The scoreboard

| Axis | Atlas (shipped path) | SOTA baseline (ungated raw-LLM lister) | Instrument |
| --- | --- | --- | --- |
| **A1 precision** | **1.00** on real facts (10/10 adjudicated true); planted false-admit **1/10 = 0.10** (Wilson95% [0.02, 0.40]) | ~0.6 (much false: one unit 13/14 false, another 8/11) | planted fixtures (`adjudicate/`) + the A4 pool |
| **A2 staleness** | true-stale caught **6/6**, false-stale **0/4** (a mechanical drift oracle exists) | **none** — a listed fact never knows when it rots | shipped `driftDetect` over planted edits (`a2-staleness.mjs`) |
| **A3 cost** | **$0.096 / site** (real `total_cost_usd`, 10 sites, `claude -p` operator config) | same model tier | shipped `metered-claude.mjs` + `cost-sum.mjs` |
| **A4 recall@pool** | **15.6%** (10/64) | **98.4%** (63/64) | `a4-pool.mjs` pooling, 10 real units, 3 miners |

## The one honest sentence

**Atlas does not compete on recall. It is a precision + freshness instrument.** The grounding door buys 100%
precision on what it emits *and* a re-runnable staleness oracle — a property the raw-LLM baseline
structurally cannot have — at the cost of recall (one high-value fact per unit, abstaining on the rest). The
baseline wins recall, but (a) ~40% of what it emits is false, and (b) not one of its facts can tell you when
it has gone stale. Atlas emits fewer facts that you can **trust** and that **carry their own drift check**.

## Per-axis detail and caveats

### A1 — precision (committed: master)
The subject-test scores the LLM's ability to reject a false claim about code, against **planted-false**
fixtures (no LLM judge decides correctness): false-admit **1/10 = 0.10**, catch 9/10, false-alarm 0/10; the
one leak was a name-vs-value confusion (`const ABSTAIN='NO-FACT'` mislabelled as sentinel `"ABSTAIN"`). On the
A4 corpus, all **10 facts Atlas actually emitted were adjudicated true** — its emitted precision corroborates
the planted number. Caveats: n=20 fixtures / 10 real facts; synthetic-clean fixtures by design; reproducible
by record (prompt digest + model snapshot + verdicts committed).

### A2 — staleness (committed: master, test-pinned)
Drives the **shipped** `driftDetect` oracle via `reDerives` over a planted corpus of fact-invalidating vs
fact-preserving edits — mechanical, zero LLM. 6/6 invalidating edits caught DRIFTED, 4/4 preserving edits
stayed FRESH. Caveats: n=10 corpus, own-anchor byte granularity only (the callee/interface leg is dropped as
*vacuous* against the shipped oracle — `freshness()` has zero production callers; see 95b §3). The
reformat→DRIFTED case honestly matches the #125 ledger (no "0-false-drift-on-reformat" overclaim). **This axis
is the moat**: the baseline has no analog.

### A3 — cost (real metered run; data below)
`metered-claude.mjs` is a drop-in `propose.cmd` that runs the real `claude -p ... --output-format json`, hands
Atlas the answer verbatim, and records the CLI's own `total_cost_usd` to a sidecar; `cost-sum.mjs` rolls it
up. 10 sites, 0 errors, 1 abstention: **total $0.964, mean $0.096/site**. Caveats: **cost is
operator-config-dependent** — $0.096 is the number for a `claude -p` (Claude Code CLI) `propose.cmd`, which
carries its own ~34k-token system prompt; a bare-Anthropic-API operator would be cheaper. The price is real
(from the CLI), not an assumed rate card. An earlier hand estimate of ~$0.003/site was wrong-low by ~32× —
recorded here as the reason the axis is measured, not estimated.

### A4 — recall@pool (pilot run; data below)
TREC-style pooling (95a): 10 real atlas units, 3 miners (Atlas `propose.md` / ungated raw-LLM `baseline-lister`
/ mechanical `comment-extractor`), 112 pooled candidates → per-unit LLM semantic-dedup + truth-adjudication →
**64 unique true facts** (denominator). recall@pool: **Atlas 15.6% · lister 98.4% · comment-extractor 3.1%**.
Per shape (of the true pool): predicate 20.5%, advisory 11.1%, negation/dependency/relation **0%**.

Caveats — load-bearing, do not drop:
1. **recall@pool only over-states absolute recall** (a fact no miner found is invisible); report as
   "recall@pool(3)", never bare "recall".
2. **The low Atlas recall largely reflects a design choice**: `propose.md` asks for **one** fact per unit; the
   lister was asked for **all**. A multi-fact Atlas config would score materially higher. This is not evidence
   Atlas *cannot* find the other facts.
3. **The 0% on negation/relation is a pilot artifact**, not a product limit: this run drove only the advisory
   `propose.md` miner. The negation and relation doors ship (post-#99a/#99b); the shipped `atlas mine` would
   run them. Measuring those shapes' recall is follow-on work.
4. **Adjudicator variance**: truth-adjudication here is an LLM judge on *real* (un-plantable) facts — the weak
   link the methodology names. Two of ten unit-judges were visibly stricter than the others. n=10 units.

## Provenance

- A3 raw: `harness/probes/a3-cost-sidecar.jsonl` (one metered record per site; `total_cost_usd` from the CLI).
- A4 raw: `harness/probes/a4-recall-pilot.json` (corpus, per-unit adjudicated clusters, per-system + per-shape
  tallies).
- A1/A2 are committed instruments with their own reports (`adjudicate/calibration-report.a1-subject.*`,
  `a2-staleness.test.mjs`).

## What this is NOT

Not an absolute-recall claim. Not a cross-vendor comparison (a fair pool would add non-Atlas SOTA systems and
hold the model fixed — 95a §7). Not the final A4: the multi-fact and per-shape (negation/relation) recall runs
remain. The scoreboard is a floor of honest, reproduced numbers, each carrying the gap between what was
measured and what a stronger claim would require.
