# Session state — 2026-08-31

**What this file is:** the state of the work at a point in time, written so a DIFFERENT session, model,
harness or provider can pick it up cold. It is not a plan. This repository has already been bitten by
reading a plan as state — a doc describing work to be done outlived the work, and the next reader
recommended building something that already existed. So every claim below carries the command that
re-derives it, and nothing here is a value you are asked to trust.

**Baseline:** master `35845ae` (2026-08-31). If `git rev-parse --short HEAD` on master differs, this file
is behind by that much; treat its measurements as a dated reading and re-run the commands.

---

## 1 — How to re-derive everything on this page

Build first (`npx tsc -b`), then:

| what | command |
| --- | --- |
| all guards | `npm run godfile-guard && npm run spec-conformance-guard && npm run layer-guard && npm run reference-model-guard && npm run command-doc-guard && npm run wiring-guard && npm run adr-citation-guard && npm run req-clause-guard && npm run ears-coamend-guard && npm run doc-transcript-guard && npm run service-gate-guard` |
| the memory-ring benchmark (M-axis) | `node harness/probes/m1-memory-ring.mjs` |
| the CAS integrity audit | `node packages/cli/dist/src/bin.js doctor cas` |
| the proven-fact re-verification | `node packages/cli/dist/src/bin.js verify-store` |
| the advertised MCP surface | pipe an `initialize` + `tools/list` JSON-RPC pair into `node packages/mcp-server/dist/src/bin.js` |

Two traps, both paid for in this session:

- **`node harness/gates/<g>.mjs | grep …` reports grep's exit code, not the gate's.** Capture the command's
  own status immediately, or redirect to a file and check `$?` before piping.
- **Never run the whole test suite concurrently.** It has frozen this machine. One package at a time:
  `npx vitest run packages/<name> --pool=forks --poolOptions.forks.singleFork=true`.

---

## 2 — What shipped, and why

Three PRs, all merged to master, all with CI green.

### #294 — MEM-5 gates field TYPES

`atlas memory-emit` reads arbitrary user JSON and asserted it into `MemoryEntry` — a compile-time claim over
a runtime value nothing checked. Measured against the shipped binary: a record with a string `frecency` was
ADMITTED, reached disk, and RANKED in the per-seat turn header, because the decay arithmetic coerces a
numeric string.

The fix also made the `template-invalid` refusal reachable for the first time. The kind-derivation step
filtered candidate templates by exactly the two conditions the validator decided, so every entry that could
fail validation had already failed derivation — the refusal was declared, advertised to users in the door's
guidance, and impossible to produce. **Types are the first condition validation decides that derivation does
not.** That is the whole mechanism; it generalises to any two gates where the earlier one screens on the
later one's criteria.

`kind-conflation` is the same defect and is NOT fixed, because it cannot be by the same move: the partition
step answers `knowledge` only for an entry carrying a `kind` key, which is outside every memory template, so
derivation always refuses first. The catch stays as a fail-closed floor; what was removed is the CLAIM, from
the tool guidance. The M-axis asserts the unreachability, so it cannot drift back silently.

### #296 — `atlas doctor cas` (ADR-0022) + the docs lying about the MCP surface

A content-addressed object's filename is the hash of its content, so corruption is decidable locally with no
index, model or network — and nothing in the product decided it. `DoctorApi` grew a fifth read leg. Read
`docs/adr/ADR-0022-doctor-audits-the-store-it-diagnoses.md` for the reasoning, including the rejected
alternative that was found AFTER the owner ratified and re-examined rather than quietly omitted.

The same PR corrected four false public claims (README surface counts; `docs/reference/commands/doctor.md`
asserting there is no `atlas-doctor` MCP tool) and put a gate on the README bullet that had rotted twice
while carrying the sentence *"No gate holds this bullet."*

**The most transferable lesson in this session is in that gate.** Its first cut derived the advertised MCP
surface from the two exported surface constants — the same thing the README claimed. Running the real stdio
server disproved it in one call: it advertises more tools than those constants hold, because two ride a
documented parallel path. The README was calling reachable doors unreachable, and the new gate would have
certified it. **The constants are the model; the server is the path. Anchor a gate on what ships.**

### #297 — the rows `verify-store` was dropping

`atlas verify-store` re-proves every fact sealed `proven`. On this repository it reported zero such facts and
exited 0, under guidance reading *"an honest zero, not a skip"*, while the durable projection held
seventeen. The cause was one filter whose own doc comment admitted it — rows whose bytes are absent were
dropped — repeated independently in a second code path.

**The dropped rows are exactly the broken ones**, so the gate was anti-correlated with the fault: cleanest
precisely when the store is worst. Fixed with a fourth outcome bucket, `dangling`, in its own name (the
witness missing and the fact missing are different faults), joined to the non-zero exit.

Same PR narrowed `doc-transcript-guard`'s exemption key. It was a file-wide ordinal, so inserting one worked
example partway down a page shifted every later block and silently re-attached each exemption to its
neighbour, with nothing failing. The ordinal is now scoped to the invocation.

---

## 3 — The state of THIS repository's own store

Re-derive with the two commands in §1. As measured at this baseline: the CAS holds 1320 objects; the
projection references 613; **17 of those references resolve to nothing**, and `verify-store` reports the same
17 as `dangling` and exits non-zero. Zero objects are corrupt or unparseable.

The same audit reports a large `orphan` count. **That is not a fault and does not make the store unsound.**
The CAS is append-only and content-keyed, so an object outliving the sidecar that once referenced it is
ordinary; `orphan` is counted and deliberately excluded from the soundness verdict. Do not "clean up"
orphans — the audit reports them, and reporting is the whole of its mandate.

All 17 are the same shape — advisory family, tier T2, seal `proven`, slot `dependency`, scope `atlas:mined`.
The discrimination is total: every proven/dependency row is missing and every other row is present.

**What is NOT established, and must not be repeated as if it were.** Every CAS object was written inside a
single window on 2026-08-25 while the projection advanced days later, and no stored object carries a seal
field at all. That is consistent with the CAS being rebuilt after those rows were published, with the
deriving command never re-run. It was not proven: "never written" and "written then removed" are
indistinguishable from what is on disk, and the emit path writes bytes BEFORE publishing and refuses an
unaddressable object, so there is no live defect to point at.

`.atlas/cas/` and `.atlas/projection.json` are deliberately un-ignored (they may travel) and are currently
UNCOMMITTED. **They should stay uncommitted while the audit fails** — a travelling store must pass its own
audit, and this one does not.

---

## 4 — Open decisions (owner's, not the next session's to take)

**(a) The 17 unresolvable rows.** Recommended: leave them. They were invisible; now every re-verification
surfaces them and exits non-zero. The alternatives both cost more than the fault: re-deriving is not a
repair (see (b)), and retiring the rows is a governed write that erases the evidence they existed.

**(b) Do NOT reach for `derive-relations` as a repair.** Measured this session: it derives **6193** edges,
not 17 — a roughly tenfold growth of the projection, not a patch. It also cannot run: every candidate is
refused `unauthorized: actor not in fact scope`, because the existing 17 carry scope `atlas:mined` (granted
in policy) while derived edges take endpoint scopes granted to nobody. Authorising them means editing
`.atlas/policy.json`, which declares itself admin-owned. Nothing was persisted by the attempt: the door
refused every candidate and reported `persisted 0`, and the store was re-checked immediately after —
unchanged object count, unchanged newest write time, unchanged generation count, clean working tree. (That is
what was checked; the files were not re-hashed one by one, so "unchanged" is those four observations, not a
byte-level proof.) If the 6193 are ever wanted, that is its own campaign with its own plan.

**(c) CI cost.** `harness/gates/doc-transcript-guard.test.mjs` was measured at **833s** after the change
(`npx vitest run harness/gates/doc-transcript-guard.test.mjs --pool=forks --poolOptions.forks.singleFork=true`).
The figure before the change was never measured in isolation, so the delta is stated structurally rather than
as a number: two tests were added, and each re-runs the whole corpus — one fixture repository per verified
block. A single gate invocation on its own is ~40s; the tests cost more than that because an insertion pushes
declared blocks into the verified set. If this is too expensive, the same-invocation test is the one to cut;
the different-invocation test is what actually proves the fix and is comparatively cheap.

---

## 5 — Working rules this session had to learn or re-learn

Ordered by how much they cost when ignored.

1. **A gate that skips what it cannot read reports health for the exact fault it exists to catch.** Ask of
   any gate: what does it do with an item it cannot process? If the answer is "filters it out", that is a
   silent bucket, and silent buckets are where the failures live. Every drop must be counted and named.
2. **A sentence denying a failure mode is evidence someone once worried about it, not evidence it was
   fixed.** Two examples here: *"an honest zero, not a skip"* over a skip, and *"No gate holds this bullet"*
   in a bullet that then rotted through two campaigns.
3. **Anchor a gate on the shipped artifact, not on the constant that describes it.** Falsify it once against
   the live system by hand before believing it.
4. **Mutation-probe your own instrument.** Three defects in this session's probes were found only by
   deliberately breaking the thing under test and checking the probe went red — never by reading the code.
   One assertion was passing while the property it named was broken.
5. **When you fix what a measurement measured, re-derive the measurement.** An assertion whose subject an
   earlier gate now removes still reads green and has become vacuous.
6. **Run every guard before pushing, not the ones you think you touched.** Two CI failures this session were
   guards that a local partial run never invoked.
7. **A dated transcript quoted as evidence goes stale while still reading as freshly verified.** Date it, or
   re-run it.
8. **Publish no measured numbers without an independent cold review.** Two of two reviews found something
   real; the second found a limit that had been weakened by an unrelated edit. Ask the reviewer explicitly
   to check whether the edit softened any pre-existing constraint.
9. **Measure a command before recommending it.** The `derive-relations` suggestion in §4(b) was made without
   checking its scope: it was described as repairing 17 rows and in fact derives 6193 — wrong by a factor of
   364, and in the direction that would have grown the store rather than fixed it.

---

## 6 — Where to look next

Nothing is in flight: no open pull request, no open issue, no open dependency alert, working tree clean apart
from the deliberately-uncommitted store sidecars. The backlog is empty, so the next piece of work is a
decision, not a queue item.

The dependency alert is zero because one was **dismissed as inaccurate**, not because none was ever raised —
a `postcss` advisory whose vulnerable range the committed lockfile is already past, and which is a
development-only transitive dependency of the test runner with no product code path. The measurement is in
the dismissal comment on the alert. If it reappears, re-measure before acting; do not assume it is new.

For the full reasoning behind any of the three changes, read the pull request bodies — `gh pr view 294`,
`gh pr view 296`, `gh pr view 297`. They carry the measurements, the rejected alternatives, and the
corrections made mid-flight, at more depth than this summary.

The four documents worth reading before touching anything: `README.md` for the shipped surface,
`BENCHMARKS.md` for what is measured and — more usefully — its Honest Limits section for what is not,
`docs/adr/ADR-0022-doctor-audits-the-store-it-diagnoses.md` for the most recent architectural decision, and
`docs/CONVENTIONS.md`.
