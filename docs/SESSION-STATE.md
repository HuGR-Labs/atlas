# Session state — 2026-09-03

**What this file is:** the state of the work at a point in time, written so a DIFFERENT session, model,
harness or provider can pick it up cold. It is not a plan. This repository has already been bitten by
reading a plan as state — a doc describing work to be done outlived the work, and the next reader
recommended building something that already existed. So every claim below carries the command that
re-derives it, and nothing here is a value you are asked to trust.

This file replaces the previous handoffs (2026-08-31, and its own 2026-09-02 rewrite). Read
`git log --all --oneline -- docs/SESSION-STATE.md` for the prior state; the changes below are the delta
since then. The session continued past the §2.5 checkpoint; §2.6 records the work it did.

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

### Operating notes from THIS session (paid for again)

- **A self-hosted runner has EIGHT sibling runners on the same machine** (atlas, skill-001, githugr,
  wallet×3, corelink). CI can stall to ~45min when they contend for the disk/CPU; the disk itself filled
  (100%) mid-session. Before debugging a stalled run, `df -h /` and count the Runner.Listener processes.
- **`~/actions-runner/bin` and `externals` are SYMLINKS to `bin.2.337.0`/`externals.2.337.0`.** Deleting the
  versioned dirs to free disk breaks `svc.sh` (`TEMPLATE_PATH` missing) and silently strands the runner.
  Delete the backup-suffixed dirs (`.2.336.0`) first; `svc.sh stop` kills the listener and `./run.sh` restarts it.
- **Do not `rm -rf` anything under `~/actions-runner` without reading what the symlinks point to.**

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

## 2.5 — What changed after the 2026-09-02 handoff — the CI/security leg (2026-09-03)

Three pull requests merged to master after the section above was written.

### #300 — the store actually commits and travels green

The `docs/SESSION-STATE.md` rewrite and the store sidecars (`.atlas/cas/`, `.atlas/projection.json`)
went to master together as PR #300. The store now travels with the code, as §1 of `.gitignore`
intends (`projection` and `cas` are deliberately un-ignored). Re-derive: `doctor cas` →
`objects=1320 referenced=596 corrupt=0 unreadable=0 missing=0 orphan=724 sound=true`;
`verify-store` → `0 sealed-proven … 0 dangling`, exit 0. The mirror-only travel case was verified
(move `projection.614.json` aside, re-run both commands — green).

### Billing lock forced a self-hosted runner

The GitHub-hosted runner pool stopped starting jobs while the account billing is locked
("The job was not started because your account is locked due to a billing issue."). The gate now
runs on a machine-local self-hosted runner (`MacBook-Pro-de-Gustavo`, labels `self-hosted/macOS/X64`,
installed under `~/actions-runner`, run as a launch-agent via `./svc.sh install/start`). This is a
permanent operating fact of this repository until the billing lock is cleared, recorded so a future
session does not waste a CI cycle wondering why the job landed on somebody's laptop.

### #301 — forked pull requests never reach the runner (the RCE gate)

The gate executes **untrusted code** (`npm ci` + the whole suite) on the self-hosted runner — the
owner's machine — and this repository is **public**. A fork's pull_request is exactly the
remote-code-execution vector GitHub warns self-hosted runners must never accept. `.github/workflows/ci.yml`
now splits the surface:

- `gate` runs only for **pushes** and pull_requests whose head lives **inside this repository**
  (`head.repo.full_name == github.repository`). Forks never reach it.
- A fork PR triggers `fork-guard` instead: no checkout, no npm, no repo code — only a static
  `echo::warning`. The merge blocks on the missing `gate` check until a maintainer syncs the fork's
  change onto an in-repo branch.
- `permissions: contents: read` on the whole workflow; the workflow token is write-free.
- `actions/checkout` pinned to a full SHA (`11d5960a…`) instead of the `@v4` mutable tag.

Settings-level, applied via the REST API (live, do not revert without the owner):
`allowed_actions = selected` (allowlist = exactly `actions/checkout@11d5960a…`), `sha_pinning_required = true`.

---

## 2.6 — What changed later on 2026-09-03 — surface hygiene, lucy-1, the owner ruling

Three further PRs merged to master after §2.5 was written.

### #303 / #304 — the surface docs and code comments caught up with the shipped 18 tools

- `#303 chore/code-comment-hygiene` — stale comments in `packages/mcp-server/src/server.ts` /
  `server-read-tools.ts` corrected: 18 tools (not 17), six governance (not five), `doctor`/`node` ARE
  reachable over MCP (were claimed CLI-only). Comments only; the mutation-probe showed the guards read
  constants, not comments, so this job was value that no gate catches.
- `#304 docs/surface-truth-hygiene` — the docs layer corrected to the shipped constants (six
  governance / three write paths / ten read / 18 advertised): `emit.md` (both handles), `init.md`
  (full `InitOut` render, transcripts marked illustrative), `node.md`, the atlas-* reference pages,
  `wp-campaign-10.md`, `roadmap-authoring.md` (CAMPAIGN-10.1/2/3 marked SHIPPED). One deliberate
  boundary: the RATIFIED `ENTRY-MCP-3` invariant text stayed "exactly five/two" — that was lucy-1,
  handled next.

### #305 — lucy-1 resolved: the ratified layer now names the derived six/three (req layer fan-out)

The requirement layer still asserted "exactly five governance / exactly two write doors" while the
product shipped **six / three / ten-read / 18-advertised**. ADR-0006 Decision 2 (owner-ratified) had
superseded the count with the DERIVED + BUDGETED surface property and CAMPAIGN-11 added
`atlas-memory-emit`, but the fan-out into the ratified rows never ran. #305 performed the governed
co-amendment: `INV-TOOLS-1/12/16` + `INV-MCP-3` restated to the derived surface; `REQ-TOOLS-1a/1b/12c/16e`
+ `REQ-MCP-3d/3g` re-lifted verbatim (live quotes again, ledger shrank by four); goldens/method-tags/
properties fanned out (teeth bumped to seventh-tool/fourth-door — the conformance tests already pinned
6/3 since WP-11.W8, the docs were behind their own witness); register rows updated; ADR-0005's count
superseded with a dated note; A-D3/A-D4 got `[COUNT SUPERSEDED]` tombstones. All 11 gates green.
**In-flight CI also paid a tax: the disk on the runner filled (ENOSPC), producing two false-red gate
runs on the same PR; the rerun passed in 8m.** See the operating notes in §1.

### #306 — hygiene: recut ledger closed, doc-transcript CI cost re-measured

`docs/design/campaign-10-recut.md` nine rows still `OPEN` that are shipped (lucy-1/2, bobby-1/2,
billy-1, A5-stale-4, dogfood-5, F4/F5/no-help) each given its closing evidence; `arch-#8` stays OPEN,
pointed at ARCH-D3b/D4. And the doc-transcript CI cost was re-measured on the healthy runner:
**241s, not the 833s recorded on 2026-08-31** — the "cut the same-invocation test" advice is retracted.

### #307 — the AUTHORITY ruling (owner, 2026-09-03): CREATE is T2-by-construction, growth by USE-OR-SEAL

The owner ratified the two questions that kept ADR-0010 a proposal. Product framing, verbatim:
*"who approves is the ORCHESTRATOR, approving only with evidence, clear protocol; both [use-and-success
and human seal] coexist; neither is mandatory; human-in-the-loop kills the purpose, this serves LLMs not
humans."* Three commitments (ADR-0010 §"Owner ruling"; atlas-architecture §3.4):

1. **CREATE is T2-by-construction** — a new node is born advisory; the one-way join at
   `fastpath.ts:143` already made self-declaring higher cost more than it buys, and the ruling makes T2
   the written rule, not a consequence.
2. **Growth is USE-OR-SEAL, neither mandatory** — a node leaves advisory by ONE of two earned evidences:
   **USE** (served in a recorded, completed decision; the `hits` ledger
   `packages/knowledge/src/lifecycle/hits.ts` is the foundation) or **SEAL** (human ratify token).
   Neither is required; a node earning neither stays advisory and decays (KNOW-17).
3. **The ratify token is ONE evidence, not a gate; verification stays advisory** under the local
   posture; `service-gate-guard` re-opens it the moment a remote/multi-tenant transport is attempted.

ADR-0010 moves Proposed → Accepted. Items 1 and 3 of its old ratification list (wire `DOOR_RATIFY_CTX`
derivation; derive `scope` from `primaryAnchor`) become the implementation scope of **ARCH-D3b**, now
authorized to build. **Docs-only — no code behavior yet.**

---

## 3 — The state of THIS repository's own store — AFTER the retirement

Re-derive with the two commands in §1. As measured at this handoff, HEAD `bd9aaca`:
- `doctor cas` → `objects=1320 referenced=596 corrupt=0 unreadable=0 missing=0 orphan=724 sound=true`.
  **`sound=true` for the first time since the rows went missing.** `orphan` is not a fault (append-only,
  content-keyed CAS; an object outliving the sidecar that referenced it is ordinary). Do not "clean up"
  orphans.
- `verify-store` → `0 sealed-proven fact(s) — 0 re-proven, 0 broken, 0 unverifiable, 0 dangling`, exit 0.
  The honest zero: the 17 were the entire `proven` population, so nothing remains to re-verify, and the
  line says so explicitly.
- `atlas doctor cas` and `atlas verify-store` run on the **compiled** CLI
  (`packages/cli/dist/src/bin.js`), so `npx tsc -b` must have run at least once since the last build.

The store is now in the state the 2026-08-31 handoff called for: it passes its own audit, and it is
COMMITTED (PR #300) — it travels with the code. `.atlas/cas/` and `.atlas/projection.json` are tracked
on master; a fresh clone reads a store that re-proves itself.

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

**(c) CI cost.** `harness/gates/doc-transcript-guard.test.mjs` was measured at **833s** in the 2026-08-31
session. **Re-measured 2026-09-03 on the self-hosted runner: 241s (~4min), 13/13 green.** The earlier figure
was taken on a machine whose per-test corpus runs were slower; it also predates the runner being restored
to a healthy symlinked install. Two consequences: the §2026-08-31 suggestion to "cut the same-invocation
test" should NOT be followed — the two insertion tests are the teeth that prove the re-attach fix, they now
cost ~2min combined, and the whole file sits inside an 8-minute gate comfortably. If CI time ever
regresses to ~14min, re-measure before cutting anything.

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

Nothing is in flight: no open pull request, no open issue, no open dependency alert. The store passes its
own audit and is committed; CI is green and self-hosted-secure.

The next piece of work is **no longer a decision — it is ARCH-D3b, IMPLEMENTATION AUTHORIZED.** The
2026-09-03 owner ruling (§2.6/#307) resolved the two questions keeping ADR-0010 a proposal; the
implementation scope is exactly what atlas-architecture §3.4 pins:

1. **Wire the `DOOR_RATIFY_CTX` derivation** — replace the `{ contested: false, lowRisk: true }` constant
   in `packages/adapter-io/src/governed-emit-route.ts:24` with the real verdicts: `lowRisk` from the
   KNOW-17 hits-threshold (the foundations exist in `packages/knowledge/src/lifecycle/hits.ts`), `contested`
   from the KNOW-18b store-veto.
2. **Derive `scope` from `primaryAnchor`** — authz must not be claimable by declaration; a
   scope↔anchor mapping in `adapter-io/policy.ts`.
3. **Growth by USE-OR-SEAL** — the hits ledger feeds class growth (T2 → T1/T0 by accumulated evidence or
   by human seal); no mandatory human gate.

Two standing threads remain owner-level, unchanged from the prior handoff:
- **The billing lock** — why CI runs on the owner's machine; clearing it restores hosted runners.
- **The fork-PR contribution flow** — #301 means forks never reach the gate until synced in-repo.

For the full reasoning behind the recent changes, read the pull request bodies — `gh pr view 294`,
`gh pr view 296`, `gh pr view 297`, `gh pr view 300`, `gh pr view 301`, `gh pr view 305`, `gh pr view 307`.
The four documents worth reading before touching anything: `README.md` for the shipped surface,
`BENCHMARKS.md` for what is measured and — more usefully — its Honest Limits section for what is not,
`docs/adr/ADR-0022-doctor-audits-the-store-it-diagnoses.md` for the most recent architectural decision,
and `docs/CONVENTIONS.md`. For ARCH-D3b specifically, start at `docs/adr/ADR-0010` §"Owner ruling" and
`docs/reference/atlas-architecture.md` §3.4.