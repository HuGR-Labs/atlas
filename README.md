# Atlas

**Layer 0: a shared, grounded knowledge layer for a codebase.** The Atlas is a content-addressed,
git-native substrate that lets an AI coding agent (or a human) ask *what is true about this code, and
is it still true?* — and get a deterministic, drift-checked answer. No embeddings, no RAG: retrieval is
a hashed structural index (BLAKE3-merkle CAS) resolved by scope, dependency blast-radius, and trigger.

> **Status — stated per campaign, not claimed globally.** **87 of the 103 Work Packages are built**:
> campaigns 1–8 (the 72 core WPs) and campaign 9 (15 WPs, the productization ring — CLI, MCP server,
> real-repo adapters), with a story-driven end-to-end suite over the wired runtime. **Campaign 10 (16 WPs
> — the authoring surface) is decomposed but NOT built**; `npm run layer-guard` says so on every run
> (`READ_SURFACE not yet exported — its partition is DECLARED UNCOVERED, not verified`). An earlier
> version of this line read *"Status: built. All 72 Work Packages…"*, which was wrong twice: 72 is the sum
> of campaigns 1–8 only, and it implied a finished tree.
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
does **not** put `atlas` on your `PATH`; alias it or invoke the file. **Exactly these ten commands exist**
(`COMMANDS` in `packages/cli/src/map.ts` — the oracle; `command-doc-guard` fails the build if this table and
that array disagree in either direction); one reference page each, every example on them executed against
the real binary.

| command | what it does | page |
| --- | --- | --- |
| `atlas init <path>` | structural `$0`-LLM move-in; installs the `.gitignore` rule for `.atlas/` | [reference](./docs/reference/commands/init.md) |
| `atlas query <scope> [--by …]` | the bounded read: a scope's `tier≥T1` invariants, with a `stale` flag | [reference](./docs/reference/commands/query.md) |
| `atlas emit <fact.json> --at <sha>` | governed write door — admits a grounded fact, or says which gate refused it | [reference](./docs/reference/commands/emit.md) |
| `atlas reconcile <mergeBase> [--accept-reground]` | the merge gate: classifies drift, exits `2` on any semantic flip | [reference](./docs/reference/commands/reconcile.md) |
| `atlas doctor <archive\|why\|hotset\|reground>` | read-only diagnosis and repair *proposals*; persists nothing | [reference](./docs/reference/commands/doctor.md) |
| `atlas mine <repo>` | the genesis bootstrap; writes candidates only, and abstains loudly with no model | [reference](./docs/reference/commands/mine.md) |
| `atlas node <addr>` | read one fact whole, by content address | [reference](./docs/reference/commands/node.md) |
| `atlas link <a> <b> [--retract]` | governed write door — asserts (or withdraws) `a ≡ b`; never a merge | [reference](./docs/reference/commands/link.md) |
| `atlas promote` | carries staged candidates into knowledge THROUGH the emit door; needs a ratifier | [reference](./docs/reference/commands/promote.md) |
| `atlas own <scope>` | the briefing for a scope: role, invariants, gotchas, terrain, dependents, what else is reachable | [reference](./docs/reference/commands/own.md) |

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
  tools           the governed tool surface (5 tools · 2 write doors) · the published tool schemas · spawn ladder
  genesis         the one-time $0-LLM seeder · budgeted LLM proposal · mechanical admission
  ── RING (campaign 9 — the productization surface; the core stays pure and does no I/O itself)
  adapter-io      the composition root: filesystem · SCIP · git · LLM · durable store, wired into ONE handler
  cli             `atlas init|query|emit|reconcile|doctor|mine|node|link` — a total argv parser (never throws)
  mcp-server      a stdio MCP server over that same handler, mapping every Verdict (incl. refusals) to MCP
  ── SUITES
  e2e             story-driven in-process suite over the wired runtime
  e2e-blackbox    the same stories as a stranger: subprocess CLI + real MCP stdio
docs/           design-first artifacts (the decomposition, dogfooding the Atlas doc conventions):
  method/         the governed decomposition method (S0→S1→S2→S3→C→S4)
  requirements/   611 EARS requirements (481 core + 130 ring) · method-tags · 956 goldens (826 + 130) ·
                  103 work-packages across 10 campaigns
  roadmap/        69 epic headings over 10 dependency-ordered campaigns (66 DISTINCT ids — three ids are
                  reused between the core and the ring roadmaps, so "69 epics" would be an overcount)
  reference/      12 `atlas-*.md` contracts: one per core module (9), plus atlas-adapters (the ring),
                  atlas-architecture, and atlas-authoring (campaign 10 — a contract with no code yet)
  adr/ · design/ · spec/ · explanation/ · how-to/ · governance/
```

`npm run id-integrity` recomputes and prints the corpus counts (`611 REQ, 956 SCN, … 103 WP`);
`npm run layer-guard` prints the package count and the live tool-surface cardinality.

### Transport parity — what holds, and what does not

- **Holds: schema and verdict parity.** The MCP server does not hand-author anything — it reads
  `handler.schema(tool)` verbatim, and both transports route the same call through the one wired handler,
  so an identical input yields a byte-identical `Verdict` on the CLI and over MCP (TOOLS-3).
- **Does NOT hold: surface parity.** The CLI exposes **nine** commands; MCP advertises
  `GOVERNANCE_SURFACE ∪ READ_SURFACE` (ADR-0006), and `READ_SURFACE` is not exported yet — so MCP
  advertises **five** tools today. `doctor`, `mine`, `node` and `promote` are **CLI-only and unreachable
  over MCP**. `promote` is the one of those four that WRITES: it publishes through `atlas-emit` (ADR-0008 —
  an ordinary use of the existing door, not new surface), so no tool token exists for it. Closing that gap
  is campaign 10, which is not built.

## Build order

Follow the roadmap — `docs/roadmap/roadmap.md` (campaigns 1–8), `roadmap-adapters.md` (campaign 9) and
`roadmap-authoring.md` (campaign 10): campaigns are dependency-ordered (Now/Next/Later). Each
Work Package (`docs/requirements/work-packages/`) is a driftless, zero-decision card — its `acceptance`
is the frozen goldens by reference. The `≤400-LOC` godfile ceiling is enforced in CI from day one.
