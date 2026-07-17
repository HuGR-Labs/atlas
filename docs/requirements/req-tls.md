# Requirements — Block TLS (tools/delivery) · S1 lift-and-tag

### REQ-TOOLS-1a — governance surface is exactly four tools
source: INV-TOOLS-1 @ reference/atlas-tools.md#tools-1
The tools layer shall expose exactly `atlas-init`, `atlas-query`, `atlas-emit`, and `atlas-reconcile` as its governance surface.
normative-clause: "The **governance** surface MUST be exactly `atlas-init`, `atlas-query`, `atlas-emit`, `atlas-reconcile`"

### REQ-TOOLS-1b — atlas-emit is the only write path
source: INV-TOOLS-1 @ reference/atlas-tools.md#tools-1
The tools layer shall route every write through `atlas-emit` as the only write path.
normative-clause: "the **only write path** is `atlas-emit`"

### REQ-TOOLS-1c — reject back-channel writes
source: INV-TOOLS-1 @ reference/atlas-tools.md#tools-1
If a back-channel write attempts to bypass `atlas-emit`, then the tools layer shall not let it write.
normative-clause: "no back-channel write may bypass it"

### REQ-TOOLS-1d — read projections carry no write authority
source: INV-TOOLS-1 @ reference/atlas-tools.md#tools-1
The tools layer shall expose per-node read projections as read-only views that carry no write authority.
normative-clause: "Per-node read projections (the node-tools of RETR-5 / TOOLS-10) are **not** a fifth governance tool — they are read-only views of the same store and carry no write authority."

### REQ-TOOLS-2a — tools pure and total
source: INV-TOOLS-2 @ reference/atlas-tools.md#tools-2
Each Atlas tool shall be pure and total.
normative-clause: "Every tool MUST be pure and total"

### REQ-TOOLS-2b — malformed argument fails closed
source: INV-TOOLS-2 @ reference/atlas-tools.md#tools-2
If a malformed argument reaches an Atlas tool, then the tool shall fail closed to a structured empty/rejected verdict rather than throw.
normative-clause: "a malformed argument fails closed to a structured empty/rejected verdict; none throws"

### REQ-TOOLS-3a — CLI and MCP parity on one schema
source: INV-TOOLS-3 @ reference/atlas-tools.md#tools-3
Each Atlas tool shall be callable identically over the CLI and over MCP against one published input schema.
normative-clause: "Every tool MUST be callable identically over the CLI and over MCP, against one **published input schema**"

### REQ-TOOLS-3b — CLI and MCP must not diverge
source: INV-TOOLS-3 @ reference/atlas-tools.md#tools-3
If an Atlas tool is invoked over both the CLI and MCP, then the tool shall not diverge in behavior or contract between the two transports.
normative-clause: "The two transports MUST NOT diverge in behavior or contract"

### REQ-TOOLS-4 — every result carries guidance
source: INV-TOOLS-4 @ reference/atlas-tools.md#tools-4
When an Atlas tool returns a result, the tool shall include `next + invariant` guidance.
normative-clause: "Every result MUST carry `next + invariant` guidance — what to do next and which invariant governs"

### REQ-TOOLS-5a — move-in is $0-LLM and structural
source: INV-TOOLS-5 @ reference/atlas-tools.md#tools-5
The `atlas-init` tool shall perform move-in as a `$0`-LLM, structural operation.
normative-clause: "Move-in MUST be `$0`-LLM and structural"

### REQ-TOOLS-5b — atlas-init returns skeleton, blast radius, flags
source: INV-TOOLS-5 @ reference/atlas-tools.md#tools-5
When `atlas-init` runs on a tree, the tool shall return the territory skeleton, the blast radius, and the T0-candidate flags.
normative-clause: "it MUST return the territory skeleton + blast radius + T0-candidate flags"

### REQ-TOOLS-5c — never set a tier above T2
source: INV-TOOLS-5 @ reference/atlas-tools.md#tools-5
If `atlas-init` would set a tier above `T2`, then the tool shall not set it.
normative-clause: "MUST NOT set any tier above `T2`"

### REQ-TOOLS-5d — never auto-promote a T0
source: INV-TOOLS-5 @ reference/atlas-tools.md#tools-5
If a `T0` would be promoted during move-in, then `atlas-init` shall not promote it automatically.
normative-clause: "promote a `T0` automatically"

### REQ-TOOLS-5e — heuristics only flag T0 candidates
source: INV-TOOLS-5 @ reference/atlas-tools.md#tools-5
Where a heuristic detects a `T0` candidate, `atlas-init` shall only flag it.
normative-clause: "Heuristics MAY only *flag* a T0 candidate."

### REQ-TOOLS-6a — query resolves scope to covering territories
source: INV-TOOLS-6 @ reference/atlas-tools.md#tools-6
When `atlas-query` receives a scope of file, folder, module, or crate, the tool shall resolve it through the index to the covering territory/-ies.
normative-clause: "It MUST accept any scope (file/folder/module/crate), resolve it through the index to the covering territory/-ies"

### REQ-TOOLS-6b — pack is bounded to tier≥T1
source: INV-TOOLS-6 @ reference/atlas-tools.md#tools-6
The `atlas-query` tool shall return a `≤ ~2K` pack of `tier≥T1` invariants.
normative-clause: "return a `≤ ~2K` pack of `tier≥T1` invariants"

### REQ-TOOLS-6c — stale pack must be re-grounded
source: INV-TOOLS-6 @ reference/atlas-tools.md#tools-6
If a returned pack carries `stale:true`, then `atlas-query` shall require re-grounding before the pack is trusted.
normative-clause: "`stale:true` MUST mean re-ground before trusting"

### REQ-TOOLS-7a — re-derive citation at source@sha
source: INV-TOOLS-7 @ reference/atlas-tools.md#tools-7
The `atlas-emit` tool shall re-derive the citation at `source@sha`.
normative-clause: "It MUST re-derive the citation at `source@sha`"

### REQ-TOOLS-7b — reject a node that does not re-derive
source: INV-TOOLS-7 @ reference/atlas-tools.md#tools-7
If a node's grounding does not re-derive, then `atlas-emit` shall reject it with `emitted:false` and persist nothing.
normative-clause: "a node whose grounding does not re-derive MUST be rejected (`emitted:false`, nothing persisted)"

### REQ-TOOLS-7c — writes are templated
source: INV-TOOLS-7 @ reference/atlas-tools.md#tools-7
The `atlas-emit` tool shall make every write templated.
normative-clause: "Writes MUST be templated"

### REQ-TOOLS-7d — writes are upserts, not blind inserts
source: INV-TOOLS-7 @ reference/atlas-tools.md#tools-7
The `atlas-emit` tool shall perform every write as an upsert rather than a blind insert.
normative-clause: "upserts, not blind inserts"

### REQ-TOOLS-8a — classify drift into reviewable set
source: INV-TOOLS-8 @ reference/atlas-tools.md#tools-8
When reconciling at merge-time, `atlas-reconcile` shall classify the `DRIFTED` subset by the KNOW-5 mechanical/semantic split into a reviewable `DriftItem[]` set rather than an all-or-nothing verdict.
normative-clause: "classify the `DRIFTED` subset by the `atlas-knowledge` KNOW-5 mechanical/semantic split (referenced, not redefined here) and present the result as a **reviewable `DriftItem[]` set**, never an all-or-nothing verdict"

### REQ-TOOLS-8b — exit 2 only on semantic drift
source: INV-TOOLS-8 @ reference/atlas-tools.md#tools-8
If a run's drift is `semantic`, then `atlas-reconcile` shall exit `2` and never report a silent green there.
normative-clause: "It MUST exit `2` **only** on `semantic` drift — never a silent green there"

### REQ-TOOLS-8c — mechanical-only drift exits 0
source: INV-TOOLS-8 @ reference/atlas-tools.md#tools-8
When a run's drift is entirely `mechanical`, `atlas-reconcile` shall exit `0`.
normative-clause: "a run whose drift is entirely `mechanical` MUST exit `0`"

### REQ-TOOLS-8d — re-author bounded to the semantic subset
source: INV-TOOLS-8 @ reference/atlas-tools.md#tools-8
The `atlas-reconcile` tool shall re-author exactly `== |semantic|` items and never the whole store.
normative-clause: "It MUST re-author `== |semantic|`, never the whole store"

### REQ-TOOLS-9a — wave-close write driven by absorb
source: INV-TOOLS-9 @ reference/atlas-tools.md#tools-9
The `atlas-emit` write path at wave-close shall be driven by `ResultCard.absorb` rather than a separate authoring ritual.
normative-clause: "The `atlas-emit` write path at wave-close MUST be driven by `ResultCard.absorb`, not a separate authoring ritual"

### REQ-TOOLS-9b — sealing wave must feed or emit why-not
source: INV-TOOLS-9 @ reference/atlas-tools.md#tools-9
If a sealing wave neither feeds the Atlas nor emits a grounded why-not, then the probe shall record a violation.
normative-clause: "A sealing wave with no `absorb` and no why-not ⇒ the probe records a violation"

### REQ-TOOLS-10a — node addressable over three transports
source: INV-TOOLS-10 @ reference/atlas-tools.md#tools-10
The node handler shall make every Atlas node addressable by its content address over the MCP tool, the poke injection, and the CLI against one handler.
normative-clause: "**every Atlas node** MUST be addressable by its **content address** over three transports against one handler"

### REQ-TOOLS-10b — transports must not diverge in contract
source: INV-TOOLS-10 @ reference/atlas-tools.md#tools-10
If the same node is resolved over the MCP tool, the poke, and the CLI, then the node handler shall not diverge in contract across the three.
normative-clause: "The three MUST NOT diverge in contract"

### REQ-TOOLS-10c — transports add no write path
source: INV-TOOLS-10 @ reference/atlas-tools.md#tools-10
If a node is reached over any of the three transports, then the node handler shall keep the transport read/subscribe only and add no write path.
normative-clause: "This adds **no** write path: all three transports are read/subscribe; writes still funnel through `atlas-emit`"

### REQ-TOOLS-10d — CLI is unscoped
source: INV-TOOLS-10 @ reference/atlas-tools.md#tools-10
The CLI shall keep any node addressable by its content address at any time.
normative-clause: "the **CLI is unscoped** — any node is addressable by address at any time"

### REQ-TOOLS-11-a — never force a seat to the CLI
source: INV-TOOLS-11 @ reference/atlas-tools.md#tools-11
If a seat needs to reach the Atlas, then the orchestrator shall not force it to the CLI.
normative-clause: "A seat MUST NOT be forced to the CLI to reach the Atlas"

### REQ-TOOLS-11-b — push reaches a seat with no grant
source: INV-TOOLS-11 @ reference/atlas-tools.md#tools-11
The orchestrator shall deliver push (the poke / pack / `RelationSet`) to a seat with no tool grant required.
normative-clause: "**push** (the poke / pack / `RelationSet`) is the **orchestrator's** job and MUST reach a seat with **no tool grant required**"

### REQ-TOOLS-11-c — pull resolves down the native-first ladder
source: INV-TOOLS-11 @ reference/atlas-tools.md#tools-11
When a seat issues an ad-hoc pull, the tools layer shall resolve it down the fixed native-first ladder in-process SDK MCP → registered MCP + grant → poke-as-file → orchestrator relay → CLI.
normative-clause: "it MUST resolve down a fixed **native-first** ladder (see *Subagent transport*): in-process SDK MCP → registered MCP + grant → poke-as-file → orchestrator relay → CLI"

### REQ-TOOLS-11-d — every tier is one handler, one contract
source: INV-TOOLS-11 @ reference/atlas-tools.md#tools-11
The tools layer shall back every ladder tier by the one handler so tiers differ only in transport, never in contract or result.
normative-clause: "Every tier is backed by the **one** handler (TOOLS-10) — tiers differ only in transport, never in contract or result"

### REQ-TOOLS-11a-a — spawn seats via the SDK in-process path
source: INV-TOOLS-11a @ reference/atlas-tools.md#tools-11a
Orchestra shall spawn its governed seats via the Agent SDK in-process path (`create_sdk_mcp_server` in-process plus a per-seat `allowed_tools` grant).
normative-clause: "Orchestra MUST spawn its governed seats via the **Agent SDK in-process path** (`create_sdk_mcp_server` in-process + a per-seat `allowed_tools` grant)"

### REQ-TOOLS-11a-b — down-rank pull 1 and 2 when MCP unavailable
source: INV-TOOLS-11a @ reference/atlas-tools.md#tools-11a
If the running harness cannot propagate MCP, then the ladder shall down-rank pull 1 and pull 2 to `unavailable` and resolve straight to push / pull 3–4.
normative-clause: "a harness that cannot propagate MCP MUST down-rank pull 1 **and** pull 2 to **`unavailable`** and resolve straight to push / pull 3–4"

### REQ-TOOLS-11a-c — never silently fall through a native tier
source: INV-TOOLS-11a @ reference/atlas-tools.md#tools-11a
If a tier is advertised as native, then the ladder shall not silently fall through it.
normative-clause: "it MUST NOT silently fall through a tier it advertises as native"

### REQ-TOOLS-11a-d — report the tier actually started on
source: INV-TOOLS-11a @ reference/atlas-tools.md#tools-11a
The ladder shall report the tier it actually started on for the running harness.
normative-clause: "The ladder MUST report the tier it actually started on for the running harness"

### REQ-TOOLS-12a — doctor is read/advisory only
source: INV-TOOLS-12 @ reference/atlas-tools.md#tools-12
The `atlas doctor` surface shall be read/advisory only.
normative-clause: "The diagnostic surface (`atlas doctor`) MUST be **read/advisory only**"

### REQ-TOOLS-12b — doctor never persists
source: INV-TOOLS-12 @ reference/atlas-tools.md#tools-12
If `atlas doctor` proposes a write, then it shall funnel that write through `atlas-emit` instead of persisting it.
normative-clause: "It MUST NOT persist: any write it proposes MUST funnel through `atlas-emit`"

### REQ-TOOLS-12c — doctor carries no write authority
source: INV-TOOLS-12 @ reference/atlas-tools.md#tools-12
The `atlas doctor` surface shall remain a no-write-authority diagnostic view rather than a fifth governance tool.
normative-clause: "It is **not** a fifth governance tool (TOOLS-1 stays four) — it is a diagnostic view of the same store, carrying no write authority"

### REQ-TOOLS-13a — auto-re-ground mechanical drift in one pass
source: INV-TOOLS-13 @ reference/atlas-tools.md#tools-13
When run with `--accept-reground`, `atlas-reconcile` shall auto-re-ground every `mechanical` `DriftItem` in one pass with no human and no merge block.
normative-clause: "`atlas-reconcile --accept-reground` MUST, in **one pass**, auto-re-ground every `mechanical` `DriftItem` (anchor moved but the claim still re-derives at the new `@sha`) — updating the anchor with no human and no merge block"

### REQ-TOOLS-13b — report regroundedCount
source: INV-TOOLS-13 @ reference/atlas-tools.md#tools-13
The `atlas-reconcile` tool shall report `regroundedCount`.
normative-clause: "report `regroundedCount`"

### REQ-TOOLS-13c — never auto-touch semantic drift
source: INV-TOOLS-13 @ reference/atlas-tools.md#tools-13
If drift is `semantic`, then `atlas-reconcile --accept-reground` shall not auto-touch it, leaving it to surface for review and exit `2`.
normative-clause: "It MUST NOT auto-touch `semantic` drift: those still surface for review and still exit `2`"

### REQ-TOOLS-13d — re-ground write passes the fail-closed check
source: INV-TOOLS-13 @ reference/atlas-tools.md#tools-13
The `atlas-reconcile` tool shall make each re-ground write pass the `atlas-emit` fail-closed check.
normative-clause: "Each re-ground write MUST still pass the `atlas-emit` fail-closed check (TOOLS-7)"

### REQ-TOOLS-14a — auto-inject a fresh pack at phase transition
source: INV-TOOLS-14 @ reference/atlas-tools.md#tools-14
When a phase transition occurs, the orchestrator shall auto-inject a fresh `atlas-query`/`own_<unit>` pack into the seat's context.
normative-clause: "At **every phase transition** the orchestrator MUST **auto-inject a fresh `atlas-query`/`own_<unit>` pack** into the seat's context"

### REQ-TOOLS-14b — phase-pack push needs no grant
source: INV-TOOLS-14 @ reference/atlas-tools.md#tools-14
The orchestrator shall deliver the phase-boundary pack push with no tool grant.
normative-clause: "it MUST hold with **no tool grant**"

### REQ-TOOLS-14c — mid-task pull is not load-bearing
source: INV-TOOLS-14 @ reference/atlas-tools.md#tools-14
The orchestrator shall keep mid-task PULL an optimization only, never load-bearing.
normative-clause: "Mid-task PULL MUST NOT be load-bearing"

### REQ-TOOLS-15a — store medium is append-only/permissioned
source: INV-TOOLS-15 @ reference/atlas-tools.md#tools-15
The store medium shall be append-only / permissioned.
normative-clause: "the store medium MUST be **append-only / permissioned**"

### REQ-TOOLS-15b — reads reject ungrounded rows
source: INV-TOOLS-15 @ reference/atlas-tools.md#tools-15
If a read encounters an un-emitted (ungrounded) row, then the store shall enforce a content-address integrity check that rejects it.
normative-clause: "**reads MUST enforce a content-address integrity check that rejects any un-emitted (ungrounded) row**"

### REQ-TOOLS-15c — direct write never surfaces as a served fact
source: INV-TOOLS-15 @ reference/atlas-tools.md#tools-15
If a direct write skips the emit path, then the store shall either refuse it at write or reject it at read so it never surfaces as a served fact.
normative-clause: "a direct write that skips the emit path either cannot land (append-only/permission) or is rejected at read (integrity check), never surfacing as a served fact"

### REQ-TOOLS-16a — atlas-diff surfaces the version delta read-only
source: INV-TOOLS-16 @ reference/atlas-tools.md#tools-16
When `atlas-diff <shaA> <shaB>` is invoked, the tools layer shall surface the PERSIST-14 delta as a read-only projection.
normative-clause: "`atlas-diff <shaA> <shaB>` surfaces the PERSIST-14 delta as a read-only projection"

### REQ-TOOLS-16b — atlas-diff CLI and MCP parity
source: INV-TOOLS-16 @ reference/atlas-tools.md#tools-16
The `atlas-diff` tool shall be callable identically over the CLI and over MCP against one published schema.
normative-clause: "CLI≡MCP … one published schema"

### REQ-TOOLS-16c — atlas-diff CLI and MCP must not diverge
source: INV-TOOLS-16 @ reference/atlas-tools.md#tools-16
If `atlas-diff` is invoked over both the CLI and MCP, then the tools layer shall not diverge in behavior or contract between the two.
normative-clause: "CLI≡MCP (0 divergence)"

### REQ-TOOLS-16d — atlas-diff adds no write path
source: INV-TOOLS-16 @ reference/atlas-tools.md#tools-16
If `atlas-diff` is reached over any transport, then the tools layer shall keep it read/subscribe only and add no write path.
normative-clause: "0 write path"

### REQ-TOOLS-16e — atlas-diff is not a fifth write tool
source: INV-TOOLS-16 @ reference/atlas-tools.md#tools-16
If `atlas-diff` would grow the governance write surface, then the tools layer shall not admit it as a write tool, keeping the write surface exactly four.
normative-clause: "the governance WRITE surface stays exactly 4 tools (this is a read projection like `node` TOOLS-10 / `doctor` TOOLS-12, NOT a fifth write tool)"
