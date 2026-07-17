# Work Packages — CAMPAIGN-7 (state S4)

> The governed tool surface & tri-transport. Epics EPIC-26-a / -b / -c, all single-module (**TOOLS**).
> Each epic is single-module ⇒ exactly one WP per epic and **no seam-freeze** (no cross-module obligation
> inside any of the three epics). TLS authors no FSPEC; it consumes KERNEL's store/`FSPEC-merge` frozen
> upstream — recorded as a consumed contract in `interface_contract`, never smeared into a WP it does not own.
>
> Driftless law: every substantive field below is a `ptr+digest` (the `# ptr+digest` marker; digest is
> tooling-filled at freeze). `intent` is the one prose carve-out (non-authoritative, executor-invisible).
> The `exec` fields (`outputs`/`provenance`/`trace_ref`) are present-but-empty at S4-freeze.

---

## EPIC-26-a — single governed write-door & store integrity

### WP-7.26-a.TOOLS — TOOLS slice of EPIC-26-a
epic: EPIC-26-a
id: WP-7.26-a.TOOLS
content_hash: <filled-at-freeze>
title: single governed write-door + append-only/permissioned store integrity
intent: >
  Wire the governance surface to exactly four tools with atlas-emit as the sole write path, refuse every
  back-channel / direct / ungrounded write at write-or-read, keep read projections read-only, and make each
  tool pure+total (malformed fails closed). Human handle only — non-authoritative.
source_reqs:                             # ptr+digest
  - source: ../req-tls.md#REQ-TOOLS-1a  # ptr+digest
  - source: ../req-tls.md#REQ-TOOLS-1b  # ptr+digest
  - source: ../req-tls.md#REQ-TOOLS-1c  # ptr+digest
  - source: ../req-tls.md#REQ-TOOLS-1d  # ptr+digest
  - source: ../req-tls.md#REQ-TOOLS-2a  # ptr+digest
  - source: ../req-tls.md#REQ-TOOLS-2b  # ptr+digest
  - source: ../req-tls.md#REQ-TOOLS-15a  # ptr+digest
  - source: ../req-tls.md#REQ-TOOLS-15b  # ptr+digest
  - source: ../req-tls.md#REQ-TOOLS-15c  # ptr+digest
seam-freezes: [ ]
anchor: # value
  target: the TOOLS governance layer — the four-tool surface {atlas-init, atlas-query, atlas-emit,
    atlas-reconcile} + the store medium; production tools differential-tested against the named reference
    oracles tools/ref/store.ts (surface/writePaths/append-only) · tools/ref/tool.ts (pure/total wrapper) ·
    tools/ref/emit.ts (fail-closed writer). Insertion site = the write-door + store-integrity entry points.
interface_contract:                      # ptr+digest
  - source: ../../reference/atlas-tools.md#tools-1  # ptr+digest
  - source: ../../reference/atlas-tools.md#tools-2  # ptr+digest
  - source: ../../reference/atlas-tools.md#tools-15  # ptr+digest
  - source: ../../reference/atlas-kernel.md#store  # ptr+digest
exclusions: # value
  - Adversarial security-exploitability of the write-door (shell-armed seat red-teaming the
    append-only/permission model) is billy / FR-12 (FORTRESS) — NOT authored here; 1c/15b/15c assert the
    FUNCTIONAL refusal only.
  - The KNOW-5 mechanical/semantic classifier and drift/reconcile behaviour (TOOLS-8/13) — not in this epic.
  - CLI/MCP parity, doctor, transports (EPIC-26-b / -c) — out of scope here.
inputs:                                  # ptr+digest
  - source: ../goldens-tls.md#concrete-fixture-universe  # ptr+digest
  - source: tools/ref/store.ts  # ptr+digest
  - source: tools/ref/tool.ts  # ptr+digest
  - source: tools/ref/emit.ts  # ptr+digest
action: # value (zero-decision recipe)
  Implement the four-tool surface + store so each acceptance SCN passes as a differential/conformance run
  against its named tools/ref/*.ts oracle; run the goldens harness; do not add a fifth governance tool or a
  second write path.
action_surface: # value
  [ Read, Edit, Write (TOOLS package only), run goldens/conformance harness, run PBT-fuzz for 2b ]
guardrails: # value
  - edit only within the TOOLS package + its tests; never edit ../reference/*, ../req-tls.md, ../goldens-tls.md
  - no new write path may surface; writePaths must stay == 1 (atlas-emit)
  - no network; deterministic (no wall-clock / mutable-cache reads — purity)
repair_budget: # value
  N: 3 ; early-stop on { repeated-identical-failure, no-change-diff, semantic-duplicate-edit }
acceptance:                              # ptr+digest = frozen goldens
  - source: ../goldens-tls.md#SCN-TOOLS-1a-1  # ptr+digest
  - source: ../goldens-tls.md#SCN-TOOLS-1b-1  # ptr+digest
  - source: ../goldens-tls.md#SCN-TOOLS-1c-1  # ptr+digest
  - source: ../goldens-tls.md#SCN-TOOLS-1d-1  # ptr+digest
  - source: ../goldens-tls.md#SCN-TOOLS-2a-1  # ptr+digest
  - source: ../goldens-tls.md#SCN-TOOLS-2b-1  # ptr+digest
  - source: ../goldens-tls.md#SCN-TOOLS-15a-1  # ptr+digest
  - source: ../goldens-tls.md#SCN-TOOLS-15b-1  # ptr+digest
  - source: ../goldens-tls.md#SCN-TOOLS-15c-1  # ptr+digest
deps: [ ]   parallel_group: —
exit_predicate: # value
  all 9 acceptance SCNs green ∧ conformance/PBT gates pass ∧ surface count == 4 ∧ writePaths == 1 ∧
  ungroundedRowsServed == 0 ∧ no tool throws on malformed input
context_refs:                            # closed list
  - source: ../../reference/atlas-tools.md#tools-1
  - source: ../../reference/atlas-tools.md#tools-2
  - source: ../../reference/atlas-tools.md#tools-15
  - source: ../goldens-tls.md
owner: charlie (FORGE)                                                            # value
outputs:                                             # exec — empty at S4-freeze
provenance:                                          # exec — empty at S4-freeze
trace_ref:                                           # exec — empty at S4-freeze
rationale:                               # ptr
  - source: ../invariant-register.md#INV-TOOLS-1
  - source: ../invariant-register.md#INV-TOOLS-2
  - source: ../invariant-register.md#INV-TOOLS-15
---

## EPIC-26-b — CLI/MCP parity, guidance & read-only doctor

### WP-7.26-b.TOOLS — TOOLS slice of EPIC-26-b
epic: EPIC-26-b
id: WP-7.26-b.TOOLS
content_hash: <filled-at-freeze>
title: CLI≡MCP parity on one schema + per-result guidance + read/advisory-only doctor
intent: >
  One published schema behind both the CLI and MCP adapters over the one handler (byte-identical results incl.
  identical malformed rejection), every Verdict carries {next, invariant} guidance, and atlas doctor stays a
  read/advisory-only diagnostic view whose proposed writes funnel through atlas-emit. Human handle only.
source_reqs:                             # ptr+digest
  - source: ../req-tls.md#REQ-TOOLS-3a  # ptr+digest
  - source: ../req-tls.md#REQ-TOOLS-3b  # ptr+digest
  - source: ../req-tls.md#REQ-TOOLS-4  # ptr+digest
  - source: ../req-tls.md#REQ-TOOLS-12a  # ptr+digest
  - source: ../req-tls.md#REQ-TOOLS-12b  # ptr+digest
  - source: ../req-tls.md#REQ-TOOLS-12c  # ptr+digest
seam-freezes: [ ]
anchor: # value
  target: the CLI + MCP adapters over the one handler tools/ref/handler.ts, the Verdict constructor
    tools/ref/tool.ts (guidance stamp), and the doctor projection tools/ref/doctor.ts. Insertion site = the
    two transport adapters + the doctor sub-command surface (archive / why-broken / hot-set / reground-plan).
interface_contract:                      # ptr+digest
  - source: ../../reference/atlas-tools.md#tools-3  # ptr+digest
  - source: ../../reference/atlas-tools.md#tools-4  # ptr+digest
  - source: ../../reference/atlas-tools.md#tools-12  # ptr+digest
  - source: tools/ref/handler.ts  # ptr+digest
exclusions: # value
  - The write-door + store integrity (EPIC-26-a) and the tri-transport node handler / spawn ladder
    (EPIC-26-c) — out of scope here.
  - doctor's diagnostic ANALYSES themselves (why-broken heuristics) are consumed, not authored here; this WP
    asserts only the read/advisory / no-persist / no-write-authority property.
inputs:                                  # ptr+digest
  - source: ../goldens-tls.md#concrete-fixture-universe  # ptr+digest
  - source: tools/ref/handler.ts  # ptr+digest
  - source: tools/ref/tool.ts  # ptr+digest
  - source: tools/ref/doctor.ts  # ptr+digest
action: # value
  Build the CLI+MCP adapters over the one handler and the doctor projection so each acceptance SCN passes:
  the PBT witnesses (3a/3b) prove cli(x) ≡ mcp(x) incl. malformed; the conformance SCNs prove per-result
  guidance and doctor no-write-authority. Run the goldens harness.
action_surface: # value
  [ Read, Edit, Write (TOOLS package only), run goldens/conformance harness, run PBT equivalence harness for 3a/3b ]
guardrails: # value
  - edit only within the TOOLS package + its tests; the two transports MUST NOT diverge (no MCP-only envelope,
    no CLI-only coercion)
  - doctor must add no store-mutating method; directStoreMutations must stay == 0
  - governance surface stays == 4 (doctor is not a fifth tool)
repair_budget: # value
  N: 3 ; early-stop on { repeated-identical-failure, no-change-diff, semantic-duplicate-edit }
acceptance:                              # ptr+digest = frozen goldens
  - source: ../goldens-tls.md#SCN-TOOLS-3a-1  # ptr+digest
  - source: ../goldens-tls.md#SCN-TOOLS-3b-1  # ptr+digest
  - source: ../goldens-tls.md#SCN-TOOLS-4-1  # ptr+digest
  - source: ../goldens-tls.md#SCN-TOOLS-12a-1  # ptr+digest
  - source: ../goldens-tls.md#SCN-TOOLS-12b-1  # ptr+digest
  - source: ../goldens-tls.md#SCN-TOOLS-12c-1  # ptr+digest
deps: [ WP-7.26-a.TOOLS ]   parallel_group: [P] with WP-7.26-c.TOOLS
exit_predicate: # value
  all 6 acceptance SCNs green ∧ PBT equivalence (cli≡mcp incl. malformed) holds ∧ emptyGuidance == 0 ∧
  directStoreMutations == 0 ∧ surface stays == 4
context_refs:                            # closed list
  - source: ../../reference/atlas-tools.md#tools-3
  - source: ../../reference/atlas-tools.md#tools-4
  - source: ../../reference/atlas-tools.md#tools-12
  - source: ../goldens-tls.md
owner: charlie (FORGE)                                                            # value
outputs:                                             # exec — empty at S4-freeze
provenance:                                          # exec — empty at S4-freeze
trace_ref:                                           # exec — empty at S4-freeze
rationale:                               # ptr
  - source: ../invariant-register.md#INV-TOOLS-3
  - source: ../invariant-register.md#INV-TOOLS-4
  - source: ../invariant-register.md#INV-TOOLS-12
---

## EPIC-26-c — tri-transport addressability & spawn ladder

### WP-7.26-c.TOOLS — TOOLS slice of EPIC-26-c
epic: EPIC-26-c
id: WP-7.26-c.TOOLS
content_hash: <filled-at-freeze>
title: tri-transport byte-identity (MCP/poke/CLI) + native-first honest spawn ladder
intent: >
  Every node is addressable by content address over MCP, poke, and CLI against the one handler with a
  byte-identical Verdict contract and no added write path; the CLI is unscoped; push reaches a no-grant seat;
  ad-hoc pull walks the fixed native-first ladder (SDK-MCP → registered-MCP+grant → poke-as-file → relay →
  CLI), down-ranks tiers 1&2 on an MCP-incapable harness, never silently falls through a native tier, and
  reports the tier it actually started on. Human handle only.
source_reqs:                             # ptr+digest
  - source: ../req-tls.md#REQ-TOOLS-10a  # ptr+digest
  - source: ../req-tls.md#REQ-TOOLS-10b  # ptr+digest
  - source: ../req-tls.md#REQ-TOOLS-10c  # ptr+digest
  - source: ../req-tls.md#REQ-TOOLS-10d  # ptr+digest
  - source: ../req-tls.md#REQ-TOOLS-11-a  # ptr+digest
  - source: ../req-tls.md#REQ-TOOLS-11-b  # ptr+digest
  - source: ../req-tls.md#REQ-TOOLS-11-c  # ptr+digest
  - source: ../req-tls.md#REQ-TOOLS-11-d  # ptr+digest
  - source: ../req-tls.md#REQ-TOOLS-11a-a  # ptr+digest
  - source: ../req-tls.md#REQ-TOOLS-11a-b  # ptr+digest
  - source: ../req-tls.md#REQ-TOOLS-11a-c  # ptr+digest
  - source: ../req-tls.md#REQ-TOOLS-11a-d  # ptr+digest
seam-freezes: [ ]
anchor: # value
  target: the tri-transport node handler tools/ref/handler.ts (one handler behind MCP / poke / CLI) and the
    direction-split spawn/pull resolver tools/ref/ladder.ts. Insertion site = the three transport bindings +
    the native-first ladder resolver (spawn, down-rank, report startedTier).
interface_contract:                      # ptr+digest
  - source: ../../reference/atlas-tools.md#tools-10  # ptr+digest
  - source: ../../reference/atlas-tools.md#tools-11  # ptr+digest
  - source: ../../reference/atlas-tools.md#tools-11a  # ptr+digest
  - source: tools/ref/handler.ts  # ptr+digest
exclusions: # value
  - The no-write-path arm (10c) is a POSITIVE reference-model property of the same handler (a write attempt is
    refused / no store-mutating method) — NOT a formal model; formal verification is out of scope.
  - The write-door + store (EPIC-26-a) and CLI/MCP parity + doctor (EPIC-26-b) — out of scope here.
inputs:                                  # ptr+digest
  - source: ../goldens-tls.md#concrete-fixture-universe  # ptr+digest
  - source: tools/ref/handler.ts  # ptr+digest
  - source: tools/ref/ladder.ts  # ptr+digest
action: # value
  Bind the one handler to the three transports and build the native-first ladder so each acceptance SCN
  passes: PBT witnesses (10a–10d) prove mcp(a)≡poke(a)≡cli(a) + contract identity + no-write-path + CLI
  unscoped; conformance SCNs (11-*, 11a-*) prove push-no-grant, native-first order, one-handler tier
  equality, SDK in-process spawn, MCP-incapable down-rank, no silent fall-through, honest startedTier. Run
  the goldens harness.
action_surface: # value
  [ Read, Edit, Write (TOOLS package only), run goldens/conformance harness, run PBT tri-equivalence harness for 10a–10d ]
guardrails: # value
  - edit only within the TOOLS package + its tests; the three transports MUST NOT diverge in contract
  - add NO write path over any transport (all read/subscribe; writes funnel through atlas-emit)
  - the ladder must never silently fall through an advertised-native tier and must report the true startedTier
repair_budget: # value
  N: 3 ; early-stop on { repeated-identical-failure, no-change-diff, semantic-duplicate-edit }
acceptance:                              # ptr+digest = frozen goldens
  - source: ../goldens-tls.md#SCN-TOOLS-10a-1  # ptr+digest
  - source: ../goldens-tls.md#SCN-TOOLS-10b-1  # ptr+digest
  - source: ../goldens-tls.md#SCN-TOOLS-10c-1  # ptr+digest
  - source: ../goldens-tls.md#SCN-TOOLS-10d-1  # ptr+digest
  - source: ../goldens-tls.md#SCN-TOOLS-11-a-1  # ptr+digest
  - source: ../goldens-tls.md#SCN-TOOLS-11-b-1  # ptr+digest
  - source: ../goldens-tls.md#SCN-TOOLS-11-c-1  # ptr+digest
  - source: ../goldens-tls.md#SCN-TOOLS-11-d-1  # ptr+digest
  - source: ../goldens-tls.md#SCN-TOOLS-11a-a-1  # ptr+digest
  - source: ../goldens-tls.md#SCN-TOOLS-11a-b-1  # ptr+digest
  - source: ../goldens-tls.md#SCN-TOOLS-11a-c-1  # ptr+digest
  - source: ../goldens-tls.md#SCN-TOOLS-11a-d-1  # ptr+digest
deps: [ WP-7.26-a.TOOLS ]   parallel_group: [P] with WP-7.26-b.TOOLS
exit_predicate: # value
  all 12 acceptance SCNs green ∧ PBT tri-equivalence (mcp≡poke≡cli) holds ∧ no write path added on any
  transport ∧ ladder native-first order preserved ∧ startedTier reported honestly per harness
context_refs:                            # closed list
  - source: ../../reference/atlas-tools.md#tools-10
  - source: ../../reference/atlas-tools.md#tools-11
  - source: ../../reference/atlas-tools.md#tools-11a
  - source: ../goldens-tls.md
owner: charlie (FORGE)                                                            # value
outputs:                                             # exec — empty at S4-freeze
provenance:                                          # exec — empty at S4-freeze
trace_ref:                                           # exec — empty at S4-freeze
rationale:                               # ptr
  - source: ../invariant-register.md#INV-TOOLS-10
  - source: ../invariant-register.md#INV-TOOLS-11
  - source: ../invariant-register.md#INV-TOOLS-11a
---

## S4 partition ledger (self-check)

- **REQ→WP partition:** 27/27 CAMPAIGN-7 REQs owned by exactly one WP — orphans = 0, doubles = 0.
  - WP-7.26-a.TOOLS (9): 1a, 1b, 1c, 1d, 2a, 2b, 15a, 15b, 15c
  - WP-7.26-b.TOOLS (6): 3a, 3b, 4, 12a, 12b, 12c
  - WP-7.26-c.TOOLS (12): 10a, 10b, 10c, 10d, 11-a, 11-b, 11-c, 11-d, 11a-a, 11a-b, 11a-c, 11a-d
- **Epic coverage:** each of EPIC-26-a / -b / -c fully covered by its single TOOLS WP.
- **Seam-freezes:** none — all three epics are single-module (TOOLS); the KERNEL store / one-handler contract is
  a *consumed-from-upstream* pointer (frozen), not a same-epic cross-module obligation.
- **Acceptance:** each WP's acceptance = its REQs' frozen SCN goldens by reference (ptr+digest), no prose copy.
- **No new decisions:** every field transcribes frozen upstream; the security-exploitability of the write-door
  is explicitly excluded (billy / FR-12), matching the goldens-tls.md standing note.
