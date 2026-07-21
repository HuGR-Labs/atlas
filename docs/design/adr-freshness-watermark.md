# ADR — `atlas query`'s freshness signal is a read-model WATERMARK, not a live re-derivation (N11)

- **Status:** accepted (2026-07-21) — owner elected "the SOTA path" for N11; lead determined the design below.
- **Scope:** `atlas query` `stale` semantics; `StoreProjection.builtAt`; `projection-query-index.ts`.

## Context

`atlas query <scope>` returns a bounded read pack whose `stale` boolean is contracted (TOOLS-6) to mean
"re-ground before trusting." The pre-N11 implementation set `stale` **only** from each under-scope fact's
stored `freshness === 'DRIFTED'` field. Nothing on the live path writes that field back: `atlas reconcile`
is READ-ONLY (TOOLS-8, "Persists NOTHING"), and emit stamps a fact `FRESH` at authoring. So in normal use
the stored freshness stays `FRESH`, and **between a code change at HEAD and a manual reconcile the query
silently reported `stale: false`** — a fact grounded three commits ago read as verified-fresh. That is the
dishonesty N11 removes.

The question owner delegated to the lead: should `query.stale` become a **live drift oracle** (re-derive
every under-scope fact's grounding against HEAD on each read), or something else?

## Decision

`query.stale` is made honest via a **materialized-view watermark**, NOT live re-derivation on read:

1. The durable projection is stamped at persist with `builtAt` = the git HEAD its stored freshness reflects
   (injected `headSha` seam on `createDiskStore`; both write doors — governed emit + the mine driver —
   stamp uniformly, the store staying git-ignorant).
2. On a query, the reader cheaply reads live HEAD (`git rev-parse HEAD` — **no worktree**) and compares. If
   `builtAt` and live HEAD are **both known and differ**, the view is behind HEAD ⇒ its freshness is
   unverified ⇒ `stale: true`. The stored per-fact `DRIFTED` fold still contributes (unchanged).
3. Conservative on the unknown: if either `builtAt` (old sidecar / mine-bootstrapped projection) or live
   HEAD (non-git) is absent, the reader does **not** flag behind-HEAD — it only asserts staleness it can
   PROVE. Never a false alarm.

## Why not the live oracle (the rejected alternative)

- **It breaks the read/oracle separation this codebase already commits to.** `doctor`/`reconcile` ARE the
  live drift oracle; `query` is the cheap bounded read. Re-deriving per fact on read collapses that CQRS
  split and duplicates reconcile's logic in the read path.
- **It puts git-worktree I/O — the exact `#73` contention surface — on every query.** Re-derivation builds
  the index at HEAD via a temp worktree (`rev-index`), which `#73` showed is lock-contention-prone under
  concurrency. A read should never pay that. The watermark check is a single `rev-parse` — no worktree,
  no lock.
- **A materialized read model's honesty comes from a version/watermark, not from recomputation.** This is
  the standard CQRS / search-index pattern: the view serves results *as of* a known position and tells the
  consumer when it is behind. That is exactly `builtAt` vs HEAD.

The authoritative, per-fact live answer ("did THIS grounding actually drift?") remains available where it
belongs and is expensive-by-design: `atlas reconcile` / `atlas doctor`. `query.stale: true` is the honest,
cheap signal that says "run it."

## Consequences

- `query.stale` is now honest: it is never `false` when the view is provably behind HEAD.
- Cost of a query is unchanged but for one `git rev-parse HEAD` (no worktree, memo-free, ~ms).
- `StoreProjection` / `WireProjection` gain an optional `builtAt` (additive, back-compat: old sidecars load
  as "unknown watermark").
- A mine-bootstrapped projection stamps `builtAt` too (the mine driver injects the same seam); a projection
  persisted by a store with no `headSha` seam (tests / non-git) carries no watermark and is read
  conservatively.
- Teeth: `packages/e2e-blackbox/test/s15-freshness-watermark.blackbox.test.ts` — one fact, `stale: false`
  at HEAD, `stale: true` after a single commit advances HEAD (fact never mutated), on both CLI and MCP doors.
- **Granularity is repo-GLOBAL, not scope-scoped (deliberate).** The watermark compares the projection's
  `builtAt` to repo HEAD, so `query.stale` flips `true` after ANY HEAD advance — even a commit touching
  nothing under the queried scope. This trades the old dishonest false-NEGATIVE (silently `fresh` when the
  view was behind) for an honest-conservative false-POSITIVE (an unnecessary-but-safe "reconcile first"). In
  an active repo HEAD moves constantly, so `stale` is often `true` — which is the *honest* state (knowledge
  IS unverified against new commits until reconcile runs). A scope-scoped watermark (did HEAD change anything
  under THIS scope?) would need a per-query HEAD-vs-`builtAt` tree diff — real cost on the read path, against
  the whole point of the cheap watermark. Deferred until a consumer needs finer granularity.

## Not chosen / deferred

- A richer 3-state freshness (`verified | unverified | drifted`) on the pack contract — the existing
  `stale` boolean already carries the honest "re-ground before trusting" meaning; a wider enum is a
  `PackResult` contract change with broader blast radius, deferred until a consumer needs the distinction.
