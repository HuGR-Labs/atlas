# atlas-architecture — Reference (the hierarchy, the exposure model, the authority model)

> owner: orchestrator · status: **draft — ratification candidate.** The tool-exposure amendment (§2) was
> **owner-ratified 2026-07-25**; the rest awaits the DEFINE seat.
>
> **Why this document exists.** Three independent cold reviews of CAMPAIGN-10 found the same disease by three
> different routes: the layer hierarchy was never written down (so a campaign was cut with the dependency
> direction inverted), the tool-exposure rule lived in two places and contradicted itself, and "advertised"
> and "invocable" were independent sets nobody bound together. None of that is a detail — it is a **missing
> constitution**. This is that constitution, and every clause here is enforced by a gate, not by prose.
>
> **The bar.** Each of the three models below is grounded in named prior art and, where the state of the art
> gives a *measured* threshold, the measurement is cited rather than a number being invented.

---

## 0. The three models, and the failure each one prevents

| § | model | prevents | prior art |
|---|---|---|---|
| **1** | **Hierarchy** — who may depend on whom | a package cycle; a seam frozen by the wrong side | Hexagonal / ports-and-adapters (Cockburn); Dependency Inversion (Martin); **architecture fitness functions** (Ford/Parsons/Kua; ArchUnit → ArchUnitTS) |
| **2** | **Exposure** — what may be published as a tool | tool-catalog overload; advertised ≠ invocable | measured tool-selection degradation (see §2.2); MCP progressive disclosure |
| **3** | **Authority** — what may decide a gate | the confused deputy; ratification bypass | object-capability model (Miller, *Robust Composition*; KeyKOS/EROS/Capsicum/CHERI); "capability gates are not authorization" |

---

## 1. HIERARCHY — the layer law

### 1.1 The rule

> <a id="arch-1"></a>**ARCH-1 Ports point inward; adapters point outward.** An **interface (port)** MUST be
> declared in the layer that *consumes* it. Its **implementation (adapter)** MUST live in the layer that
> owns the outside resource. Dependencies MUST flow in exactly one direction — **outer depends on inner,
> never the reverse** — and the package dependency graph MUST be **acyclic**.

The repo already applies this correctly in three places, and those are the pattern to copy, not to argue
with: `TruthGate`, `DoctorSource`, `T0Heuristic` and `NodeSource` are declared in **`@atlas/tools`** and
implemented in **`@atlas/adapter-io`**, injected at `assembleHandler`. `adapter-io` imports `TruthGate`
*from* `tools`; `tools` imports nothing from `adapter-io`.

### 1.2 The layer order (normative)

```
contracts → kernel → { index · grounding } → knowledge → { persist · retrieval } → tools
                                                                                     ↑
                                                                            adapter-io
                                                                           ↗           ↖
                                                                        cli          mcp-server
```

> <a id="arch-2"></a>**ARCH-2 `tools` is the innermost port layer of the ring.** `@atlas/tools` MUST NOT
> depend on `@atlas/adapter-io`, `@atlas/cli`, or `@atlas/mcp-server`. Every capability the ring needs from
> the outside world MUST be expressed as a port declared in `tools` and satisfied by an adapter.

**Direct consequence — the CAMPAIGN-10 defect.** `GroundingComputer` and `GateChain` were carded as
adapter-io-owned seams consumed by tools-side legs. That is unbuildable: it inverts ARCH-2 and creates a
cycle. Both are **ports** — declared in `tools`, implemented in `adapter-io`. The card that got it right
(`EmitOut` widening, "tools is upstream of adapter-io") is the template.

### 1.3 The composition root

> <a id="arch-3"></a>**ARCH-3 One composition root, and it is named.** There MUST be exactly one site where
> tool legs are bound to their implementations (`packages/adapter-io/src/wire.ts`). Adding a tool to the
> `Tool` union without binding a leg at that site, or binding a leg for a token absent from the union, MUST
> fail the build. **Every work package that introduces a tool MUST name this site in its edit surface** — a
> door that is typed, rendered and tested but never bound is not a feature, it is a hole.

*(This clause exists because CAMPAIGN-10's 16 WP cards mention `wire.ts` exactly zero times, so all four new
doors would have been built and never made reachable — the same "the loop didn't close" failure the E2E
wave already paid for once.)*

### 1.4 Enforcement — a fitness function, not a review

> <a id="arch-4"></a>**ARCH-4 The hierarchy is machine-checked.** ARCH-1/2/3 MUST be enforced by a gate in
> CI that reads the real dependency graph and fails on any inward edge, any cycle, or any unbound tool. A
> layer rule that lives only in prose is not a rule; the industry name for the mechanical form is an
> **architecture fitness function** (Ford/Parsons/Kua; ArchUnit for the JVM, ArchUnitTS for TypeScript).

Implementation: `harness/gates/layer-guard.mjs`, wired into `ci.yml` beside `godfile-guard` and
`spec-conformance-guard`.

---

## 2. EXPOSURE — the tool-surface law

### 2.1 What replaces the count

The old rule — *"the MCP server publishes exactly the five governed tools"* (INV-MCP-1) — is **superseded**
(owner-ratified 2026-07-25; recorded in `ADR-0006`). The count was never the property; it was the mechanism
available when there were five legs, exactly as INV-TOOLS-1's "exactly four" was (ADR-0003: *"the count was
the accidental part; the governance property is the essential part"*).

> <a id="arch-5"></a>**ARCH-5 One closed union; both surfaces are DERIVED from it.** There MUST be exactly
> one closed `Tool` union. The **advertised** set and the **invocable** set MUST both be derived from it, and
> MUST be provably equal: `advertised ≡ invocable ≡ Tool`. Neither may be assembled independently.
>
> <a id="arch-6"></a>**ARCH-6 Every tool declares its authority class.** `Tool` MUST partition into
> `GOVERNANCE_SURFACE` (governed doors, of which `WRITE_PATHS` is the write subset) and `READ_SURFACE`
> (zero write authority). The partition MUST be total and disjoint, and MUST be pinned in CI.

*(ARCH-5 closes a hole that exists today and predates this work: `callTool` dispatches on `legs[tool]` with
no membership check against the advertised list, so "advertised" and "invocable" have always been two
independently-maintained sets that merely happen to coincide.)*

### 2.2 The budget — measured, not invented

Replacing a magic number with no number would be a regression. The state of the art gives a **measured**
one:

- Tool-selection accuracy stays above ~90% up to roughly **30 candidate tools**, degrades sharply beyond
  **30–50**, and collapses past 100 — reported drops of **95% → 71%** when a single large server's full
  catalog is loaded.
- Schema cost is not free: one production MCP server's tool definitions alone consume **~42k tokens** before
  any task context, and stacked servers routinely hand **30–50% of the context budget** to tool schemas.

> <a id="arch-7"></a>**ARCH-7 The static surface is budgeted.** The statically-advertised tool count MUST
> stay at or below **30**. Crossing it is not forbidden by fiat — it is the trigger to move growth onto the
> dynamic projection (§2.3), and the gate MUST fail so the decision is taken deliberately rather than drifted
> into.

Current surface: 5 governance + 7 read = **12**. Comfortably inside the budget, which is why the amendment
is safe — and the budget is what makes the *next* addition an explicit decision instead of a slide.

### 2.3 Growth path — progressive disclosure, which this product already specified

The scaling answer in the literature is not a bigger catalog; it is **loading only what the task requires** —
treating tool selection as retrieval rather than reasoning.

Atlas already specified exactly this, and ratified it, for a different surface: `spec/atlas.md` §6.2 —
*"Only the current scope's nodes are exposed as tools at once; on leaving the scope they retract. Exposing
the whole graph as tools at once would flood the context with schemas and is forbidden — the tool surface is
**dynamic**, following where the navigator is."*

> <a id="arch-8"></a>**ARCH-8 Static core, dynamic tail.** The governance + read surface is the **static
> core**: small, bounded by ARCH-7, always present. Anything that scales with the repository — node-tools,
> per-scope projections — MUST use the dynamic scope-scoped projection, never the static catalog.

The product invented the right pattern and did not apply it to itself. §2.3 applies it.

---

## 3. AUTHORITY — the capability law

### 3.1 The failure this prevents (reproduced, not hypothesized)

Verified against the built packages on `master`:

```
nodeKey(T0) == nodeKey(T2)     → identity does NOT include tier
route(T0) = full-ratify        → the KNOW-8 ratify gate RUNS (billy token required)
route(T2) = auto-accept        → the ratify gate is SKIPPED
emit T0 → CREATE ; emit T2 → UPDATE ; node now points at the T2 bytes ; supersededBy: (none)
```

A `T0` fact admitted only with the billy token can be **displaced by a `T2` advisory carrying no token at
all**, at the same `(anchor, slot)`. And because `atlas-query` bounds `T2` out of reads, the T0 invariant
then silently stops appearing for its scope, with no refusal on any transport.

The mechanism has a name: **`tier` is an author-supplied argument that selects which gate runs.** In the
literature this is the confused deputy, and the current framing of it for agent systems is precise —
*capability gating* answers which tools are exposed; *per-call authorization* answers whether a concrete
call with specific argument values is allowed. Atlas has the first and is missing the second at exactly this
field.

### 3.2 The rules

> <a id="arch-9"></a>**ARCH-9 A gate-selecting field is not author-supplied.** Any field whose value
> determines **which** governance gate runs MUST either (a) be inside the integrity envelope that identity is
> computed over, or (b) be derived by the door rather than read from the payload. It MUST NOT be both
> author-supplied and gate-selecting. Today `tier` is both; `scope` is the same shape (authz gates on the
> author-supplied `node.scope` while the read projection scopes on the *derived* `primaryAnchor`, with
> nothing binding the two).
>
> <a id="arch-10"></a>**ARCH-10 An UPDATE may not lower the authority of what it replaces.** A write that
> replaces a current node MUST NOT reduce the ratification class of that node without passing the gate the
> existing node required. Displacement is a supersede, and a supersede of a ratified fact is itself a
> ratified act.
>
> <a id="arch-11"></a>**ARCH-11 Read-only means no handle, not a promise.** A leg with no write authority
> MUST NOT be *given* a write handle. Write-freedom MUST be a property of what the leg receives — an
> unforgeable read-only capability — not of a reviewer noticing, and not of a runtime spy. This is the
> object-capability discipline (Miller; KeyKOS/EROS/Capsicum/CHERI): authority travels as an unforgeable
> reference, and a component cannot exercise authority it was never handed.

The repo already has the correct idiom to copy: `packages/tools/src/guard.ts` declares `ReadProjection`
(`read()` and nothing that mutates), and `NodeSource` is resolve-only. Planner legs MUST be constructed over
a port of that shape. Until they are, the honest claim is "structurally **checked**" (a spy), not
"structurally **guaranteed**" (a type) — and ADR-0004 currently claims the latter.

### 3.3 Scope note — the threat model, stated rather than inferred

Atlas's `actor` is `ATLAS_ACTOR ?? gitUserEmail(repo) ?? ''` — caller-settable and unauthenticated — checked
against a policy file readable by anyone who can invoke the CLI. **KNOW-11 is an anti-accident guardrail,
not an adversarial control.** That is a legitimate posture for a local developer tool, and it means a
dry-run door (`check`) discloses nothing an attacker could not already read.

> <a id="arch-12"></a>**ARCH-12 The posture is written down.** This threat model MUST be stated in the
> reference, not inferred from the code. If the transport ever becomes remote or multi-tenant, both the
> env-var actor and the readable policy become live vulnerabilities and this clause MUST be revisited before
> that transport ships.

---

## 4. Acceptance (falsifiable checks — S3 lifts goldens from these)

1. The package dependency graph is acyclic, and no inner layer imports an outer one. *(ARCH-1, ARCH-2)*
2. `@atlas/tools` has zero import edges to `adapter-io` / `cli` / `mcp-server`. *(ARCH-2)*
3. Every member of the `Tool` union has a bound leg at the composition root, and every bound leg's token is a
   member of the union — checked in both directions. *(ARCH-3)*
4. The gate fails on a planted inward import, a planted cycle, and a planted unbound tool. *(ARCH-4)*
5. `advertised ≡ invocable ≡ Tool`, asserted by set-equality, not by inspection. *(ARCH-5)*
6. `GOVERNANCE_SURFACE ⊎ READ_SURFACE == Tool`, total and disjoint; `WRITE_PATHS ⊆ GOVERNANCE_SURFACE`.
   *(ARCH-6)*
7. `|Tool| ≤ 30`, and the gate fails at 31 with a message naming ARCH-8 as the remedy. *(ARCH-7)*
8. No field that selects a governance gate is both author-supplied and outside the identity envelope.
   *(ARCH-9)*
9. Emitting a `T2` advisory at the `(anchor, slot)` of a ratified `T0` fact is **refused**, not silently
   applied as an UPDATE. *(ARCH-10 — the reproduction in §3.1 becomes a red test)*
10. A planner leg cannot be constructed over a store handle that exposes a mutator — enforced by the type,
    demonstrated by a compile failure, not by a spy. *(ARCH-11)*

---

## 5. Decisions

| # | decision | status |
|---|---|---|
| **ARCH-D1** | Ports declared inward, adapters outward; `tools` never depends on `adapter-io` | **proposed** — ADR-0006 §hierarchy |
| **ARCH-D2** | INV-MCP-1's "exactly five tools" is superseded by the derived-surface property + a measured budget | **OWNER-RATIFIED 2026-07-25** — ADR-0006 |
| **ARCH-D3** | `tier` (and `scope`) must stop being author-supplied gate selectors | **OPEN — DEFINE required.** This is a live governance hole on `master`, reproduced in §3.1; it is not CAMPAIGN-10 debt |
| **ARCH-D4** | Planner legs take an unforgeable read-only port (ocap), replacing the write-spy as the guarantee | **proposed** — supersedes ADR-0004's "property of the type" claim, which is currently overstated |

## Sources

- [MCP Tool Overload: Why More Tools Make Your Agent Worse](https://dev.to/thedailyagent/mcp-tool-overload-why-more-tools-make-your-agent-worse-5a49)
- [AI Tool Overload: Why More Tools Mean Worse Performance](https://www.jenova.ai/en/resources/mcp-tool-scalability-problem)
- [From reasoning to retrieval: solving the MCP tool overload problem](https://redis.io/blog/from-reasoning-to-retrieval-solving-the-mcp-tool-overload-problem/)
- [Capability Gates Are Not Authorization: Confused-Deputy Failures in LLM Agent Frameworks](https://arxiv.org/html/2606.28679)
- [Capability Minimization as a Safety Primitive: Risk-Aware Causal Gating for Least-Privilege LLM Agents](https://arxiv.org/pdf/2606.13884)
- [Least privilege for AI agents: identity, access, and tool binding (Microsoft Security)](https://www.microsoft.com/en-us/security/blog/2026/07/16/least-privilege-for-ai-agents-identity-access-and-tool-binding/)
- [ArchUnitTS — architecture fitness functions for TypeScript](https://github.com/LukasNiessen/ArchUnitTS)
