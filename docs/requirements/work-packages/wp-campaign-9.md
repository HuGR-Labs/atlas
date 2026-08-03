# Work Packages — CAMPAIGN-9 (state S4)

> The productization ring: real **adapters** + **entrypoints** over the pure layer-0 hexagon. One **WP-card**
> per (epic × module), conforming to [`method/wp-template.md`](../../method/wp-template.md). Every substantive
> field is a `ptr+digest` (the digest is tooling-filled at freeze — the pointer carries a `# ptr+digest` marker,
> no fabricated hashes); `content_hash` is `<filled-at-freeze>`; the `exec` fields
> (`outputs`/`provenance`/`trace_ref`) are present-but-empty. `intent` is the one prose carve-out
> (non-authoritative, executor-invisible).
>
> **Campaign coverage:** 10 leaf epics · 15 WPs · 55 REQs (ADAPTER 34 + WIRE 2 + CLI 13 + MCP 6) · REQ→WP =
> total function (each REQ owned by exactly one WP; orphans/doubles = 0). **Seam-freezes = 6** frozen
> cross-boundary contracts (8 declarations): 2 owned-in-ring (WiredHandler: WIRE→CLI/MCP · durable StoreApi:
> STORE→KNOWLEDGE) + 4 consumed-from-frozen (index-inputs FS/SCIP→INDEX · kernel StoreApi core→STORE · genesis
> run-controller+SiteProposer→mine · persist host-adapter core→FORGE). The ONE core-touching WP is
> **WP-9.2.4.KNOWLEDGE** (binds the parked `writeDecision` front-door — sequenced + reviewed as a core binding,
> the only WP that edits a core package).

---

## CAMPAIGN-9.1 — read a real repo (Phase 0: init/query floor)

### EPIC-1-a — one wired handler behind a total CLI

### WP-9.1.1-a.WIRE — WIRE slice of EPIC-1-a
epic: EPIC-1-a
id: WP-9.1.1-a.WIRE
content_hash: <filled-at-freeze>
title: One shared wire module assembles the five-leg WiredHandler
intent: >
  A single shared `wire` module assembles the five-leg `WiredHandler` (`atlas-init/query/emit/reconcile/link` legs;
  the `atlas-link` leg added by WP-SAMEAS, ADR-0003) over the adapters, and both entrypoints consume THIS module — so CLI and MCP are contract-identical by
  construction, not by copy. WIRE owns the handler contract; CLI and MCP consume it. (Non-authoritative handle.)
source_reqs:                                  # ptr+digest
  - source: ../requirements-adapters.md#REQ-WIRE-1a  # ptr+digest
  - source: ../requirements-adapters.md#REQ-WIRE-1b  # ptr+digest
seam-freezes: [ "WiredHandler contract owned-by WIRE, consumed-by CLI and MCP" ]
anchor: packages/adapter-io/src/wire.ts — the shared `createHandler(adapters)` assembling the five-leg WiredHandler (→ tools/handler.ts)
interface_contract:                           # ptr+digest
  - source: ../../reference/atlas-adapters.md#wire-1  # ptr+digest
  - source: ../method-tags-adapters.md#INV-WIRE-1     # ptr+digest
exclusions: >
  No command parsing / render / exit codes (WP-9.1.1-a.CLI); no MCP transport (WP-9.4.7.MCP); no adapter
  implementations (EPIC-1-b onward) — this assembles the five legs over the injected adapters, nothing more.
inputs:                                        # ptr+digest
  - source: ../../reference/atlas-adapters.md#wire-1  # ptr+digest
action: Implement the shared `wire` module that assembles exactly one five-leg `WiredHandler` over the adapters; verify a single instance exposes the five legs and that the module is the sole assembly point both entrypoints import.
action_surface: [ read-repo, edit(packages/adapter-io/src/wire.ts), run(test:adapter-io), typecheck ]
guardrails: >
  Edit only under packages/adapter-io/src/wire.ts. Assemble exactly ONE handler (no per-entrypoint copy). Do not
  reach into packages/cli, packages/mcp-server, or any core package. No transport, no argv, no render here.
repair_budget: N=3 · early-stop: { repeated-identical-failure, no-change-diff, semantic-dup-edit }
acceptance:                                    # ptr+digest = frozen goldens
  - source: ../goldens-adapters.md#SCN-WIRE-1a-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-WIRE-1b-1  # ptr+digest
deps: [ ]   parallel_group: [P] — foundational entrypoint seam, no in-campaign predecessor
exit_predicate: all acceptance SCNs green ∧ one WiredHandler instance shared by both entrypoints (module-identity holds) ∧ module gates (typecheck/lint) pass ∧ all pointer digests resolve (no STALE)
context_refs:                                  # closed list
  - source: ../../reference/atlas-adapters.md
  - source: ../requirements-adapters.md
  - source: ../goldens-adapters.md
  - source: ../method-tags-adapters.md
owner: charlie · builder_id: <assigned-at-dispatch>
outputs:                                                    # exec — empty at S4-freeze
provenance:                                                 # exec — empty at S4-freeze
trace_ref:                                                  # exec — empty at S4-freeze
rationale:                                     # ptr
  - source: ../invariant-register-adapters.md#INV-WIRE-1

### WP-9.1.1-a.CLI — CLI slice of EPIC-1-a
epic: EPIC-1-a
id: WP-9.1.1-a.CLI
content_hash: <filled-at-freeze>
title: Total command surface · read/write authority floor · deterministic verdict render
intent: >
  `atlas <cmd>` maps each command to exactly one wired tool leg (plus `mine`); parsing is total (a malformed
  invocation yields a structured error + guidance + non-zero exit, never a crash); reads resolve directly and
  every write funnels through the single door `atlas-emit` with a read carrying no write authority; the CLI
  renders a `Verdict` deterministically, sets the exit code from it, and carries the tool's guidance. Consumes
  the WiredHandler frozen upstream in WIRE. (Non-authoritative handle.)
source_reqs:                                  # ptr+digest
  - source: ../requirements-adapters.md#REQ-CLI-1a  # ptr+digest
  - source: ../requirements-adapters.md#REQ-CLI-1b  # ptr+digest
  - source: ../requirements-adapters.md#REQ-CLI-1c  # ptr+digest
  - source: ../requirements-adapters.md#REQ-CLI-2a  # ptr+digest
  - source: ../requirements-adapters.md#REQ-CLI-2b  # ptr+digest
  - source: ../requirements-adapters.md#REQ-CLI-2c  # ptr+digest
  - source: ../requirements-adapters.md#REQ-CLI-3a  # ptr+digest
  - source: ../requirements-adapters.md#REQ-CLI-3b  # ptr+digest
  - source: ../requirements-adapters.md#REQ-CLI-3c  # ptr+digest
  - source: ../requirements-adapters.md#REQ-CLI-3d  # ptr+digest
seam-freezes: [ "WiredHandler contract consumed-from WIRE (frozen upstream in WP-9.1.1-a.WIRE)" ]
anchor: packages/cli/src/ — the command parser (command→leg map · authority matrix) + the deterministic Verdict renderer
interface_contract:                           # ptr+digest
  - source: ../../reference/atlas-adapters.md#cli-1   # ptr+digest
  - source: ../../reference/atlas-adapters.md#cli-2   # ptr+digest
  - source: ../../reference/atlas-adapters.md#cli-3   # ptr+digest
  - source: ../method-tags-adapters.md#INV-CLI-1      # ptr+digest
  - source: ../method-tags-adapters.md#INV-CLI-2      # ptr+digest
  - source: ../method-tags-adapters.md#INV-CLI-3      # ptr+digest
exclusions: >
  No `mine` driver (WP-9.3.6-b.CLI); no handler assembly (WP-9.1.1-a.WIRE); no adapter implementations; no MCP
  transport (WP-9.4.7.MCP). Consumes the WiredHandler as frozen — does not re-assemble it.
inputs:                                        # ptr+digest
  - source: ../../reference/atlas-adapters.md#cli-1   # ptr+digest
  - source: ../../reference/atlas-adapters.md#cli-2   # ptr+digest
  - source: ../../reference/atlas-adapters.md#cli-3   # ptr+digest
action: Implement the CLI command parser (total command→leg map, read/write authority partition) and the deterministic Verdict renderer over the frozen WiredHandler; verify every command maps to exactly one leg, malformed argv yields a structured non-zero error (never a crash), reads carry no write authority, and the render is byte-identical with the exit code a function of the verdict.
action_surface: [ read-repo, edit(packages/cli/src/**), run(test:cli), typecheck ]
guardrails: >
  Edit only under packages/cli/**. Do not re-assemble the handler — import the shared WIRE module. Every write
  MUST funnel through `atlas-emit`; a read command MUST carry no write authority. No timestamp/nonce in the
  render. Parser MUST NOT throw on malformed input. Do not touch adapter-io, mcp-server, or any core package.
repair_budget: N=3 · early-stop: { repeated-identical-failure, no-change-diff, semantic-dup-edit }
acceptance:                                    # ptr+digest = frozen goldens
  - source: ../goldens-adapters.md#SCN-CLI-1a-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-CLI-1b-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-CLI-1c-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-CLI-2a-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-CLI-2b-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-CLI-2c-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-CLI-3a-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-CLI-3b-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-CLI-3c-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-CLI-3d-1  # ptr+digest
deps: [ WP-9.1.1-a.WIRE ]
exit_predicate: all acceptance SCNs green ∧ command→leg map total+mutually-exclusive ∧ malformed-argv fuzz 0 crashes ∧ render byte-identical + exitCode==f(status) ∧ module gates pass ∧ all pointer digests resolve (no STALE)
context_refs:                                  # closed list
  - source: ../../reference/atlas-adapters.md
  - source: ../requirements-adapters.md
  - source: ../goldens-adapters.md
  - source: ../method-tags-adapters.md
owner: charlie · builder_id: <assigned-at-dispatch>
outputs:                                                    # exec — empty at S4-freeze
provenance:                                                 # exec — empty at S4-freeze
trace_ref:                                                  # exec — empty at S4-freeze
rationale:                                     # ptr
  - source: ../invariant-register-adapters.md#INV-CLI-1
  - source: ../invariant-register-adapters.md#INV-CLI-2
  - source: ../invariant-register-adapters.md#INV-CLI-3

---

### EPIC-1-b — atlas init builds a real single-language index

### WP-9.1.1-b.FS — FS slice of EPIC-1-b
epic: EPIC-1-b
id: WP-9.1.1-b.FS
content_hash: <filled-at-freeze>
title: Faithful filesystem walker → the exact FileTree, .gitignore-honoring, deterministic
intent: >
  The filesystem walker produces the exact `FileTree` (paths, nesting, leaf `content`) for a real repo path in
  a deterministic order, honoring `.gitignore`; it neither fabricates nor omits a tracked file and yields
  byte-identical output across two walks. (Non-authoritative handle.)
source_reqs:                                  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-1a  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-1b  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-1c  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-1d  # ptr+digest
seam-freezes: [ ]
anchor: packages/adapter-io/src/fs.ts — the filesystem walker realizing the FileTree input (→ FileTree@index/types.ts)
interface_contract:                           # ptr+digest
  - source: ../../reference/atlas-adapters.md#adapt-fs-1  # ptr+digest
  - source: ../method-tags-adapters.md#INV-ADAPTER-1      # ptr+digest
exclusions: >
  No SCIP reading (WP-9.1.1-b.SCIP); no @atlas/index driving (WP-9.1.1-b.INDEX); no sub-file AST units
  (WP-9.1.2.AST); no multi-language dispatch (WP-9.1.2.SCIP). File tree only.
inputs:                                        # ptr+digest
  - source: ../../reference/atlas-adapters.md#adapt-fs-1  # ptr+digest
action: Implement the filesystem walker to produce the exact FileTree in a deterministic, .gitignore-honoring order; verify deepEqual against the reference tree, that no gitignored/absent path is emitted, that a tracked no-indexer file is present, and that two walks are byte-identical.
action_surface: [ read-repo, edit(packages/adapter-io/src/fs.ts), run(test:adapter-io), typecheck ]
guardrails: >
  Edit only under packages/adapter-io/src/fs.ts. Honor `.gitignore`. MUST NOT fabricate or omit a tracked file.
  No per-walk value (wall-clock/nonce) on a node — derive purely from bytes. Do not touch other modules/core.
repair_budget: N=3 · early-stop: { repeated-identical-failure, no-change-diff, semantic-dup-edit }
acceptance:                                    # ptr+digest = frozen goldens
  - source: ../goldens-adapters.md#SCN-ADAPTER-1a-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-ADAPTER-1b-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-ADAPTER-1c-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-ADAPTER-1d-1  # ptr+digest
deps: [ ]   parallel_group: [P] — foundational adapter, no in-campaign predecessor
exit_predicate: all acceptance SCNs green ∧ walk==reference-tree ∧ gitignored/absent paths absent ∧ tracked set fully present ∧ two walks byte-identical ∧ module gates pass ∧ all pointer digests resolve (no STALE)
context_refs:                                  # closed list
  - source: ../../reference/atlas-adapters.md
  - source: ../requirements-adapters.md
  - source: ../goldens-adapters.md
  - source: ../method-tags-adapters.md
owner: charlie · builder_id: <assigned-at-dispatch>
outputs:                                                    # exec — empty at S4-freeze
provenance:                                                 # exec — empty at S4-freeze
trace_ref:                                                  # exec — empty at S4-freeze
rationale:                                     # ptr
  - source: ../invariant-register-adapters.md#INV-ADAPTER-1

### WP-9.1.1-b.SCIP — SCIP slice of EPIC-1-b
epic: EPIC-1-b
id: WP-9.1.1-b.SCIP
content_hash: <filled-at-freeze>
title: SCIP reader → ScipOutput, read not invented (dangling stays unresolved)
intent: >
  The SCIP reader parses a `.scip` protobuf index into the frozen `ScipOutput` (per-document
  `definition`/`reference` occurrences only); a reference with no in-index definition stays unresolved
  (`to: null`); the reader never synthesizes a symbol or edge the `.scip` does not contain. (Non-authoritative.)
source_reqs:                                  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-2a  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-2b  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-2c  # ptr+digest
seam-freezes: [ ]
anchor: packages/adapter-io/src/scip.ts — the `.scip` protobuf reader realizing ScipOutput (→ ScipOutput@index/types.ts)
interface_contract:                           # ptr+digest
  - source: ../../reference/atlas-adapters.md#adapt-scip-1  # ptr+digest
  - source: ../method-tags-adapters.md#INV-ADAPTER-2        # ptr+digest
exclusions: >
  No multi-language dispatch/merge (WP-9.1.2.SCIP); no file walking (WP-9.1.1-b.FS); no @atlas/index driving
  (WP-9.1.1-b.INDEX). Single-index read fidelity only.
inputs:                                        # ptr+digest
  - source: ../../reference/atlas-adapters.md#adapt-scip-1  # ptr+digest
action: Implement the `.scip` reader to yield exactly the fixture's definition/reference occurrences; verify a dangling reference resolves to `to: null` and 0 symbols/edges absent from the `.scip` are synthesized.
action_surface: [ read-repo, edit(packages/adapter-io/src/scip.ts), run(test:adapter-io), typecheck ]
guardrails: >
  Edit only under packages/adapter-io/src/scip.ts. Emit ONLY occurrences present in the `.scip`. A dangling ref
  MUST stay `to: null` — never resolve to a same-named symbol. Do not touch other modules/core.
repair_budget: N=3 · early-stop: { repeated-identical-failure, no-change-diff, semantic-dup-edit }
acceptance:                                    # ptr+digest = frozen goldens
  - source: ../goldens-adapters.md#SCN-ADAPTER-2a-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-ADAPTER-2b-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-ADAPTER-2c-1  # ptr+digest
deps: [ ]   parallel_group: [P] — foundational adapter, no in-campaign predecessor
exit_predicate: all acceptance SCNs green ∧ ScipOutput==fixture occurrence set ∧ dangling ref → to:null ∧ 0 synthesized symbol/edge ∧ module gates pass ∧ all pointer digests resolve (no STALE)
context_refs:                                  # closed list
  - source: ../../reference/atlas-adapters.md
  - source: ../requirements-adapters.md
  - source: ../goldens-adapters.md
  - source: ../method-tags-adapters.md
owner: charlie · builder_id: <assigned-at-dispatch>
outputs:                                                    # exec — empty at S4-freeze
provenance:                                                 # exec — empty at S4-freeze
trace_ref:                                                  # exec — empty at S4-freeze
rationale:                                     # ptr
  - source: ../invariant-register-adapters.md#INV-ADAPTER-2

### WP-9.1.1-b.INDEX — INDEX slice of EPIC-1-b
epic: EPIC-1-b
id: WP-9.1.1-b.INDEX
content_hash: <filled-at-freeze>
title: Index-backing adapter drives @atlas/index — pure delegation, no own ranking
intent: >
  The index-backing adapter satisfies `MoveInIndex` (→ tools/init.ts) and `QueryIndex` (→ tools/query.ts) by
  driving `@atlas/index` `build`/`resolve`/`coverage` over the frozen walker + SCIP outputs; it introduces no
  ranking or resolution of its own. Consumes the FS + SCIP outputs (frozen upstream) and @atlas/index.
  (Non-authoritative handle.)
source_reqs:                                  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-5a  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-5b  # ptr+digest
seam-freezes: [ "FS FileTree + SCIP ScipOutput consumed-from WP-9.1.1-b.FS/WP-9.1.1-b.SCIP (frozen upstream) + @atlas/index seam" ]
anchor: packages/adapter-io/src/index-adapter.ts — MoveInIndex/QueryIndex driving @atlas/index over the walker+SCIP outputs
interface_contract:                           # ptr+digest
  - source: ../../reference/atlas-adapters.md#adapt-index-1  # ptr+digest
  - source: ../method-tags-adapters.md#INV-ADAPTER-5         # ptr+digest
exclusions: >
  No walking (WP-9.1.1-b.FS), no SCIP parsing (WP-9.1.1-b.SCIP), no dispatch (WP-9.1.2.SCIP), no AST fold
  (WP-9.1.2.AST). Does NOT redefine @atlas/index — drives it; introduces no ranking/resolution of its own.
inputs:                                        # ptr+digest
  - source: ../../reference/atlas-adapters.md#adapt-index-1  # ptr+digest
action: Implement the index-backing adapter that drives @atlas/index build/resolve/coverage over the frozen walker + SCIP outputs; verify deepEqual against @atlas/index over the same inputs and that a resolution spy proves every resolution originated in @atlas/index (0 computed in the adapter).
action_surface: [ read-repo, edit(packages/adapter-io/src/index-adapter.ts), run(test:adapter-io), typecheck ]
guardrails: >
  Edit only under packages/adapter-io/src/index-adapter.ts. Pure delegation — 0 local ranking/resolution. Consume
  FS + SCIP outputs and @atlas/index as frozen; do not re-implement them. Do not touch other modules/core.
repair_budget: N=3 · early-stop: { repeated-identical-failure, no-change-diff, semantic-dup-edit }
acceptance:                                    # ptr+digest = frozen goldens
  - source: ../goldens-adapters.md#SCN-ADAPTER-5a-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-ADAPTER-5b-1  # ptr+digest
deps: [ WP-9.1.1-b.FS, WP-9.1.1-b.SCIP ]
exit_predicate: all acceptance SCNs green ∧ adapterOutput==@atlas/index ∧ resolution-spy count==resolutions (0 adapter-local) ∧ module gates pass ∧ all pointer digests resolve (no STALE)
context_refs:                                  # closed list
  - source: ../../reference/atlas-adapters.md
  - source: ../requirements-adapters.md
  - source: ../goldens-adapters.md
  - source: ../method-tags-adapters.md
owner: charlie · builder_id: <assigned-at-dispatch>
outputs:                                                    # exec — empty at S4-freeze
provenance:                                                 # exec — empty at S4-freeze
trace_ref:                                                  # exec — empty at S4-freeze
rationale:                                     # ptr
  - source: ../invariant-register-adapters.md#INV-ADAPTER-5

---

### EPIC-2 — multi-language + sub-file index refinement

### WP-9.1.2.SCIP — SCIP slice of EPIC-2
epic: EPIC-2
id: WP-9.1.2.SCIP
content_hash: <filled-at-freeze>
title: Multi-language SCIP dispatch by LangId, honest hole for un-indexed languages
intent: >
  For a repo spanning languages, the ring runs the correct per-language SCIP indexer (`IndexerPlan` by `LangId`)
  and merges the `.scip` outputs; a language with no configured indexer contributes its files to the `FileTree`
  only (an honest structural hole) and causes no fabricated or dropped edge for any other language.
  (Non-authoritative handle.)
source_reqs:                                  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-3a  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-3b  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-3c  # ptr+digest
seam-freezes: [ ]
anchor: packages/adapter-io/src/scip.ts — the multi-language dispatch layer (IndexerPlan by LangId + merge). This adapter's LangId→IndexerPlan dispatch is the live selector and SUPERSEDES the stale core `MECHANISMS` constant (`genesis/rank.ts:82`, which still lists 'stack-graphs' per the S0 DRIFT note); this WP MUST NOT reproduce 'stack-graphs' in its dispatch table (D1: web-tree-sitter + SCIP only). The core `MECHANISMS` constant itself is OUT OF SCOPE here — see exclusions.
interface_contract:                           # ptr+digest
  - source: ../../reference/atlas-adapters.md#adapt-scip-2  # ptr+digest
  - source: ../method-tags-adapters.md#INV-ADAPTER-3        # ptr+digest
exclusions: >
  No single-index read fidelity (WP-9.1.1-b.SCIP, consumed as frozen); no AST fold (WP-9.1.2.AST); no file
  walking (WP-9.1.1-b.FS). Dispatch + merge honesty only. The stale `MECHANISMS` constant in the CORE
  `genesis/rank.ts:82` is NOT edited by this ring WP (guardrails forbid all core edits; only WP-9.2.4.KNOWLEDGE
  touches core) — its cleanup is a deferred, separately-tracked core-hygiene item (S0 register: non-freeze-
  blocking, nothing consumes it to select an indexer). This WP only ensures the adapter's own dispatch omits
  'stack-graphs'; the goldens (ADAPTER-3a/b/c) verify the dispatch, not the core constant.
inputs:                                        # ptr+digest
  - source: ../../reference/atlas-adapters.md#adapt-scip-2  # ptr+digest
action: Implement the LangId→IndexerPlan dispatch and `.scip` merge; verify the dispatch table is total (every repo LangId routes to exactly one of {indexer, honest-hole}), the un-indexed language is files-only, and no other language's edges are fabricated or dropped.
action_surface: [ read-repo, edit(packages/adapter-io/src/scip.ts), run(test:adapter-io), typecheck ]
guardrails: >
  Edit only under packages/adapter-io/src/scip.ts. Dispatch MUST be total. An un-indexed language is a files-only
  hole — never dropped, never routed to another language's indexer. Preserve INDEX-13 cross-language honesty.
  Do not touch other modules/core.
repair_budget: N=3 · early-stop: { repeated-identical-failure, no-change-diff, semantic-dup-edit }
acceptance:                                    # ptr+digest = frozen goldens
  - source: ../goldens-adapters.md#SCN-ADAPTER-3a-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-ADAPTER-3b-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-ADAPTER-3c-1  # ptr+digest
deps: [ WP-9.1.1-b.SCIP ]
exit_predicate: all acceptance SCNs green ∧ dispatch total+mutually-exclusive ∧ un-indexed language files-only (0 edges) ∧ 0 fabricated/dropped edge cross-language ∧ module gates pass ∧ all pointer digests resolve (no STALE)
context_refs:                                  # closed list
  - source: ../../reference/atlas-adapters.md
  - source: ../requirements-adapters.md
  - source: ../goldens-adapters.md
  - source: ../method-tags-adapters.md
owner: charlie · builder_id: <assigned-at-dispatch>
outputs:                                                    # exec — empty at S4-freeze
provenance:                                                 # exec — empty at S4-freeze
trace_ref:                                                  # exec — empty at S4-freeze
rationale:                                     # ptr
  - source: ../invariant-register-adapters.md#INV-ADAPTER-3

### WP-9.1.2.AST — AST slice of EPIC-2
epic: EPIC-2
id: WP-9.1.2.AST
content_hash: <filled-at-freeze>
title: Deterministic web-tree-sitter sub-file units (additive refinement)
intent: >
  The `web-tree-sitter` layer, when enabled, folds sub-file structural units (item/block) into the `FileTree`
  spatial rail deterministically (same bytes ⇒ same units); it is additive — with it absent the index is
  file-level and still valid. (Non-authoritative handle.)
source_reqs:                                  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-4a  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-4b  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-4c  # ptr+digest
seam-freezes: [ ]
anchor: packages/adapter-io/src/ast.ts — the web-tree-sitter fold of sub-file units into the FileTree spatial rail (additive)
interface_contract:                           # ptr+digest
  - source: ../../reference/atlas-adapters.md#adapt-ast-1  # ptr+digest
  - source: ../method-tags-adapters.md#INV-ADAPTER-4       # ptr+digest
exclusions: >
  No file walking (WP-9.1.1-b.FS, consumed as frozen); no SCIP read/dispatch (WP-9.1.1-b.SCIP / WP-9.1.2.SCIP);
  no @atlas/index driving. Additive sub-file fold only — MUST NOT invalidate the file-level index when absent.
inputs:                                        # ptr+digest
  - source: ../../reference/atlas-adapters.md#adapt-ast-1  # ptr+digest
action: Implement the additive web-tree-sitter fold of deterministic sub-file units over the frozen FileTree; verify identical bytes fold to the identical reference unit set every run, repeated folds are byte-identical, and the file-level index stays valid with the layer disabled.
action_surface: [ read-repo, edit(packages/adapter-io/src/ast.ts), run(test:adapter-io), typecheck ]
guardrails: >
  Edit only under packages/adapter-io/src/ast.ts. Additive ONLY — the file-level index MUST stay valid with the
  layer absent. Unit ids/order derive from byte offsets, never a fold-scoped counter or wall-clock. Do not touch
  other modules/core.
repair_budget: N=3 · early-stop: { repeated-identical-failure, no-change-diff, semantic-dup-edit }
acceptance:                                    # ptr+digest = frozen goldens
  - source: ../goldens-adapters.md#SCN-ADAPTER-4a-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-ADAPTER-4b-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-ADAPTER-4c-1  # ptr+digest
deps: [ WP-9.1.1-b.FS ]
exit_predicate: all acceptance SCNs green ∧ same bytes ⇒ same units (enabled) ∧ repeated folds byte-identical ∧ file-level index valid (disabled) ∧ module gates pass ∧ all pointer digests resolve (no STALE)
context_refs:                                  # closed list
  - source: ../../reference/atlas-adapters.md
  - source: ../requirements-adapters.md
  - source: ../goldens-adapters.md
  - source: ../method-tags-adapters.md
owner: charlie · builder_id: <assigned-at-dispatch>
outputs:                                                    # exec — empty at S4-freeze
provenance:                                                 # exec — empty at S4-freeze
trace_ref:                                                  # exec — empty at S4-freeze
rationale:                                     # ptr
  - source: ../invariant-register-adapters.md#INV-ADAPTER-4

---

## CAMPAIGN-9.2 — durable knowledge (Phase 1: emit/reconcile persist)

### EPIC-3 — durable content-addressed store

### WP-9.2.3.STORE — STORE slice of EPIC-3
epic: EPIC-3
id: WP-9.2.3.STORE
content_hash: <filled-at-freeze>
title: Durable tamper-safe disk StoreApi + cross-process projection rehydrate
intent: >
  The disk store implements `StoreApi` (`put(obj)→Hash`, `get(h)→CasObject|undefined`) over persistent storage
  so an object put in one process is byte-identical `get`-retrievable in a later process, and a value whose
  `id(value) !== key` reads as absent (tamper-safe); on a fresh process it reconstructs the `StoreProjection`
  current-node map from disk, minting nothing. Consumes the kernel `StoreApi` (frozen core seam).
  (Non-authoritative handle.)
source_reqs:                                  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-6a   # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-6b   # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-6c   # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-12a  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-12b  # ptr+digest
seam-freezes: [ "kernel StoreApi consumed-from @atlas/kernel (frozen core seam)", "durable StoreApi owned-by STORE, consumed-by KNOWLEDGE" ]
anchor: packages/adapter-io/src/store.ts — the disk StoreApi (durable put/get, D4 `.atlas/cas/` sharded) + StoreProjection rehydrate (→ kernel/store.ts)
interface_contract:                           # ptr+digest
  - source: ../../reference/atlas-adapters.md#adapt-store-1  # ptr+digest
  - source: ../../reference/atlas-adapters.md#adapt-store-3  # ptr+digest
  - source: ../method-tags-adapters.md#INV-ADAPTER-6         # ptr+digest
  - source: ../method-tags-adapters.md#INV-ADAPTER-12        # ptr+digest
exclusions: >
  No governed write binding (WP-9.2.4.KNOWLEDGE); no git forge (WP-9.4.8.FORGE); no drift (WP-9.2.5.DRIFT).
  Does NOT redefine the kernel StoreApi — implements it durably over disk. Durability + rehydrate only.
inputs:                                        # ptr+digest
  - source: ../../reference/atlas-adapters.md#adapt-store-1  # ptr+digest
  - source: ../../reference/atlas-adapters.md#adapt-store-3  # ptr+digest
action: Implement the durable disk StoreApi (D4 `.atlas/cas/` sharded `<h[0:2]>/<h>`) and the fresh-process StoreProjection rehydrate; verify a put in process A is byte-identical get in fresh process B, a tampered on-disk value reads as absent, the flushed fact rehydrates byte-identical, and a write-spy records 0 mint/alter during rehydration.
action_surface: [ read-repo, edit(packages/adapter-io/src/store.ts), run(test:adapter-io), typecheck ]
guardrails: >
  Edit only under packages/adapter-io/src/store.ts. Store MUST be durable (flush to disk, not memory-only). On
  read MUST verify `id(value) === key` and treat a mismatch as absent. Rehydrate reconstructs state only — mint
  nothing. Consume the kernel StoreApi as frozen. Do not touch other modules/core.
repair_budget: N=3 · early-stop: { repeated-identical-failure, no-change-diff, semantic-dup-edit }
acceptance:                                    # ptr+digest = frozen goldens
  - source: ../goldens-adapters.md#SCN-ADAPTER-6a-1   # ptr+digest
  - source: ../goldens-adapters.md#SCN-ADAPTER-6b-1   # ptr+digest
  - source: ../goldens-adapters.md#SCN-ADAPTER-6c-1   # ptr+digest
  - source: ../goldens-adapters.md#SCN-ADAPTER-12a-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-ADAPTER-12b-1  # ptr+digest
deps: [ ]   parallel_group: [P] — foundational persistence floor, no in-campaign predecessor
exit_predicate: all acceptance SCNs green ∧ cross-process byte-identical get ∧ tampered value → undefined ∧ flushed fact rehydrates byte-identical, 0 mint ∧ module gates pass ∧ all pointer digests resolve (no STALE)
context_refs:                                  # closed list
  - source: ../../reference/atlas-adapters.md
  - source: ../requirements-adapters.md
  - source: ../goldens-adapters.md
  - source: ../method-tags-adapters.md
owner: charlie · builder_id: <assigned-at-dispatch>
outputs:                                                    # exec — empty at S4-freeze
provenance:                                                 # exec — empty at S4-freeze
trace_ref:                                                  # exec — empty at S4-freeze
rationale:                                     # ptr
  - source: ../invariant-register-adapters.md#INV-ADAPTER-6
  - source: ../invariant-register-adapters.md#INV-ADAPTER-12

---

### EPIC-4 — governed dedup/supersede write lands durably

### WP-9.2.4.KNOWLEDGE — KNOWLEDGE slice of EPIC-4
epic: EPIC-4
id: WP-9.2.4.KNOWLEDGE
content_hash: <filled-at-freeze>
title: Bind the parked writeDecision front-door — governed durable dedup/supersede (CORE BINDING)
intent: >
  To land one governed dedup/supersede write durably, the parked `writeDecision(candidate,cfg)` front-door is
  bound: compute `nodeKey(candidate)`, probe the durable store for the contentHash (D0) and nodeKey (D1) hits, call the
  existing `routeWrite`, apply `upsert`, and flush the projection through the store — idempotent
  (`write∘write ≡ write`) and order-independent under supersede, inventing no new routing. This is the ONLY
  core-touching WP: it edits a core package (`packages/knowledge`) and is sequenced + reviewed as a core
  binding. Consumes the durable StoreApi frozen upstream in STORE. (Non-authoritative handle.)
source_reqs:                                  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-7a  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-7b  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-7c  # ptr+digest
seam-freezes: [ "durable StoreApi consumed-from STORE (frozen upstream, EPIC-3)" ]
anchor: packages/knowledge/src/write/router.ts — bind the PARKED `writeDecision(candidate,cfg)` front-door (CORE BINDING — nodeKey→probe→routeWrite→upsert→flush)
interface_contract:                           # ptr+digest
  - source: ../../reference/atlas-adapters.md#adapt-store-2  # ptr+digest
  - source: ../method-tags-adapters.md#INV-ADAPTER-7         # ptr+digest
exclusions: >
  Does NOT implement the durable store (WP-9.2.3.STORE, consumed as frozen); no rehydrate (WP-9.2.3.STORE);
  no forge (WP-9.4.8.FORGE). Invents NO new routing — binds the existing `routeWrite`/`upsert` only. Touches
  exactly the parked `writeDecision` front-door, nothing else in the core.
inputs:                                        # ptr+digest
  - source: ../../reference/atlas-adapters.md#adapt-store-2  # ptr+digest
action: Bind the parked `writeDecision` front-door to compose nodeKey→durable-probe→routeWrite→upsert→flush over the frozen durable StoreApi; verify the binding composes those steps, a governed write of the same fact twice lands once, a supersede lands one head in either delivery order, and the bound decision equals `routeWrite`'s on the same inputs (0 new routing).
action_surface: [ read-repo, edit(packages/knowledge/src/write/router.ts), run(test:knowledge), typecheck ]
guardrails: >
  CORE BINDING — edit ONLY packages/knowledge/src/write/router.ts (the parked `writeDecision` front-door); touch
  no other file in packages/knowledge or any core package. Invent NO new routing — delegate to the existing
  `routeWrite`/`upsert`. MUST flush the projection through the durable store (no memory-only landing). Consume
  the durable StoreApi as frozen. Sequenced + reviewed as a core binding, not an outer-ring adapter.
repair_budget: N=3 · early-stop: { repeated-identical-failure, no-change-diff, semantic-dup-edit }
acceptance:                                    # ptr+digest = frozen goldens
  - source: ../goldens-adapters.md#SCN-ADAPTER-7a-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-ADAPTER-7b-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-ADAPTER-7b-2  # ptr+digest
  - source: ../goldens-adapters.md#SCN-ADAPTER-7c-1  # ptr+digest
deps: [ WP-9.2.3.STORE ]
exit_predicate: all acceptance SCNs green (PBT idempotence + supersede-order witnesses) ∧ write∘write≡write over the durable store ∧ supersede order-independent ∧ boundDecision==routeWrite ∧ core gates pass ∧ all pointer digests resolve (no STALE)
context_refs:                                  # closed list
  - source: ../../reference/atlas-adapters.md
  - source: ../requirements-adapters.md
  - source: ../goldens-adapters.md
  - source: ../method-tags-adapters.md
owner: charlie · builder_id: <assigned-at-dispatch>
outputs:                                                    # exec — empty at S4-freeze
provenance:                                                 # exec — empty at S4-freeze
trace_ref:                                                  # exec — empty at S4-freeze
rationale:                                     # ptr
  - source: ../invariant-register-adapters.md#INV-ADAPTER-7

---

### EPIC-5 — atlas reconcile classifies drift over a real merge-base

### WP-9.2.5.DRIFT — DRIFT slice of EPIC-5
epic: EPIC-5
id: WP-9.2.5.DRIFT
content_hash: <filled-at-freeze>
title: DriftSource over git merge-base feeds reconcile's mechanical-vs-semantic classification
intent: >
  `DriftSource` computes drifted anchors across a git merge-base so `atlas-reconcile` can classify mechanical
  vs semantic (TOOLS-8 `exitCode` law unchanged); drift is computed across the merge-base and nothing else.
  (Non-authoritative handle.)
source_reqs:                                  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-9a  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-9b  # ptr+digest
seam-freezes: [ ]
anchor: packages/adapter-io/src/git-drift.ts — DriftSource computing drifted anchors across the git merge-base (→ tools/reconcile.ts)
interface_contract:                           # ptr+digest
  - source: ../../reference/atlas-adapters.md#adapt-git-2  # ptr+digest
  - source: ../method-tags-adapters.md#INV-ADAPTER-9       # ptr+digest
exclusions: >
  No history ranking (WP-9.3.6-a.HISTORY); no forge (WP-9.4.8.FORGE); no store (EPIC-3). Does NOT change the
  TOOLS-8 exitCode law — feeds the classification only. Merge-base drift computation only.
inputs:                                        # ptr+digest
  - source: ../../reference/atlas-adapters.md#adapt-git-2  # ptr+digest
action: Implement DriftSource over the git merge-base; verify the drifted-anchor set equals the `mb → topic` diff and that a change shared on both tips after the merge-base is excluded (drift is merge-base-only, not a two-tip or fixed-window diff).
action_surface: [ read-repo, edit(packages/adapter-io/src/git-drift.ts), run(test:adapter-io), typecheck ]
guardrails: >
  Edit only under packages/adapter-io/src/git-drift.ts. Drift MUST be computed across the git merge-base and
  nothing else (not two-tip, not a fixed HEAD window). Do not alter the TOOLS-8 exitCode law. Do not touch other
  modules/core.
repair_budget: N=3 · early-stop: { repeated-identical-failure, no-change-diff, semantic-dup-edit }
acceptance:                                    # ptr+digest = frozen goldens
  - source: ../goldens-adapters.md#SCN-ADAPTER-9a-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-ADAPTER-9b-1  # ptr+digest
deps: [ ]   parallel_group: [P] — foundational git adapter, no in-campaign predecessor
exit_predicate: all acceptance SCNs green ∧ anchor set == merge-base diff ∧ shared post-mb change excluded ∧ module gates pass ∧ all pointer digests resolve (no STALE)
context_refs:                                  # closed list
  - source: ../../reference/atlas-adapters.md
  - source: ../requirements-adapters.md
  - source: ../goldens-adapters.md
  - source: ../method-tags-adapters.md
owner: charlie · builder_id: <assigned-at-dispatch>
outputs:                                                    # exec — empty at S4-freeze
provenance:                                                 # exec — empty at S4-freeze
trace_ref:                                                  # exec — empty at S4-freeze
rationale:                                     # ptr
  - source: ../invariant-register-adapters.md#INV-ADAPTER-9

---

## CAMPAIGN-9.3 — cold-start mining (Phase 2: LLM seed)

### EPIC-6-a — deterministic history ranking (the $0 seed floor)

### WP-9.3.6-a.HISTORY — HISTORY slice of EPIC-6-a
epic: EPIC-6-a
id: WP-9.3.6-a.HISTORY
content_hash: <filled-at-freeze>
title: HistorySource over real git — deterministic for a fixed rev, mints no fact
intent: >
  `HistorySource` is backed by real `git log`/`blame`/coupling over a rev, deterministic for a fixed rev; it
  feeds ranking only and never mints a fact (the GEN structural-only guarantee). (Non-authoritative handle.)
source_reqs:                                  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-8a  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-8b  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-8c  # ptr+digest
seam-freezes: [ ]
anchor: packages/adapter-io/src/git-history.ts — HistorySource (real git log/blame/coupling over a rev) feeding ranking (→ genesis/rank.ts)
interface_contract:                           # ptr+digest
  - source: ../../reference/atlas-adapters.md#adapt-git-1  # ptr+digest
  - source: ../method-tags-adapters.md#INV-ADAPTER-8       # ptr+digest
exclusions: >
  No drift (WP-9.2.5.DRIFT); no forge (WP-9.4.8.FORGE); no LLM proposal (WP-9.3.6-b.LLM); no mine driver
  (WP-9.3.6-b.CLI). Feeds ranking only — MUST NOT mint a fact.
inputs:                                        # ptr+digest
  - source: ../../reference/atlas-adapters.md#adapt-git-1  # ptr+digest
action: Implement HistorySource over real git log/blame/coupling at a rev; verify the signals equal real git output at the fixed rev, are byte-identical across two runs, and a write-spy records 0 fact mints during ranking.
action_surface: [ read-repo, edit(packages/adapter-io/src/git-history.ts), run(test:adapter-io), typecheck ]
guardrails: >
  Edit only under packages/adapter-io/src/git-history.ts. Back signals with REAL git (no hardcoded stub).
  Deterministic for a fixed rev (no wall-clock-seeded ordering). MUST NOT mint a fact — feeds ranking only.
  Do not touch other modules/core.
repair_budget: N=3 · early-stop: { repeated-identical-failure, no-change-diff, semantic-dup-edit }
acceptance:                                    # ptr+digest = frozen goldens
  - source: ../goldens-adapters.md#SCN-ADAPTER-8a-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-ADAPTER-8b-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-ADAPTER-8c-1  # ptr+digest
deps: [ ]   parallel_group: [P] — foundational git adapter, no in-campaign predecessor
exit_predicate: all acceptance SCNs green ∧ signals == real git at r0 ∧ byte-identical across runs ∧ write-spy 0 mints ∧ module gates pass ∧ all pointer digests resolve (no STALE)
context_refs:                                  # closed list
  - source: ../../reference/atlas-adapters.md
  - source: ../requirements-adapters.md
  - source: ../goldens-adapters.md
  - source: ../method-tags-adapters.md
owner: charlie · builder_id: <assigned-at-dispatch>
outputs:                                                    # exec — empty at S4-freeze
provenance:                                                 # exec — empty at S4-freeze
trace_ref:                                                  # exec — empty at S4-freeze
rationale:                                     # ptr
  - source: ../invariant-register-adapters.md#INV-ADAPTER-8

---

### EPIC-6-b — bounded LLM proposal + the mine driver

### WP-9.3.6-b.LLM — LLM slice of EPIC-6-b
epic: EPIC-6-b
id: WP-9.3.6-b.LLM
content_hash: <filled-at-freeze>
title: SiteProposer.propose — the single bounded, non-authoritative model entry
intent: >
  `SiteProposer.propose` is the ONLY place a model is invoked in the whole system; it makes one bounded call
  per site honoring the cost/timeout budget and returns a candidate proposal that is never auto-trusted (the
  2-door admission + ratification still gate it). The core stays `$0`-LLM. (Non-authoritative handle.)
source_reqs:                                  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-11a  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-11b  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-11c  # ptr+digest
seam-freezes: [ ]
anchor: packages/adapter-io/src/llm.ts — SiteProposer, the single model entry point (→ genesis/extract.ts)
interface_contract:                           # ptr+digest
  - source: ../../reference/atlas-adapters.md#adapt-llm-1  # ptr+digest
  - source: ../method-tags-adapters.md#INV-ADAPTER-11      # ptr+digest
exclusions: >
  No history ranking (WP-9.3.6-a.HISTORY); no mine driver (WP-9.3.6-b.CLI); no admission logic (owned by the
  frozen genesis run-controller). The single bounded model call only — no live model in CI (spy proposer).
inputs:                                        # ptr+digest
  - source: ../../reference/atlas-adapters.md#adapt-llm-1  # ptr+digest
action: Implement SiteProposer.propose as the single model seam; verify (via a spy proposer + module-graph audit) that a model is invoked only here, exactly one bounded call per site within budget, and the return enters as a gated candidate (never auto-trusted).
action_surface: [ read-repo, edit(packages/adapter-io/src/llm.ts), run(test:adapter-io), typecheck ]
guardrails: >
  Edit only under packages/adapter-io/src/llm.ts. This MUST be the sole model call site in the system. Exactly
  one bounded call per site (honor cost/timeout budget — no retries past budget). Return a candidate — never
  write to the ratified store / bypass the 2-door gate. No live model in CI. Do not touch other modules/core.
repair_budget: N=3 · early-stop: { repeated-identical-failure, no-change-diff, semantic-dup-edit }
acceptance:                                    # ptr+digest = frozen goldens
  - source: ../goldens-adapters.md#SCN-ADAPTER-11a-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-ADAPTER-11b-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-ADAPTER-11c-1  # ptr+digest
deps: [ ]   parallel_group: [P] — foundational LLM adapter, no in-campaign predecessor
exit_predicate: all acceptance SCNs green ∧ 0 out-of-band model call sites ∧ ≤1 bounded call/site ∧ proposal enters as gated candidate ∧ module gates pass ∧ all pointer digests resolve (no STALE)
context_refs:                                  # closed list
  - source: ../../reference/atlas-adapters.md
  - source: ../requirements-adapters.md
  - source: ../goldens-adapters.md
  - source: ../method-tags-adapters.md
owner: charlie · builder_id: <assigned-at-dispatch>
outputs:                                                    # exec — empty at S4-freeze
provenance:                                                 # exec — empty at S4-freeze
trace_ref:                                                  # exec — empty at S4-freeze
rationale:                                     # ptr
  - source: ../invariant-register-adapters.md#INV-ADAPTER-11

### WP-9.3.6-b.CLI — CLI(mine) slice of EPIC-6-b
epic: EPIC-6-b
id: WP-9.3.6-b.CLI
content_hash: <filled-at-freeze>
title: The `atlas mine` driver composes the frozen run-controller — candidate-only, admits nothing
intent: >
  `atlas mine` drives the already-frozen `genesis` run-controller as a single governed pass over a real repo,
  minting candidate-only writes (never ratified); the driver wires the frozen parts and invents no admission of
  its own. Consumes the frozen genesis run-controller and the SiteProposer frozen upstream in LLM.
  (Non-authoritative handle.)
source_reqs:                                  # ptr+digest
  - source: ../requirements-adapters.md#REQ-CLI-4a  # ptr+digest
  - source: ../requirements-adapters.md#REQ-CLI-4b  # ptr+digest
  - source: ../requirements-adapters.md#REQ-CLI-4c  # ptr+digest
seam-freezes: [ "genesis run-controller (frozen core seam) + SiteProposer consumed-from WP-9.3.6-b.LLM (frozen upstream)" ]
anchor: packages/cli/src/mine.ts — the `mine` driver over the frozen genesis run-controller (candidate-only pass)
interface_contract:                           # ptr+digest
  - source: ../../reference/atlas-adapters.md#cli-4    # ptr+digest
  - source: ../method-tags-adapters.md#INV-CLI-4       # ptr+digest
exclusions: >
  No command parser / render (WP-9.1.1-a.CLI); no LLM proposal implementation (WP-9.3.6-b.LLM); no history
  ranking (WP-9.3.6-a.HISTORY). Ring-scoped composition only — the `scan→rank→extract→admit→align→seed` stages
  are GEN's frozen invariants; the driver invents NO admission of its own.
inputs:                                        # ptr+digest
  - source: ../../reference/atlas-adapters.md#cli-4    # ptr+digest
action: Implement the `atlas mine` driver over the frozen genesis run-controller (with the frozen SiteProposer + HistorySource); verify the produced write-set equals the run-controller's over the same inputs, every mined write is candidate-only (never ratified), and the driver adds 0 admission of its own.
action_surface: [ read-repo, edit(packages/cli/src/mine.ts), run(test:cli), typecheck ]
guardrails: >
  Edit only under packages/cli/src/mine.ts. Drive the frozen run-controller — do NOT re-order the stages or add
  a local admission pre-filter. Every mined write MUST be candidate-only (never ratified). Consume the genesis
  run-controller + SiteProposer as frozen. Do not touch adapter-io internals, mcp-server, or any core package.
repair_budget: N=3 · early-stop: { repeated-identical-failure, no-change-diff, semantic-dup-edit }
acceptance:                                    # ptr+digest = frozen goldens
  - source: ../goldens-adapters.md#SCN-CLI-4a-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-CLI-4b-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-CLI-4c-1  # ptr+digest
deps: [ WP-9.3.6-b.LLM, WP-9.3.6-a.HISTORY, WP-9.1.1-a.CLI ]
exit_predicate: all acceptance SCNs green ∧ mine write-set == run-controller's ∧ every write candidate-only ∧ admitted set == run-controller's (0 admission invented) ∧ module gates pass ∧ all pointer digests resolve (no STALE)
context_refs:                                  # closed list
  - source: ../../reference/atlas-adapters.md
  - source: ../requirements-adapters.md
  - source: ../goldens-adapters.md
  - source: ../method-tags-adapters.md
owner: charlie · builder_id: <assigned-at-dispatch>
outputs:                                                    # exec — empty at S4-freeze
provenance:                                                 # exec — empty at S4-freeze
trace_ref:                                                  # exec — empty at S4-freeze
rationale:                                     # ptr
  - source: ../invariant-register-adapters.md#INV-CLI-4

---

### WP-PROMOTE.CLI — CLI(promote) slice of EPIC-6-b
epic: EPIC-6-b
id: WP-PROMOTE.CLI
content_hash: <filled-at-freeze>
title: The `atlas promote` curator door — staged candidates into governed knowledge, through the ratifier
intent: >
  `atlas mine` stages candidates and nothing reads them back, so KNOW-8's measurable holds VACUOUSLY —
  severance, not ratification. This WP builds the missing route: a CLI-only `atlas promote` that reads the
  staging sidecar, rehydrates each candidate's whole fact from CAS, and presents it to the EXISTING
  `atlas-emit` governed write door (ADR-0008 pre-decided that a curator door is an ordinary use of that door,
  NOT new surface). The load-bearing detail is the ratification context: a mined candidate is `T2` ∧ advisory
  ∧ grounded, so under the door's default context it AUTO-ACCEPTS and the ratifier is never consulted — which
  would make KNOW-8 false rather than vacuous. The door therefore supplies a DERIVED origin that removes the
  fast path, expressed as a true field rather than as a forged store-state verdict.
source_reqs:                                  # ptr+digest
  - source: ../requirements-adapters.md#REQ-CLI-7a  # ptr+digest
  - source: ../requirements-adapters.md#REQ-CLI-7b  # ptr+digest
  - source: ../requirements-adapters.md#REQ-CLI-7c  # ptr+digest
  - source: ../requirements-adapters.md#REQ-CLI-7d  # ptr+digest
  - source: ../requirements-adapters.md#REQ-CLI-7e  # ptr+digest
  - source: ../requirements-adapters.md#REQ-CLI-7f  # ptr+digest
seam-freezes: [ "the governed emit door (createGovernedEmit) + the KNOW-18 route + DiskStore.commitStaging, all consumed as frozen" ]
anchor: packages/cli/src/promote.ts + packages/adapter-io/src/governed-promote.ts — the CLI leg and the door
interface_contract:                           # ptr+digest
  - source: ../../reference/atlas-adapters.md#cli-7    # ptr+digest
  - source: ../method-tags-adapters.md#INV-CLI-7       # ptr+digest
exclusions: >
  No sixth governed tool and no third write door — `GOVERNANCE_SURFACE` stays 5, `WRITE_PATHS` stays
  `{atlas-emit, atlas-link}`, and INV-TOOLS-1 / ADR-0003 / the spec-conformance CODE-SURFACE pin are
  untouched. No new `DiskStore` member (staging is read through the store's documented read-only decision).
  No staging-side "promoted" marker and no second mutable state machine — staging has no delete and the two
  sidecars have no shared commit. NOT this WP: wiring the mine admission gate (`makeAdmitGate` has no
  production caller, so `atlas mine` stages nothing today), and wiring `genesis/src/align.ts` (a DECLARED
  reference model — that is a ledger + gate change).
inputs:                                        # ptr+digest
  - source: ../../reference/atlas-adapters.md#cli-7    # ptr+digest
action: Build the governed promotion door and its CLI leg; verify a staged candidate cannot auto-accept, that the reported count is what settled, that a bytes-missing / degenerate-anchor row is that row's refusal, that a refused staging read is never rendered as an empty staging, and that a mined identity colliding with a governed node (including a LEGACY carrier-less row) fails closed.
action_surface: [ read-repo, edit(packages/cli/src/promote.ts), edit(packages/adapter-io/src/governed-promote.ts), run(test:cli), run(test:adapter-io), run(test:e2e-blackbox), typecheck ]
guardrails: >
  Publish ONLY through `createGovernedEmit` — re-implement no gate. Do not add a `DiskStore` member. Do not
  express "the fast path does not apply" by forging `contested`/`lowRisk`. Do not edit `.atlas/policy.json`.
  Report SETTLED counts only. Keep every file at or under the 400-LOC ceiling.
repair_budget: N=3 · early-stop: { repeated-identical-failure, no-change-diff, semantic-dup-edit }
acceptance:                                    # ptr+digest = frozen goldens
  - source: ../goldens-adapters.md#SCN-CLI-7a-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-CLI-7b-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-CLI-7c-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-CLI-7d-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-CLI-7e-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-CLI-7f-1  # ptr+digest
deps: [ WP-9.3.6-b.CLI, WP-9.1.1-a.CLI ]
exit_predicate: all acceptance SCNs green ∧ GOVERNANCE_SURFACE == 5 ∧ WRITE_PATHS == {atlas-emit, atlas-link} ∧ 0 new DiskStore members ∧ promoted count == rows the projection gained ∧ module gates pass ∧ all pointer digests resolve (no STALE)
context_refs:                                  # closed list
  - source: ../../reference/atlas-adapters.md
  - source: ../requirements-adapters.md
  - source: ../goldens-adapters.md
  - source: ../method-tags-adapters.md
owner: charlie · builder_id: <assigned-at-dispatch>
outputs:                                                    # exec — empty at S4-freeze
provenance:                                                 # exec — empty at S4-freeze
trace_ref:                                                  # exec — empty at S4-freeze
rationale:                                     # ptr
  - source: ../invariant-register-adapters.md#INV-CLI-7

---

## CAMPAIGN-9.4 — serve + write-back (Phase 3: MCP + forge)

### EPIC-7 — the MCP server exposes the five governed tools

### WP-9.4.7.MCP — MCP slice of EPIC-7
epic: EPIC-7
id: WP-9.4.7.MCP
content_hash: <filled-at-freeze>
title: MCP stdio server — exactly the five governed tools, fail-closed, shared handler
intent: >
  The MCP stdio server publishes GOVERNANCE_SURFACE ∪ READ_SURFACE with their input schemas and routes every call
  through the shared `WiredHandler`, so an MCP call and the equivalent CLI call return contract-identical
  verdicts; a tool error surfaces as a structured rejected `Verdict` and the server never crashes or drops the
  fail-closed verdict. Consumes the WiredHandler frozen upstream in WIRE. (Non-authoritative handle.)
source_reqs:                                  # ptr+digest
  - source: ../requirements-adapters.md#REQ-MCP-1a  # ptr+digest
  - source: ../requirements-adapters.md#REQ-MCP-1b  # ptr+digest
  - source: ../requirements-adapters.md#REQ-MCP-1c  # ptr+digest
  - source: ../requirements-adapters.md#REQ-MCP-2a  # ptr+digest
  - source: ../requirements-adapters.md#REQ-MCP-2b  # ptr+digest
  - source: ../requirements-adapters.md#REQ-MCP-2c  # ptr+digest
seam-freezes: [ "WiredHandler consumed-from WIRE (frozen upstream, EPIC-1-a)" ]
anchor: packages/mcp-server/src/ — the stdio server (five governed tools + schemas, fail-closed transport) over the shared WiredHandler
interface_contract:                           # ptr+digest
  - source: ../../reference/atlas-adapters.md#mcp-1    # ptr+digest
  - source: ../../reference/atlas-adapters.md#mcp-2    # ptr+digest
  - source: ../method-tags-adapters.md#INV-MCP-1       # ptr+digest
  - source: ../method-tags-adapters.md#INV-MCP-2       # ptr+digest
exclusions: >
  No handler assembly (WP-9.1.1-a.WIRE, consumed as frozen); no CLI parser/render (WP-9.1.1-a.CLI); no adapter
  implementations. Exactly the five tools — no sixth. Transport wiring + fail-closed only.
inputs:                                        # ptr+digest
  - source: ../../reference/atlas-adapters.md#mcp-1    # ptr+digest
  - source: ../../reference/atlas-adapters.md#mcp-2    # ptr+digest
action: Implement the MCP stdio server over the shared WiredHandler; verify the published set equals exactly {atlas-init, atlas-query, atlas-emit, atlas-reconcile, atlas-link} with schemas (no sixth, ADR-0003), every call routes through the shared handler with a verdict byte-identical to the CLI's, and a throwing tool surfaces a structured rejected Verdict without crashing or dropping it.
action_surface: [ read-repo, edit(packages/mcp-server/src/**), run(test:mcp-server), typecheck ]
guardrails: >
  Edit only under packages/mcp-server/**. Publish EXACTLY the five governed tools (no sixth, ADR-0003). Route every call
  through the shared WiredHandler — do not copy-assemble a handler. On tool error surface a fail-closed rejected
  Verdict; never crash, never emit an empty/ok result. Do not touch adapter-io, cli, or any core package.
repair_budget: N=3 · early-stop: { repeated-identical-failure, no-change-diff, semantic-dup-edit }
acceptance:                                    # ptr+digest = frozen goldens
  - source: ../goldens-adapters.md#SCN-MCP-1a-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-MCP-1b-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-MCP-1c-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-MCP-2a-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-MCP-2b-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-MCP-2c-1  # ptr+digest
deps: [ WP-9.1.1-a.WIRE ]
exit_predicate: all acceptance SCNs green ∧ published set == the closed five (cardinality 5, with schemas) ∧ MCP verdict == CLI verdict via shared handler ∧ tool error → fail-closed rejected Verdict, 0 crash/drop ∧ module gates pass ∧ all pointer digests resolve (no STALE)
context_refs:                                  # closed list
  - source: ../../reference/atlas-adapters.md
  - source: ../requirements-adapters.md
  - source: ../goldens-adapters.md
  - source: ../method-tags-adapters.md
owner: charlie · builder_id: <assigned-at-dispatch>
outputs:                                                    # exec — empty at S4-freeze
provenance:                                                 # exec — empty at S4-freeze
trace_ref:                                                  # exec — empty at S4-freeze
rationale:                                     # ptr
  - source: ../invariant-register-adapters.md#INV-MCP-1
  - source: ../invariant-register-adapters.md#INV-MCP-2

---

### EPIC-8 — the forge carries the atlas onto a real host

### WP-9.4.8.FORGE — FORGE slice of EPIC-8
epic: EPIC-8
id: WP-9.4.8.FORGE
content_hash: <filled-at-freeze>
title: Forge carries the atlas onto a real host — rewrite-honest, executes PERSIST-* semantics unchanged
intent: >
  The `Forge` writes the provenance trailer + a `refs/notes/orchestra` note + the PR projection onto a real
  host; a history rewrite keeps trailer data and orphans note-carried data exactly as PERSIST-* specifies — the
  adapter executes that semantics, never alters it. Consumes the persist/host-adapter semantics (frozen core
  seam). (Non-authoritative handle.)
source_reqs:                                  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-10a  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-10b  # ptr+digest
  - source: ../requirements-adapters.md#REQ-ADAPTER-10c  # ptr+digest
seam-freezes: [ "persist/host-adapter semantics consumed-from @atlas/persist (frozen core seam)" ]
anchor: packages/adapter-io/src/git-forge.ts — the Forge writing trailer + refs/notes/orchestra note + PR projection (→ persist/host-adapter.ts)
interface_contract:                           # ptr+digest
  - source: ../../reference/atlas-adapters.md#adapt-git-3  # ptr+digest
  - source: ../method-tags-adapters.md#INV-ADAPTER-10      # ptr+digest
exclusions: >
  No store (WP-9.2.3.STORE, consumed as frozen); no drift (WP-9.2.5.DRIFT); no history (WP-9.3.6-a.HISTORY).
  Does NOT define the trailer/note/orphan semantics (owned by PERSIST-*) — executes them, changes none.
inputs:                                        # ptr+digest
  - source: ../../reference/atlas-adapters.md#adapt-git-3  # ptr+digest
action: Implement the Forge over a git-sandbox host; verify it writes the provenance trailer + a `refs/notes/orchestra` note + the PR projection, that a rebase keeps the trailer and orphans the note-carried data exactly as PERSIST-* specifies, and that the observed outcome equals the PERSIST-* oracle at every step (0 semantics altered).
action_surface: [ read-repo, edit(packages/adapter-io/src/git-forge.ts), run(test:adapter-io), typecheck ]
guardrails: >
  Edit only under packages/adapter-io/src/git-forge.ts. Note MUST land under `refs/notes/orchestra` (not the
  default namespace). A rewrite MUST keep the trailer and orphan the note per PERSIST-* — never re-point or drop
  it. Execute PERSIST-* semantics, change NONE. Tested against a local git sandbox, never a live host. Do not
  touch other modules/core.
repair_budget: N=3 · early-stop: { repeated-identical-failure, no-change-diff, semantic-dup-edit }
acceptance:                                    # ptr+digest = frozen goldens
  - source: ../goldens-adapters.md#SCN-ADAPTER-10a-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-ADAPTER-10b-1  # ptr+digest
  - source: ../goldens-adapters.md#SCN-ADAPTER-10c-1  # ptr+digest
deps: [ WP-9.2.3.STORE ]
exit_predicate: all acceptance SCNs green ∧ trailer + orchestra note + PR projection written ∧ rewrite keeps trailer + orphans note per PERSIST-* ∧ outcome == PERSIST-* oracle (0 altered) ∧ module gates pass ∧ all pointer digests resolve (no STALE)
context_refs:                                  # closed list
  - source: ../../reference/atlas-adapters.md
  - source: ../requirements-adapters.md
  - source: ../goldens-adapters.md
  - source: ../method-tags-adapters.md
owner: charlie · builder_id: <assigned-at-dispatch>
outputs:                                                    # exec — empty at S4-freeze
provenance:                                                 # exec — empty at S4-freeze
trace_ref:                                                  # exec — empty at S4-freeze
rationale:                                     # ptr
  - source: ../invariant-register-adapters.md#INV-ADAPTER-10

---

## Completion report

- **WP-set:** `docs/requirements/work-packages/wp-campaign-9.md`
- **WP count:** 15 (one per epic × module, over the 10 leaf epics of `roadmap-adapters.md`).
- **REQ → WP partition (total function, orphans 0 · doubles 0 · 55/55):**

  | WP | epic | source_reqs | n | acceptance SCNs | n |
  |---|---|---|---|---|---|
  | WP-9.1.1-a.WIRE | EPIC-1-a | WIRE-1a/1b | 2 | WIRE-1a-1, 1b-1 | 2 |
  | WP-9.1.1-a.CLI | EPIC-1-a | CLI-1a/1b/1c, 2a/2b/2c, 3a/3b/3c/3d | 10 | CLI-1a-1,1b-1,1c-1,2a-1,2b-1,2c-1,3a-1,3b-1,3c-1,3d-1 | 10 |
  | WP-9.1.1-b.FS | EPIC-1-b | ADAPTER-1a/1b/1c/1d | 4 | ADAPTER-1a-1,1b-1,1c-1,1d-1 | 4 |
  | WP-9.1.1-b.SCIP | EPIC-1-b | ADAPTER-2a/2b/2c | 3 | ADAPTER-2a-1,2b-1,2c-1 | 3 |
  | WP-9.1.1-b.INDEX | EPIC-1-b | ADAPTER-5a/5b | 2 | ADAPTER-5a-1,5b-1 | 2 |
  | WP-9.1.2.SCIP | EPIC-2 | ADAPTER-3a/3b/3c | 3 | ADAPTER-3a-1,3b-1,3c-1 | 3 |
  | WP-9.1.2.AST | EPIC-2 | ADAPTER-4a/4b/4c | 3 | ADAPTER-4a-1,4b-1,4c-1 | 3 |
  | WP-9.2.3.STORE | EPIC-3 | ADAPTER-6a/6b/6c, 12a/12b | 5 | ADAPTER-6a-1,6b-1,6c-1,12a-1,12b-1 | 5 |
  | WP-9.2.4.KNOWLEDGE | EPIC-4 | ADAPTER-7a/7b/7c | 3 | ADAPTER-7a-1,7b-1,7b-2,7c-1 | 4 |
  | WP-9.2.5.DRIFT | EPIC-5 | ADAPTER-9a/9b | 2 | ADAPTER-9a-1,9b-1 | 2 |
  | WP-9.3.6-a.HISTORY | EPIC-6-a | ADAPTER-8a/8b/8c | 3 | ADAPTER-8a-1,8b-1,8c-1 | 3 |
  | WP-9.3.6-b.LLM | EPIC-6-b | ADAPTER-11a/11b/11c | 3 | ADAPTER-11a-1,11b-1,11c-1 | 3 |
  | WP-9.3.6-b.CLI | EPIC-6-b | CLI-4a/4b/4c | 3 | CLI-4a-1,4b-1,4c-1 | 3 |
  | WP-9.4.7.MCP | EPIC-7 | MCP-1a/1b/1c, 2a/2b/2c | 6 | MCP-1a-1,1b-1,1c-1,2a-1,2b-1,2c-1 | 6 |
  | WP-9.4.8.FORGE | EPIC-8 | ADAPTER-10a/10b/10c | 3 | ADAPTER-10a-1,10b-1,10c-1 | 3 |
  | **total** | | | **55** | | **56** |

  - **REQ coverage:** 55/55 REQs owned by exactly one WP (each REQ appears in exactly one `source_reqs` — orphans 0, doubles 0). The WP partition = the roadmap's 10-leaf-epic partition, re-sliced by module (EPIC-1-a→{WIRE,CLI}, EPIC-1-b→{FS,SCIP,INDEX}, EPIC-2→{SCIP,AST}, EPIC-6-b→{LLM,CLI}; the other 6 leaf epics are single-module).
  - **acceptance = DoD:** each WP's `acceptance[]` = exactly the frozen SCNs of its `source_reqs` (56 SCNs total; the +1 vs REQ count is the second ADAPTER-7b witness `SCN-ADAPTER-7b-2`, the supersede-ordering golden, owned by WP-9.2.4.KNOWLEDGE).

- **Seam-freezes (6 frozen cross-boundary contracts · 8 declarations):**
  1. **WiredHandler** — owned-by WP-9.1.1-a.WIRE; consumed-by WP-9.1.1-a.CLI + WP-9.4.7.MCP (owned-in-ring).
  2. **index-inputs** (FS FileTree + SCIP ScipOutput) — consumed-by WP-9.1.1-b.INDEX from WP-9.1.1-b.FS/SCIP + @atlas/index (frozen upstream).
  3. **kernel StoreApi** — consumed-by WP-9.2.3.STORE from @atlas/kernel (frozen core seam).
  4. **durable StoreApi** — owned-by WP-9.2.3.STORE; consumed-by WP-9.2.4.KNOWLEDGE (owned-in-ring; EPIC-3→EPIC-4).
  5. **genesis run-controller + SiteProposer** — consumed-by WP-9.3.6-b.CLI from the frozen genesis core + WP-9.3.6-b.LLM.
  6. **persist/host-adapter semantics** — consumed-by WP-9.4.8.FORGE from @atlas/persist (frozen core seam).

- **Core binding (the only core-touching WP):** WP-9.2.4.KNOWLEDGE edits `packages/knowledge/src/write/router.ts`
  (binds the parked `writeDecision` front-door) — flagged in intent/anchor/guardrails, sequenced behind
  WP-9.2.3.STORE and reviewed as a core binding. Every other WP edits only new outer-ring packages
  (`@atlas/adapter-io`, `@atlas/cli`, `@atlas/mcp-server`); the core stays untouched and pure.

- **Parallel groups `[P]` (deps-free foundational WPs):** WP-9.1.1-a.WIRE · WP-9.1.1-b.FS · WP-9.1.1-b.SCIP ·
  WP-9.2.3.STORE · WP-9.2.5.DRIFT · WP-9.3.6-a.HISTORY · WP-9.3.6-b.LLM (7).

- **Self-check:** 15 cards in canonical column-0 syntax · every substantive field a `ptr+digest` (no prose copy;
  `intent` the sole carve-out) · `content_hash: <filled-at-freeze>` · `exec` fields present-but-empty ·
  `acceptance` = source_reqs' frozen goldens · every card carries `anchor` + `interface_contract` + `exclusions`
  + `action_surface` + `guardrails` + `repair_budget`.

- → next_state **EXECUTION** (the execution machine consumes these frozen cards; digests tooling-filled at freeze).
