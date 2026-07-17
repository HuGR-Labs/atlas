# Atlas

**Layer 0: a shared, grounded knowledge layer for a codebase.** The Atlas is a content-addressed,
git-native substrate that lets an AI coding agent (or a human) ask *what is true about this code, and
is it still true?* — and get a deterministic, drift-checked answer. No embeddings, no RAG: retrieval is
a hashed structural index (BLAKE3-merkle CAS) resolved by scope, dependency blast-radius, and trigger.

> **Status: design-first.** The full design is decomposed and frozen (`docs/`); product code is built
> from the frozen Work Packages. The Atlas is consumed one-way by downstream orchestrators (e.g.
> **Orchestra**, its first consumer) — it never depends on them.

## What it guarantees

- **Grounded** — a fact never self-declares true; it is pinned to `source@sha` and goes `FRESH → DRIFTED
  → BROKEN` as the code changes (the drift oracle is the structural subtree hash, not line ranges).
- **Nothing dies** — git-native versioning; every fact/memory is re-spawnable from versioned state.
- **Knowledge ≠ Memory** — Knowledge is shared, project-level, edited/superseded (never blind-append);
  Memory is per-seat, scoped, decays by non-use. Distinct kinds within one substrate.
- **One governed write-door** — all writes flow through `atlas-emit`; reads carry no write authority.

## Layout

```
packages/       the Atlas CORE (built from the frozen WPs), one package per module:
  kernel          content-addressed identity · canonical encoding · append-only store · merge fold
  persist         git-native durability · provenance · transcript · re-spawn
  index           the structural index · rollup · drift-state · resolve · relate
  grounding       subtreeHash freshness oracle · truth-gate · 2-door admission · drift classification
  knowledge       write-decision (create/update/supersede) · lifecycle · tier-routed ratification · check-engine
  retrieval       bounded packs · OwnPack · poke · injection budget
  memory          Knowledge≠Memory boundary · Awareness/Orientation/Rules slabs
  tools           the governed tool surface · CLI/MCP parity · tri-transport addressability
  genesis         the one-time $0-LLM seeder · budgeted LLM proposal · mechanical admission
docs/           design-first artifacts (the decomposition, dogfooding the Atlas doc conventions):
  method/         the governed decomposition method (S0→S1→S2→S3→C→S4)
  requirements/   468 EARS requirements · method-tags · 473 goldens · 69 work-packages
  roadmap/        49 vertical epics × 8 dependency-ordered campaigns
  reference/      the 9 module contracts (atlas-*.md) · spec/ · explanation/ · how-to/
```

## Build order

Follow the roadmap (`docs/roadmap/roadmap.md`): campaigns are dependency-ordered (Now/Next/Later). Each
Work Package (`docs/requirements/work-packages/`) is a driftless, zero-decision card — its `acceptance`
is the frozen goldens by reference. The `≤400-LOC` godfile ceiling is enforced in CI from day one.
