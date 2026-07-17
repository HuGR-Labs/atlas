# Atlas — Docs

The map. Docs follow **[CONVENTIONS.md](./CONVENTIONS.md)** — Diátaxis × docs-as-code (co-located) ×
grounded (the docs dogfood the Atlas: reference is pinned to `source@sha` and drift-checked).

## Start here
- **[../README.md](../README.md)** — what the Atlas is + the build order.
- **[method/README.md](./method/README.md)** — the decomposition method that produced this spec.
- **[CONVENTIONS.md](./CONVENTIONS.md)** — how we document (this contract).

## The Atlas (layer 0) — knowledge + memory, one substrate

### Explanation — *why* (concepts, rationale)
- [explanation/grounding.md](./explanation/grounding.md) — why grounded, structural-not-line, no-RAG
- [explanation/knowledge.md](./explanation/knowledge.md) — the shared kind; Knowledge ≠ Memory, one Atlas
- [explanation/classes.md](./explanation/classes.md) — the 7 classes (owner + scope)
- [explanation/memory.md](./explanation/memory.md) — the per-member kind; injected vs consultable
- [explanation/versioning.md](./explanation/versioning.md) — git-native, nothing dies, re-spawnable
- [explanation/genesis-reasoning.md](./explanation/genesis-reasoning.md) — genesis: why structural-not-embeddings, the S2 propose→verify loop, cost & limits

### Reference — *what exactly* (per crate; migrates into `packages/atlas-*/` when it lands)
- [reference/atlas-kernel.md](./reference/atlas-kernel.md) — CAS · BLAKE3 · event log
- [reference/atlas-grounding.md](./reference/atlas-grounding.md) — StructRef/subtreeHash · truth-gate · 2-door admission
- [reference/atlas-index.md](./reference/atlas-index.md) — hashed structural tree · drift oracle · no-RAG
- [reference/atlas-knowledge.md](./reference/atlas-knowledge.md) — GroundedFact · tiers · upsert/supersede
- [reference/atlas-memory.md](./reference/atlas-memory.md) — task/pr/project/logbook + Orientation
- [reference/atlas-retrieval.md](./reference/atlas-retrieval.md) — packs · poke · tool projection · caps
- [reference/atlas-persist.md](./reference/atlas-persist.md) — git-native · commits+PRs · archive · re-spawn
- [reference/atlas-tools.md](./reference/atlas-tools.md) — init/query/emit/reconcile (CLI+MCP)

### How-to — *tasks*
- [how-to/write-a-project-rule.md](./how-to/write-a-project-rule.md)
- [how-to/query-the-atlas.md](./how-to/query-the-atlas.md)

## Product design (prose) & legacy specs
- [design/atlas.md](./design/atlas.md) — the product design (working-backwards prose)
- [spec/atlas.md](./spec/atlas.md) · [spec/memory.md](./spec/memory.md) — the **transitional normative
  source** the `reference/` files currently ground to (completeness verified; content-complete in
  `reference/`). Retires when the atlas **code** lands and reference re-grounds to `source@sha`.

## Chewed visuals (HTML artifacts)
`atlas.html` (the consolidated one-pager) · piece explainers: `atlas-concept` · `atlas-classes` ·
`atlas-folders` · `atlas-sizes` · `project-memory` · `project-memory-example`.
