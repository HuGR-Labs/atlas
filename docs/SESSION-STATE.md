# Session state — 2026-09-02

**What this file is:** the state of the work at a point in time, written so a DIFFERENT session, model,
harness or provider can pick it up cold. It is not a plan. This repository has already been bitten by
reading a plan as state — a doc describing work to be done outlived the work, and the next reader
recommended building something that already existed. So every claim below carries the command that
re-derives it, and nothing here is a value you are asked to trust.

This file replaces the previous handoff (2026-08-31). Read `git log --all --oneline -- docs/SESSION-STATE.md`
for the prior state; the changes below are the delta since then.

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

Two traps, both paid for in prior sessions:

- **`node harness/gates/<g>.mjs | grep …` reports grep's exit code, not the gate's.** Capture the command's
  own status immediately, or redirect to a file and check `$?` before piping.
- **Never run the whole test suite concurrently.** It has frozen this machine. One package at a time:
  `npx vitest run packages/<name> --pool=forks --poolOptions.forks.singleFork=true`.

---

## 2 — What this session changed

No product code changed in the last two sessions (#298, #299 are documentation; this handoff is built on
HEAD `1637ac6`). What changed is the **store**, and it is the whole substance of this page.

### The 17 dangling rows are deliberately retired (owner decision) — 2026-09-02

Prior state (written down in the 2026-08-31 handoff, §3/§4): the CAS held 1320 objects; the projection
referenced 613; 17 of those references resolved to nothing (`doctor cas` reported `missing=17`,
`sound=false`; `verify-store` reported the same 17 as `dangling` and exited non-zero). All 17 were the same
shape — advisory family, tier T2, seal `proven`, slot `dependency`, scope `atlas:mined` — SCIP cross-unit
reference claims ("`packages/knowledge/src` references scip-typescript npm `@atlas/contracts` …").

**The decision (owner): retire the 17 rows from the projection.** The reason the repair is a write that is
NOT done through a tool: every tool-mediated path was measured and closed, and the residue is honest to
record:

- `contentHash = id(f)` hashes the fact's grounding including `subtreeHash` from the `.atlas/index.scip` of
  the mining moment (2026-08-25). That index was regenerated (2026-08-30), so any re-derivation produces
  different bytes and a different `contentHash` — the original object is unrecoverable by re-mining.
- `mine` writes only the STAGING sidecar, never the projection (ADR-0008; `packages/cli/src/mine.ts` — the
  driver never calls a projection door). Re-mining cannot backfill the 17 rows in place.
- Re-mining the `dependency` arm needs an operator-model (`.atlas`-adjacent `~/.config/atlas/model.json`);
  with none configured `resolveProposer` returns the abstaining `defaultProposer` and the pass stages
  nothing.
- `doctor reground` answers `plan: none` for these 17: the plan leg reads the fact back from CAS
  (`store.get(contentHash)`), and a dangling row has no bytes to read, so no drift is even classified.
- `derive-relations` was measured (2026-08-31) at **6193** derivable edges, not 17, and refuses every
  candidate on scope authz; using it as a repair would be a ~10× projection growth.
- `promote` rehydrates from CAS via `store.get` and files a byte-less staged row as
  `REJECTED_CANDIDATE_UNREADABLE`; it never re-derives bytes.

So "retire the rows" was executed as a **surgical projection write**: a copy of `projection.json` minus the
17 rows (and their 17 `cas` references) was written as generation 614; the compat mirror
`.atlas/projection.json` was republished byte-identically; generations 610–613 were pruned (normal sidecar
behaviour). Every remaining `current` row's `contentHash` is in `cas`, and every `cas` hash is referenced.
Nothing else was touched: no CAS object was deleted (1320 still present, the old ones now `orphan`), no
`policy.json` change, no source change.

**The honest cost.** This is a write outside the governed doors (`WRITE_PATHS` stays
`{atlas-emit, atlas-link}` — see `packages/tools/src/handler.ts`). It was the owner's explicit call because
the predicate "the store must pass its own audit before it travels" (2026-08-31 handoff §3) outranks the
alone-standing tentàtive to keep the rows. The 17 facts are T2 advisory, machine-mined, no ratifier ever
saw them; their claims are regenerable at need. The evidence that they existed lives in this file and the
prior handoff; the audit no longer fails on them.

---

## 3 — The state of THIS repository's own store — AFTER the retirement

Re-derive with the two commands in §1. As measured at this handoff, HEAD `1637ac6`:

- `doctor cas` → `objects=1320 referenced=596 corrupt=0 unreadable=0 missing=0 orphan=724 sound=true`.
  **`sound=true` for the first time since the rows went missing.** `orphan` is not a fault (append-only,
  content-keyed CAS; an object outliving the sidecar that referenced it is ordinary). Do not "clean up"
  orphans.
- `verify-store` → `0 sealed-proven fact(s) — 0 re-proven, 0 broken, 0 unverifiable, 0 dangling`, exit 0.
  The honest zero: the 17 were the entire `proven` population, so nothing remains to re-verify, and the
  line says so explicitly.
- `atlas doctor cas` and `atlas verify-store` run on the **compiled** CLI
  (`packages/cli/dist/src/bin.js`), so `npx tsc -b` must have run at least once since the last build.

The store is now in the state the 2026-08-31 handoff called for: it passes its own audit, so it MAY be
committed and travel with the code. `.atlas/cas/` and `.atlas/projection.json` are still UNCOMMITTED at
HEAD. **They should be committed as part of the next PR that has a reason to move the store** — which is
the point of this change.

Remaining uncommitted-but-traveling sidecars: see `git status` for the exact list. `.atlas/policy.json` is
permanently tracked. Staging sidecars (`.atlas/staging*.json`) are git-ignored by design (ADR-0008) and
should stay so.

---

## 4 — Open decisions (owner's, not the next session's to take)

**(a) The 17 unresolvable rows — RESOLVED.** Retired by owner decision, 2026-09-02, per §2. The
alternatives that were weighed before choosing this one are recorded in §2 — re-mining is not a repair in
place, `derive-relations` is not a repair at all, and the retire is a governed-still-manual write.

**(b) Do NOT reach for `derive-relations` as a repair — still true, and now moot for the 17.** Measured
2026-08-31: it derives **6193** edges, not 17; every candidate is refused `unauthorized: actor not in fact
scope`; authorising would mean editing `.atlas/policy.json` (admin-owned). If the ~6193 derived edges are
ever wanted, that is its own campaign with its own plan.

**(c) CI cost.** `harness/gates/doc-transcript-guard.test.mjs` was measured at **833s**
(`npx vitest run harness/gates/doc-transcript-guard.test.mjs --pool=forks --poolOptions.forks.singleFork=true`).
Two tests were added, each re-running the whole corpus; if this is too expensive, the same-invocation test
is the one to cut (the different-invocation test is what actually proves the fix).

**(d) The retirement was a manual projection write, not a tool.** There is deliberately no CLI/MCP command
that deletes a row (staging has no delete; projection has no delete). If deleting rows becomes a recurring
need, the honest place for it is a governor-approved `doctor` leg + a governed door — a new campaign, not
an ad-hoc edit. Until then, record it in the session handoff as this session did.

---

## 5 — Working rules in force

Same rules the prior sessions paid to learn; they are load-bearing for anything that touches the store:

1. **A gate that skips what it cannot read reports health for the exact fault it exists to catch.** Every
   drop must be counted and named (the `dangling` bucket is the canonical example).
2. **A sentence denying a failure mode is evidence someone once worried about it, not evidence it was
   fixed.**
3. **Anchor a gate on the shipped artifact, not on the constant that describes it.** Falsify it once
   against the live system by hand before believing it.
4. **Mutation-probe your own instrument.** Three defects in one prior session's probes were found only by
   deliberately breaking the thing under test.
5. **When you fix what a measurement measured, re-derive the measurement.** An assertion whose subject an
   earlier gate now removes still reads green and has become vacuous.
6. **Run every guard before pushing, not the ones you think you touched.** Their state on HEAD `1637ac6`
   (all 11 exit 0) is the proof this change did not rot anything.
7. **A dated transcript quoted as evidence goes stale while still reading as freshly verified.** Date it,
   or re-run it.
8. **Publish no measured numbers without an independent cold review.** Ask the reviewer explicitly to
   check whether an edit softened any pre-existing constraint.
9. **Measure a command before recommending it** — the `derive-relations` episode (364× error) is the text.

---

## 6 — Where to look next

Nothing is in flight: no open pull request, no open issue, no open dependency alert, and — new — a store
that finally passes its own audit. The backlog is empty, so the next piece of work is a decision, not a
queue item.

The most immediate decision is **when to commit the store** (`.atlas/cas/`, `.atlas/projection.json`, and
the current `docs/SESSION-STATE.md`). The change that motivated the retirement was the finding that the
repository versions its `.atlas/` store with the code (the `.gitignore` re-includes `projection.json` and
`cas/` explicitly for that purpose). Committing it in the next PR closes the loop: a clone will read a
store that re-proves itself.

For the full reasoning behind the three prior feature changes, read the pull request bodies — `gh pr view
294`, `gh pr view 296`, `gh pr view 297`. The four documents worth reading before touching anything:
`README.md` for the shipped surface, `BENCHMARKS.md` for what is measured and — more usefully — its Honest
Limits section for what is not, `docs/adr/ADR-0022-doctor-audits-the-store-it-diagnoses.md` for the most
recent architectural decision, and `docs/CONVENTIONS.md`.