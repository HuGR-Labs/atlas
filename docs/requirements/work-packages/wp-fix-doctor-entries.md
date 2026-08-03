# Work Package — the doctor's drift classifier and repair span every grounding entry   (amendment card, 2026-08-03)

> One card, standing alone because it amends a shipped seam rather than a campaign slice. Conforms to
> [`method/wp-template.md`](../../method/wp-template.md): every substantive field is a `ptr+digest`
> (digests are tooling-filled at freeze), `content_hash` is filled at freeze, the `exec` fields carry the
> run's outcome.

---

### WP-FIX-DOCTOR-ENTRIES — classification and repair range over the same set detection does
epic: EPIC-26-b
id: WP-FIX-DOCTOR-ENTRIES
content_hash: <filled-at-freeze>
title: The drift classifier was asymmetric — detection spanned every citation, classification and repair spanned entry zero
intent: >
  `packages/adapter-io/src/doctor-source.ts` DETECTED drift over the whole grounding (`reDerives` →
  `driftDetect`, a conjunction over every citation) and then CLASSIFIED and REPAIRED `entries[0]` alone. A fact
  that drifted because a SECONDARY citation went stale therefore resolved its primary anchor at HEAD, read
  `mechanical`, and emitted a "repair" that swapped the primary anchor to effectively where it already was —
  stamped `freshness: 'FRESH'` by a template that had re-derived nothing. MEASURED on the fixture built for this
  card, pre-fix: `class=mechanical  anchorWas=src/a-primary.ts  anchorNow=src/a-primary.ts` — a move from a path
  to itself — with the stale citation untouched in the emitted candidate.

  THE SEVERITY IS BOUNDED, AND THE BOUND IS MEASURED RATHER THAN ASSUMED. `governed-emit.ts` gate 1 re-derives
  the WHOLE grounding through `buildGate` and refuses a non-HOLDS node (`REJECTED_UNGROUNDED`, nothing
  persisted); it recomputes freshness from the index and never reads the node's own `freshness` field, so the
  overstated stamp is inert at the door. Measured verdict on the pre-fix candidate: `NA` — refused. The live
  defect was therefore a MISCLASSIFICATION plus a repair plan that could not land, NOT a false FRESH reaching
  the projection. (Non-authoritative handle.)
source_reqs:                                   # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-9c  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-9d  # ptr+digest
seam-freezes: [ ]
anchor: packages/adapter-io/src/doctor-source.ts — `drift` / `plan` / `regroundTemplate`
interface_contract:                            # ptr+digest
  - source: ../../reference/atlas-adapters.md#adapt-git-2  # ptr+digest
  - source: ../method-tags-adapters.md#INV-ADAPTER-9       # ptr+digest
exclusions: >
  `driftDetect` (@atlas/grounding) is NOT touched — detection was already total over the grounding and is the
  oracle the per-entry verdict DECOMPOSES (a single-entry restriction of the same call, which is sound because
  `driftDetect` is a conjunction over entries). The emit door is NOT touched: it was already right, and it is
  what bounds this defect. `DriftItem` is NOT widened — it carries one `anchorWas`/`anchorNow` pair
  (atlas-tools:24, frozen), so the item reports the first drifted entry's move while the repair covers all of
  them; making the classifier's output shape richer would be a contract change, not a fix. `retireTemplate` is
  unchanged (a retire tags `authoring: 'SUPERSEDED'` and asserts no freshness of its own).

  NOT THIS WP, AND IT IS A REAL REMAINING GAP: `compose.ts` binds the reconcile classifier
  (`bindReconcile`) to the SAME entry-0-only question, through the `primaryAnchor` export. It is a second copy
  of this defect living in the composition root — a file five other seats are live in — so it is reported for
  sequencing rather than raced for here. The `primaryAnchor` docstring no longer claims the two classifiers are
  "one shared pick"; after this card they are not, and that sentence is why the second copy stayed invisible.
inputs:                                        # ptr+digest
  - source: ../../reference/atlas-adapters.md#adapt-git-2  # ptr+digest
action: >
  Classify over the entries that actually drifted (semantic iff ANY of them re-derives nowhere at HEAD — the
  fail-closed direction, because a re-ground that leaves one citation broken is a plan that cannot land);
  re-anchor every drifted entry in the reground candidate; derive `freshness` from whether the repair
  established every entry instead of stamping it.
action_surface: [ read-repo, edit(packages/adapter-io/src/doctor-source.ts), edit(packages/adapter-io/test/**), run-tests(adapter-io), typecheck ]
guardrails: >
  No edit to `compose.ts`, `sidecar.ts`, `git-history.ts`, `packages/grounding/**`, `packages/knowledge/**`,
  `packages/genesis/**`, `packages/cli/**`. No new export (the exported surface `primaryAnchor` /
  `regroundTemplate` / `retireTemplate` / `createDoctorSource` is unchanged in NAME; `regroundTemplate`'s second
  parameter becomes positional-per-entry, and its one call site is updated in the same package). No behaviour
  change on the primary-drift case.
repair_budget: N=3; early-stop on { repeated-identical-failure, no-change diff, semantic-dup edit }.
acceptance:                                    # ptr+digest = frozen goldens
  - source: ../goldens-adapters.md#SCN-ADAPTER-9c-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-ADAPTER-9d-1  # ptr+digest
deps: [ ]   parallel_group: [P] — single-file amendment, no in-flight predecessor
exit_predicate: >
  all acceptance SCNs green ∧ the new teeth FAIL on the pre-fix source (proven by restoring it byte-for-byte and
  watching them go red) ∧ the primary-drift case is GREEN on both the pre-fix and the fixed source ∧ `tsc -b`
  clean ∧ full `npm test` green ∧ every `harness/gates/**` gate green
context_refs:                                  # closed list
  - source: ../requirements-adapters.md
  - source: ../goldens-adapters.md
  - source: ../method-tags-adapters.md
owner: adapter-io / doctor seat
outputs: >
  packages/adapter-io/src/doctor-source.ts (233 LOC) — `restrictTo` (the single-entry restriction of the
  detection oracle), `driftedAt` (every drifted entry + where its content lives at HEAD), semantic-first
  classification, per-entry repair, derived freshness.
  packages/adapter-io/test/doctor-entry-symmetry.test.ts (NEW, 8 tests) — the two-citation demonstration, the
  rotted-secondary fail-closed case, the unchanged primary-drift case, the derived-freshness contract, and the
  emit-door measurement (the pre-fix candidate is transcribed verbatim in the test so the door's verdict on it
  is measured in the same run).
provenance: >
  BEFORE (pre-fix source, restored byte-for-byte): sec-mech → class=mechanical was=src/a-primary.ts
  now=src/a-primary.ts, plan entries=[src/a-primary.ts, src/b-secondary.ts], freshness=FRESH, door=NA.
  sec-rot → class=mechanical, action=reground, door=NA. lead-mech → class=mechanical was=src/d-lead.ts
  now=src/y-lead-moved.ts, entries=[src/y-lead-moved.ts, src/e-stable.ts], door=HOLDS.
  AFTER: sec-mech → class=mechanical was=src/b-secondary.ts now=src/z-secondary-moved.ts,
  entries=[src/a-primary.ts, src/z-secondary-moved.ts], freshness=FRESH, door=HOLDS. sec-rot → class=semantic,
  action=retire, keyed on src/c-rotten.ts. lead-mech → IDENTICAL to the pre-fix line above.
trace_ref: branch fix/doctor-entries-symmetry (worktree off master 38f3f4b)
rationale:                                     # ptr
  - source: ../invariant-register-adapters.md#INV-ADAPTER-9
