# ADR-0002 — `atlas query`'s freshness signal is a read-model WATERMARK, not a live re-derivation (N11)

- **Status:** Accepted (2026-07-21)
- **Owner-authorized:** yes ("quero o caminho sota" — owner elected the SOTA path for N11; the lead
  determined which design that is)
- **Spec author:** lead, grounded against the shipped code (`fb322bd`) + the s15 teeth + the lucy/bobby/billy
  cold reviews.

## Context

`atlas query <scope>` returns a bounded pack whose `stale` boolean is contracted (REQ-TOOLS-6c / INV-TOOLS-6)
to mean "re-ground before trusting." The pre-N11 implementation set `stale` **only** from each under-scope
fact's stored `freshness === 'DRIFTED'`. Nothing on the live path writes that field back: `atlas reconcile`
is READ-ONLY (INV-TOOLS-8, "persists nothing"), and emit stamps a fact `FRESH` at authoring. So in normal
use the stored freshness stays `FRESH`, and **between a code change at HEAD and a manual reconcile the query
silently reported `stale: false`** — a fact grounded commits ago read as verified-fresh. That silent
false-negative is the honesty gap N11 closes.

Owner delegated to the lead: make `query.stale` a **live drift oracle** (re-derive every under-scope fact
against HEAD on each read), or something else?

## Decision

`query.stale` is made honest via a **materialized-view watermark**, NOT live re-derivation on read:

1. The durable projection is stamped at persist with `builtAt` = the git HEAD its stored freshness reflects
   (an injected `headSha` seam on `createDiskStore`; the store stays git-ignorant — both write doors stamp
   uniformly via DI). `StoreProjection` / `WireProjection` gain an optional `builtAt` (additive, back-compat).
2. On a query, the reader cheaply reads live HEAD (`git rev-parse HEAD` — **no worktree**) and compares. If
   `builtAt` and live HEAD are **both known and differ**, the view is behind HEAD ⇒ freshness unverified ⇒
   `stale: true`. The stored per-fact `DRIFTED` fold still contributes (unchanged).
3. Conservative on the unknown: either side absent (old sidecar / mine-bootstrapped / non-git) ⇒ the reader
   does NOT flag behind-HEAD. It asserts only staleness it can PROVE — never a false alarm.

## Rejected alternative — the live oracle

- Breaks the read/oracle separation the product already commits to (`doctor`/`reconcile` ARE the live
  oracle; `query` is the cheap bounded read — CQRS).
- Puts a git-worktree checkout — the exact `#73` contention surface — on **every** query.
- A materialized read model's honesty comes from a version/watermark, not recomputation. The authoritative
  per-fact live answer stays where it belongs (`atlas reconcile` / `doctor`), expensive by design.

## Consequences

- `query.stale` is never `false` when the view is provably behind HEAD. Cost is one `rev-parse` (no worktree).
- **Granularity is repo-GLOBAL, not scope-scoped (deliberate).** `stale` flips `true` after ANY HEAD advance,
  even a commit touching nothing under the queried scope — trading the old dishonest false-NEGATIVE for an
  honest-conservative false-POSITIVE ("reconcile first"). A scope-scoped watermark would need a per-query
  HEAD-vs-`builtAt` tree diff on the read path, against the point of the cheap watermark. Deferred.
- Teeth: `packages/e2e-blackbox/test/s15-freshness-watermark.blackbox.test.ts` — `stale: false` at HEAD,
  `stale: true` after a single commit advances HEAD (fact never mutated), on both CLI and MCP doors.
- A richer 3-state freshness on the pack contract is deferred — the `stale` boolean already carries the
  honest "re-ground before trusting" meaning; a wider enum is a `Pack` contract change for a later consumer.

## AMENDMENT — 2026-08-03 (owner-ratified): the DEFERRED per-fact signal ships, BESIDE the watermark

**Status of the decision above: unchanged and IN FORCE.** `query.stale` is still the materialized-view
watermark, still repo-GLOBAL, still computed exactly as clauses 1-3 say, still not a live re-derivation. No
clause is reversed. What this amendment closes is the item deferred in the last Consequence — "a `Pack`
contract change for a later consumer" — and the consumer has arrived: ADR-0013's advisory band.

### What was measured

The graph was mined from Atlas at `8ada771b`; the read tree was moved to `origin/master` `44026ae`. All three
runs go through the built binary and the built `dist/` modules, never `src/`. Independent label:
`git diff --name-only` marks **14** of the 199 facts as anchored at a file that changed and 185 as not.

| tree state | pack-level `stale` (shipped) | per-fact `driftDetect` over the same 199 facts |
| --- | --- | --- |
| **A** — at the mine sha `8ada771b` | `false` | 199 FRESH · 0 DRIFTED |
| **B** — at `origin/master` `44026ae` | `true` for all 199 rows | 185 FRESH · **14 DRIFTED** — TP 14, FP 0, FN 0 |
| **C** — A + one commit touching only `README.md` | `true` for all 199 rows | **0 DRIFTED** |

Row C is the point, and it is not a defect report about `stale`: `stale: true` there is CORRECT — the view
really is behind HEAD, which is exactly what clause 2 promises and what the Consequences call an
"honest-conservative false-POSITIVE". It is simply not an answer to a different question the reader also has
("did anything I am about to trust actually move?"). One boolean cannot carry both, so a second field does.

### Why the rejected alternative is not what shipped

The rejection above is stated against a **git** mechanism twice, in these words: "puts a git-worktree
checkout — the exact `#73` contention surface — on **every** query", and "a per-query HEAD-vs-`builtAt` tree
diff on the read path". Both are costs of consulting *git* per query.

What ships is neither. `driftDetect` (`packages/grounding/src/drift.ts`) compares a recorded `subtreeHash`
against the **built-index `Axes` the composition root already builds once per process** — the same axes, and
the same oracle, the WRITE door's truth-gate already runs (`compose.ts` `buildGate(axes)`). It opens no
worktree, makes no git call, and reads no `builtAt`. Measured cost for all 199 facts: **78-89 ms on the
first call in a fresh process** (what a CLI invocation pays) and **~11 ms warm-median** over 12 repeats, on
an axes build that is already paid. End-to-end `atlas query packages` over that graph measured 4.9-5.6 s
before and 5.0-6.2 s after, on the same box with the same harness — the added pass is inside the noise of a
command whose cost is the AST fold and the axes build. The CQRS separation the rejection protects is also intact: the authoritative
*arbitrary-rev* oracle stays `atlas reconcile` / `atlas doctor`, which answer at a **sha the read path never
builds**. This is a re-derivation against the snapshot the reader is already holding, not a second oracle.

### What changed, precisely

1. `PackInvariant` gains a REQUIRED `freshness: Freshness` — the canonical 3-state, i.e. the very type
   `driftDetect` declares. No parallel enum was minted. The local structural oracle produces `FRESH`/`DRIFTED`
   only; `STALE` (GROUND-13 advisory drift) is carried through unchanged if a producer supplies it.
2. `Pack` gains `advisory` + `advisoryDropped` (ADR-0013). `stale` is untouched, and `packages/adapter-io/src/
   projection-query-index.ts` computes it from exactly the two legs it computed it from before — the stored
   `DRIFTED` fold and the N11 per-row watermark. No line of `stale` reads the per-fact verdict, pinned by
   `SCN-TOOLS-6e-3`.
3. `REQ-TOOLS-6d`'s prohibition clause is narrowed from "shall NOT re-derive per-fact drift on the read path"
   to "shall NOT put GIT I/O on the read path" — the cost that was actually priced here.

### The honest residual

A verdict this reader cannot derive (no oracle wired, or a fact whose CAS bytes carry no `grounding` at all —
reachable, because `.atlas/` is a committed artifact) reads `DRIFTED`, never the stored `FRESH`. That is
over-reporting in the conservative direction, the same direction `freshness-watermark.ts` already documents
for a deduped re-verified row.
