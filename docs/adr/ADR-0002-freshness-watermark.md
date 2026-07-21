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
