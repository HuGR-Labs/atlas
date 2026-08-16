# A1 subject-test — derived report (planted ground truth, no LLM judge in the correctness loop)

Method: [`docs/design/95-benchmark-methodology.md`](../../../docs/design/95-benchmark-methodology.md). This is the
**subject-test** framing of A1 precision: the LLM is the SUBJECT under measurement, the fixture labels are
ground truth we planted by construction, and scoring is a deterministic string-compare against the label —
**no LLM judge decides correctness**. Contrast the κ-panel report (`calibration-report.smoke-noisy.*`), which
measures inter-judge self-consistency and is a secondary signal only.

## Instrument (frozen)

- Fixtures + prompt: `fixtures.mjs` (10 grounded-true + 10 planted-false pairs, `renderPrompt`), sha256[:16]
  `01c7bc130eb7f384`.
- Subject: one **fresh-context sonnet sub-agent per fixture** (Agent tool, per [[model-in-loop-is-subagents]]),
  fed the frozen `renderPrompt` output verbatim, one pass each. It returns exactly one verdict token.
- Scoring: `fleiss.mjs::detectionRates` + a Wilson 95% score interval on the false-admit proportion.

## Result (n=20; 10 true, 10 false)

| metric | value | reading |
| --- | --- | --- |
| **false-admit-rate** (planted-false called GROUNDED_TRUE) | **1/10 = 0.100** — Wilson95% [0.018, 0.404] | the headline: how often a false claim slips through |
| catch-rate (planted-false called HALLUCINATED) | 9/10 = 0.900 | — |
| false-alarm-rate (grounded-true called HALLUCINATED) | 0/10 = 0.000 | the subject rejected no true fact |

**The one leak:** `F03` (falseKind `wrong-constant`). Code: `const ABSTAIN = 'NO-FACT'`; the fact claims the
sentinel string is `"ABSTAIN"`. The subject was fooled by the variable *name* matching the claimed value while
its actual *value* is `'NO-FACT'` — the name/value confusion class. Every other lie class (negated-condition,
wrong-callee, wrong-default, past-comment-as-present, fabricated-behavior) was caught.

## Honest limits (state as limits, not TODOs)

- **n is small (20).** Wilson95% on the false-admit is wide ([0.018, 0.404]). Expansion is additive: append
  `(code, fact, label)` pairs to `fixtures.mjs`. The interval, not the point, is the honest claim.
- **Reproducibility is by RECORD** (HELM / lm-eval discipline), not by forcing T=0: the row is reproducible
  because the instrument is fully logged — frozen prompt digest `01c7bc130eb7f384`, the model + run date
  (`a1-subject-verdicts.json`), and the raw per-fixture verdicts (committed). Re-running the same model against
  the same frozen prompt reproduces it; any answer drift on a rerun is itself a measurement to report, not a
  hole. Temperature is a recorded knob, not a precondition.
- **Measures precision, not recall.** It scores whether the model REJECTS false claims (the faculty that gates
  advisory admission), not whether it SURFACES the good facts — recall is A4's separate trail.
- **Synthetic-clean by design.** Clean labels require knowing the truth to plant the false; that beats repo
  fidelity here. Precision on real mined atlas facts would need a judge — the loop we deliberately removed.

## What is the STRONG number

The `proven` seal (dependency / count / negation), not this. Negation already reports **0-false-admit over
18,654 admits vs the tsc oracle** on real atlas code (#232) — a mechanical 0-FP claim needing no LLM. The
advisory subject-test above is the honest secondary number for the shape that has no sound oracle.

## Supersedes

The earlier live "29/30 = 96.7% grounded+true" is **demoted to non-citable smoke** — it was LLM
self-verification (a sonnet panel judging sonnet-proposed claims; see the methodology doc for why that
measures self-consistency, not truth).
