# WP-FIX-SZZ-CHURN — SZZ composes with the hotspot bar, it does not bypass it

Standalone defect-fix card (not part of a numbered campaign; frozen fields follow the campaign-9/10
card shape so it is checkable by the same gates, scoped to a targeted correction rather than a fresh
build). Owner: `packages/adapter-io/src/git-history.ts` frontier admission (ADAPT-GIT-1), already built
under WP-9.3.6-a.HISTORY — this card does not re-scope that WP, it corrects one admission leg inside it.

---

### WP-FIX-SZZ-CHURN — SZZ leg requires the same evidence-of-recurrence as the churn leg
epic: EPIC-6-a
id: WP-FIX-SZZ-CHURN
content_hash: <filled-at-freeze>
title: `frontier()`'s SZZ leg is bounded by `HOTSPOT_MIN_SZZ`, symmetric to `HOTSPOT_MIN_CHURN`
intent: >
  The GEN-11 personalization frontier (`packages/adapter-io/src/git-history.ts` `frontier()`) admits a
  file via THREE legs — churn, SZZ, coupling. The SZZ leg previously admitted on `szz.get(f) >= 1`: a
  SINGLE `fix:`-subject commit touching a file, short-circuiting `HOTSPOT_MIN_CHURN = 2` entirely. In a
  conventional-commits repo this collapses the frontier toward "every file ever touched by a `fix:`
  commit" — reinstating the file-count-proportional LLM spend REQ-GEN-3a/3b forbid (`frontierBudget` IS
  the ranked-site count, genesis/rank.ts:370). The fix introduces `HOTSPOT_MIN_SZZ = 2`, a bar SYMMETRIC
  to `HOTSPOT_MIN_CHURN`, so SZZ composes with the bound instead of bypassing it. SZZ remains its own
  admission leg (fix-proneness is a real signal); it simply now needs the same "happened more than once"
  evidence the churn leg already requires. (Non-authoritative handle.)
source_reqs:                                  # ptr+digest
  - source: ../req-gen.md#REQ-GEN-3a  # ptr+digest
  - source: ../req-gen.md#REQ-GEN-3b  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-8a  # ptr+digest
seam-freezes: [ ]
anchor: packages/adapter-io/src/git-history.ts — frontier() SZZ admission leg (→ HistorySource, ADAPT-GIT-1)
interface_contract:                           # ptr+digest
  - source: ../../reference/atlas-adapters.md#adapt-git-1  # ptr+digest
  - source: ../method-tags-adapters.md#INV-ADAPTER-8       # ptr+digest
exclusions: >
  No change to `HOTSPOT_MIN_CHURN` or `COUPLING_MIN_SUPPORT`. No change to `signals().szzBugCommits`
  (still counts every `fix:`-subject commit touching a site — an unbounded per-site SIGNAL, not a
  frontier ADMISSION gate; those are deliberately different questions). No ranking-only demotion of the
  SZZ leg, no removal of the leg, no configurable threshold — a NAMED constant, symmetric to the sibling
  bar it composes with. Does not touch `sidecar.ts`, `doctor-source.ts`, or any package outside
  `adapter-io`.
inputs:                                        # ptr+digest
  - source: ../../reference/atlas-adapters.md#adapt-git-1  # ptr+digest
action: >
  Add `HOTSPOT_MIN_SZZ = 2` beside `HOTSPOT_MIN_CHURN` in `git-history.ts`; change the SZZ leg of
  `frontier()`'s `inFrontier` predicate from `(szz.get(f) ?? 0) >= 1` to `(szz.get(f) ?? 0) >=
  HOTSPOT_MIN_SZZ`. Add a regression suite (`test/git-history-frontier-szz.test.ts`) with a local fixture
  isolating a one-fix-touch file (churn=1, szz=1 — must now be EXCLUDED) from a two-fix-touch file
  (churn=2, szz=2 — stays ADMITTED), pinning the admitted-frontier OUTPUT rather than re-asserting the
  constant. Verified failing against the pre-fix predicate before verifying green against the fix.
action_surface: [ read-repo, edit(packages/adapter-io/src/git-history.ts), edit(packages/adapter-io/test/git-history-frontier-szz.test.ts), run(test:adapter-io), typecheck ]
guardrails: >
  Edit only `packages/adapter-io/src/git-history.ts` and `packages/adapter-io/test/**` (new files only —
  the shared `git-sbx`/`fix-repo` harnesses are FROZEN fixtures other WPs consume and are not redefined
  here). One named constant, documented with the rationale above. Do not touch other modules/core.
repair_budget: N=3 · early-stop: { repeated-identical-failure, no-change-diff, semantic-dup-edit }
acceptance:                                    # ptr+digest = frozen goldens (pre-existing, still hold)
  - source: ../goldens-adapters.md#SCN-ADAPTER-8a-1  # ptr+digest — signals still equal real-git oracle
  - source: ../goldens-adapters.md#SCN-ADAPTER-8b-1  # ptr+digest — frontier still byte-identical across runs
  - source: ../goldens-adapters.md#SCN-ADAPTER-8c-1  # ptr+digest — still mints no fact
  # New regression coverage (not a frozen golden — a defect-closing suite):
  #   packages/adapter-io/test/git-history-frontier-szz.test.ts — pins the admitted frontier over a fixture
  #   with a known 1-fix file (excluded) and a known 2-fix file (admitted); fails against the pre-fix source.
deps: [ ]   parallel_group: [P] — targeted correction inside an already-built WP, no in-campaign predecessor
exit_predicate: >
  all acceptance SCNs green ∧ new regression suite green against the fix AND red against the pre-fix
  predicate ∧ full adapter-io suite green (no regression) ∧ module gates pass ∧ all pointer digests
  resolve (no STALE)
context_refs:                                  # closed list
  - source: ../../reference/atlas-adapters.md
  - source: ../requirements-adapters.md
  - source: ../goldens-adapters.md
  - source: ../method-tags-adapters.md
  - source: ../req-gen.md
owner: charlie · builder_id: <assigned-at-dispatch>
outputs:                                                    # exec — empty at S4-freeze
provenance:                                                 # exec — empty at S4-freeze
trace_ref:                                                  # exec — empty at S4-freeze
rationale:                                     # ptr
  - source: ../invariant-register-adapters.md#INV-ADAPTER-8
