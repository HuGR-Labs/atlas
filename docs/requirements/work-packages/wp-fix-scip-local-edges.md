# Work Packages — HOTFIX (out-of-band, not S4-campaign)

> A single standalone WP card for a soundness fix found by measurement against the real repository, not
> authored fresh from a requirement. Conforms loosely to
> [`method/wp-template.md`](../../method/wp-template.md) where the template fits an already-executed
> hotfix; the `exec` fields (`outputs`/`provenance`/`trace_ref`) are FILLED, not empty, because this WP
> is DONE, not S4-frozen for later dispatch. Pointers are relative to this file
> (`docs/requirements/work-packages/`).

---

### WP-FIX-1.INDEX — `deriveEdges` joined document-scoped SCIP `local` symbols across documents (#189)

epic: none (out-of-band hotfix, dispatched by the lead with the mechanism + magnitudes pre-measured — not
  carried by any CAMPAIGN)
id: WP-FIX-1.INDEX
title: Fix `deriveEdges` (`packages/index/src/build.ts`) fabricating cross-document dependency edges from
  SCIP `local N` symbols

intent: >
  `deriveEdges` keyed its definition map (`defs: Map<string, Hash>`) on the RAW SCIP symbol string, GLOBAL
  across every document, first-definition-wins. The SCIP symbol grammar (`@c4312/scip` `scip_pb.d.ts`,
  mirroring `scip.proto` verbatim: `<symbol> ::= <scheme> ' ' <package> ' ' (<descriptor>)+ | 'local '
  <local-id>`, "Local symbols MUST only be used for entities which are local to a Document") makes a
  `local` symbol's ENTIRE identity the literal `local N` string with no scheme/package to disambiguate —
  so `local 2` in one document and `local 2` in an unrelated document collide in the global map, and the
  second document's reference resolves to the FIRST document's definition: a fabricated cross-document
  `resolved` edge the SCIP data never asserted. Confirmed against this repo's own regenerated
  `.atlas/index.scip` (513 documents, 142,676 occurrences, 44,116 of them `local N` — 30.9%): 283 `local`
  symbols were defined in more than one document pre-fix.

  THE FIX (frozen by the lead, verified against the SCIP grammar rather than taken on faith — see the
  framing-error section below): a `local `-prefixed symbol contributes NO edge, on EITHER side (excluded
  from both the `defs` population loop and the `reference` loop). The dependency axis's endpoints are
  `docHash(doc.relativePath)` — its edges are BETWEEN DOCUMENTS — and a document-scoped symbol carries
  zero information about an inter-document dependency by construction; the only edge it could faithfully
  produce is a self-edge, which adds nothing to a dependency graph. `isLocalSymbol = symbol.startsWith
  ('local ')` is the exact, spec-anchored predicate (confirmed against the real dump: every `/^local/i`
  occurrence renders as exactly `local N`, never any other spelling).

  MEASURED, on this repo's real regenerated index (via the production `composeRuntime` path —
  `walkFileTree` → `foldAstUnits` → `build`, run through the built `dist/`, not reasoned about from
  source): total edges 6,753 → 2,202 (removes 4,551: 4,525 `resolved` + 26 `unresolved`); the downstream
  GEN-15c `structuralFrontier` (`packages/genesis/src/seeds.ts`) reports IDENTICAL seed counts before and
  after — 513 seeds, 0 `droppedNoPath`, both sides — because every real TS file that `scip-typescript`
  indexes carries at least one non-local reference (an import), so no document's dependency-axis NODE
  (not edge) is ever local-symbol-only. No frontier site or structural seed is lost.

source_reqs:                             # ptr+digest — the existing requirement this fix restores compliance with
  - source: ../req-idx.md#REQ-INDEX-13c  # ptr+digest — "never fabricate a resolved target"; the defect fabricated a resolved target for a document-scoped symbol across an unrelated document

seam-freezes: [ ]   (single-file production fix, no cross-module obligation created)

anchor: `packages/index/src/build.ts:154-193` — `isLocalSymbol` (new) + `deriveEdges` (the two loops both
  now guarded)

interface_contract:                      # free-form (unchecked, per repo convention — see id-integrity gate header)
  - source: ../method-tags-idx.md#INDEX-3   (mechanical SCIP-derived build, `$0`-LLM)
  - source: ../method-tags-idx.md#INDEX-13  (unresolvable/cross-language edges declared, never guessed — the same never-fabricate posture this fix extends to document-scoped symbols)

exclusions:
  - `packages/e2e-blackbox/test/s9-retrieval-modes.blackbox.test.ts`,
    `s21-scip-forgery.blackbox.test.ts`, `s28-own-briefing.blackbox.test.ts` — NOT fixed here. All three
    use `local S` / `local G` as an arbitrary GLOBAL cross-document symbol name in their SCIP fixtures, to
    demonstrate an ordinary reference→definition edge between two files. That is a SCIP-illegal fixture on
    its own terms — the grammar reserves the `local ` scheme prefix for document-scoped symbols, so a
    conformant indexer would never emit a cross-document `local`-prefixed reference/definition pair in the
    first place — and this fix now (correctly) refuses to turn it into a resolved edge, which is exactly
    the SCIP-conformant behaviour REQ-INDEX-13c already required. Renaming the fixture symbol (e.g. `local
    S` → `sym S`) is a one-line, in-package fix that preserves each test's intent exactly, but it touches
    three files outside `packages/index/**` (a different package's owned fixtures) — out of this WP's
    declared surface. Flagged for the lead rather than actioned unilaterally; see the framing-error section
    below and the return card.
  - `packages/adapter-io/**`, `packages/genesis/**`, `packages/knowledge/**`, `packages/cli/**` — read-only
    reference only, to MEASURE the downstream site/seed consequence (see `intent` above); no source edit.
  - any other campaign's WP card — this is a deliberately NEW file so as not to collide with concurrent
    edits to `wp-campaign-*.md`.

action: exclude `local `-prefixed SCIP symbols from BOTH loops of `deriveEdges` (the `defs` population loop
  and the `reference` loop) via a new `isLocalSymbol` predicate, documented against the SCIP grammar; add a
  regression test (`packages/index/test/build.test.ts`, `SCN-INDEX-13c-3`) proving two documents that each
  define+reference `local 2` produce ZERO edges post-fix, proven RED against the unfixed source first.

action_surface: `[ read(packages/**), edit(packages/index/src/build.ts),
  edit(packages/index/test/build.test.ts),
  edit(docs/requirements/goldens-idx.md, new golden only),
  edit(docs/requirements/work-packages/wp-fix-scip-local-edges.md, new file only),
  run(tsc -b), run(vitest run), run(gates) ]`

guardrails: writes confined to `packages/index/src/build.ts` (in-place edit, no signature change to
  `build`/`deriveEdges`/`dependencyAxis`/`Axes`), one test added to the existing
  `packages/index/test/build.test.ts` (no new test file), one new golden entry, and this card; forbidden
  zones = every package outside `packages/index/**` (read-only), every other `work-packages/*.md`.

acceptance:
  - source: ../goldens-idx.md#SCN-INDEX-13c-3  # ptr+digest — the new golden this WP adds and satisfies
  Proof of teeth: `packages/index/src/build.ts` was backed up byte-level (`cp`), the pre-fix source
  restored from `git show origin/master:packages/index/src/build.ts` (never `git checkout`/`restore` in
  this worktree), the new test run against the UNMODIFIED source and observed RED — two fabricated
  `resolved` edges (`b.ts→a.ts` cross-document + `a.ts→a.ts` self-edge) where zero were expected — then the
  fix restored via `cp`, `diff -q` confirming byte-identical restoration, and the full suite re-run.

deps: [ ]   parallel_group: [P] (single-file, no dependency on any concurrent seat's WP)

exit_predicate: `packages/index/test/build.test.ts` green (all live cases, including `SCN-INDEX-13c-3`) ∧
  full `npx vitest run` reconciled exactly against the `origin/master` baseline (see the return card for
  the literal delta) ∧ `npx tsc -b` clean ∧ all six `harness/gates/*` exit 0.

context_refs:                            # closed list
  - source: ../req-idx.md
  - source: ../method-tags-idx.md

owner: INDEX territory · builder_id `charlie` (dispatched by the lead for a measured production fix)

outputs:
  - `packages/index/src/build.ts` — `isLocalSymbol` predicate + both `deriveEdges` loops guarded; 237 LOC
    total, well under the 400-LOC cap
  - `packages/index/test/build.test.ts` — `SCN-INDEX-13c-3` regression case added; 235 LOC total
  - `docs/requirements/goldens-idx.md` — `SCN-INDEX-13c-3` golden added under the existing REQ-INDEX-13c
  - `docs/requirements/work-packages/wp-fix-scip-local-edges.md` — this card

provenance:
  - branch `fix/scip-local-symbol-edges`, forked from `origin/master` at
    `d41aff4c00e9b5c9fbe37b0dd52c5eba59c2fdc0` (`d41aff4`)
  - worktree-local commit (see the lead's own `git log` on the branch for the final sha — this WP does
    not self-report a commit sha it did not mint)

trace_ref: manual — lead brief (mechanism + magnitudes pre-measured by the lead, frozen decision: a `local`
  symbol contributes no edge on either side) → this WP card + the file changes under `outputs`; no
  automated S0–S4 trace exists for an out-of-band hotfix

rationale:
  - source: ../req-idx.md#REQ-INDEX-13c

---

## What the lead's framing got wrong, and what it got right (measured, not asserted)

**Got right, confirmed against the real dump:** the exact spelling `local ` (with the trailing space) is
verified as the SCIP grammar's own literal, not merely the lead's prose — `@c4312/scip`'s `scip_pb.d.ts`
mirrors `scip.proto`'s `<symbol> ::= … | 'local ' <local-id>` verbatim, and every occurrence in this repo's
regenerated `.atlas/index.scip` matching `/^local/i` renders as exactly `local N`, never `Local N`,
`local:N`, or any other variant. The "no edge at all, on either side" decision is also confirmed correct
and SAFE: the downstream `structuralFrontier` seed count is identical (513/513) before and after, run
through the real production path, not reasoned about.

**Got wrong / unmeasured:** the fix — applied exactly as frozen — breaks 3 pre-existing tests OUTSIDE
`packages/index/**`: `s9-retrieval-modes`, `s21-scip-forgery`, `s28-own-briefing.blackbox.test.ts` all use
`symbol: 'local S'` / `'local G'` as an arbitrary two-file cross-document symbol name to demonstrate a
generic resolved edge. That usage was never legal SCIP to begin with (the grammar reserves the `local `
scheme prefix for document-local symbols), so the correct fix is renaming those three fixture symbols, not
adjusting `deriveEdges` — but it is a change to fixtures outside this WP's owned package, so it is reported
here rather than actioned. Not caught by reasoning about the brief in isolation; caught only by running the
full suite red before assuming green.
