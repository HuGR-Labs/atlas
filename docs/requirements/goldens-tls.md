# Goldens — Block TLS (tools/delivery) · S3 generate-from-method-tag

> **state:** S3 · **protocol:** [`goldens`](../../.claude/skills/goldens/SKILL.md) + [`completeness`](../../.claude/skills/completeness/SKILL.md) Gate-3 teeth ·
> **axiom:** S2 frozen (`method-tags-tls.md`; every TLS INV method-tagged; **no FSPEC** — TLS consumes KRN's `FSPEC-merge`, authors none) ·
> **owner:** charlie (FORGE). TLS = the **delivery layer**: read/subscribe projections over the kernel store + one governed write-door (`atlas-emit`).
>
> **Derivation (generated from each INV's S2 method-tag — never hand-authored where a generator exists):**
> - **TOOLS-3 / TOOLS-10** are `PBT` (shape = cross-transport determinism, a universally-quantified equivalence).
>   Their SCNs are **concrete witness instances of the equivalence law** — `cli(x) ≡ mcp(x)` (TOOLS-3) and
>   `mcp(a) ≡ poke(a) ≡ cli(a)` (TOOLS-10, tri-transport byte-identity) against the **one handler**
>   (`tools/ref/handler.ts`). `gen: PBT`.
> - **TOOLS-1/2/4/5/6/7/8/9/11/11a/12/13/14/15** are `reference-model` → **conformance / differential** against
>   the named build-language mock (`tools/ref/*.ts`, reused as the unit-test mock; anti-rot). `gen: conformance`.
> - **residue: none.** Every TLS INV has a pure oracle (a reference tool or the shared handler); there is no
>   hand-written tail (unlike KRN-12a).
>
> **Two standing notes carried from S2 (load-bearing for teeth *direction*):**
> - **Read-only projection = a *positive* property, never a `formal` one.** The tri-transport node handler
>   (TOOLS-10c), the per-node read projections (TOOLS-1d), and `atlas doctor` (TOOLS-12) open **no** write path.
>   The golden asserts a **write attempt via the projection is refused** and the handle exposes **no**
>   store-mutating method — a reference-model property of the same handler, not a formal model.
> - **Write-door *security-exploitability* is billy / FR-12 (FORTRESS), NOT authored here.** TOOLS-1c / 15b / 15c
>   assert the **functional** refusal (a back-channel / direct / ungrounded write cannot land or is rejected at
>   read). The **adversarial exploit** — a shell-armed seat red-teaming the append-only/permission model — is
>   billy's security review; **no exploit golden is authored in this block** (flagged in the completion card).

---

## Concrete fixture universe (reused across the block)

| id | kind | concrete value |
|---|---|---|
| N1 | Knowledge node | nodeKey `claim:acme-arr-2024`, content address `cas:9b21`, claim "ACME ARR 2024 = $4.2M", grounded at `source@sha = reference/finance.md@a1b2c3` |
| N1′ | ungrounded node | same nodeKey, claim "ACME ARR 2024 = $9.9M" — **not** present at `reference/finance.md@a1b2c3` |
| N2 | stale pack node | nodeKey `claim:acme-hq`, `stale:true` |
| dm | **mechanical** DriftItem | anchor moved `reference/finance.md#arr` `@a1b2c3 → @d4e5f6`; the claim still re-derives at `@d4e5f6` |
| ds | **semantic** DriftItem | claim text changed `$4.2M → $5.0M`; does **not** re-derive at source |
| D | drift set | `{dm, ds}` ⇒ `|mechanical|=1`, `|semantic|=1` |
| T | move-in tree | territories `{finance/, auth/, kernel/}`; `auth/` matches a T0 keyword (`security-invariant`) |
| H_sdk | harness | SDK in-process, `canPropagateMcp:true` |
| H_agents | harness | `.claude/agents`, `canPropagateMcp:false` |
| S_ro | seat | a governed seat with **only** the `Read` grant (no tool grant) |

Governance surface (TOOLS-1) = exactly `{atlas-init, atlas-query, atlas-emit, atlas-reconcile}`. Pull ladder
(TOOLS-11) = `SDK-MCP → registered-MCP+grant → poke-as-file → relay → CLI`.

---

## REQ-TOOLS-1 — single write-door governance surface

### REQ-TOOLS-1a — governance surface is exactly four tools   (happy)

### SCN-TOOLS-1a-1 — the surface enumerates to exactly four   (happy)
source: REQ-TOOLS-1a
Given the tools layer wired against `tools/ref/store.ts`, with its governance surface enumerated
When the surface set is listed
Then it is exactly `{atlas-init, atlas-query, atlas-emit, atlas-reconcile}` — surface count `== 4`, no more, no fewer
teeth: breaks-on "a fifth governance tool `atlas-delete` is registered on the surface — surface count `== 5`"
gen: conformance   # differential vs `tools/ref/store.ts` 4-tool surface

### REQ-TOOLS-1b — atlas-emit is the only write path   (happy)

### SCN-TOOLS-1b-1 — exactly one write entry across the whole layer   (happy)
source: REQ-TOOLS-1b
Given the tools layer after wiring all four tools plus the read projections
When every store-mutating entry point is enumerated
Then exactly one exists and it is `atlas-emit` — `writePaths == 1`
teeth: breaks-on "`atlas-reconcile` grows its own direct store-mutate call — `writePaths == 2`"
gen: conformance   # `tools/ref/store.ts` asserts `writePaths==1`

### REQ-TOOLS-1c — reject back-channel writes   (guard)

### SCN-TOOLS-1c-1 — a write bypassing atlas-emit cannot land   (guard)
source: REQ-TOOLS-1c
Given a back-channel call `store.write(row_for_N1)` that bypasses `atlas-emit`
When the store processes it
Then it is refused — no row not produced by the `atlas-emit` grounded path enters the store (`ungroundedRows == 0`)
teeth: breaks-on "the back-channel write lands — a row not produced by `atlas-emit` is persisted and served"
gen: conformance   # functional refusal only; adversarial *exploitability* of this door = billy / FR-12, not authored here

### REQ-TOOLS-1d — read projections carry no write authority   (happy)

### SCN-TOOLS-1d-1 — a write via a read projection is refused   (happy)
source: REQ-TOOLS-1d
Given the per-node read projection `own_finance` (a RETR-5 / TOOLS-10 node-tool) resolving N1
When the projection handle is inspected and a write is attempted through it
Then the handle exposes **no** store-mutating method and the write attempt is refused — the projection is not a fifth write path (positive property: a projection opens NO write door)
teeth: breaks-on "the read-projection handle grows a `.write()`/`.set()` method — a write via the projection lands, opening a fifth write path"
gen: conformance   # reference-model property of the read handle (no store-mutating method); NOT a formal model

---

## REQ-TOOLS-2 — tools pure and total

### REQ-TOOLS-2a — tools pure and total   (happy)

### SCN-TOOLS-2a-1 — identical args → identical result, no side effect   (happy)
source: REQ-TOOLS-2a
Given `atlas-query(scope="src/finance/arr.rs")` run twice on byte-identical args over the total reference wrapper `tools/ref/tool.ts`, side-by-side with the production tool
When each invocation returns
Then both runs return the byte-identical `Verdict` and mutate nothing (store byte-identical before/after) — pure ∧ total, and prod matches ref
teeth: breaks-on "the tool reads wall-clock / a mutable cache and returns a different result on the second identical call (impure)"
gen: conformance   # differential vs the total `tools/ref/tool.ts` wrapper

### REQ-TOOLS-2b — malformed argument fails closed   (guard)

### SCN-TOOLS-2b-1 — a malformed arg yields a structured rejection, never a throw   (guard)
source: REQ-TOOLS-2b
Given `atlas-query` and a malformed argument (`scope: 42`, a number where a path string is required)
When the tool is invoked on it
Then it returns a structured `Verdict{rejected:true, guidance}` — it does **not** throw (`exceptions == 0`)
teeth: breaks-on "the malformed arg propagates an uncaught `TypeError` instead of a structured rejected verdict"
gen: conformance   # PBT-fuzz differential vs `tools/ref/tool.ts` no-throw property (tag stays reference-model per §K7)

---

## REQ-TOOLS-3 — CLI ≡ MCP on one schema (PBT · cross-transport determinism)

### REQ-TOOLS-3a — CLI and MCP parity on one schema   (happy)

### SCN-TOOLS-3a-1 — one input, two transports, byte-identical result   (happy)
source: REQ-TOOLS-3a
Given the input `x = {scope:"src/finance/arr.rs"}` valid under the one published schema, run through both the `cli` and `mcp` adapters over the one handler `tools/ref/handler.ts`
When `cli(x)` and `mcp(x)` are computed
Then `cli(x) ≡ mcp(x)` — byte-identical `Verdict`, the same schema-checked handler behind both transports
teeth: breaks-on "the MCP adapter wraps the result in a transport envelope `{mcp:{…}}` (re-serializes) — `mcp(x) ≠ cli(x)` byte-wise"
gen: PBT   # witness of the equivalence law `∀x. cli(x) ≡ mcp(x)` (method-tags-tls §INV-TOOLS-3)

### REQ-TOOLS-3b — CLI and MCP must not diverge   (guard)

### SCN-TOOLS-3b-1 — a malformed input rejects identically on both transports   (guard)
source: REQ-TOOLS-3b
Given the malformed input `x = {scope: 42}` presented over both the `cli` and the `mcp` adapter
When `cli(x)` and `mcp(x)` are computed
Then both return the **same** structured rejection — the two transports do not diverge in behavior or contract on the identical input
teeth: breaks-on "the MCP adapter coerces `42→\"42\"` (applies a default) and accepts while the CLI rejects — divergent verdicts for the same input"
gen: PBT   # witness of `∀x (incl. malformed). cli(x) ≡ mcp(x)` — divergence is the negated property

---

## REQ-TOOLS-4 — every result carries guidance

### REQ-TOOLS-4 — every result carries guidance   (happy)

### SCN-TOOLS-4-1 — both the ok and the rejected path carry non-empty guidance   (happy)
source: REQ-TOOLS-4
Given an `atlas-query` that resolves (ok) and an `atlas-emit` that rejects N1′ (rejected), both via the reference Verdict constructor `tools/ref/tool.ts`
When each result is inspected
Then every result carries non-empty `Guidance{next, invariant}` — the ok path and the rejected path both name the follow-up and the governing invariant (`emptyGuidance == 0`)
teeth: breaks-on "the rejected path ships `guidance:{}` — a caller hitting the reject is left to guess the follow-up"
gen: conformance   # the reference wrapper stamps guidance on every path; a code result with empty guidance diverges

---

## REQ-TOOLS-5 — structural, no-promote move-in

### REQ-TOOLS-5a — move-in is $0-LLM and structural   (happy)

### SCN-TOOLS-5a-1 — atlas-init on a tree consults no LLM   (happy)
source: REQ-TOOLS-5a
Given `atlas-init` run on tree `T` over the reference `tools/ref/init.ts` (a pure structural walk)
When move-in completes
Then it made `0` LLM calls and produced its output by structural walk alone — `$0`-LLM
teeth: breaks-on "`atlas-init` calls an LLM to classify a territory — move-in is no longer `$0`-LLM / structural"
gen: conformance   # differential vs `tools/ref/init.ts` structural mover

### REQ-TOOLS-5b — atlas-init returns skeleton, blast radius, flags   (happy)

### SCN-TOOLS-5b-1 — move-in returns all three fields   (happy)
source: REQ-TOOLS-5b
Given `atlas-init` run on tree `T`
When the `InitOut` is inspected
Then it carries the territory skeleton `[finance/, auth/, kernel/]` **and** a blast radius **and** the T0-candidate flags `[auth/]` — all three present
teeth: breaks-on "`InitOut` omits the `blastRadius` field — the caller cannot see move-in scope"
gen: conformance

### REQ-TOOLS-5c — never set a tier above T2   (guard)

### SCN-TOOLS-5c-1 — every territory caps at T2 even a T0-keyword hit   (guard)
source: REQ-TOOLS-5c
Given `atlas-init` on `T`, where `auth/` matches the T0 keyword `security-invariant`
When tiers are assigned
Then `max(tier over all territories) == T2` — `auth/` is set to `T2`, never to a tier above `T2` (`T1`/`T0`)
teeth: breaks-on "`atlas-init` sets `auth/` directly to `T0` — a tier above `T2` is assigned during move-in"
gen: conformance   # `tools/ref/init.ts` asserts `max(tier)==T2`

### REQ-TOOLS-5d — never auto-promote a T0   (guard)

### SCN-TOOLS-5d-1 — a T0 candidate is flagged, never promoted   (guard)
source: REQ-TOOLS-5d
Given the `auth/` territory flagged `t0Candidate:true` during move-in on `T`
When move-in completes
Then `auth/` remains at `tier==T2` with `t0Candidate:true` — `promotions == 0`; the promotion decision is left to a human/governance step
teeth: breaks-on "`atlas-init` auto-promotes the `auth/` T0-candidate to `T0` — a promotion happens during move-in"
gen: conformance

### REQ-TOOLS-5e — heuristics only flag T0 candidates   (happy)

### SCN-TOOLS-5e-1 — the T0 heuristic writes a flag and nothing else   (happy)
source: REQ-TOOLS-5e
Given the T0-keyword heuristic firing on `auth/`
When its effect on state is observed
Then it produced exactly `t0Candidate:true` with `tier=='T2'` unchanged — the heuristic *only* flags, it sets no tier and writes no other state
teeth: breaks-on "the heuristic that detects a T0 candidate also writes `tier=T0` — it does more than flag"
gen: conformance

---

## REQ-TOOLS-6 — bounded read projection

### REQ-TOOLS-6a — query resolves scope to covering territories   (happy)

### SCN-TOOLS-6a-1 — a file scope resolves through the index to its territory   (happy)
source: REQ-TOOLS-6a
Given `atlas-query(scope="src/finance/arr.rs")` over the reference `tools/ref/query.ts` with the index reference
When the scope is resolved
Then it resolves through the index to the covering territory `finance/` (and any co-covering territory) — not a global dump
teeth: breaks-on "`atlas-query` ignores the index and returns a global pack — the file scope is not resolved to its covering territory"
gen: conformance

### REQ-TOOLS-6b — pack is bounded to tier≥T1   (happy)

### SCN-TOOLS-6b-1 — the pack contains only tier≥T1 nodes   (happy)
source: REQ-TOOLS-6b
Given `atlas-query` returning a `Pack` for the `finance/` territory
When the pack contents are inspected
Then every node in the pack is `tier ≥ T1` (`0` nodes below T1) and the pack size is within the `≤ ~2K` advisory bound
teeth: breaks-on "the pack leaks a `T2`/below-`T1` node — the `tier ≥ T1` filter is violated"
gen: conformance   # tier filter has a real oracle; the `~2K` count is an advisory size bound (size test, not correctness oracle)

### REQ-TOOLS-6c — stale pack must be re-grounded   (guard)

### SCN-TOOLS-6c-1 — a stale pack is surfaced, not trusted   (guard)
source: REQ-TOOLS-6c
Given `atlas-query` returning node N2 with `stale:true`
When the pack is delivered
Then `stale:true` is surfaced on the pack and the contract requires re-grounding before the pack is trusted — a stale pack is never served as fresh truth
teeth: breaks-on "the `stale:true` flag is dropped and the stale pack is served as fresh — trusted without re-grounding"
gen: conformance

---

## REQ-TOOLS-7 — fail-closed grounded write

### REQ-TOOLS-7a — re-derive citation at source@sha   (happy)

### SCN-TOOLS-7a-1 — emit re-derives the claim at the pinned sha   (happy)
source: REQ-TOOLS-7a
Given `atlas-emit(N1, source="reference/finance.md@a1b2c3")` where the claim "ACME ARR 2024 = $4.2M" **is** present at `@a1b2c3`, over `tools/ref/emit.ts`
When emit runs
Then it re-derives the citation at `source@sha`, the derivation matches, and the node is emitted
teeth: breaks-on "`atlas-emit` skips re-derivation and trusts the caller's citation — a claim not present at `@a1b2c3` is emitted"
gen: conformance   # differential vs `tools/ref/emit.ts` fail-closed writer

### REQ-TOOLS-7b — reject a node that does not re-derive   (guard)

### SCN-TOOLS-7b-1 — a non-re-deriving node is rejected, nothing persisted   (guard)
source: REQ-TOOLS-7b
Given `atlas-emit(N1′, source="reference/finance.md@a1b2c3")` where "$9.9M" is **not** present at `@a1b2c3`
When emit runs
Then it returns `{emitted:false}` and persists nothing (`store` byte-identical before/after)
teeth: breaks-on "the non-re-deriving node is persisted anyway (`emitted:true`) — an ungrounded fact lands"
gen: conformance

### REQ-TOOLS-7c — writes are templated   (happy)

### SCN-TOOLS-7c-1 — every write goes through the fixed template   (happy)
source: REQ-TOOLS-7c
Given `atlas-emit(N1, …)` producing a write
When the emitted row is inspected
Then it was produced through the fixed write template (structured fields), not a free-form ad-hoc row
teeth: breaks-on "`atlas-emit` accepts a free-form ad-hoc row bypassing the template"
gen: conformance

### REQ-TOOLS-7d — writes are upserts, not blind inserts   (happy)

### SCN-TOOLS-7d-1 — a changed fact supersedes, it does not duplicate   (happy)
source: REQ-TOOLS-7d
Given the store already holds N1 (`claim:acme-arr-2024` = "$4.2M"), then `atlas-emit` writes a changed fact "$4.5M" for the same nodeKey
When the write completes
Then the store holds exactly one live row for `claim:acme-arr-2024` (the change superseded the prior) — `duplicates == 0`
teeth: breaks-on "`atlas-emit` blind-inserts — the changed fact creates a second row, `2` rows for one nodeKey"
gen: conformance

---

## REQ-TOOLS-8 — drift classification with a deterministic exit-gate

### REQ-TOOLS-8a — classify drift into reviewable set   (happy)

### SCN-TOOLS-8a-1 — DRIFTED splits into a reviewable DriftItem set   (happy)
source: REQ-TOOLS-8a
Given `atlas-reconcile` at merge-time over drift set `D = {dm, ds}`, using the KNOW-5 mechanical/semantic split (referenced, not redefined)
When reconcile classifies
Then it returns a reviewable `DriftItem[] = [dm:mechanical, ds:semantic]` — never a single all-or-nothing `DRIFTED` verdict
teeth: breaks-on "`atlas-reconcile` returns one all-or-nothing `DRIFTED` verdict — the mechanical/semantic split is collapsed"
gen: conformance   # differential vs `tools/ref/reconcile.ts`; the KNOW-5 classifier itself is GRD's, consumed here

### REQ-TOOLS-8b — exit 2 only on semantic drift   (guard)

### SCN-TOOLS-8b-1 — a run with semantic drift exits 2, never silent-green   (guard)
source: REQ-TOOLS-8b
Given `atlas-reconcile` over `D = {dm, ds}` with `|semantic| = 1`
When the run finishes
Then it exits `2` — it never reports a silent green when a semantic drift is present
teeth: breaks-on "a run with semantic drift exits `0` (silent green) — the semantic drift is masked"
gen: conformance

### REQ-TOOLS-8c — mechanical-only drift exits 0   (happy)

### SCN-TOOLS-8c-1 — a mechanical-only run exits 0   (happy)
source: REQ-TOOLS-8c
Given `atlas-reconcile` over `D′ = {dm}` with `|semantic| = 0` (drift entirely mechanical)
When the run finishes
Then it exits `0` — no block on drift that needs no review
teeth: breaks-on "a mechanical-only run exits `2` — a spurious merge block on drift that carries no semantic change"
gen: conformance

### REQ-TOOLS-8d — re-author bounded to the semantic subset   (happy)

### SCN-TOOLS-8d-1 — reconcile re-authors exactly the semantic count   (happy)
source: REQ-TOOLS-8d
Given `atlas-reconcile` over `D = {dm, ds}` (`|semantic| = 1`)
When reconcile acts on the classified set
Then it re-authors exactly `1` item (`== |semantic|`, the item `ds`) — never the whole store
teeth: breaks-on "`atlas-reconcile` re-authors the whole store (all N rows) instead of just the `1` semantic item"
gen: conformance

---

## REQ-TOOLS-9 — absorb-driven wave-close write

### REQ-TOOLS-9a — wave-close write driven by absorb   (happy)

### SCN-TOOLS-9a-1 — the wave-close write comes from ResultCard.absorb   (happy)
source: REQ-TOOLS-9a
Given a wave closing with `ResultCard.absorb` carrying a grounded fact, over the reference wave-close (which routes `absorb` through `emit`, `tools/ref/emit.ts`)
When wave-close runs
Then the write is produced from `ResultCard.absorb` routed through `atlas-emit` — not from a separate authoring ritual
teeth: breaks-on "wave-close runs a separate authoring ritual and ignores `ResultCard.absorb` — the absorb payload is dropped"
gen: conformance

### REQ-TOOLS-9b — sealing wave must feed or emit why-not   (guard)

### SCN-TOOLS-9b-1 — a seal with neither absorb nor why-not records a violation   (guard)
source: REQ-TOOLS-9b
Given a sealing wave with `absorb == ∅` **and** no grounded why-not emitted
When the seal-probe runs
Then it records exactly `1` violation — a seal that neither feeds the Atlas nor emits a grounded why-not is not silent
teeth: breaks-on "the seal-probe passes a wave with neither `absorb` nor why-not — a silent seal, `0` violations recorded"
gen: conformance   # seal-probe reference is the mock; a seal outside the absorb path / skipping why-not fails it

---

## REQ-TOOLS-10 — tri-transport byte-identity (PBT · cross-transport determinism)

### REQ-TOOLS-10a — node addressable over three transports   (happy)

### SCN-TOOLS-10a-1 — one node, three transports, byte-identical content   (happy)
source: REQ-TOOLS-10a
Given node N1 at content address `a = cas:9b21`, resolved by content address over the MCP tool, the poke injection, and the CLI — all against the one handler `tools/ref/handler.ts`
When `mcp(a)`, `poke(a)`, and `cli(a)` are computed
Then `mcp(a) ≡ poke(a) ≡ cli(a)` — byte-identical node content across all three transports
teeth: breaks-on "the poke transport re-serializes the node (reorders JSON keys / strips a field) — `poke(a) ≠ mcp(a)` byte-wise"
gen: PBT   # witness of the tri-equivalence law `∀a. mcp(a) ≡ poke(a) ≡ cli(a)` (method-tags-tls §INV-TOOLS-10)

### REQ-TOOLS-10b — transports must not diverge in contract   (guard)

### SCN-TOOLS-10b-1 — the three transports return the same contract shape   (guard)
source: REQ-TOOLS-10b
Given the same node `a = cas:9b21` resolved over the MCP tool, the poke, and the CLI
When each transport returns
Then all three return the identical `Verdict` contract `{content, next, invariant}` — no transport diverges in contract
teeth: breaks-on "the CLI transport returns a bare content string while MCP returns a `Verdict` — the contract diverges across transports"
gen: PBT   # witness of `∀a. contract(mcp(a)) ≡ contract(poke(a)) ≡ contract(cli(a))`

### REQ-TOOLS-10c — transports add no write path   (guard)

### SCN-TOOLS-10c-1 — a write through any transport is refused   (guard)
source: REQ-TOOLS-10c
Given the node handler reached over each of the three transports (MCP / poke / CLI)
When a store-mutating call is attempted through each
Then all three are read/subscribe only — none exposes a store-mutating method, and every attempted write is refused (writes still funnel through `atlas-emit`); positive property — a projection opens NO write door
teeth: breaks-on "the MCP transport exposes a `set()`/`put()` method — a write lands via the node handler, bypassing `atlas-emit`"
gen: PBT   # the no-write-path arm is a reference-model property of the same handler under the tri-equivalence; NOT a formal model

### REQ-TOOLS-10d — CLI is unscoped   (happy)

### SCN-TOOLS-10d-1 — the CLI addresses a node outside the current phase pack   (happy)
source: REQ-TOOLS-10d
Given a node `a = cas:9b21` that is **not** in the seat's current phase pack, addressed via the CLI by its content address
When `cli(a)` is computed
Then the node resolves — the CLI is unscoped, any node is addressable by content address at any time
teeth: breaks-on "the CLI scopes addressability to the current phase pack — a node outside the pack is not addressable by its content address"
gen: PBT   # witness that CLI addressability is invariant under phase/scope

---

## REQ-TOOLS-11 — push-owns-common-case, laddered pull, CLI-floor

### REQ-TOOLS-11-a — never force a seat to the CLI   (guard)

### SCN-TOOLS-11-a-1 — a Read-only seat is served by push, never forced to the CLI   (guard)
source: REQ-TOOLS-11-a
Given seat `S_ro` (only the `Read` grant) that needs to reach the Atlas, over the reference `tools/ref/ladder.ts`
When `resolve(S_ro, need)` runs
Then the seat is served by push (poke / pack) — it is **never** forced to the CLI to reach the Atlas
teeth: breaks-on "`resolve` routes the Read-only seat to the CLI — the seat is forced to the CLI to reach the Atlas"
gen: conformance   # differential vs `tools/ref/ladder.ts` direction-split resolver

### REQ-TOOLS-11-b — push reaches a seat with no grant   (happy)

### SCN-TOOLS-11-b-1 — push lands on a Read-only seat with zero tool grant   (happy)
source: REQ-TOOLS-11-b
Given a poke / pack / `RelationSet` pushed to seat `S_ro` (grant set = `{Read}`)
When push is delivered
Then `S_ro` consumes it with **no** tool grant required (`grantsRequired == 0`) — push is the orchestrator's job
teeth: breaks-on "push requires a tool grant — a seat with only `Read` cannot receive the poke"
gen: conformance

### REQ-TOOLS-11-c — pull resolves down the native-first ladder   (happy)

### SCN-TOOLS-11-c-1 — an ad-hoc pull walks the ladder native-first   (happy)
source: REQ-TOOLS-11-c
Given a seat issuing an ad-hoc pull on harness `H_sdk`
When the ladder resolves
Then it walks the fixed order `SDK-MCP → registered-MCP+grant → poke-as-file → relay → CLI` and returns the first available tier (`SDK-MCP`) — native-first
teeth: breaks-on "the ladder is reordered to try the CLI first (native-last) — pull resolves to CLI while `SDK-MCP` was available"
gen: conformance

### REQ-TOOLS-11-d — every tier is one handler, one contract   (happy)

### SCN-TOOLS-11-d-1 — a lower-tier result equals the native-tier result   (happy)
source: REQ-TOOLS-11-d
Given the same node `cas:9b21` resolved once at the `poke-as-file` tier and once at the `SDK-MCP` tier, both backed by the one handler (TOOLS-10)
When each tier returns
Then the two results are byte-identical — tiers differ only in transport, never in contract or result
teeth: breaks-on "the `poke-as-file` tier is backed by a second handler that returns a different contract than the `SDK-MCP` tier"
gen: conformance   # `tools/ref/ladder.ts` asserts resolved-tier result == native-tier result

---

## REQ-TOOLS-11a — honest ladder per harness

### REQ-TOOLS-11a-a — spawn seats via the SDK in-process path   (happy)

### SCN-TOOLS-11a-a-1 — a governed seat is spawned in-process with a per-seat grant   (happy)
source: REQ-TOOLS-11a-a
Given Orchestra spawning a governed seat on harness `H_sdk`
When the seat is created
Then it is spawned via the Agent SDK in-process path — `create_sdk_mcp_server` in-process **plus** a per-seat `allowed_tools` grant (the native tier-1 spawn contract)
teeth: breaks-on "a seat is spawned via a registered external MCP server instead of the in-process SDK path — the tier-1 native spawn contract is broken"
gen: conformance   # differential vs `tools/ref/ladder.ts` spawn path

### REQ-TOOLS-11a-b — down-rank pull 1 and 2 when MCP unavailable   (guard)

### SCN-TOOLS-11a-b-1 — an MCP-incapable harness down-ranks tiers 1 and 2   (guard)
source: REQ-TOOLS-11a-b
Given harness `H_agents` with `canPropagateMcp:false`
When the ladder is built for this harness
Then pull tier 1 (SDK-MCP) **and** tier 2 (registered-MCP+grant) are marked `unavailable`, and resolution goes straight to push / pull 3–4
teeth: breaks-on "on `H_agents` the ladder still advertises tier-1 SDK-MCP as available — pull 1 is attempted and silently fails"
gen: conformance

### REQ-TOOLS-11a-c — never silently fall through a native tier   (guard)

### SCN-TOOLS-11a-c-1 — a failing advertised-native tier is reported, not skipped   (guard)
source: REQ-TOOLS-11a-c
Given a tier the ladder advertises as native which then fails to resolve
When the ladder moves on
Then the fall-through is **reported** (surfaced), never silent — the ladder does not quietly advance past a tier it advertised as native
teeth: breaks-on "an advertised-native tier fails and the ladder silently falls through to the next tier with no report"
gen: conformance

### REQ-TOOLS-11a-d — report the tier actually started on   (happy)

### SCN-TOOLS-11a-d-1 — the ladder reports its true starting tier   (happy)
source: REQ-TOOLS-11a-d
Given the ladder resolving on harness `H_agents` (`canPropagateMcp:false`)
When resolution returns
Then it reports `startedTier == push` (the tier it actually started on for this harness) — not the native tier-1
teeth: breaks-on "the ladder reports `startedTier == SDK-MCP` on `H_agents` while it actually started on push — a dishonest report"
gen: conformance

---

## REQ-TOOLS-12 — read/advisory-only doctor

### REQ-TOOLS-12a — doctor is read/advisory only   (happy)

### SCN-TOOLS-12a-1 — every doctor sub-command leaves the store byte-identical   (happy)
source: REQ-TOOLS-12a
Given `atlas doctor` sub-commands (`archive`, `why-broken`, `hot-set`) run over the reference `tools/ref/doctor.ts`
When each runs
Then the store is byte-identical before and after every sub-command — doctor is read/advisory only (`directStoreMutations == 0`); positive property — a diagnostic view opens NO write door
teeth: breaks-on "a doctor sub-command mutates the store directly — the store bytes change after a read-only diagnostic"
gen: conformance   # differential vs `tools/ref/doctor.ts` no-write-authority projection

### REQ-TOOLS-12b — doctor never persists   (guard)

### SCN-TOOLS-12b-1 — a doctor-proposed write funnels through atlas-emit   (guard)
source: REQ-TOOLS-12b
Given `atlas doctor reground` proposing a write for dm
When the proposal is produced
Then doctor persists nothing itself — it returns a `RegroundPlan` that only mutates the store when run through `atlas-emit`
teeth: breaks-on "doctor persists its proposed write directly instead of funneling the plan through `atlas-emit`"
gen: conformance

### REQ-TOOLS-12c — doctor carries no write authority   (happy)

### SCN-TOOLS-12c-1 — doctor is a diagnostic view, not a fifth governance tool   (happy)
source: REQ-TOOLS-12c
Given the governance surface with `atlas doctor` present
When the surface is enumerated and the doctor handle inspected
Then the surface stays exactly `4` governance tools and the doctor handle exposes **no** store-mutating method — no write authority
teeth: breaks-on "doctor is registered as a fifth governance tool with a write method — surface count `== 5` and a write via doctor lands"
gen: conformance

---

## REQ-TOOLS-13 — mechanical auto-re-ground, no human, no block

### REQ-TOOLS-13a — auto-re-ground mechanical drift in one pass   (happy)

### SCN-TOOLS-13a-1 — --accept-reground re-grounds the mechanical item in one pass   (happy)
source: REQ-TOOLS-13a
Given `atlas-reconcile --accept-reground` over `D = {dm, ds}` (dm = anchor moved `@a1b2c3→@d4e5f6`, claim still re-derives), over `tools/ref/reconcile.ts` + `tools/ref/emit.ts`
When the run executes
Then it auto-re-grounds `dm` in **one pass** — the anchor is updated to `@d4e5f6` with no human and no merge block
teeth: breaks-on "auto-re-ground needs a second pass / a human confirmation — the mechanical drift is not resolved in one pass"
gen: conformance

### REQ-TOOLS-13b — report regroundedCount   (happy)

### SCN-TOOLS-13b-1 — the run reports the count of items re-grounded   (happy)
source: REQ-TOOLS-13b
Given the `--accept-reground` run over `D = {dm, ds}` (`|mechanical| = 1`)
When the run finishes
Then it reports `regroundedCount == 1` (`== |mechanical|`)
teeth: breaks-on "`regroundedCount` is reported as `0` while `1` mechanical item was re-grounded — the count under-reports"
gen: conformance

### REQ-TOOLS-13c — never auto-touch semantic drift   (guard)

### SCN-TOOLS-13c-1 — the semantic item is left for review and still exits 2   (guard)
source: REQ-TOOLS-13c
Given the `--accept-reground` run over `D = {dm, ds}` (ds = semantic)
When the run executes
Then `ds` is left untouched — it still surfaces for review and the run still exits `2`; only the mechanical `dm` was auto-re-grounded
teeth: breaks-on "`--accept-reground` auto-re-grounds the semantic item `ds` too — a semantic drift is silently rewritten and the run exits `0`"
gen: conformance

### REQ-TOOLS-13d — re-ground write passes the fail-closed check   (happy)

### SCN-TOOLS-13d-1 — each auto-re-ground write clears the emit grounding bar   (happy)
source: REQ-TOOLS-13d
Given the auto-re-ground write for `dm` (anchor now `@d4e5f6`)
When it is applied
Then it passes through `atlas-emit`'s fail-closed grounding check (TOOLS-7) — it re-derives at `@d4e5f6` before it lands
teeth: breaks-on "the auto-re-ground write bypasses `atlas-emit`'s fail-closed check — a re-ground anchor that does not re-derive is written"
gen: conformance   # reuses `tools/ref/emit.ts` fail-closed mock (anti-rot)

---

## REQ-TOOLS-14 — push-driven pre-phase discovery

### REQ-TOOLS-14a — auto-inject a fresh pack at phase transition   (happy)

### SCN-TOOLS-14a-1 — a phase boundary injects a fresh pack into the seat   (happy)
source: REQ-TOOLS-14a
Given a seat crossing a phase transition, over the reference phase-hook `tools/ref/push.ts`
When the boundary fires
Then the orchestrator auto-injects a fresh `atlas-query` / `own_<unit>` pack into the seat's context — the seat need not *decide* to re-ground
teeth: breaks-on "no pack is injected at the phase boundary — the seat carries a stale pack across the transition"
gen: conformance   # differential vs `tools/ref/push.ts` pack injector

### REQ-TOOLS-14b — phase-pack push needs no grant   (happy)

### SCN-TOOLS-14b-1 — the boundary pack reaches a Read-only seat with no grant   (happy)
source: REQ-TOOLS-14b
Given the phase-boundary pack pushed to seat `S_ro` (grant set = `{Read}`)
When push is delivered
Then `S_ro` consumes the fresh pack with **no** tool grant (`grantsRequired == 0`)
teeth: breaks-on "the phase-pack push requires a tool grant — a Read-only seat gets no fresh pack at the boundary"
gen: conformance

### REQ-TOOLS-14c — mid-task pull is not load-bearing   (happy)

### SCN-TOOLS-14c-1 — a boundary re-grounds by push even where pull is unavailable   (guard)
source: REQ-TOOLS-14c
Given a seat crossing a boundary on harness `H_agents` (native pull `unavailable`)
When the boundary fires
Then the seat is re-grounded purely by push and `pull` is never invoked — mid-task PULL is an optimization only, never load-bearing
teeth: breaks-on "re-grounding at the boundary depends on a mid-task pull — on a pull-unavailable harness the seat is left ungrounded"
gen: conformance   # independent of TOOLS-11a: a pushed seat is correct even where native pull is unavailable

---

## REQ-TOOLS-15 — structural single-write-door store

### REQ-TOOLS-15a — store medium is append-only/permissioned   (happy)

### SCN-TOOLS-15a-1 — no prior row's bytes change on a new write   (happy)
source: REQ-TOOLS-15a
Given the reference store `tools/ref/store.ts` holding N1, then a new grounded row for another nodeKey is emitted
When the new write completes
Then no prior row's bytes changed — the medium is append-only / permissioned; an in-place overwrite is refused
teeth: breaks-on "the store allows an in-place overwrite of an existing row — a served fact is mutated under the same address"
gen: conformance

### REQ-TOOLS-15b — reads reject ungrounded rows   (guard)

### SCN-TOOLS-15b-1 — a read rejects an un-emitted row via the integrity check   (guard)
source: REQ-TOOLS-15b
Given a row injected directly into the store (not produced by `atlas-emit`'s grounded path)
When `read(id)` recomputes the content address for that row
Then the content-address integrity check rejects it — an ungrounded row is never returned (`ungroundedRowsServed == 0`)
teeth: breaks-on "`read` serves the directly-injected ungrounded row — the content-address integrity check is skipped"
gen: conformance   # functional refusal; *penetration* of the integrity check = billy / FR-12, not authored here

### REQ-TOOLS-15c — direct write never surfaces as a served fact   (guard)

### SCN-TOOLS-15c-1 — a direct write is refused at write or rejected at read   (guard)
source: REQ-TOOLS-15c
Given a direct write that skips the `atlas-emit` path
When it is attempted and then a read is issued for it
Then it either cannot land (append-only / permission) **or** is rejected at read (integrity check) — it never surfaces as a served fact
teeth: breaks-on "a direct write that skips `atlas-emit` is served as a fact — it neither fails at write nor is rejected at read"
gen: conformance   # functional refusal only; adversarial exploit of this door = billy / FR-12, not authored here

---

## Coverage ledger (S3 completeness facet)

- **REQ coverage:** 52/52 REQ have ≥1 SCN (TOOLS-1a..1d, 2a/2b, 3a/3b, 4, 5a..5e, 6a..6c, 7a..7d, 8a..8d, 9a/9b, 10a..10d, 11-a..11-d, 11a-a..11a-d, 12a..12c, 13a..13d, 14a..14c, 15a..15c).
- **Guard coverage:** 19/19 unwanted/If-then/MUST-NOT REQ have a guard SCN — 1c, 2b, 3b, 5c, 5d, 6c, 7b, 8b, 9b, 10b, 10c, 11-a, 11a-b, 11a-c, 12b, 13c, 14c, 15b, 15c.
- **Teeth (Gate 3):** 52/52 SCN name the exact mutant of their REQ they flip to BROKEN on; none vacuous. The PBT tri/dual-transport witnesses are interesting (a real re-serializing transport, a real contract fork, a real coercion-vs-reject divergence — no antecedent-failure passes); the reference-model conformance witnesses each drive a genuine divergence against the named `tools/ref/*.ts` mock.
- **gen histogram:** PBT 6 (3a, 3b, 10a, 10b, 10c, 10d) · conformance 46 (all others) · residue 0 (every TLS INV has a pure oracle — no hand-written tail).
- **Positive read-only-projection goldens (write-attempt refused, NOT a formal model):** 1d, 10c, 12a.
- **Deferred to billy / FR-12 (functional refusal authored here; exploit NOT authored):** 1c, 15b, 15c.
- **ID-scheme note honored:** TOOLS-11 family SCNs use `SCN-TOOLS-11-<c>-<k>` (hyphenated) vs the TOOLS-11a family `SCN-TOOLS-11a-<c>-<k>` — no prefix collision.
