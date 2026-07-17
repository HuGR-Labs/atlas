# Orchestra — Architecture (v2, design-first)

> **Status:** DRAFT for owner review. Nothing below is built yet — this is the decided design to
> shred before a line of product code is written. Maestro-v1 is the predecessor; Orchestra is a
> ground-up rebuild that keeps only the primitives v1 *proved*, and fixes the three failures the
> owner named: (1) no architecture / unnavigable, (2) the "team" was hollow `.md` prompts, not real
> harnesses, (3) most of the dream product was missing or built without craft.

---

## 0. The one-sentence thesis

**Orchestra is a governed engineering orchestrator: the LEAD holds 100% of the judgment and dispatches
work so pre-decided that executing it is verifiable-not-judged; the work is executed by a fleet of
SEATS, each of which is a full, independently-shippable agent HARNESS; and every guarantee is enforced
in code, folded from live evidence — never asserted in prose.**

Two words carry the whole rebuild: **governed** (the enforcement spine) and **harness** (each seat is
a real product, not a prompt).

## 1. What the SOTA says (why this shape, not another)

Grounded in 2026 multi-agent research, not vibes:

- **Supervisor/worker is the dominant, best-understood pattern.** Orchestra is a supervisor (the lead)
  over specialized workers (seats). No peer-to-peer handoffs — the #1 production failure is infinite
  A→B→C→A handoff loops. Seats never talk to each other; only the lead dispatches and integrates.
- **The supervisor's context is the cost center.** Token spend is dominated by the supervisor's
  *growing* context, and at ≥4 workers a naive supervisor's context exceeds the window. This is v1's
  AP-2 ("orchestrator absorbs the sub-agent dump"). Orchestra's answer is structural, not advisory:
  **every seat returns a frozen compact card; the lead never ingests a transcript.** The return-firewall
  is a *contract*, enforced at the seam.
- **Subagent sprawl is the loudest failure (OOM).** So dispatch is deliberate and contract-bound: a
  seat is spawned only for genuinely independent, pre-sliced work, with the smallest capability set.
- **The only channel parent→worker is the prompt string.** So the dispatch packet is a first-class,
  chewed artifact (paths, contract, target marked, return-shape) — never "figure it out."
- **The Claude Agent SDK is a full runtime** (agent loop, tool engine, permission system, hooks,
  session persistence, memory). A seat is built *on* the SDK — that is what makes "seat = harness"
  concrete rather than aspirational.

## 2. Principles (the anti-v1 charter)

1. **Layered, domain-bounded — never a flat pile.** v1 was ~130 files in one directory. Orchestra has
   strict downward-only layers (§4). A module's home is obvious from its layer.
2. **The seat-harness contract is the frozen keystone.** One interface every seat implements. Seats are
   built in *separate repos, in parallel*, against a stable seam, then vendored in. This is the
   techlead-contract pillar made structural — it is what makes the parallel build sane.
3. **A seat is a real harness, not a prompt.** Own CLI, own MCP tools (callable via CLI *and* MCP), own
   skills, own SDK loop, own kit. If it can't be run standalone (`orchestra-charlie run brief.json`),
   it isn't a seat.
4. **Reuse only what v1 PROVED — ported deliberately, not dragged.** (§6). Everything else is
   redesigned or dropped. No "salvage the zone."
5. **Craft is enforced on Orchestra itself.** The quality gates Orchestra preaches (typed contracts,
   totality, fences, no-self-attest, CI from commit #1) bind Orchestra's own repo. Dogfood or it's a lie.
6. **Enforcement in code, folded from evidence.** Guarantees are producers+consumers+fences over a live
   event log — the one genuinely-real thing v1 had. Kept, but architected.
7. **The Atlas self-hosts (§8).** Orchestra is its own first project: as we build the atlas and the fleet,
   we populate Orchestra's *own* `packages/atlas-*` with grounded knowledge + memory about Orchestra itself
   — the docs are docs-as-code, grounded and drift-checked, so this repo's reference docs *are* the first
   knowledge. If Orchestra can't build Orchestra with its own atlas, it isn't real. Honest bootstrap:
   `atlas-kernel` + `atlas-grounding` by hand first; the atlas tooling takes over hosting once it exists.

## 3. The monorepo, and how seats live in it

The owner's constraint: **each seat is developed in its OWN repo (a session per seat), but everything
ultimately lives in ONE repo.** So the layout is a monorepo *designed to receive* independently-built
seat repos:

```
Orchestra/                     # the mono (this repo)
  ARCHITECTURE.md  README.md
  package.json  tsconfig.base.json      # workspace root (npm/pnpm workspaces)
  .github/workflows/ci.yml              # CI from commit #1
  docs/{adr,contracts}/                 # decision records + human-readable seams
  packages/                             # the ORCHESTRA CORE (built here)
    kernel/          # pure, zero-dep, deterministic primitives + encoder seam (§6 ports)
    contracts/       # THE seat-harness contract + governance seams (frozen)
    governance/      # guarantees · ledger · policy/guard · ed25519 approval
    atlas-kernel/    # LAYER 0: CAS · BLAKE3 encoder seam · append-only event log (the storage substrate)
    atlas-grounding/ #          StructRef/subtreeHash · truth-gate · 2-door admission
    atlas-index/     #          hashed structural tree · drift oracle · no-RAG
    atlas-knowledge/ #          GroundedFact · tiers · upsert/supersede
    atlas-memory/    #          task/pr/project/logbook + the injected header (subsumes v1's memory store)
    atlas-retrieval/ #          packs · poke · tool projection · caps
    atlas-persist/   #          git-native · commits+PRs · archive · re-spawn
    atlas-tools/     #          init/query/emit/reconcile (CLI+MCP)
    orchestrator/    # the LEAD: plan → dispatch → integrate (the supervisor)
    cli/             # the `orchestra` root CLI
    testkit/         # shared actuation-probe / fence helpers
  seats/                                # each seat = an independently-built HARNESS, vendored in
    _template/       # the reference seat skeleton — the craft bar (§5)
    charlie/  lucy/  billy/  ...         # git subtree of each seat's own repo
```

**Vendoring mechanism:** each seat repo is brought in under `seats/<name>/` via **git subtree**
(preferred over submodules: the mono is self-contained, clones work without `--recursive`, and CI sees
real files). A seat's own repo remains the source of truth during active development; `git subtree
pull` syncs it into the mono. The seat contract (`packages/contracts`) is the *only* coupling — a seat
repo depends on the published `@orchestra/contracts`, nothing else from the mono.

## 4. The layers (downward-only dependency)

```
  seats/*          →  a harness; depends ONLY on @orchestra/contracts (+ its own kit); READS the atlas
  ────────────────────────────────────────────────────────────────────
  cli              →  orchestrator + governance + contracts
  orchestrator     →  governance + atlas-* + contracts + kernel
  governance       →  kernel + contracts
  atlas-*          →  kernel          ← LAYER 0: the atlas-* crate family (atlas-kernel = CAS + event log;
                                        grounding → index → knowledge/memory → retrieval → persist/tools)
  contracts        →  kernel
  kernel           →  (nothing — pure, zero runtime deps)
```

- **kernel** — the incorruptible base: content-addressing (`canonical`, `id`), the event model
  (`Event{id,seq,at,actor,kind,payload,nodeKey?}`), injected-clock determinism, glob, result/verdict types. Pure,
  total, zero-dep. No I/O. This is the one thing v1 got right; it is ported almost verbatim (§6). *(The
  Atlas's own **CAS + append-only event log** are NOT here — they live in `atlas-kernel` (layer 0), keyed
  through this package's encoder seam. This resolves the kernel-vs-atlas-kernel ambiguity: the generic
  encoder/primitive seam is `kernel`; the Atlas storage substrate is `atlas-kernel`.)*
- **contracts** — every frozen seam as typed interfaces: the **SeatHarness contract**, the **WorkBrief**
  (the dispatch packet), the **ResultCard** (the return-firewall), the guarantee IDs, the policy shape.
  Contracts have no logic — they are the shared vocabulary that lets core and seats compile apart.
- **governance** — the enforcement spine: `guarantees` (producer/consumer/fence per guarantee),
  `ledger` (fold state from the live event log), `policy`+`guard` (the hardened command classifier +
  phase gate — ported from v1's A-INTEG work), `approval` (ed25519 DSSE owner-sign). All pure verdicts
  over evidence; the I/O keystone (event append) is the single impure edge.
- **atlas-\*** — **LAYER 0**, the ground-truth substrate every phase reads before it acts, built as a
  **family of `packages/atlas-*` crates** (not one package): `atlas-kernel` (the CAS + BLAKE3 encoder seam
  + append-only event log — the storage substrate) → `atlas-grounding` (StructRef/subtreeHash truth-gate) →
  `atlas-index` (hashed structural tree, drift oracle, no-RAG) → `atlas-knowledge` (GroundedFact, tiers,
  upsert/supersede) + `atlas-memory` (per-member task/pr/project/logbook) → `atlas-retrieval` (packs, poke,
  tool projection) → `atlas-persist` (git-native, archive, re-spawn) + `atlas-tools` (init/query/emit/
  reconcile). **Knowledge** (shared, grounded to the code) + **Memory** (per-member) live on one
  BLAKE3-hashed structural index — **no embeddings, no RAG**. Grounding re-checks against `source@sha`;
  born-from-work; git-native, nothing-dies. Subsumes v1's `MemoryFact` store. Designed in
  `docs/{design,explanation,reference}/`, contract in [docs/CONVENTIONS.md](./docs/CONVENTIONS.md).
- **orchestrator** — the LEAD: decompose (slice disjoint, freeze contracts), dispatch (arm the relay,
  chew the packet, enforce the return-firewall), integrate (DAG-ordered merge, seal, absorb). This is
  where the techlead doctrine lives as code.
- **cli** — `orchestra` — the human/CI entrypoint: `plan`, `dispatch`, `wave`, `seal`, `reconcile`,
  and seat passthrough.

## 5. The seat-harness contract (THE keystone)

A seat is a package that satisfies **one contract** so the lead can drive any seat uniformly and seats
can be built in parallel, blind to each other. Concretely, a seat ships:

1. **A manifest** — `SeatManifest{ id, kit, model, capabilities, toolAllowlist, contractVersion }`.
2. **A CLI binary** — `orchestra-<seat>`, with at minimum:
   - `orchestra-<seat> run <brief.json>` → executes a WorkBrief, prints a ResultCard (JSON).
   - `orchestra-<seat> tool <name> <args.json>` → invokes one of the seat's MCP tools from the shell.
   - `orchestra-<seat> manifest` → prints its SeatManifest.
3. **An MCP server** — the seat's tools, exposed over MCP *and* the CLI above (parity — a v1 lesson:
   tools must be callable both ways, with published input schemas).
4. **Skills** — the seat's craft, loaded into its own SDK loop (not the lead's prompt).
5. **An SDK loop** — the seat runs on the Claude Agent SDK with its own context, tools, model tier.
6. **Governance conformance** — on run it consumes an armed relay token, runs its gates for real, emits
   `wp.metered`, and returns a ResultCard (never a transcript). The return-firewall is the seat's
   responsibility to honor and the lead's to verify.

```ts
// packages/contracts/src/seat.ts  (frozen v1 of the seam — the real file lands with the scaffold)
export interface SeatHarness {
  manifest(): SeatManifest;
  run(brief: WorkBrief, ctx: SeatRunContext): Promise<ResultCard>;   // the ONE entrypoint
}
export interface WorkBrief {            // the chewed dispatch packet — the ONLY parent→seat channel
  readonly wpId: string;
  readonly anchor: string;              // the target, marked (file:symbol)
  readonly owns: readonly string[];     // the disjoint write-scope
  readonly contract?: WpContract;       // the four axioms (completeness/invariants/quality/DoD)
  readonly gates: readonly Gate[];      // the real oracle commands
  readonly relayToken: string;          // content-addressed arm↔release binding
  readonly returnShape: ResultShape;    // what the ResultCard MUST contain
}
export interface ResultCard {           // the return-firewall — the lead ingests THIS, never a transcript
  readonly wpId: string;
  readonly outcome: 'sealed' | 'held' | 'blocked' | 'escalated';
  readonly evidence: Evidence;          // gate exit codes, changed files@sha, metered tokens
  readonly absorb?: readonly MemoryFact[];
  readonly note: string;                // ≤N chars, compact by contract
}
```

**Why this is the keystone:** freeze this, publish `@orchestra/contracts`, and every seat repo can be
built in its own session, in parallel, tested standalone against the contract, and vendored in with
zero integration surprises. It is the single decision that makes the whole parallel-repo model work —
and the single thing that must be gotten right before anything else.

### 5.1 The GAN loop, enforced — from the KNOWN roster (not a self-declared field)

The 2026 SOTA harness pattern is GAN-style: separate the agent that GENERATES work from the skeptical
agent that EVALUATES it. Orchestra's fleet already IS this — and the roster is **fixed and named**, so
the orchestrator simply knows who is who (no redundant `role` field on the manifest):

- **generators** (charlie, patty) — produce artifacts. A generator's WP is **not sealable** until an
  **evaluator** has verified it.
- **evaluators** (lucy, billy, frankie) — judge adversarially. Never dispatched to WRITE product.
- **explorer** (jimmy) — mines grounded facts / researches; feeds both, gates neither.

The orchestrator (`packages/orchestrator`) owns this rule against the roster: `seal(generatorWP)`
requires a matching evaluator ResultCard, or it refuses. The owner's "cold-review every returning
agent" law becomes a trap the conductor can't skip — the governance analog of the GAN feedback loop.
See [docs/TEAM.md](./docs/TEAM.md) for the full roster and the phase/persona separation.

### 5.2 All seats are TypeScript (decided)

Every seat is a TS harness on the Agent SDK — one language, one contract, maximal contributability. A
seat that needs another language's muscle (e.g. a Rust scanner) wraps it as an MCP **tool** that shells
out to a subprocess; the seat itself stays TS. No polyglot toolchain in the mono.

## 6. What is REUSED from v1 (deliberate ports, not salvage)

Only what v1 *proved* under adversarial review, ported into `kernel`/`governance`/`atlas-*` and
re-fenced in Orchestra's own suite:

| v1 artifact | → Orchestra home | why it earned the port |
|---|---|---|
| `canonical.ts` content-addressing | kernel | injective, the base of every hash/id |
| event model `Event{id,seq,at,actor,kind,payload,nodeKey?}` | kernel | the one real thing: live-folded ledger |
| `classify.ts` + guard phase-gate (A-INTEG-01/04 hardened) | governance | billy-reviewed, bypass-closed |
| ed25519 DSSE approval (`pae`, sign/verify) | governance | real crypto, owner-sign gate |
| MemoryFact contract (M1–M4, fail-closed grounding) | atlas-memory | structured, no-prose, per-seat |
| relay content-addressed arm↔release binding (R6) | governance | token = sha256(canonical(brief)) |
| the guarantee/probe fold model | governance | producer+consumer+fence, folded from evidence |
| the **atlas** concept (grounding truth-gate, born-from-work, tiers, zero-lock-in export) | **the atlas-\* family (layer 0)** | v1's strongest idea — rebuilt: **structural/BLAKE3 anchor** (not line/SHA), actually *fed* via `ResultCard.absorb`, no-RAG hashed index |

**Explicitly NOT ported:** the flat module sprawl, the context-monitor-as-afterthought, the hollow `.md`
seats, and anything that existed only to make a test green. Redesigned or dropped. *(v1's atlas is NOT in
this list — it was v1's strongest idea, rebuilt as layer 0; see the row above.)*

## 7. The quality bar, on Orchestra itself (day 1, not day 90)

- CI on commit #1: `tsc --strict`, own-suite-green, loc-cap per file, no-dup-primitive, totality fence,
  no-self-attest probe lint — the same gates the orchestrator enforces on seats.
- Every guarantee has a producer, a consumer, and a *falsifiable* fence (a test that fails if the
  guarantee is violated) — the one genuinely-strong thing v1's suite had, kept as the standard.
- ADRs for every load-bearing decision (`docs/adr/`).
- No file over the loc-cap; a module that grows splits. The zone does not come back.

## 7.5 Tooling & scaffold (decided — path B, transparent-over-magic)

The owner's top priority is a mono that is *very* modular and *easy to work on, contribute to, and
document*. We compose that from explicit, legible tools rather than one batteries-included platform
(Nx) — because the v1 trauma was "unnavigable + magic", and every piece here is readable and
swappable:

| concern | choice | why |
|---|---|---|
| install / linking | **pnpm workspaces** | the strict, fast 2026 default |
| task graph + cache | **Turborepo** (Rust core) | simple, fast; "80% of the value, 20% of the complexity" |
| **module boundaries** | **dependency-cruiser** (or eslint-plugin-boundaries) as a CI lint | the downward-only layers (§4) become rules that FAIL the build — "very modular" enforced, not hoped |
| **new package/seat** | a light generator (`hygen`/`plop`, exposed as `orchestra new-seat <id>`) | creating a seat = one command against `_template` — the contribution barrier drops to near-zero |
| **docs site** | **Starlight** (Astro) | per-package docs + guides, easy to write |
| **API docs** | **TypeDoc** | generated from the typed contracts |
| **navigability** | dependency-cruiser graph, auto-generated | the dependency map the v1 zone never had |

Rule of thumb baked into the scaffold: **1 package = 1 domain**, a co-located `README.md` is mandatory,
a per-file LOC cap trips CI, and an ADR records every load-bearing decision. Turborepo only knows tasks
— so boundaries/generation/docs are the explicit tools above, each independently understandable.

## 8. Build order (post-approval — design-first, so this waits)

1. **kernel + contracts** — the frozen base + the seat seam. Publish `@orchestra/contracts`.
2. **the atlas-\* family (LAYER 0)** — `atlas-kernel` (CAS/BLAKE3/event-log) → `atlas-grounding` →
   `atlas-index`, then the knowledge + memory kinds (`atlas-knowledge` + `atlas-memory`), `atlas-retrieval`,
   `atlas-persist`, `atlas-tools`. Everything above reads it, so it comes before governance/orchestrator.
   *(Self-hosting starts here — §2.7: Orchestra populates its OWN atlas as each crate lands.)*
3. **governance** — the enforcement spine, re-fenced.
4. **`seats/_template`** — the reference harness, built with total craft, as the bar every real seat is
   held to.
5. **orchestrator + cli** — the lead, driving the template seat end-to-end (the first live governed run).
6. **The seats** — each in its own repo/session, against the frozen contract, vendored in as it lands.

Steps 1–4 are Orchestra-core (this repo). Step 5 is the fleet, built where the owner opens a session per
seat. Nothing starts until this architecture is ratified.
