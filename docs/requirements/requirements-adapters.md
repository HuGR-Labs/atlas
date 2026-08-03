# S1 — Requirements (EARS) · Campaign-9 (the productization ring)

> state: **S1** · consumes: `requirements/invariant-register-adapters.md` @ `freeze/adapters-v0` · produces:
> `REQ-<MODULE>-<n>` · next: S2 (method-tags).
>
> **Brownfield lift-and-tag.** Every REQ recovers exactly one frozen invariant clause into one testable EARS
> sentence — no design invented. `normative-clause:` quotes the load-bearing clause verbatim from
> `reference/atlas-adapters.md`. Each `unwanted[]` clause becomes its own `If-then` guard REQ.

### REQ-ADAPTER-1a — faithful file tree
source: INV-ADAPTER-1 @ reference/atlas-adapters.md#adapt-fs-1
The filesystem walker shall produce the exact FileTree — paths, nesting, and leaf content — for a real repo path in a deterministic order, honoring the repo's `.gitignore` rules, with leaf `content` being the tracked file's working-tree bytes EXCEPT for a mode-120000 (symlink) entry, whose `content` is its stored link text (REQ-ADAPTER-1e).   <!-- AMENDED 2026-08-02 with REQ-ADAPTER-1e: "leaf content" read as "the bytes at that path" was FALSE for a symlink, and the walker followed the link -->
normative-clause: "The filesystem walker MUST produce the exact `FileTree` (`→ FileTree@index/types.ts`) for a real repo path — paths, nesting, and leaf `content` — in a deterministic order, honoring the repo's ignore rules (`.gitignore`)."

### REQ-ADAPTER-1b — no omitted tracked file
source: INV-ADAPTER-1 @ reference/atlas-adapters.md#adapt-fs-1
If a file is tracked in the repo, then the walker shall include it in the FileTree.
normative-clause: "It MUST NOT fabricate or omit a tracked file."

### REQ-ADAPTER-1c — no fabricated file
source: INV-ADAPTER-1 @ reference/atlas-adapters.md#adapt-fs-1
If a file is absent from the repo, then the walker shall not emit it in the FileTree.
normative-clause: "It MUST NOT fabricate or omit a tracked file."

### REQ-ADAPTER-1d — walk is order-stable
source: INV-ADAPTER-1 @ reference/atlas-adapters.md#adapt-fs-1
If the same repo tree is walked more than once, then the walker shall yield identical order and content.
normative-clause: "in a deterministic order"

### REQ-ADAPTER-1e — a tracked symlink contributes its stored link text, never its target
source: SECURITY AMENDMENT 2026-08-02 (the tracked-symlink rule in `adapter-io/src/fs.ts`) — NOT a lift from INV-ADAPTER-1
If a tracked entry's git mode is 120000, then the walker shall include it as a leaf whose `content` is the stored link text taken from the entry's index blob, shall never open the link target, and that leaf shall be excluded from the sub-file AST fold.
normative-clause: — none. This clause is NOT recovered from `reference/atlas-adapters.md#adapt-fs-1`; that frozen text predates the rule and is silent on symlinks (see the note).

> **AMENDED 2026-08-02 (the containment family), ADDING a clause the frozen register does not carry.** Every
> other REQ here is a brownfield lift of one frozen invariant clause. This one is not, and saying so is the
> point: it records a DECISION taken to close a defect, so a later reader does not go looking for an
> invariant that was never written. Reproduced before the fix: a git-tracked `src/config.ts -> /etc/passwd`
> put the password file's contents into the walked `FileTree`, because the walker `readFileSync`'d every
> tracked path and that call FOLLOWS a symlink. Four things this clause fixes in the record:
>
> 1. **The `content` is the stored link text, and the target is never read.** The rule is git's own: under
>    `core.symlinks=false` (Windows, some CI) git already checks a mode-120000 entry out as a regular file
>    holding exactly that text, so the walk reproduces what such a checkout yields rather than inventing a
>    convention. REQ-ADAPTER-1b still holds with NO new exception — the tracked entry is INCLUDED, carrying
>    what the repo says it is — and REQ-ADAPTER-1d gets stronger: the content behind a link to an absolute
>    outside path was a fact about the HOST, so two machines could walk one commit to different content.
>    They no longer can. The walker asks NO containment predicate and resolves NO attacker-influenced path;
>    that business stays out of the boot path of both binaries, which is where the two `isContainedIn` fixes
>    put it back on the doors that genuinely need it.
> 2. **The source is the INDEX BLOB, not `readlink` — deliberately, and on the record.** A
>    `core.symlinks=false` checkout has no link to read: `readlink` fails EINVAL there and the tracked entry
>    would be silently DROPPED, violating REQ-ADAPTER-1b on exactly those hosts. So the bytes come from the
>    object database. This means the walk has a MIXED SOURCE — symlink leaves from the index, regular files
>    from the working tree — which is stated here rather than left to be discovered by whoever next asks why
>    a dirty symlink walks to its staged text.
> 3. **A symlink leaf is excluded from `foldAstUnits` and mints no unit key.** A link target is
>    attacker-chosen TEXT: `ln -s 'const leaked = 1' src/leak.ts` is a legal symlink whose stored blob parses
>    as TypeScript, and folding it would mint `src/leak.ts::lexical_declaration:0:leaked` — a first-class
>    node key minted from something that is not a program, and node keys are what retrieval hands out.
> 4. **A broken link and a directory link are INCLUDED as link-text leaves — this is the behaviour that
>    changed.** Both used to be dropped, but by ACCIDENT rather than by decision: the walker's read swallowed
>    the ENOENT of a dangling target and the EISDIR of a directory target, and the mode never reached it. A
>    directory link stays a LEAF and contributes none of the linked directory's entries (a tracked file under
>    the real directory appears exactly once, under its real path).
>
> **UNSPECIFIED, and left that way on purpose: mode 160000 (gitlinks/submodules).** There are none in this
> repo, the mode is unexercised, and inventing a rule for it would be a worse record than an honest gap. A
> gitlink today falls to the working-tree read leg and is skipped; that is a consequence, not a decision.
>
> **NOT AMENDED HERE: the frozen reference.** `reference/atlas-adapters.md#adapt-fs-1` (ADAPT-FS-1) is
> consumed at `freeze/adapters-v0` and still reads "paths, nesting, and leaf `content`" with no symlink
> clause. It is not edited by this seat: a frozen invariant register is amended by ratification, not by the
> seat that discovered the gap. Flagged for that decision.

### REQ-ADAPTER-2a — SCIP is read into ScipOutput
source: INV-ADAPTER-2 @ reference/atlas-adapters.md#adapt-scip-1
The SCIP reader shall parse a `.scip` protobuf index into the frozen ScipOutput as per-document definition/reference occurrences only.
normative-clause: "The SCIP reader MUST parse a `.scip` protobuf index into the frozen `ScipOutput` (`→ ScipOutput@index/types.ts`): per-document `definition`/`reference` occurrences only."

### REQ-ADAPTER-2b — dangling reference stays unresolved
source: INV-ADAPTER-2 @ reference/atlas-adapters.md#adapt-scip-1
If a reference has no in-index definition, then the reader shall leave it unresolved (downstream `to: null`).
normative-clause: "A `reference` with no in-index `definition` MUST remain unresolved (downstream `to: null`, INDEX-13)"

### REQ-ADAPTER-2c — no synthesized symbol or edge
source: INV-ADAPTER-2 @ reference/atlas-adapters.md#adapt-scip-1
If a symbol or edge is absent from the `.scip`, then the reader shall not synthesize it.
normative-clause: "the reader MUST NEVER synthesize a symbol or an edge the `.scip` does not contain."

### REQ-ADAPTER-3a — per-language indexer dispatch and merge
source: INV-ADAPTER-3 @ reference/atlas-adapters.md#adapt-scip-2
For a repo spanning languages, the ring shall run the correct per-language SCIP indexer (IndexerPlan by LangId) and merge their `.scip` outputs.
normative-clause: "the ring MUST run the correct per-language SCIP indexer (`IndexerPlan` by `LangId`) and merge their `.scip` outputs."

### REQ-ADAPTER-3b — un-indexed language contributes files only
source: INV-ADAPTER-3 @ reference/atlas-adapters.md#adapt-scip-2
Where a language has no configured indexer, the ring shall contribute its files to the FileTree only.
normative-clause: "A language with **no configured indexer** MUST contribute its files to the `FileTree` only (an honest structural hole)"

### REQ-ADAPTER-3c — un-indexed language corrupts no other language
source: INV-ADAPTER-3 @ reference/atlas-adapters.md#adapt-scip-2
If a language has no configured indexer, then it shall not cause a fabricated or dropped edge for any other language.
normative-clause: "MUST NOT cause a fabricated or dropped edge for any other language (INDEX-13 honesty preserved cross-language)."

### REQ-ADAPTER-4a — deterministic sub-file units
source: INV-ADAPTER-4 @ reference/atlas-adapters.md#adapt-ast-1
When the web-tree-sitter layer is enabled, it shall fold sub-file structural units (item/block) into the FileTree spatial rail deterministically.
normative-clause: "The `web-tree-sitter` layer, when enabled, MUST fold sub-file structural units (item/block) into the `FileTree` spatial rail deterministically (same bytes ⇒ same units)."

### REQ-ADAPTER-4b — file-level index stays valid without AST
source: INV-ADAPTER-4 @ reference/atlas-adapters.md#adapt-ast-1
Where the web-tree-sitter layer is absent, the index shall remain valid at file level.
normative-clause: "It is an **additive refinement**: with it absent, the index is file-level and still valid."

### REQ-ADAPTER-4c — same bytes yield same units
source: INV-ADAPTER-4 @ reference/atlas-adapters.md#adapt-ast-1
If the same file bytes are folded more than once, then the layer shall yield identical sub-file units.
normative-clause: "(same bytes ⇒ same units)"

### REQ-ADAPTER-5a — index adapter drives @atlas/index
source: INV-ADAPTER-5 @ reference/atlas-adapters.md#adapt-index-1
The index-backing adapter shall satisfy MoveInIndex and QueryIndex by driving `@atlas/index` build/resolve/coverage over the walker and SCIP outputs.
normative-clause: "The index-backing adapter MUST satisfy `MoveInIndex` (`→ tools/init.ts`) and `QueryIndex` (`→ tools/query.ts`) by driving `@atlas/index` `build`/`resolve`/`coverage` over the walker + SCIP outputs"

### REQ-ADAPTER-5b — adapter owns no ranking or resolution
source: INV-ADAPTER-5 @ reference/atlas-adapters.md#adapt-index-1
If ranking or resolution is required, then the adapter shall introduce none of its own.
normative-clause: "it introduces no ranking or resolution of its own."

### REQ-ADAPTER-6a — durable content-addressed store
source: INV-ADAPTER-6 @ reference/atlas-adapters.md#adapt-store-1
The disk store shall implement StoreApi (`put(obj)→Hash`, `get(h)→CasObject|undefined`) over persistent storage.
normative-clause: "The disk store MUST implement `StoreApi` (`→ kernel/store.ts`: `put(obj)→Hash`, `get(h)→CasObject|undefined`) over persistent storage"

### REQ-ADAPTER-6b — cross-process byte-identical retrieval
source: INV-ADAPTER-6 @ reference/atlas-adapters.md#adapt-store-1
When an object put in one process is read in a later process, the store shall return it byte-identical.
normative-clause: "such that an object `put` in one process is `get`-retrievable, byte-identical, in a later process."

### REQ-ADAPTER-6c — tampered value reads as absent
source: INV-ADAPTER-6 @ reference/atlas-adapters.md#adapt-store-1
If `id(value) !== key` on read, then the store shall treat the value as absent.
normative-clause: "On read it MUST verify `id(value) === key` and treat a mismatch as absent (tamper-safe, KERNEL-1)."

### REQ-ADAPTER-7a — governed persistent write binding
source: INV-ADAPTER-7 @ reference/atlas-adapters.md#adapt-store-2
To land one governed dedup/supersede write durably, the binding shall compute `nodeKey(candidate)`, probe the durable store for the contentHash (D0) and nodeKey (D1) hits, call the existing `routeWrite`, apply `upsert`, and flush the projection through the store.
normative-clause: "compute `nodeKey(candidate)`, probe the durable store for the contentHash (D0) and nodeKey (D1) hits, call the existing `routeWrite`, apply `upsert`, and flush the projection through the store."

### REQ-ADAPTER-7b — idempotent governed write
source: INV-ADAPTER-7 @ reference/atlas-adapters.md#adapt-store-2
If the same fact is governed-written twice, then the bound write shall land it once.
normative-clause: "To make one governed **dedup/supersede** write land durably"

### REQ-ADAPTER-7c — binding invents no routing
source: INV-ADAPTER-7 @ reference/atlas-adapters.md#adapt-store-2
If routing is required, then the binding shall introduce no new routing beyond the existing `routeWrite`/`upsert`.
normative-clause: "This binds existing pieces; it invents no new routing."

### REQ-ADAPTER-8a — history is backed by real git
source: INV-ADAPTER-8 @ reference/atlas-adapters.md#adapt-git-1
HistorySource shall be backed by real `git log`/`blame`/coupling over a rev.
normative-clause: "`HistorySource` (`→ genesis/rank.ts`) MUST be backed by real `git log`/`blame`/coupling over a rev"

### REQ-ADAPTER-8b — history is deterministic for a fixed rev
source: INV-ADAPTER-8 @ reference/atlas-adapters.md#adapt-git-1
If the rev is fixed, then the history signals shall be identical across runs.
normative-clause: "deterministic for a fixed rev"

### REQ-ADAPTER-8c — history mints no fact
source: INV-ADAPTER-8 @ reference/atlas-adapters.md#adapt-git-1
If a history signal is produced, then it shall never mint a fact.
normative-clause: "it feeds ranking only and MUST NEVER mint a fact (GEN structural-only guarantee)."

### REQ-ADAPTER-9a — drift over merge-base
source: INV-ADAPTER-9 @ reference/atlas-adapters.md#adapt-git-2
DriftSource shall compute drifted anchors across a git merge-base so `atlas-reconcile` can classify mechanical vs semantic.
normative-clause: "`DriftSource` (`→ tools/reconcile.ts`) MUST compute drifted anchors across a git merge-base so `atlas-reconcile` can classify mechanical vs semantic"

### REQ-ADAPTER-9b — drift is computed against the merge-base only
source: INV-ADAPTER-9 @ reference/atlas-adapters.md#adapt-git-2
If drift is computed, then it shall be computed across the git merge-base and nothing else.
normative-clause: "MUST compute drifted anchors across a git merge-base"

### REQ-ADAPTER-10a — forge carries the atlas
source: INV-ADAPTER-10 @ reference/atlas-adapters.md#adapt-git-3
The Forge shall write the provenance trailer, a `refs/notes/orchestra` note, and the PR projection onto a real host.
normative-clause: "`Forge` (`→ persist/host-adapter.ts`) MUST write the provenance trailer + a `refs/notes/orchestra` note + the PR projection onto a real host"

### REQ-ADAPTER-10b — rewrite keeps trailer, orphans note data
source: INV-ADAPTER-10 @ reference/atlas-adapters.md#adapt-git-3
If history is rewritten, then the forge shall keep trailer data and orphan note-carried data exactly as PERSIST-* specifies.
normative-clause: "a history rewrite MUST keep trailer data and orphan note-carried data exactly as PERSIST-* specifies"

### REQ-ADAPTER-10c — forge executes, never alters, semantics
source: INV-ADAPTER-10 @ reference/atlas-adapters.md#adapt-git-3
If the forge acts, then it shall execute the specified semantics and change none of them.
normative-clause: "the adapter changes none of that semantics, only executes it."

### REQ-ADAPTER-11a — the single model entry
source: INV-ADAPTER-11 @ reference/atlas-adapters.md#adapt-llm-1
If a model is invoked anywhere in the system, then it shall be invoked only through `SiteProposer.propose`.
normative-clause: "`SiteProposer.propose` (`→ genesis/extract.ts`) MUST be the **only** place a model is invoked in the whole system"

### REQ-ADAPTER-11b — one bounded call per site
source: INV-ADAPTER-11 @ reference/atlas-adapters.md#adapt-llm-1
When proposing for a site, `propose` shall make exactly one bounded call, honoring the cost/timeout budget.
normative-clause: "it MUST make one bounded call per site, honor the cost/timeout budget"

### REQ-ADAPTER-11c — proposal is a candidate, never auto-trusted
source: INV-ADAPTER-11 @ reference/atlas-adapters.md#adapt-llm-1
If `propose` returns a proposal, then it shall be a candidate gated by the admission bar and ratification, never auto-trusted.
normative-clause: "return a **candidate** proposal that is never auto-trusted (the admission bar + ratification still gate it)."

### REQ-ADAPTER-12a — rehydrate the session projection
source: INV-ADAPTER-12 @ reference/atlas-adapters.md#adapt-store-3
When a fresh process rehydrates, the store adapter shall reconstruct the StoreProjection current-node map from the durable store such that a fact written and flushed in an earlier run is present byte-identical.
normative-clause: "On a fresh process the store adapter MUST reconstruct the `StoreProjection` current-node map from the durable store such that a fact written and flushed in an earlier run is present, byte-identical, in the rehydrated projection"

### REQ-ADAPTER-12b — rehydrate reconstructs, mints nothing
source: INV-ADAPTER-12 @ reference/atlas-adapters.md#adapt-store-3
If the projection is rehydrated, then the adapter shall mint or alter nothing.
normative-clause: "reconstructing state only, minting nothing."

### REQ-WIRE-1a — one shared handler assembly
source: INV-WIRE-1 @ reference/atlas-adapters.md#wire-1
A single shared `wire` module shall assemble the five-leg WiredHandler over the adapters.
normative-clause: "A single shared `wire` module MUST assemble the five-leg `WiredHandler` (`atlas-init/query/emit/reconcile/link` legs over the adapters, `→ tools/handler.ts`; the `atlas-link` leg added by WP-SAMEAS, ADR-0003)."

### REQ-WIRE-1b — both entrypoints consume the shared module
source: INV-WIRE-1 @ reference/atlas-adapters.md#wire-1
If an entrypoint needs the handler, then it shall consume the shared `wire` module.
normative-clause: "Both entrypoints MUST consume THIS module, so CLI and MCP are contract-identical **by construction**, not by copy"

### REQ-CLI-1a — total command surface
source: INV-CLI-1 @ reference/atlas-adapters.md#cli-1
`atlas <cmd>` shall map each command to exactly one wired tool leg, plus `mine` driving genesis.
normative-clause: "`atlas <cmd>` MUST map each command to exactly one wired tool leg (plus `mine` driving genesis)."

### REQ-CLI-1b — malformed invocation is structured
source: INV-CLI-1 @ reference/atlas-adapters.md#cli-1
If an invocation is malformed, then the CLI shall yield a structured error with guidance and a non-zero exit.
normative-clause: "a malformed invocation yields a structured error + guidance and a non-zero exit"

### REQ-CLI-1c — parser never crashes
source: INV-CLI-1 @ reference/atlas-adapters.md#cli-1
If an invocation is malformed, then the CLI shall not crash.
normative-clause: "never a crash"

### REQ-CLI-2a — reads resolve over the CLI
source: INV-CLI-2 @ reference/atlas-adapters.md#cli-2
Reads (`query`/`reconcile`/`doctor`) shall resolve over the CLI directly.
normative-clause: "Reads (`query`/`reconcile`/`doctor`) MUST resolve over the CLI directly"

### REQ-CLI-2b — writes funnel through a governed write door
source: INV-CLI-2 @ reference/atlas-adapters.md#cli-2
If a command writes, then it shall funnel through a governed write door (`atlas-emit` / `atlas-link`).
normative-clause: "every write MUST funnel through a governed write door (`atlas-emit` / `atlas-link`) (TOOLS-1/TOOLS-11 CLI-floor, ADR-0003)."

### REQ-CLI-2c — a read carries no write authority
source: INV-CLI-2 @ reference/atlas-adapters.md#cli-2
If a command is a read, then it shall carry no write authority.
normative-clause: "A read command MUST carry no write authority."

### REQ-CLI-3a — deterministic verdict render
source: INV-CLI-3 @ reference/atlas-adapters.md#cli-3
The CLI shall render a tool Verdict to stdout deterministically.
normative-clause: "The CLI MUST render a tool `Verdict` to stdout deterministically"

### REQ-CLI-3b — exit code reflects the verdict
source: INV-CLI-3 @ reference/atlas-adapters.md#cli-3
When rendering a verdict, the CLI shall set the exit code from it (`0` ok, non-zero on rejected/error).
normative-clause: "set the exit code from the verdict (`0` ok, non-zero on rejected/error)"

### REQ-CLI-3c — render is reproducible
source: INV-CLI-3 @ reference/atlas-adapters.md#cli-3
If the same verdict is rendered more than once, then the CLI output shall be identical.
normative-clause: "render a tool `Verdict` to stdout deterministically"

### REQ-CLI-3d — render carries guidance
source: INV-CLI-3 @ reference/atlas-adapters.md#cli-3
When rendering a verdict, the CLI shall carry the tool's guidance in the output.
normative-clause: "carrying the tool's `guidance` (TOOLS-4)."

### REQ-CLI-4a — mine drives the frozen run-controller
source: INV-CLI-4 @ reference/atlas-adapters.md#cli-4
`atlas mine` shall drive the already-frozen genesis run-controller as a single governed pass over a real repo.
normative-clause: "`atlas mine` MUST drive the **already-frozen** `genesis` run-controller (`→ genesis` run-controller, atlas-genesis reference) as a single governed pass over a real repo"

### REQ-CLI-4b — mine mints candidates only
source: INV-CLI-4 @ reference/atlas-adapters.md#cli-4
If `atlas mine` writes, then every write shall be candidate-only and never ratified.
normative-clause: "minting **candidate-only** writes (never ratified)"

### REQ-CLI-4c — mine invents no admission
source: INV-CLI-4 @ reference/atlas-adapters.md#cli-4
If admission is required, then the `mine` driver shall rely on the frozen run-controller and add none of its own.
normative-clause: "the `mine` driver wires the parts and **invents no admission of its own**."

### REQ-CLI-7a — promote publishes only through the existing emit door
source: INV-CLI-7 @ reference/atlas-adapters.md#cli-7
`atlas promote` shall carry the explorer's staged candidates into governed knowledge by presenting each one to the existing `atlas-emit` governed write door, minting no new governed tool and opening no second write medium.
normative-clause: "`atlas promote` MUST carry the explorer's STAGED candidates into governed knowledge by presenting each one to the existing `atlas-emit` governed write door — it MUST NOT mint a new governed tool and MUST NOT open a second write medium, so `GOVERNANCE_SURFACE` and `WRITE_PATHS` are unchanged"

### REQ-CLI-7b — every promoted candidate faces full ratification
source: INV-CLI-7 @ reference/atlas-adapters.md#cli-7
If a staged candidate is promoted, then it shall face full ratification under a ratification context the door derived, and shall not be accepted by the confidence fast path.
normative-clause: "Every staged candidate MUST face FULL ratification: the door MUST supply a ratification context it DERIVED (the write came out of staging), never one the payload chose"

### REQ-CLI-7c — the derivation is stated truthfully
source: INV-CLI-7 @ reference/atlas-adapters.md#cli-7
If the door derives that the fast path does not apply, then it shall express that derivation without asserting a store-state verdict that is not true of the candidate.
normative-clause: "and MUST NOT express that by asserting a store-state verdict that is not true of the candidate"

### REQ-CLI-7d — a refusal is per row
source: INV-CLI-7 @ reference/atlas-adapters.md#cli-7
If one staged candidate cannot be promoted, then the pass shall refuse that row by name and continue with the remaining candidates.
normative-clause: "A refusal MUST be PER-ROW — one unpromotable candidate MUST NOT end the pass"

### REQ-CLI-7e — the reported count is settled
source: INV-CLI-7 @ reference/atlas-adapters.md#cli-7
`atlas promote` shall report the number of candidates that were made durable, never the number attempted.
normative-clause: "the count reported MUST be what SETTLED durably, never what was attempted"

### REQ-CLI-7f — a refused staging read is not an empty staging
source: INV-CLI-7 @ reference/atlas-adapters.md#cli-7
If the staging read refuses, then `atlas promote` shall report a refusal and shall not report zero candidates.
normative-clause: "A staging read that REFUSES MUST be reported as a refusal and MUST NOT degrade to \"0 candidates\""

### REQ-MCP-1a — the published set is the closed tool union   (amended ADR-0006)
source: INV-MCP-1 @ reference/atlas-adapters.md#mcp-1
The MCP stdio server shall publish exactly the members of the closed `Tool` union (`GOVERNANCE_SURFACE ∪ READ_SURFACE`) with their input schemas.
normative-clause: "The MCP stdio server MUST publish exactly the members of the closed `Tool` union — `GOVERNANCE_SURFACE ∪ READ_SURFACE`"

### REQ-MCP-1b — no tool outside the union   (amended ADR-0006)
source: INV-MCP-1 @ reference/atlas-adapters.md#mcp-1
If a tool is published over MCP, then it shall be a member of the closed `Tool` union.
normative-clause: "No tool outside the union may be published or invocable."

### REQ-MCP-1d — advertised and invocable are derived and equal   (added ADR-0006)
source: INV-MCP-1 @ reference/atlas-adapters.md#mcp-1
The advertised set and the invocable set shall both be derived from the one closed `Tool` union and shall be equal.
normative-clause: "The advertised set and the invocable set MUST both be DERIVED from that one union and MUST be equal; neither may be assembled independently (ARCH-5)."

### REQ-MCP-1e — no independent drift   (added ADR-0006)
source: INV-MCP-1 @ reference/atlas-adapters.md#mcp-1
If the advertised set and the invocable set are computed separately, then the surface conformance gate shall fail.
normative-clause: "neither may be assembled independently (ARCH-5)"

### REQ-MCP-1c — MCP and CLI verdicts are identical
source: INV-MCP-1 @ reference/atlas-adapters.md#mcp-1
When a tool is called over MCP, the server shall route it through the shared WiredHandler so the verdict is contract-identical to the equivalent CLI call.
normative-clause: "route every call through the shared `WiredHandler` (WIRE-1) — so an MCP call and the equivalent CLI call return contract-identical verdicts (TOOLS-3, by construction)."

### REQ-MCP-2a — tool error surfaces as rejected verdict
source: INV-MCP-2 @ reference/atlas-adapters.md#mcp-2
If a tool errors, then the server shall surface a structured rejected Verdict in the MCP result.
normative-clause: "A tool error MUST surface as a structured rejected `Verdict` carried in the MCP result"

### REQ-MCP-2b — server does not crash on tool error
source: INV-MCP-2 @ reference/atlas-adapters.md#mcp-2
If a tool errors, then the server shall not crash.
normative-clause: "the server MUST NOT crash"

### REQ-MCP-2c — fail-closed verdict is never dropped
source: INV-MCP-2 @ reference/atlas-adapters.md#mcp-2
If a tool errors, then the server shall not drop the fail-closed verdict (no empty or ok result on error).
normative-clause: "the server MUST NOT crash or drop the fail-closed verdict (TOOLS-2 across the transport)."

## [NEEDS RECONCILIATION]
- None new at S1. The register specifies every invariant fully; no design silence or contradiction surfaced
  during the lift. The S0 phase-deferred impl-DEFINEs (D4 disk-CAS layout · D5 the LLM · D6 the forge host) and
  the stale `MECHANISMS` code constant carry forward unchanged — none blocks a requirement.
