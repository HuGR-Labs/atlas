# Wave Plan — Atlas WP execution (post scaffold-freeze)

> The dispatch decision record that opens WP execution. Derived from the frozen roadmap
> (`roadmap.md`, 50 epics × 8 campaigns), the 71 WP cards (`work-packages/wp-campaign-*.md`), and the
> **frozen scaffold** (`packages/*/ref/*.ts`, 9 packages L0–L8, `tsc -b` green, 119 files ≤400 LOC).
> Two independent gates cleared this plan's inputs: bobby (architectural cold-review of the scaffold —
> **APPROVE**, 6/6 structural invariants PASS, zero unflagged decision-leaks) + jimmy (mechanical
> WP→file ownership matrix). Nothing here is self-reported.

## GO/NO-GO — HYBRID (campaign-parallel, WP-serial on shared files)

Campaigns are the parallel unit (they partition epics ⇒ disjoint REQs ⇒ disjoint packages). **Every
write-conflict is INTRA-campaign** (see §Conflict-map) — no cross-campaign shared writer exists — so
the campaign-parallel structure holds and the only serialization is *within* a campaign's own wave.

## Merge order (DAG-ordered — from the roadmap topo)

```
WAVE A : CAMPAIGN-1 ∥ CAMPAIGN-2      (kernel/persist floor  ∥  index)
WAVE B : CAMPAIGN-3 ∥ CAMPAIGN-4      (persist/mem host      ∥  grounding/knowledge/tools truth-gate)
WAVE C : CAMPAIGN-5                    (knowledge lifecycle — router/template/tier)
WAVE D : CAMPAIGN-6 ∥ CAMPAIGN-8      (retrieval/memory serve ∥ genesis bootstrap)
WAVE E : CAMPAIGN-7                    (tools public surface + atlas-diff; edge C7→C3 provenance)
```

Topo: {1,2} → {3,4} → {5} → {6,8} → {7}. A campaign opens only when its DAG-predecessors are SEALED.

## Package → WP fan-in (parallelism width)

| package | #WPs | package | #WPs |
|---|---|---|---|
| tools | 12 | memory | 7 |
| knowledge | 11 | kernel | 6 |
| persist | 8 | retrieval | 6 |
| index | 8 | grounding | 5 |
| genesis | 8 | **contracts** | **0** (pure types — frozen at scaffold, no WP) |

Total = 71 WPs. Cap ≤6 concurrent per wave for non-trivial prompts (techlead §1.4).

## Conflict-map — shared ref files (single-write-owner / sequencing)

Mechanically extracted (jimmy). Every co-writer pair is **intra-campaign**; classification:

| ref file | writers | campaign | verdict | order |
|---|---|---|---|---|
| `tools/ref/handler.ts` | 7.26-b, 7.26-c, 7.32.TOOLS | 7 | **SEQUENTIAL** (one dispatcher) | 7.26-b → 7.26-c → 7.32 |
| `index/ref/depgraph.ts` | 2.6, 2.8-b.INDEX | 2 | **SEQUENTIAL** | 2.6 (build) → 2.8-b (depends-on) |
| `index/ref/fold.ts` | 2.7-a, 2.7-b | 2 | **SEQUENTIAL** | 2.7-a (rollup) → 2.7-b (drift) |
| `knowledge/ref/router.ts` | 5.13-a, 5.13-b | 5 | **SEQUENTIAL** | 5.13-a → 5.13-b |
| `tools/ref/handler.ts` (also oracle for 7.26-a/b via rename R1) | 7.26-a, 7.26-b, 7.26-c, 7.32 | 7 | **SEQUENTIAL** (one dispatcher) | 7.26-a → -b → -c → 7.32 |

Read-only cross-package consumers (NOT co-writers, no conflict): `index/ref/depgraph.ts` ← WP-2.8-b.RETR
(guardrail "MUST NOT edit index/**"); `kernel/ref/fold.ts` ← WP-7.32.PERSIST (reused fold oracle).

**Everything else is CONFLICT-FREE** at package grain. Caveat (§Reconciliation R4): the 15 ref-naming
WPs are file-pinned; the other 56 are req/golden-anchored — their intra-package file-disjointness rests
on the facet-narrative + single-package guardrail, to be made mechanical at digest-freeze.

## Reconciliation registry — MUST close before/at digest-freeze

| # | item | detail | close where |
|---|---|---|---|
| R1 | **Dangling ref pointers** ✅ CLOSED | tools cards named `tools/ref/{store,tool,ladder}.ts`; scaffold has them under real facet names. Rename applied (read-of-cards): `store→guard` (writePaths/single-write-door; surface=Tool union in types.ts, append-only store=@atlas/persist), `tool→handler` (pure/total wrapper + Verdict guidance stamp), `ladder→transport`. Nothing missing — pure rename; input-list dups deduped. | DONE in wp-campaign-7.md |
| R2 | **`@orchestra/*` residual** ✅ CLOSED | was 3 occ of `@orchestra/kernel` in 2 cards (WP-1.1-a.KERNEL ×2, WP-4.10-a.GROUND ×1) → `@atlas/kernel`. (The `merge=orchestra-atlas` git driver name is unrelated — kept.) | DONE in wp-campaign-{1,4}.md |
| R3 | **Reference contradictions** (bobby tripwires — scaffold correctly refused to invent) | (a) Event shape: atlas-kernel vs fspec-merge (KERNEL-10, scaffold pinned fspec-merge, dropped kind/actor/at); (b) ClaimEntry = kernel Event vs atlas-knowledge `{claimNorm,claimText,provenance}`; (c) KNOW fields owner/scope/predicateSlot/supersededBy required-by-invariant, absent from record; (d) frecency vs hits (scaffold pinned MEM-7 frecency). | reconciled IN the owning WP (KRN/KNW/MEM data-model WPs) — flagged in ref, not a blocker |
| R4 | **File-ownership for the 56 req-anchored WPs** | make each WP's owned `src/<facet>.ts` mechanical by binding source_reqs→facet at digest-freeze, so intra-package disjointness is proven not asserted | digest-freeze tooling |

R1+R2 are trivial text fixes (do before wave). R3 is designed-in (each is a 1-line ref FLAG the WP resolves against the reference). R4 is the digest-freeze deliverable.

## Per-WP execution machine (deferred — Phase 3, off critical path)

Each WP runs BIND→RED→GREEN→REFACTOR*→GATE→SEAL (RED = confirm the frozen golden fails, not author it;
model never writes FS — orchestration applies post-gate; mutation-at-seal catches false-green). Not built
yet; the wave cannot execute until it + the digest-freeze tooling exist.

## Definition of Done (per WP)

GATE green (typecheck + the WP's frozen goldens, by reference) ∧ cold-review APPROVE (decorrelated seat)
→ SEAL. Merge in the DAG order above; main stays green; ≤400 LOC/file holds (godfile-guard in CI).
