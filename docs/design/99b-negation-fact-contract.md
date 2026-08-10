# #99b — NEGATION fact: frozen build contract

**Status:** FROZEN (lead pre-work, 2026-08-10). Lands the **D3** leg of
[ADR-0015](../adr/ADR-0015-grounding-tokens-are-typed-by-fact-shape.md) (owner-ratified 2026-08-09). This is
the SECOND third of the [#99](../../README.md) product limit ("Atlas cannot ground a negative, a relation, or
a transition") and the ADR names it *"the honesty core"* — the axis where the easy version ships a lie. The
[#99a RELATION contract](99a-relation-fact-contract.md) is the structural template (typed family, own identity
mint, own door traversal, reused oracle where sound).

> **Search-before-freeze done (2026-08-10, branch `feat/negation-fact-99b` off master `d7e2029`).** No prior
> negation work exists — `git branch -a`, `git worktree list`, and a `negation|abstain|absent` grep across
> `packages/**/src` returned nothing but unrelated fail-closed sentinels. This is a genuine build, not a rebase.
> Every surface cited below was READ, not assumed.

> **Owner framing RATIFIED 2026-08-10 (the two product-honesty commitments):**
> 1. **SYMBOL-level, not file-level.** The owner REFUSED the file-level proxy ("no file depends on X's file")
>    the shipped doc→doc graph grounds today, and requires the real *"symbol f is never called"*. This adds a
>    PREREQUISITE (N0): a symbol-keyed reverse graph in `@atlas/index`.
> 2. **Abstention emits an EXPLICIT `ABSTAINED` record** ("checked, scope not closed — cannot decide"), NOT a
>    silent fail-closed refuse. It must be *testable that it FIRES* (closes the #202 finding: 0/300 abstentions).

## 0. The crux this contract exists to resolve

A negation is `¬∃` over a relation ("no unit **calls** X"). Closed-world negation (Soufflé/Doop/DDlog) is sound
**only if the negated relation was computed COMPLETELY over the scope** — an under-approximated graph makes every
negative a lie. Atlas's shipped dependency graph IS an under-approximation (#189: cross-language/FFI targets are
`unresolved`, SCIP `local` symbols are document-scoped), so an **unscoped** negative has no witness and the door
**MUST refuse it**. The honest, groundable form is the **scoped positive**: *"within closed scope S under
edge-model E, no caller of X was found"* — falsifiable, carrying its own completeness proof.

The completeness machinery **already exists and is measured, not theory** (grounded 2026-08-10):

- `reverseClosure(node): { closure, underApprox, coChanged }` (`index/src/depgraph.ts`) already computes
  **`underApprox = true iff any unresolved/dynamic edge is in scope`** — the exact abstention trigger. It is
  WIRED and reachable (`retrieval-model.ts:72`, `index-adapter.ts:134`, `wire.ts:139`), **but every caller reads
  `.closure` and DROPS `.underApprox`.** #99b is the FIRST consumer of the honesty flag.
- `EdgeKind = 'resolved' | 'unresolved' | 'dynamic'` (`index/src/types.ts`) — `dynamic` is the open-world
  (reflective/FFI) boundary; `unresolved` is the incompleteness hole; `underApprox` folds both.
- `IndexerPlan.version` (`adapter-io/src/scip.ts:26`) — the pinned extractor release = the edge-model version.

**The one genuinely new grounding mechanism** is the *scope Merkle root* (§3): the shipped `subtreeHash` oracle is
per-unit and is **monotone-blind to a unit ENTERING the scope** — a new caller of X inserted as a brand-new unit
does not change any existing unit's hash. A negation's freshness MUST drift on insertion, so its token is a root
over the *set* of in-scope units, not a per-unit hash. This is D3's "insertion-sensitivity a per-unit hash lacks",
made concrete — the analogue of what `relationKey` was for #99a.

## 0a. THE PREREQUISITE (N0) — symbol-level reverse graph. Why the shipped `reverseClosure` is not enough.

The shipped `dependencyAxis` keys endpoints by `docHash(path)` (`build.ts:170` `deriveEdges` → `dependencyAxis`),
so `reverseClosure` answers at FILE granularity: *"which files depend on file F"*. The owner ratified SYMBOL
granularity, so N0 builds a **symbol-keyed** reverse graph over the SAME SCIP occurrences `deriveEdges` already
reads. Grounded that the data suffices (2026-08-10): `deriveEdges` already builds `defs: Map<globalSymbol,
docHash>` from `role==='definition'` occurrences and walks `role==='reference'` occurrences — it merely PROJECTS
symbol identity onto `docHash`. N0 retains the symbol:

- `reverseCallers(symbol X): { callers, underApprox }` where `callers` = the set of units (unitKey / docHash) that
  carry a `reference` occurrence of the **global** symbol X, and `underApprox` = X's scope contains an
  `unresolved`/`dynamic` reference (honest incompleteness), mirroring `depgraph.ts` exactly one granularity down.
- **Groundable only for a GLOBAL symbol X** (a non-`local` SCIP symbol string — its identity is stable across
  documents). A `local` symbol is document-scoped by the SCIP grammar, so its callers are ALL in its own document
  (findable by intra-doc AST, a different closed procedure) — **out of #99b v1 scope, stated honestly.**

N0 is a producer inside `@atlas/index` (the `$0`-LLM, deterministic axis-build layer). It does NOT change
`deriveEdges` / the doc-level `dependencyAxis` (those stay — `query --by dependency` depends on them); it ADDS a
sibling symbol-reverse view. Reference-model-vs-shipped: N0 must be WIRED (a production caller in `adapter-io`),
not left as a reference model — the #99a lesson (relationsOf was dormant until R3 wired it).

## 1. The NegationNode shape (knowledge/src/types.ts)

`GroundedFact` becomes a FOUR-variant union (the discriminant stays `kind`). A negation is advisory-CLASS for
ratification (it carries no `check`).

```ts
export type GroundedFact = AdvisoryNode | PredicateNode | RelationNode | NegationNode;

export interface NegationNode {
  readonly kind: 'negation';
  readonly id: NodeKey;                 // = negationKey (see §2); minted, never trusted from payload
  readonly tier: Tier;
  readonly relationKind: RelationKind;  // the NEGATED relation (reuse #99a's closed 'depends-on'|'calls')
  readonly target: string;             // the location-free GLOBAL symbol key X the negative is ABOUT (¬∃ · →X)
  readonly scope: string;              // the CLOSED scope S the completeness witness ranges over (identity leg)
  readonly grounding: Grounding;        // the COMPLETENESS WITNESS (see §3) — NOT a per-unit subtreeHash
  readonly freshness: KnowledgeFreshness;
  readonly claims: readonly ClaimEntry[];
  readonly authoring: 'NEGATED' | 'SUPERSEDED';
  readonly obviousness?: ObviousnessScore;   // ADR-0012, additive, absent-tolerant
}

/** The explicit honest-abstention record (owner-ratified). NOT a GroundedFact — it asserts NOTHING about the
 *  world; it records that the door was ASKED a negative it could not soundly decide, and why. Durable + read-
 *  back so "abstention fired" is observable (closes #202). */
export interface AbstainedRecord {
  readonly kind: 'abstained';
  readonly id: NodeKey;                 // = negationKey(the refused question) — same address the negation WOULD take
  readonly relationKind: RelationKind;
  readonly target: string;
  readonly scope: string;
  readonly reason: 'scope-open' | 'target-not-global' | 'scope-empty';   // WHY it could not decide (closed set)
  readonly witness: { readonly underApproxSources: readonly string[] };  // the unresolved/dynamic edges that opened S
}
```

**Why `scope` is an identity leg (not only grounding):** `(¬calls, X)` is a different FACT in scope `src/payments`
than in scope `src/` — the negative is only as strong as the scope it was proven closed over. Identity therefore
binds the scope; two negations over the same (kind, X) at different scopes are distinct nodes.

## 2. Identity — `negationKey` (knowledge/src/write/negation-key.ts, additive)

A NEW pure function, sibling to `relationKey`, mirroring its discipline (sealed kernel seam, total-over-unknown,
named `MalformedNegationError`):

```ts
/** negationKey(kind, target, scope) = hash(canonicalForm({neg: kind, t: target, s: scope})). The `neg` tag makes
 *  the preimage SET disjoint from relationKey's ({a,k,b}) and nodeKey's ({a,s[,c]}) — no cross-family address
 *  collision (the #103 discipline). Directed by construction (a negation is not symmetric). TOTAL over unknown:
 *  a non-string/empty target or scope, or an off-vocabulary relationKind, yields the refusal, never a raw throw. */
export function negationKey(kind: RelationKind, target: string, scope: string): NodeKey;
```

Refuses (`MalformedNegationError`, converted to a fail-closed verdict by the door) iff `target`/`scope` is not a
non-empty string, or `kind ∉ RELATION_KINDS`. An `AbstainedRecord` reuses the SAME `negationKey` address so a
later successful negation at the same question SUPERSEDES the abstention (the honest lifecycle: "couldn't decide"
→ later "decided false").

## 3. The completeness witness — the grounding (the one hard, genuinely-new sub-decision)

A negation's grounding is NOT a per-unit `subtreeHash`. It is the **completeness witness**:

- **`scopeRoot`** — a Merkle root over `{ unitKey · subtreeHash }` for EVERY in-scope unit that could emit a `→X`
  edge, sorted by unitKey. Drifts on: any in-scope unit's bytes changing (a hash moves) OR a unit ENTERING/LEAVING
  the scope (the set membership changes → the root changes). This is the insertion-sensitivity §0 names.
- **`edgeModel`** — the `IndexerPlan.version` string. An extractor upgrade can surface a previously-invisible edge,
  so it MUST invalidate the witness.
- (The assertion "no →X caller in S" is NOT stored — it is re-derived at HEAD by `reverseCallers(X)`.)

**`driftDetect` for a negation (the freshness oracle).** FRESH iff ALL hold at HEAD:
1. `reverseCallers(X).callers ∩ S == ∅` — still no caller (a caller inserted ⇒ DRIFTED);
2. `!reverseCallers(X).underApprox` — scope still CLOSED (a new unresolved/dynamic edge opened S ⇒ DRIFTED, and on
   a *fresh emit attempt* would ABSTAIN);
3. `scopeRoot` recomputed == stored — no in-scope unit changed AND none entered/left;
4. `edgeModel` == stored.

**HOW the witness rides the frozen `Grounding` model — N1 DESIGN RESIDUE, resolve with evidence, do not fabricate.**
ADR-0015's whole thesis is that the `subtreeHash` oracle is correct for exactly ONE shape; a negation needs a
DIFFERENT token. Two candidate encodings, to be decided in N1 against the frozen `Grounding`/`driftDetect` code
(grounding/src/{ground,drift}.ts) — the lead picks ONE with the code open, this contract does not guess:
  - **(a) a typed grounding token**: widen the grounding entry with a `witness` shape (`scopeRoot`+`edgeModel`) and
    branch `driftDetect` on the token type. Truest to the ADR; touches the sealed oracle.
  - **(b) a witness-anchor kind**: express the witness as one grounding entry whose `anchor.kind: 'witness'` and
    whose "subtreeHash" IS the `scopeRoot`, re-derived by recomputing the scope Merkle. Rides the existing
    entries[]/AND-fold with a new anchor-kind resolver; smaller blast radius on the oracle.
Whichever is chosen, the freshness must be the 4-clause conjunction above — the encoding is the residue, not the
semantics. This is the ONE place the contract defers a decision, and it defers it to *code-grounded* judgment, not
to a builder (AP-3).

## 4. Family, routing, door traversal (knowledge/write + adapter-io/governed-emit)

- `NodeFamily` widens to include `'negation'`; `routeWrite` for family `'negation'` mirrors advisory
  (contentHashHit ⇒ DEDUP, negationKey miss ⇒ CREATE, hit ⇒ UPDATE; never SUPERSEDE by routing — an
  `AbstainedRecord`→negation transition is an explicit supersede on the shared address).
- The negation enters the SAME governed door with the re-routes:
  - **gate 0.1 WELL-FORMED**: `target`/`scope` non-empty, `relationKind ∈ RELATION_KINDS`, and **`target` is a
    GLOBAL symbol** (not `local`) — else the door emits an `AbstainedRecord{reason:'target-not-global'}`.
  - **gate 1 TRUTH DOOR — the abstention gate (the honesty core).** Compute `reverseCallers(target)` over the
    scope. If `underApprox` (scope open) ⇒ **do NOT admit the negation; emit `AbstainedRecord{reason:'scope-open',
    witness}`** (durable, exit-legible, NOT a silent refusal). If a caller exists in S ⇒ the negative is FALSE ⇒
    reject (the claim is refuted, not abstained). Only `callers∩S==∅ ∧ !underApprox` admits the negation with the
    §3 witness as its grounding.
  - **gate 2.1 ANCHOR/AUTHZ**: bind the write scope on `scope` (the negation's own declared scope IS its authz
    scope — the assertion is ABOUT that scope). `primaryAnchorId` is NOT called.
  - the remaining gates (2.25 incumbent keyed on `negationKey`, 2.5 ratify as advisory-class, 3 upsert+put) apply
    verbatim.

## 5. Read surface (cli + mcp) + the abstention read

Mirror #99a's separate-command surface (owner-ratified divergence there; be CONSISTENT):
- `relationsOf`-style fold `negationsOf(projection, scope?)` and `abstentionsOf(projection, scope?)` (derive-on-read
  over `family:'negation'` / `kind:'abstained'` rows).
- CLI: `atlas negations <scope>` (grounded negatives) and the abstention MUST be visible — either a column/flag or
  `atlas negations <scope> --abstained`. MCP: an `atlas-negations` read tool, served through the shared verdict
  builder (CLI≡MCP bytes), OUTSIDE `GOVERNANCE_SURFACE`.
- **Honest-close inheritance:** the #99a §5 read-surface contract-divergence amendment is still owed on the
  99a doc; do the SAME shape here deliberately and record it, do not silently diverge.

## 6. WP decomposition (the wave)

DAG: **N0 (index prereq) → N1 (knowledge core) → { N2 door, N3 read } → N4 e2e.** N0 is a hard predecessor (nothing
grounds without the symbol-reverse graph); N1 freezes the shape+witness encoding; N2/N3 disjoint by owner-file.

| WP | owner-files (disjoint) | dep | DoD |
|---|---|---|---|
| **N0** | index/src (new `symbol-reverse.ts` + `index.ts`), adapter-io wiring (`wire.ts`/`index-adapter.ts`), tests | — | `reverseCallers(globalSymbol): {callers, underApprox}` over the SAME occurrences `deriveEdges` reads; doc-level `dependencyAxis` UNCHANGED; WIRED (production caller in adapter-io, not a reference model); unit tests incl. an inserted-caller and an `underApprox` (unresolved/dynamic) case |
| **N1** | knowledge/src/types.ts, negation-key.ts, router.ts, upsert.ts; the §3 witness-encoding decision | N0 | `NegationNode`+`AbstainedRecord` in the model; `negationKey`+`MalformedNegationError`; `NodeFamily` widened; witness grounding encoding CHOSEN with the oracle code open (§3); every exhaustive `.kind`/family switch handles 'negation'+'abstained'; `driftDetect` 4-clause freshness; unit tests incl. insertion-drift + scope-open-abstain |
| **N2** | adapter-io/src/governed-emit*.ts (+reasons), the abstention gate | N1 | the door computes `reverseCallers`, ABSTAINS (emits `AbstainedRecord`) on `underApprox`, REJECTS on a real caller, ADMITS only the closed-empty case; scope authz on `scope`; the crux tested (a scope-open question ABSTAINS, not silently drops); mutation-scoped per re-routed gate |
| **N3** | index/knowledge read folds, cli/src, mcp-server/src | N1 | `negationsOf`/`abstentionsOf`; `atlas negations` CLI + `atlas-negations` MCP; abstention VISIBLE on both; total (miss⇒empty); CLI≡MCP parity |
| **N4** | e2e-blackbox (new sNN) | N0-N3 | subprocess story: emit `(f, ¬calls, S)` grounded (f global, S closed) → `atlas negations S` finds it → INSERT a caller of f → the negation reads DRIFTED → a `¬calls` over an OPEN scope (unresolved/dynamic in S) EMITS AN ABSTAINED record, readable (proves abstention FIRES — closes #202) |

## 7. Blast-radius / ratification (GAP-2 rite)

- **ADR-0015 D3 is owner-ratified (2026-08-09);** the two mechanization commitments (symbol-level, explicit
  ABSTAINED) are owner-ratified (2026-08-10, this document's header). No NEW invariant amendment beyond the ADR.
- The `GroundedFact` union widening to a FOURTH variant ripples to every exhaustive `.kind` switch repo-wide — an
  R1-style audit (`grep '.kind ==='`, `case '…'`, `never` checks) is a NAMED N1 deliverable, exactly as #99a's
  blast-radius sweep found the render/doctor/genesis sites (all handled or Proposal-typed there; re-audit for the
  new variants).
- N0 touches the SACRED `@atlas/index` axis-build layer — **billy** (T0, it changes what edges the completeness
  oracle sees) AND **bobby** (T0-adjacent, it adds a sibling axis view — architectural) cold-review N0 before N1
  builds on it. **lucy** cold-reviews each WP; **billy** the door (N2, authz/identity/abstention-soundness).
  One-fix-round. Gates (layer/godfile≤400/spec-conformance/reference-model/id-integrity) on every WP.
- The honesty axis is where "honestidade inegociável" is load-bearing: an abstention that never fires, or a
  negation admitted over an open scope, is the exact failure this contract exists to forbid. N4's abstain-fires
  witness and N2's mutation on the `underApprox` branch are the teeth that prove it.
