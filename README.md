# Atlas

**Layer 0: a shared, grounded knowledge layer for a codebase.** The Atlas is a content-addressed,
git-native substrate that lets an AI coding agent (or a human) ask *what is true about this code, and
is it still true?* — and get a deterministic, drift-checked answer. No embeddings, no RAG: retrieval is
a hashed structural index (BLAKE3-merkle CAS) resolved by scope, dependency blast-radius, and trigger.

> **Status.** All ten campaigns are built, including **campaign 10 — the authoring surface**, whose card
> carries its own audited close (`docs/requirements/work-packages/wp-campaign-10.md`: *ALL 16 WPs BUILT —
> campaign closed*). `npm run layer-guard` now reports the read partition as bound rather than uncovered,
> which is the mechanical fact that retires the older claim.
>
> **What this paragraph deliberately does NOT say is a built-COUNT**, and that is a real gap rather than an
> omission. Two earlier versions of this line each asserted one — *"all 72 Work Packages"*, then *"87 of
> 103"* — and neither was derivable from anything in the tree: only campaign 10's card records a build
> status at all, so no gate could ever have contradicted them. The corpus totals below ARE derivable and
> are printed by `npm run id-integrity`; a per-WP build ledger does not exist yet, and until it does this
> README will not claim a number it cannot show you the derivation of.
>
> The Atlas is consumed one-way by downstream orchestrators (e.g. **Orchestra**, its first consumer) — it
> never depends on them.
>
> **New here?** Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) — the module graph, where things live, and
> the invariants that hold across the tree.

## What it guarantees

- **Grounded** — a fact never self-declares true; it is pinned to `source@sha` and goes `FRESH → DRIFTED
  → BROKEN` as the code changes (the drift oracle is the structural subtree hash, not line ranges).
- **Nothing dies** — git-native versioning; every fact/memory is re-spawnable from versioned state.
- **Knowledge ≠ Memory** — Knowledge is shared, project-level, edited/superseded (never blind-append);
  Memory is per-seat, scoped, decays by non-use. Distinct kinds within one substrate.
- **Governed write doors** — every write flows through a governed door: `atlas-emit` (grounded facts) or
  `atlas-link` (sameAs edges). Two doors, one bar (ADR-0003 — this line used to say "one governed
  write-door", which stopped being true when `atlas-link` was ratified on 2026-07-21). Reads carry no
  write authority; the doors are the frozen `WRITE_PATHS` constant in `packages/tools/src/handler.ts`.

## Commands

The CLI is `atlas` (`packages/cli/package.json` `bin` → `packages/cli/dist/src/bin.js`). The workspace is
not published, so build it from a checkout — `npm ci && npm run build` — and note that a workspace install
does **not** put `atlas` on your `PATH`; alias it or invoke the file.

**Exactly these commands exist.** `COMMANDS` in `packages/cli/src/map.ts` is the oracle, and
`command-doc-guard` fails the build when this table, that array, or the reference pages disagree in any
direction. That sentence used to be false: the gate read the pages and never the README, so the table sat at
ten rows against a shipped surface of twenty-three with every check green. The gate now reads the region
below, so the drift that produced this correction cannot recur silently.

<!-- command-table:begin -->

| command | kind | what it does | page |
| --- | --- | --- | --- |
| `atlas init <path>` | read | structural `$0`-LLM move-in; installs the `.gitignore` rule for `.atlas/` | [reference](./docs/reference/commands/init.md) |
| `atlas query <scope> [--by …]` | read | the bounded read: a scope's `tier≥T1` invariants plus a capped advisory band | [reference](./docs/reference/commands/query.md) |
| `atlas own <scope>` | read | the briefing for a scope: role, invariants, gotchas, terrain, dependents | [reference](./docs/reference/commands/own.md) |
| `atlas node <addr>` | read | read one fact whole, by content address | [reference](./docs/reference/commands/node.md) |
| `atlas anchors <path>` | read | list the groundable units the built index carries under a tree path | [reference](./docs/reference/commands/anchors.md) |
| `atlas slots` | read | list the closed predicate-slot vocabulary — what you can say | [reference](./docs/reference/commands/slots.md) |
| `atlas draft` | read | compose a candidate fact the door will accept | [reference](./docs/reference/commands/draft.md) |
| `atlas check` | read | dry-run the emit door's whole gate chain; persists nothing | [reference](./docs/reference/commands/check.md) |
| `atlas doctor <archive\|why\|hotset\|reground>` | read | read-only diagnosis and repair *proposals*; persists nothing | [reference](./docs/reference/commands/doctor.md) |
| `atlas relations <unit>` | read | the grounded relation facts touching a unit, both directions | [reference](./docs/reference/commands/relations.md) |
| `atlas negations <scope>` | read | the grounded negatives and the honest abstentions under a scope | [reference](./docs/reference/commands/negations.md) |
| `atlas transitions <unit>` | read | the grounded transitions on a unit lineage | [reference](./docs/reference/commands/transitions.md) |
| `atlas test-vacuities <unit>` | read | the grounded test-vacuity facts on a unit | [reference](./docs/reference/commands/test-vacuities.md) |
| `atlas verify-fact` | read | PROVE, REFUTE or ABSTAIN on a typed claim — three `$0`-LLM oracles | [reference](./docs/reference/commands/verify-fact.md) |
| `atlas verify-store` | read | re-prove every `proven` fact in the store against the live index | [reference](./docs/reference/commands/verify-store.md) |
| `atlas emit <fact.json> --at <sha>` | write | governed write door — admits a grounded fact, or says which gate refused it | [reference](./docs/reference/commands/emit.md) |
| `atlas link <a> <b> [--retract]` | write | governed write door — asserts (or withdraws) `a ≡ b`; never a merge | [reference](./docs/reference/commands/link.md) |
| `atlas promote` | write | carries staged candidates into knowledge THROUGH the emit door; needs a ratifier | [reference](./docs/reference/commands/promote.md) |
| `atlas derive-relations` | write | projects proven `depends-on` from the index into governed knowledge | [reference](./docs/reference/commands/derive-relations.md) |
| `atlas transition <unit>` | write | produce a grounded transition for a unit across two revs | [reference](./docs/reference/commands/transition.md) |
| `atlas test-vacuity` | write | produce grounded test-vacuity facts over a repository's HEAD test files | [reference](./docs/reference/commands/test-vacuity.md) |
| `atlas mine <repo>` | bootstrap | the genesis bootstrap; writes candidates only, and abstains loudly with no model | [reference](./docs/reference/commands/mine.md) |
| `atlas reconcile <mergeBase> [--accept-reground]` | gate | the merge gate: classifies drift, exits `2` on any semantic flip | [reference](./docs/reference/commands/reconcile.md) |

<!-- command-table:end -->

**Exit codes are a designed surface**, uniform across every one of them (`EXIT` / `deriveStatus`,
`packages/cli/src/map.ts`): `0` ok · `1` **usage or wiring error — your invocation was wrong** · `2`
**governed refusal — your invocation was fine and a gate declined it**, so re-running it unchanged will not
help. A refusal always carries the reason and the invariant it enforced.

Task guides: [move a repository in](./docs/how-to/move-a-repo-in.md) ·
[emit a grounded fact](./docs/how-to/emit-a-grounded-fact.md) ·
[find and fix drifted knowledge](./docs/how-to/find-and-fix-drift.md) ·
[get a territory's knowledge](./docs/how-to/query-the-atlas.md).

## Layout

Fifteen packages: the ten-package layered CORE, the productization RING you actually run, and the two
end-to-end suites. Counts below are measured from the tree, not asserted — the command that reproduces
each one is in the note underneath.

```
packages/
  ── CORE (the layered DAG; a package imports only from packages below it — see ARCHITECTURE.md)
  contracts       L0 shared vocabulary: Hash · SubtreeHash · StructRef · Tier · Pack · Tool (pure types)
  kernel          content-addressed identity · canonical encoding · append-only store · merge fold
  persist         git-native durability · provenance · transcript · re-spawn
  index           the structural index · rollup · drift-state · resolve · relate
  grounding       subtreeHash freshness oracle · truth-gate · 2-door admission · drift classification
  knowledge       write-decision (create/update/supersede) · lifecycle · tier-routed ratification · check-engine
  retrieval       bounded packs · OwnPack · poke · injection budget
  memory          Knowledge≠Memory boundary · Awareness/Orientation/Rules slabs
  tools           the governed tool surface (5 governance + 6 read doors · 2 of them write) · schemas · spawn ladder
  genesis         the one-time $0-LLM seeder · budgeted LLM proposal · mechanical admission
  ── RING (campaign 9 — the productization surface; the core stays pure and does no I/O itself)
  adapter-io      the composition root: filesystem · SCIP · git · LLM · durable store, wired into ONE handler
  cli             the `atlas` CLI — 23 commands through a total argv parser (never throws); see the table above
  mcp-server      a stdio MCP server over that same handler, mapping every Verdict (incl. refusals) to MCP
  ── SUITES
  e2e             story-driven in-process suite over the wired runtime
  e2e-blackbox    the same stories as a stranger: subprocess CLI + real MCP stdio
docs/           design-first artifacts (the decomposition, dogfooding the Atlas doc conventions):
  method/         the governed decomposition method (S0→S1→S2→S3→C→S4)
  requirements/   637 EARS requirements · method-tags · 1006 goldens · 129 work-package cards
                  (107 across the 10 campaigns + 22 remediation cards)
  roadmap/        10 dependency-ordered campaigns; 76 DISTINCT epic ids across the three roadmap files
                  (ids are reused between roadmaps, so a heading count would overcount — see the note below)
  reference/      12 `atlas-*.md` contracts: one per core module (9 — `contracts` has none), plus
                  atlas-adapters (the ring), atlas-architecture, and atlas-authoring (campaign 10, now built)
  adr/ · design/ · spec/ · explanation/ · how-to/ · governance/
```

`npm run id-integrity` recomputes and prints the corpus counts (`637 REQ, 1006 SCN, … 129 WP`);
`npm run layer-guard` prints the package count and the live tool-surface cardinality;
`npm run command-doc-guard` prints the command count three ways and fails if they disagree. The work-package
split is `grep -c '^### WP-' docs/requirements/work-packages/*.md`, and the distinct epic count is
`grep -rho 'EPIC-[A-Za-z0-9.-]*' docs/roadmap/*.md | sort -u | wc -l` — no gate holds these two, so they are
the numbers on this page most likely to rot.

### Transport parity — what holds, and what does not

- **Holds: schema and verdict parity.** The MCP server does not hand-author anything — it reads
  `handler.schema(tool)` verbatim, and both transports route the same call through the one wired handler,
  so an identical input yields a byte-identical `Verdict` on the CLI and over MCP (TOOLS-3).
- **Does NOT hold: surface parity.** The CLI exposes **23** commands; MCP advertises
  `GOVERNANCE_SURFACE ∪ READ_SURFACE` (ADR-0006) — **11** tools (5 governance + 6 read), both arrays in
  `packages/tools/src/handler.ts`. Campaign 10 exported `READ_SURFACE`, which moved `doctor`, `node`,
  `anchors`, `slots`, `draft` and `check` onto MCP; the earlier version of this bullet said `READ_SURFACE`
  was unexported and that MCP advertised five tools, and both stopped being true when that campaign closed.
  **The remaining 12 commands are CLI-only and unreachable over MCP**: `mine`, `promote`, `own`,
  `relations`, `negations`, `transitions`, `transition`, `test-vacuities`, `test-vacuity`, `verify-fact`,
  `verify-store`, `derive-relations`. The writers among them publish through `atlas-emit` (ADR-0008 — an
  ordinary use of the existing door, not new surface), so no tool token exists for them. **No gate holds
  this bullet**, unlike the command table above it; it is prose, and it is the paragraph on this page most
  exposed to the next surface change.

## Build order

Follow the roadmap — `docs/roadmap/roadmap.md` (campaigns 1–8), `roadmap-adapters.md` (campaign 9) and
`roadmap-authoring.md` (campaign 10): campaigns are dependency-ordered (Now/Next/Later). Each
Work Package (`docs/requirements/work-packages/`) is a driftless, zero-decision card — its `acceptance`
is the frozen goldens by reference. The `≤400-LOC` godfile ceiling is enforced in CI from day one.
