# ADR-0014 — a unit's grounded bytes include its bound leading doc-comment

- **Status:** Proposed (2026-08-09). The *finding* (GAP-2) is measured on the shipped binary; the
  *unit-boundary redefinition* and the *repo-wide hash re-key* it forces are **NOT yet ratified** — this ADR
  is written so the owner ratifies a measured scope, not a summary. See §"What the owner still has to ratify".
- **Spec author:** lead, grounded against master `ce91a08`.
- **Resolves:** GAP-2 — a fact derived from a declaration's leading doc-comment is anchored to a symbol unit
  whose `subtreeHash` does NOT cover that comment, so a comment-only edit that invalidates the fact reads
  **FRESH**. Confirmed live end-to-end through the shipped `driftDetect`.
- **Scope of the blind spot (measured, do not overstate):** the **symbol frontier only** (`ATLAS_FRONTIER=
  symbol`, #182, OFF by default). The default file frontier is NOT affected — a file node's `subtreeHash`
  commits to the whole file's bytes, comments included. This ADR is therefore a **precondition for turning on
  symbol-granular recall**, not a fix to a default-path defect.
- **Amends (ratified surfaces):** the unit-boundary definition that feeds `INV-GROUND-1` / `INV-GROUND-5`
  (what constitutes "the cited unit's OWN bytes"). It does **not** change the *text* of GROUND-5; it changes
  the *extent* of the unit the text quantifies over. Why that is not the same as breaking GROUND-5's golden is
  defended below.
- **Forces:** a repo-wide `subtreeHash` re-key (`FOLD_DOMAIN` `v2`→`v3`), because a unit's hash feeds its
  parent file's hash (Merkle). The `v1`→`v2` precedent (#112) established the machinery.
- **Does NOT touch:** the span carrier (`grounding/src/span.ts`), the drift path (`driftDetect` reads the
  node's `subtreeHash`, unchanged in mechanism), or GROUND-2 (every entry still carries `anchor.subtreeHash`).

## Context — the finding, quoted rather than paraphrased

`packages/adapter-io/src/ast.ts:206` slices a unit's bytes as the declaration node's own span:

```ts
content: src.slice(decl.node.startIndex, decl.node.endIndex),
```

Tree-sitter's declaration node does not include the leading comment (a comment is a *preceding sibling*), so
the slice excludes it. `packages/index/src/rollup.ts:83` folds a node's hash over **its own content plus its
named child hashes**:

```ts
return asSubtreeHash(id({ v: FOLD_DOMAIN, children: entries, content: material.content }));
```

The drift oracle (`grounding/src/subtree.ts`) rides that `subtreeHash`. So a fact whose evidence lives in the
declaration's leading doc-comment, anchored to the symbol unit, is watched by bytes that **exclude the comment
the fact came from**. A comment-only edit that makes the fact false leaves the unit hash byte-identical →
`driftDetect` returns `FRESH` → the truth gate serves a stale HOLD. This is the exact asymmetric failure the
grounding layer exists to remove (a false-negative lets the gate serve a stale fact), now located.

**Reachability (measured, not assumed).** Because `foldNodeHash` commits to a node's OWN content, the
**file** node's hash covers the whole file including all comments; only the **item/symbol** node's hash
excludes the leading comment. The identical leading-comment edit therefore drifts a file-anchored fact and
reads FRESH for a symbol-anchored fact — so the blind spot is symbol-arm-only. (Harness:
`atlas-genesis-micro/bin/governance-h2h.mjs`, `armDependenceProof`.)

**Interior comments are already covered, and this narrows the fix.** Member JSDoc *inside* a class/interface
body is part of the enclosing declaration's slice, so it is already in the unit hash and already drifts. The
gap is strictly the **leading** comment ABOVE a top-level declaration.

## Decision

**A unit's grounded bytes are extended upward to include its BOUND leading doc-comment.** "Bound" is defined
mechanically and narrowly, precisely so the ratified GROUND-5 golden survives (§ next):

> A **bound leading doc-comment** is the maximal run of `comment` nodes immediately preceding a top-level
> declaration (or its `export`/`export default` wrapper) such that (1) each comment and the next
> comment/declaration are on **consecutive lines** — no blank line anywhere in the run or between the run and
> the declaration — AND (2) the run is **not the file's leading comment** (it is preceded, on the token
> stream, by at least one earlier top-level construct — an import, a statement, or another declaration). A
> run that begins at the start of file, or is separated from the declaration by any blank line, is **not
> bound** and is **not** included.

The unit's `subtreeHash` is then computed over `[boundCommentStart, decl.endIndex)`. Rejected alternative
[B] (a divergent comment-inclusive anchor hash that leaves the structural `subtreeHash` untouched) is
recorded below.

### Why the alternative was rejected — recorded because it avoids the migration and is therefore tempting

[B] keeps `FOLD_DOMAIN` at v2 (no re-key) by minting, for symbol-arm facts only, a *second* hash over
(comment ‖ unit) and anchoring to that. It was rejected because it splits the one thing whose singleness is a
security property: `driftDetect` compares `anchor.subtreeHash` against **the node's** `subtreeHash`
(`compose.ts:70`). Under [B] the anchor hash and the node hash are computed by different rules, so either
`driftDetect` learns a second recompute path (a branch in the sacred drift leg — exactly the surface that has
already fail-opened twice, #176/#101), or every symbol-arm fact reads permanently DRIFTED. GROUND-1 says the
anchor **is** the unit's `subtreeHash`; [A] keeps that identity true, [B] breaks it. A one-time migration is
cheaper than a permanent fork in the oracle.

## Why the ratified GROUND-5 golden SURVIVES — the load-bearing claim, defended not assumed

The ratified golden (`docs/design/functional-surface.md:93`, `product-framing.md:115`, `atlas-grounding.md:
164`) requires:

> "the cited unit's OWN bytes unchanged though the file around it changed (import or **license header added
> above it**, unrelated rename elsewhere) → stays FRESH"

The **license/module header** is the file's leading comment: it sits at start-of-file, above the first
declaration, and is file-level, not documentation bound to any one declaration. Clause (2) of "bound"
**excludes** it — a file-leading run is never attached to a unit — so editing (or adding) a license header
still changes no unit's bytes and still reads FRESH. Clause (1) (no blank line) means an import added above a
declaration, or a header separated by a blank line, is likewise outside every unit's slice. So the golden's
three enumerated cases — import-above, license-header-above, unrelated-rename-elsewhere — **all remain FRESH**
under [A]. What newly drifts is exactly and only the case the golden never covered: an edit to the doc-comment
**bound to** the cited declaration, which is a change to that declaration's own documented meaning — correct
to drift.

This is therefore an **extent** change (what "the unit's own bytes" spans), not a **contradiction** of
GROUND-5's rule (unchanged own bytes ⇒ FRESH). The rule holds verbatim; the boundary it quantifies over moves
by a precisely-bounded, header-excluding amount.

## The migration — stated with its blast radius, not hand-waved

`FOLD_DOMAIN` bumps `atlas.index.node.v2` → `atlas.index.node.v3`. Because the fold is Merkle, **every**
node whose subtree contains at least one bound-doc-commented declaration re-keys — which in practice is nearly
every file node, so the re-key is effectively repo-wide, identical in shape to #112's v1→v2. Consequences:

1. Every stored fact reads DRIFTED exactly once, then re-grounds at the new hash. The re-ground path
   (`--accept-reground`, WP-N1, shipped) is the sanctioned mechanism; a bulk re-ground step is required at
   migration time.
2. Version detection must recognise a v2 anchor and route it to re-ground rather than to a false BROKEN. #112
   is marked closed for "no version detection"; WP-1 must CONFIRM that path is live and add a golden if it is
   only implicit.
3. Every hash-constant golden that pins a v2 literal moves. Per #104 ("no golden pins a hash constant" — now
   closed), the new literals must be pinned, not left free.

## Goldens this decision requires (authored in WP-1, listed here so completeness is auditable)

- **G-GAP2-1 (the fix):** a fact anchored to a symbol unit; edit ONLY its bound leading doc-comment so the
  fact is now false ⇒ **DRIFTED**. (Today: FRESH. This is the regression the ADR closes.)
- **G-GAP2-2 (golden preserved — header):** add/modify a file license/module header ⇒ the first declaration's
  unit stays **FRESH**. (Guards clause (2).)
- **G-GAP2-3 (golden preserved — import):** add an import above a declaration (blank-line separated from any
  comment) ⇒ **FRESH**. (Guards clause (1); this is SCN-GROUND-5b, must not regress.)
- **G-GAP2-4 (boundary — blank line):** a comment separated from the declaration by a blank line ⇒ NOT
  attached; editing it ⇒ **FRESH**.
- **G-GAP2-5 (reformat still drifts):** a reformat inside the now-extended unit (including inside the bound
  comment) ⇒ **DRIFTED** (REQ-GROUND-5b, unchanged).
- **G-GAP2-6 (hash constant pinned):** the v3 `subtreeHash` of a fixture unit is pinned to a literal (#104).

## What this ADR does NOT close

- **GAP-1 (variable-granularity anchoring).** A fact that spans a SET of units, or is file-level, still has no
  minimal-set anchor. That is the sibling decision (WP-2), deliberately separate: GAP-2 is a boundary
  redefinition of a single unit; GAP-1 is a new multi-anchor shape.
- **The UTF-16→UTF-8 offset hazard for interior spans** (`grounding/src/types.ts`, #159). Extending the unit
  slice uses `String.slice` (UTF-16), consistent with tree-sitter, so the *slice* is correct; but any future
  span minted INTO the extended unit inherits the documented byte-offset conversion duty. Named so it is not
  rediscovered.
- **Whether symbol-arm recall is turned ON by default.** This ADR makes it SAFE to turn on; the default flip
  is a separate call on measured recall/precision (the bundle's WP-3).

## What the owner still has to ratify

1. **The unit-boundary redefinition.** "A unit's grounded bytes include its bound leading doc-comment" changes
   the ratified meaning of `subtreeHash`'s preimage. The GROUND-5 golden is preserved (defended above), but the
   *definition* of a unit is a ratified surface and the change is the owner's to accept.
2. **The repo-wide `v3` re-key.** A one-time DRIFTED-then-reground of the whole store. Recommended together
   with #1, since the boundary change is what forces it; approving one without the other is incoherent.

**Lead recommendation: ratify both, as [A].** The alternative that avoids the migration ([B]) buys it with a
permanent branch in the drift oracle — the one component whose simplicity is the product's differentiated
edge. Pay the one-time migration; keep the oracle single-path.
