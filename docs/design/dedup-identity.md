# Dedup & Identity — the grounded resolution model

> **Status:** FROZEN design-contract (owner-ratified 2026-07-20). Supersedes the reactive
> ADJACENCY-A/B (#66–#68) always-merge. Slices into WP-DEDUP-1/2 (Wave 1) + WP-DEDUP-3 (Wave 2, model-gated).

## Epitaph

**Identity is grounded, not textual. Definitional equality is exact and *merges*; everything softer
is a *relation*, never a merge — derived on read or promoted by ratification. Subsumption, not
record-linkage.**

## Axioms (inherited — non-negotiable)

- **A1** — No embeddings, no RAG. Every signal is deterministic and auditable.
- **A2** — A fact is truth only if grounded. Merging two distinct groundings **de-grounds one** → forbidden.
- **A3** — Prose is the weakest signal; it **never** decides identity. *(Already coded: `nodeKey` excludes the claim body.)*
- **A4** — Content-addressed; CAS history is never destroyed. The only byte-destructive op is exact-hash DEDUP.

## The evolution principle this rides (verified in-repo)

`docs/explanation/versioning.md:29` — *"the folded knowledge evolves by supersede-with-lineage.
History is never destroyed."* The anti-append target is **parallel duplicate facts**
(`types.ts:162` — `nodeKey` collision forces UPDATE/union *instead of proliferating*), NOT relations.
A persisted directed typed node→node edge **already exists** (`CurrentNode.supersededBy`,
`router.ts:146,250`, serialized in the projection sidecar `store.ts:47`) — so a relation is the same
species, not a foreign body.

## The decision lattice (signal → disposition)

| # | Signal (deterministic) | Disposition | Destructive? |
|---|---|---|---|
| **D0** | `contentHash` equal | **DEDUP** — drop the new | byte-safe (identical) |
| **D1** | `nodeKey` equal (`primaryAnchorId ‖ slot ‖ check`) | **UPDATE / union** claim-sets (KNOW-4c) | no (one node per nodeKey) |
| **R1** | `subsumes`: `isPrefix(seg(anchorB), seg(anchorA)) ∧ slotA===slotB ∧ claim(A)==claim(B)` | **derived relation** (broader ⊃ narrower) | **no — never merges** |
| **H1** | same claim across **non-containment** groundings | **`sameAs` candidate → ratification only** | no |
| — | anything else | two distinct grounded facts; keep both | no |

`claim==` is the **check** for predicates and the **exact `claimNorm`** (NFC+trim, `claimSimilarity∈{0,1}`)
for advisories. No fuzzy τ. The `::`-path *is* the sanctioned ancestry chain (`module::item::block`,
`primaryAnchorId` is pure — `router.ts:340`), so segment-prefix is real structural containment, not a
string hack. The near-synonym / cross-location residual is **indecidable without embeddings → routed
to human ratification** (A1-honest).

## The frozen decisions

- **DP-1 — un-merge.** The always-merge of ADJACENCY-B is **removed** from both call-sites
  (`upsert` router.ts:197-208, `writeDecision` router.ts:394-397). A routed CREATE at an adjacent
  anchor mints its **own** node (each keeps its own grounding — A2). `adjacencyNearDup`'s pure logic is
  **retained** and repurposed by DP-2. The `primaryAnchor`/`slot` carriers on `CurrentNode` stay.

- **DP-2 — `subsumes` is derived on read, never stored.** `primaryAnchorId` is pure and the four
  inputs (`anchorA`, `anchorB`, `slot`, `claim`) already live in the projection ⇒ `subsumes` is a total
  pure function `deriveSubsumes(projection): readonly Relation[]`. **Zero new persisted state.** Adds the
  `slotA===slotB` constraint the old matcher lacked (ADJACENCY spanned all slots — a bug).

- **DP-3 — `sameAs` is the only new persisted state, and it is human-ratified.** *(Wave 2, model-gated.)*
  A cross-location sameness a human asserts. It rides existing rails: the projection sidecar already
  hosts directed edges (`supersededBy`), and ratification already has the T0→billy human gate
  (`ratify.ts:66-68`, `fastpath.ts:63`). `sameAs` links two **distinct** `nodeKey`s and is presented as
  a **read-fold**, never a second current-node — so the "one node per nodeKey" invariant is intact.

- **DP-4 — resolution is at read, not write.** `subsumes` = coverage on read (never folds/deletes).
  Ratified `sameAs` = union-find equivalence-fold at the **knowledge** read layer over `StoreProjection`
  (NOT `@atlas/index` retrieval — that is below knowledge in the DAG and cannot see `nodeKey`). Memoizable
  by `subtreeHash`.

## What dies (negative space)

- ✝ **always-merge** — destructive, currently **live** in governed emit → replaced by DP-1 + DP-2.
- ✝ **string-prefix as the *only* signal** — kept **only** gated by slot + exact claim, and only ever
  yielding a non-destructive relation.
- ✝ **SimHash / MinHash / blocking / any fuzzy tier** — foreign to grounding; the case it would catch is
  usually not a dup (it would de-ground). Never built.
- ✝ **stored `subsumes` edges** — derivable on read (DP-2); persisting them is redundant state.

## Waves

- **Wave 1 (now):** WP-DEDUP-1 (un-merge) → WP-DEDUP-2 (subsumes derive-on-read). Sequential (same files).
  Kills the live debt + lands the structural relation. No frozen-model mutation.
- **Wave 2 (owner-gated):** WP-DEDUP-3 (`sameAs` persist + ratify-promote + read-fold). Touches
  `StoreProjection` + `store.ts` sidecar + `ratify/*`. Held for an explicit nod before mutating the
  frozen model — the biggest lift for the rarest case.
