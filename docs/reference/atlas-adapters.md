# atlas-adapters — Reference (the productization ring)

> owner: orchestrator · grounding: each clause REALIZES a frozen layer-0 port (cited `→ port@file`) or an
> already-ratified reference invariant; the ratified productization decisions are recorded in §Decisions ·
> status: **draft — S0 design-freeze candidate for Campaign-9** (DEFINE seat = owner ratifies)

## Purpose

The layer-0 core (Campaigns 1–8) is a pure hexagon: every external system is a **frozen injected port**
satisfied by a fake in tests. This document is the **constitution of the outer ring** — the real **adapters**
that fill those ports over real backends (a code indexer, a durable store, git, an LLM) and the **entrypoints**
(`atlas` CLI + an MCP server) that drive the four governed tools on a real repository. It authors **no new core
behaviour**: every adapter clause is bounded by the port it realizes; the core stays untouched and pure.

## Boundary (what this ring is, and is NOT)

- The ring is a set of **new packages above genesis** in the DAG (`@atlas/adapter-io`, `@atlas/cli`,
  `@atlas/mcp-server`): they consume `@atlas/*`; **nothing in the core imports them** (the same one-way rule as
  `@atlas/e2e`). The core packages are not modified — **except** the one pre-existing OWNER-DEFINE seam
  (`writeDecision`, §ADAPT-STORE-2), which is a core binding, sequenced and reviewed as such.
- **Purity is preserved where it lives:** the core stays deterministic/clock-free/IO-free (this is why its 857
  tests are deterministic). Adapters are the *only* place IO/network/clock enters, and are verified by
  **integration + recorded-fixture** tests, not the core's pure-determinism method.
- Identity stays sealed: every adapter that mints a hash does so through `@atlas/kernel` `id` — no adapter rolls
  its own digest (KERNEL-2/3 still hold across the ring).

## Data model (the ring's own shapes; core shapes imported, never redefined)

```
LangId       = 'ts' | 'py' | 'go' | 'java' | 'rust' | …        // a language the ring can index
IndexerPlan  = { lang: LangId, tool: string, args: string[] }  // which SCIP indexer runs for a language
CasPath      = string                                          // on-disk CAS location (Decisions §D2)
CliVerdict   = { exitCode: number, stdout: string }            // deterministic render of a tool Verdict
WiredHandler = ReturnType<createHandler>                       // the ONE 4-leg handler both entrypoints share
```

## Invariants

### Indexer adapters (realize the `FileTree` + `ScipOutput` inputs of `index.build`)

- **ADAPT-FS-1 Faithful file tree.** The filesystem walker MUST produce the exact `FileTree`
  (`→ FileTree@index/types.ts`) for a real repo path — paths, nesting, and leaf `content` — in a deterministic
  order, honoring the repo's ignore rules (`.gitignore`). It MUST NOT fabricate or omit a tracked file.
- **ADAPT-SCIP-1 SCIP is read, not invented.** The SCIP reader MUST parse a `.scip` protobuf index into the
  frozen `ScipOutput` (`→ ScipOutput@index/types.ts`): per-document `definition`/`reference` occurrences only.
  A `reference` with no in-index `definition` MUST remain unresolved (downstream `to: null`, INDEX-13); the
  reader MUST NEVER synthesize a symbol or an edge the `.scip` does not contain.
- **ADAPT-SCIP-2 Multi-language by dispatch.** For a repo spanning languages, the ring MUST run the correct
  per-language SCIP indexer (`IndexerPlan` by `LangId`) and merge their `.scip` outputs. A language with **no
  configured indexer** MUST contribute its files to the `FileTree` only (an honest structural hole), and MUST
  NOT cause a fabricated or dropped edge for any other language (INDEX-13 honesty preserved cross-language).
- **ADAPT-AST-1 Deterministic sub-file units (additive).** The `web-tree-sitter` layer, when enabled, MUST fold
  sub-file structural units (item/block) into the `FileTree` spatial rail deterministically (same bytes ⇒ same
  units). It is an **additive refinement**: with it absent, the index is file-level and still valid.
- **ADAPT-INDEX-1 Wire to the real index.** The index-backing adapter MUST satisfy `MoveInIndex`
  (`→ tools/init.ts`) and `QueryIndex` (`→ tools/query.ts`) by driving `@atlas/index` `build`/`resolve`/
  `coverage` over the walker + SCIP outputs — it introduces no ranking or resolution of its own.

### Store adapter (realizes the kernel `StoreApi` + the emit sink, durably)

- **ADAPT-STORE-1 Durable content-addressed store.** The disk store MUST implement `StoreApi`
  (`→ kernel/store.ts`: `put(obj)→Hash`, `get(h)→CasObject|undefined`) over persistent storage such that an
  object `put` in one process is `get`-retrievable, byte-identical, in a later process. On read it MUST verify
  `id(value) === key` and treat a mismatch as absent (tamper-safe, KERNEL-1).
- **ADAPT-STORE-2 Governed persistent write (OWNER-DEFINE).** To make one governed **dedup/supersede** write
  land durably, the parked front-door `writeDecision(candidate,cfg)` (`→ knowledge/write/router.ts`) MUST be
  bound: compute `nodeKey(candidate)`, probe the durable store for the contentHash (D0) and nodeKey (D1) hits, call the
  existing `routeWrite`, apply `upsert`, and flush the projection through the store. This binds existing pieces;
  it invents no new routing.
- **ADAPT-STORE-3 Projection rehydrate (the read-back obligation).** Rehydrating the session projection from
  disk is the store adapter's job, not the core's — the write (ADAPT-STORE-2) and the read-back are **separate
  obligations**. On a fresh process the store adapter MUST reconstruct the `StoreProjection` current-node map
  from the durable store such that a fact written and flushed in an earlier run is present, byte-identical, in
  the rehydrated projection — reconstructing state only, minting nothing.

### Git adapters (realize `HistorySource`, `DriftSource`, `Forge` over real git)

- **ADAPT-GIT-1 History is real + deterministic.** `HistorySource` (`→ genesis/rank.ts`) MUST be backed by real
  `git log`/`blame`/coupling over a rev, deterministic for a fixed rev; it feeds ranking only and MUST NEVER
  mint a fact (GEN structural-only guarantee).
- **ADAPT-GIT-2 Drift over merge-base.** `DriftSource` (`→ tools/reconcile.ts`) MUST compute drifted anchors
  across a git merge-base so `atlas-reconcile` can classify mechanical vs semantic (TOOLS-8 `exitCode` law
  unchanged).
- **ADAPT-GIT-3 Forge carries the atlas, honestly.** `Forge` (`→ persist/host-adapter.ts`) MUST write the
  provenance trailer + a `refs/notes/orchestra` note + the PR projection onto a real host; a history rewrite
  MUST keep trailer data and orphan note-carried data exactly as PERSIST-* specifies — the adapter changes
  none of that semantics, only executes it.

### LLM adapter (realizes `SiteProposer` — the single model entry)

- **ADAPT-LLM-1 The one model call, bounded, non-authoritative.** `SiteProposer.propose`
  (`→ genesis/extract.ts`) MUST be the **only** place a model is invoked in the whole system; it MUST make one
  bounded call per site, honor the cost/timeout budget, and return a **candidate** proposal that is never
  auto-trusted (the 2-door admission + ratification still gate it). The core stays `$0`-LLM (GEN S0/S1
  determinism is unaffected — the LLM enters at S2 extraction only).

### Entrypoints (CLI + MCP — one wired handler, two transports)

- **WIRE-1 One handler, assembled once.** A single shared `wire` module MUST assemble the four-leg
  `WiredHandler` (`atlas-init/query/emit/reconcile` legs over the adapters, `→ tools/handler.ts`). Both
  entrypoints MUST consume THIS module, so CLI and MCP are contract-identical **by construction**, not by copy
  (discharges TOOLS-3 at the entrypoint).
- **CLI-1 Total command surface.** `atlas <cmd>` MUST map each command to exactly one wired tool leg (plus
  `mine` driving genesis). Argument parsing MUST be total: a malformed invocation yields a structured error +
  guidance and a non-zero exit, never a crash (mirrors TOOLS-2).
- **CLI-2 The CLI is the floor.** Reads (`query`/`reconcile`/`doctor`) MUST resolve over the CLI directly;
  every write MUST funnel through the single write door `atlas-emit` (TOOLS-1/TOOLS-11 CLI-floor). A read
  command MUST carry no write authority.
- **CLI-3 Deterministic render.** The CLI MUST render a tool `Verdict` to stdout deterministically and set the
  exit code from the verdict (`0` ok, non-zero on rejected/error), carrying the tool's `guidance` (TOOLS-4).
- **MCP-1 The server exposes exactly the four tools.** The MCP stdio server MUST publish exactly the four
  governed tools with their input schemas and route every call through the shared `WiredHandler` (WIRE-1) — so
  an MCP call and the equivalent CLI call return contract-identical verdicts (TOOLS-3, by construction).
- **MCP-2 Fail-closed transport.** A tool error MUST surface as a structured rejected `Verdict` carried in the
  MCP result; the server MUST NOT crash or drop the fail-closed verdict (TOOLS-2 across the transport).
- **CLI-4 The `mine` driver composes, it does not admit.** `atlas mine` MUST drive the **already-frozen**
  `genesis` run-controller (`→ genesis` run-controller, atlas-genesis reference) as a single governed pass over a
  real repo, minting **candidate-only** writes (never ratified). This clause is **ring-scoped composition only**:
  the internal `scan→rank→extract→admit→align→seed` stages and their laws are GEN's own frozen invariants — the
  `mine` driver wires the parts and **invents no admission of its own**.

## Acceptance (the ring's falsifiable checks — S3 lifts goldens from these)

1. `atlas init <fixture-repo>` on a real multi-file, multi-language repo prints the true skeleton + blast-radius
   + T0 candidates; re-run is byte-identical (ADAPT-FS-1/SCIP-1/2/INDEX-1, determinism).
2. A `reference` to a symbol defined in another indexed file ⇒ a `resolved` edge; a reference with no in-index
   definition (or an un-indexed language) ⇒ `to: null` — never a fabricated target (ADAPT-SCIP-1/2).
3. A fact `emit`ted in run A is `get`-retrievable, byte-identical, in run B; a tampered on-disk value reads as
   absent (ADAPT-STORE-1). A fresh process rehydrates the session projection from disk and the run-A fact is
   present, byte-identical, in the reconstructed current-node map (ADAPT-STORE-3).
4. One governed dedup write of the same fact twice lands once (idempotent); a superseding write records the
   supersedes pointer (ADAPT-STORE-2).
5. `atlas reconcile` on a git-sandbox where a cited file changed classifies the drift and sets `exitCode` per
   TOOLS-8 (ADAPT-GIT-2).
6. The same tool called over the CLI and over the MCP server returns a byte-identical `Verdict` (WIRE-1/MCP-1).
7. `atlas mine <fixture>` with a **recorded** proposer yields candidate facts with deterministic ranking, and
   makes exactly one proposer call per site (ADAPT-LLM-1, contract-tested — no live model in CI).

## Decisions (ratified / DEFINE-pending — the S0 [NEEDS RECONCILIATION] queue)

- **D1 Toolchain (ratified 2026-07-19):** `web-tree-sitter` (WASM, AST) + **SCIP** for def/ref
  (`@sourcegraph/scip-typescript` + per-language SCIP indexers, read via `@c4312/scip`). **stack-graphs dropped**
  (archived 2025-09-09, Rust-only, ~3 langs). The `MECHANISMS` registry (`genesis/rank.ts`) listing
  `'stack-graphs'` is now stale and MUST be reconciled.
- **D2 Package structure (ratified):** minimal — `@atlas/adapter-io` (fs · scip · ast · store · git · llm, one
  file each) + `@atlas/cli` + `@atlas/mcp-server` + the shared `wire` module. Not one package per adapter.
- **D3 Language scope (ratified):** multi-language from v0 (per-language SCIP indexers), TS as the first + the
  dogfood target.
- **D4 [DEFINE-pending → owner]** disk-CAS layout (proposed default: `.atlas/cas/` sharded `<h[0:2]>/<h>`).
- **D5 [DEFINE-pending → owner]** the LLM (model + the exact `SiteProposer` prompt contract), surfaced at Phase-2.
- **D6 [DEFINE-pending → owner]** the forge host (proposed default: GitHub via `gh` first, generic git-notes
  fallback), surfaced at Phase-3.
