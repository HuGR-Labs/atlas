# atlas-grounding — Reference

> owner: charlie (FORGE) · grounding: claims checked against `spec/atlas.md` §3.1, A-1, A-2, A-9, A-13 and the `@orchestra/kernel` encoder seam · status: draft

## Purpose

Grounding is the Atlas's trust primitive: the content-addressed receipt that anchors a fact to a
**structural unit** of the code. It supplies the truth-gate (a fact serves `HOLDS` only while its
grounding re-checks FRESH) and the admission bar (a fact enters only if it is both true and useful).
This module owns the structural anchor, drift detection, and the two-door gate — no storage, no index.

### Scope & honest limit — structure, not truth

Grounding proves exactly one thing: **the cited unit's normalized structure is unchanged since the
receipt was taken.** It does **NOT** prove the claim is still true. FRESH ≠ true; DRIFTED ≠ false. Two
gaps follow, and the module MUST NOT phrase around them (honestidade inegociável):

- **False alarm.** A behavior-preserving refactor (extract helper / inline) drifts the normalized
  subtree ⇒ a still-true fact flips BROKEN.
- **False negative.** A behavior-**changing** edit to a *callee* leaves a *caller*-anchored fact FRESH
  though it is now false — the caller's own bytes did not move.

The gate therefore narrows false HOLDs; it does not eliminate them. GROUND-11 closes the false-negative
gap structurally by folding the dependency axis; the false-alarm gap is bounded by drift-classification
(mechanical re-ground, see `atlas-knowledge` KNOW-5), never by claiming FRESH means true. KNOW-5's
mechanical-vs-semantic split is decidable **only for predicate facts** (facts carrying a re-runnable
`check`); an **advisory** fact has no such mechanical re-derivation and MUST take the `STALE` path
instead (GROUND-13), never either arm of the split.

## Data model

Grounding anchors to a `StructRef`, identified by the BLAKE3 hash of its **normalized subtree**
(`subtreeHash`) — **not** line numbers. Line numbers are fragile: an import added above, a reformat,
or an unrelated rename shifts them and would drift a fact whose code did not change. Line-ranges are
therefore demoted to an optional display hint and are **never** the drift oracle.

```
Grounding      = { entries: GroundingEntry[] }              // sorted by anchor
GroundingEntry = {
  anchor:        StructRef,   // THE DRIFT ORACLE — hash of the normalized structural unit
  path:          string,      // repo-relative, for humans/navigation
  displayLines?: string,      // OPTIONAL nav hint ("42-50") — NEVER the drift oracle
}
StructRef      = { kind:'symbol'|'block'|'file'|'repo'|'project', qualifiedPath: string, subtreeHash: string }
                 // 'repo'/'project' anchors a global rule to a POLICY ARTIFACT's relevant heading/section
                 // BLOCK subtreeHash (territories manifest / CONVENTIONS.md#section), NOT the file byte-hash —
                 // grounded-to-policy, never anchorless (GROUND-12)
Freshness      = 'FRESH' | 'DRIFTED' | 'STALE'   // STALE = advisory drift: non-blocking, served-with-flag (GROUND-13)
Status         = 'HOLDS' | 'BROKEN' | 'NA' | 'advisory'
```

- **The drift oracle is `subtreeHash`**, computed over the unit's **normalized** AST subtree
  (whitespace, comments-if-configured, and De-Bruijn / param-name / lifetime noise erased — reuse v1's
  `SymRef` / `normalizedSignature`).
- **Hash function: BLAKE3**, reached through the `@orchestra/kernel` encoder seam (KERNEL-2), chosen
  because its native Merkle tree *is* the hierarchical index (see [atlas-index](./atlas-index.md)).
- **Fallback:** a non-parseable file (`kind:'file'`) anchors on the BLAKE3 of its bytes — the weakest
  rung, isolated to where structure is unavailable.

> **Move-awareness note (KNOW-15 precondition).** `subtreeHash` is a BLAKE3 **equality** oracle: it
> catches a PURE move/rename (identical normalized subtree relocated) but NOT a rename co-occurring with
> a body edit — the common case — whose hash differs. Therefore `atlas-knowledge` KNOW-15's "move-aware
> `primaryAnchorId`, never orphans" MUST NOT be built on `subtreeHash` equality; it requires a real
> **similarity matcher (GumTree / RefactoringMiner-grade)**. Until that matcher is specified as its own
> sub-spec, KNOW-15 is **NOT delivered** — hash-equality alone will orphan a moved anchor and spuriously
> CREATE a duplicate fact. Flagged here because grounding supplies the equality primitive KNOW-15 must
> not overtrust.

> **Hash-consistency note (sanity-fix #8).** Grounding hashes with **BLAKE3**; a downstream consumer's
> relay-token (e.g. the Orchestra orchestrator) may hash a brief with **SHA-256** (`relayToken =
> sha256(canonical(brief))`). These are **separate contracts, not a bug** — but a consumer SHOULD route
> its hashing through the Atlas kernel encoder seam so the system has one swappable hash authority.
> Aligning them is a consistency recommendation, not a required change to either contract.

## Invariants

- **GROUND-1 Structural anchor, not lines.** A grounding entry's drift oracle MUST be its `subtreeHash`.
  `displayLines` MUST NOT participate in drift detection. Line-ranges alone are NEVER a valid anchor.
- **GROUND-2 Real grounding.** A `Grounding` is real iff it has ≥1 entry and every entry carries a
  non-empty `subtreeHash`. An ungrounded grounding MUST NOT ever be FRESH.
- **GROUND-3 Fail-closed resolution.** An unresolvable citation (unit gone, path absent) MUST fail
  closed — dropped by `ground()`, treated as `DRIFTED` by `driftDetect()`. It MUST NOT throw.
- **GROUND-4 Truth-gate.** → see spec **A-1**; enforced in atlas-grounding by `gateHolds` (GROUND-2/3/5
  supply the grounded ∧ FRESH inputs it gates on).
- **GROUND-5 Semantic drift only.** A semantically-irrelevant edit (reformat, import added above,
  unrelated rename) MUST NOT drift a fact; a real change to the cited unit MUST drift it.
- **GROUND-6 Fail-closed write.** → see spec **A-2**; enforced at `emit` (atlas-tools TOOLS-7) — ungrounded
  facts do not enter.
- **GROUND-7 Admission — two doors.** A fact is admitted iff it passes **both**: (1) **truth** — its
  grounding re-checks FRESH (GROUND-4); and (2) **usefulness** — it is actionable AND non-obvious. A
  true-but-obvious fact is noise and MUST be rejected. Failing either door blocks admission.
- **GROUND-8 Provenance.** → see spec **A-9**; enforced in atlas-grounding — an `untrusted`-source claim is
  excluded from `gateHolds`.
- **GROUND-9 Templated write.** → see spec **A-13**; enforced at `emit` — no free-prose fact persists.
- **GROUND-10 Hash via the seam.** `subtreeHash` MUST be computed through the `@orchestra/kernel`
  encoder seam, not a locally-inlined hash call — so the function stays swappable (KERNEL-2).
- **GROUND-11 Freshness folds the forward closure — on interface, not full body.** A fact's freshness
  MUST fold **both** (a) its own grounding-set's `subtreeHash` **and** (b) its forward-closure's
  **interface/signature-level `rState`** (the type/contract-relevant structure) on the dependency axis
  (INDEX-12) — **NOT** the callee's full-body `subtreeHash`. Folding a callee's full body would drift
  every caller on any behavior-**preserving** edit inside that callee (a transitive over-approximation);
  folding only the interface means a callee whose **signature/contract** changed MUST DRIFT its
  callers, while a pure-body refactor of that callee MUST NOT. Freshness MUST be phrased as "the cited
  unit **and its dependencies' interfaces** are structurally unchanged," never as "the claim is true."
- **GROUND-12 Repo-global grounding target — block, not file byte-hash.** A genuinely repo-wide rule
  with no single symbol anchor ("all handlers must be idempotent") MUST be groundable to the spatial
  `repo`/`project` level, anchored to a **policy artifact**. Because `CONVENTIONS.md` and the
  `territories` manifest are parseable and are already **block-level structural CAS nodes** (docs are
  first-class hashed objects), the anchor MUST be the **relevant heading/section block's `subtreeHash`**,
  NOT the whole-file byte-hash. Anchoring to the file hash would re-import the byte-hash fragility
  grounding exists to escape — any unrelated edit to that file would drift **every** global rule. The
  whole-file byte-hash is reserved for genuinely **non-parseable** policy files. This is a legal
  grounding target: it satisfies GROUND-2/A-2 fail-closed (still ≥1 real anchor). A rule with **no**
  artifact anchor stays anchorless and MUST be rejected — the level legalizes global rules, it does not
  admit truly anchorless facts.
- **GROUND-13 Advisory drift is non-blocking — `STALE`, not the KNOW-5 split.** A **predicate** fact
  (carrying a re-runnable `check`) that drifts takes the KNOW-5 mechanical/semantic split. An
  **advisory** fact (the day-one default; verdict-free, no `check`) has **no** mechanical "does the claim
  still re-derive" test, so it MUST NOT be forced into either arm: a silent mechanical re-ground would
  serve a blind/stale claim as FRESH, and a semantic block would impose merge toil on a fact that is
  non-blocking by construction. An advisory fact whose grounding drifts MUST resolve to `STALE` —
  served-with-flag: **never** silently re-grounded, and it MUST NOT block a merge. `STALE` is honest
  (the flag is visible) and costs no toil (advisory carries no verdict to defend).

## Surface / API

```
ground(node, src): Grounding          // re-derive the anchor@src; unresolvable entries dropped (GROUND-3)
driftDetect(grounding, src): Freshness// FRESH iff every anchor's subtreeHash matches AND the forward-closure INTERFACE rState is unchanged (GROUND-11); an advisory fact's drift resolves to STALE not DRIFTED (GROUND-13); else DRIFTED
isGrounded(g): boolean                // ≥1 entry ∧ every entry has a non-empty subtreeHash (GROUND-2)
gateHolds(candidate, grounding, src): Status  // HOLDS only if grounded ∧ FRESH, else NA (GROUND-4)
admit(fact): boolean                  // both doors: truth (gateHolds FRESH) ∧ useful (actionable+non-obvious)
```

- All five MUST be pure and total: no clock, no IO, no global state, no throw-for-logic.
- `gateHolds` MUST pass non-`HOLDS` verdicts through unchanged; it only ever downgrades `HOLDS`→`NA`.

## Acceptance

1. **GROUND-1 / GROUND-5** — A real change to the cited unit ⇒ `DRIFTED`; a reformat, an import added
   above it, or an unrelated rename ⇒ still `FRESH`.
2. **GROUND-2** — An empty grounding ⇒ `isGrounded==false` and `driftDetect==DRIFTED`.
3. **GROUND-3** — A citation whose unit/path is gone ⇒ dropped by `ground`, `DRIFTED` by `driftDetect`,
   no throw.
4. **GROUND-4 / GROUND-6** — A `HOLDS` candidate that is ungrounded or drifted serves `NA`; `emit` of an
   ungrounded node ⇒ `emitted:false`, nothing persisted.
5. **GROUND-7** — A grounded, drift-FRESH but *obvious* fact is rejected at admission (usefulness door);
   an ungrounded-but-useful fact is rejected at the truth door.
6. **GROUND-8** — An `untrusted`-source claim is advisory and absent from the gate's inputs.
7. **GROUND-9** — A fact missing a required template field, or over cap, is rejected; no free-prose fact
   is persisted.
8. **GROUND-10** — Grep the module: the only hash call goes through the kernel encoder seam.
9. **GROUND-11** — A callee **interface/signature** change (caller bytes untouched) flips the caller's
   forward-closure interface `rState` ⇒ the caller-anchored fact reads `DRIFTED`, not FRESH; a pure
   behavior-preserving **body** refactor of that callee (signature unchanged) leaves the caller `FRESH`;
   a fact with an empty forward closure is unaffected. The freshness verdict never asserts the claim is
   true.
10. **GROUND-12** — A repo-wide rule grounded to a `CONVENTIONS.md` **section block** (a `repo`/`project`
    `StructRef` carrying that block's `subtreeHash`) is `isGrounded==true` and admits; editing **that
    section** drifts it, while an unrelated edit elsewhere in the same file does NOT; the same rule with
    no artifact anchor is rejected fail-closed (anchorless).
11. **GROUND-13** — An advisory fact whose grounding drifts reads `STALE` (not `DRIFTED`), is served
    with the stale flag, and does not block a merge; a predicate fact's drift instead takes the KNOW-5
    mechanical/semantic split.
