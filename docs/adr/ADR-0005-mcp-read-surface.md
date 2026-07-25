# ADR-0005 — the advertised MCP surface is `GOVERNANCE_SURFACE ∪ READ_SURFACE`

- **Status:** Proposed (2026-07-25) — DEFINE seat (owner) ratifies
- **Owner-directed:** yes — *"Lembre-se que tem que ter via mcp tool e via cli"* (2026-07-25). The
  requirement that every authoring door exist on both transports is the owner's, not the lead's.
- **Spec author:** lead, grounded against `packages/mcp-server/src/server.ts` @ `3496d6f`.
- **Introduces:** `INV-MCP-3`, `INV-MCP-4` (reference/atlas-authoring.md#entry-mcp-3, #entry-mcp-4).
- **Does NOT amend:** INV-TOOLS-1 / ADR-0003. `GOVERNANCE_SURFACE` stays 5; `WRITE_PATHS` stays 2.

## Context

`advertisedTools` maps **exactly `GOVERNANCE_SURFACE`** — the five governance tools — and nothing else.
The server's own comment states the surface is *"EXACTLY the `GOVERNANCE_SURFACE` tools, no more, no less
(TOOLS-1)."*

Three consequences, all verified against the code:

1. **The already-built read doors are CLI-only.** `atlas doctor` (four sub-legs), `atlas node`, and
   `atlas-diff` are wired, tested, and reachable from the CLI — and completely absent over MCP. An agent
   seat cannot inspect the archive, explain a drift, read a node, or see a version delta.
2. **The authoring surface would inherit the same asymmetry.** `anchors`/`slots`/`draft`/`check`
   (ADR-0004) are planners; if the advertised set may only contain governance tools, an agent gets none of
   them and the owner's both-transports requirement cannot be met.
3. **The framing conflates two different sets.** TOOLS-1 governs the *write* surface and the *governance*
   surface. It says nothing about what a transport may advertise. The literal claim "the MCP surface is
   exactly the five governance tools" is a **stronger** statement than any ratified invariant requires — and
   it is the one blocking the requirement.

## Decision

The MCP server advertises the **union of two disjoint sets**:

```
advertised = GOVERNANCE_SURFACE  ∪  READ_SURFACE

GOVERNANCE_SURFACE = { atlas-init, atlas-query, atlas-emit, atlas-reconcile, atlas-link }   // 5, unchanged
WRITE_PATHS        = { atlas-emit, atlas-link }                                             // 2, unchanged
READ_SURFACE       = { atlas-anchors, atlas-slots, atlas-draft, atlas-check,                // planners
                       atlas-doctor, atlas-node, atlas-diff }                               // already built
```

Normatively (`INV-MCP-3`): every `READ_SURFACE` member carries **zero write authority**; membership must
not confer, imply, or route to a write; `GOVERNANCE_SURFACE` remains exactly five and `WRITE_PATHS`
exactly two.

And (`INV-MCP-4`): for identical input, every door produces a **byte-identical `Verdict`** over the CLI and
over MCP — extending the existing TOOLS-3 CLI≡MCP property to the new doors.

## Why this does not weaken TOOLS-1

TOOLS-1's guarantee, as re-stated in ADR-0003, is: *no ungoverned path mutates the store, and no write
silently succeeds-or-fails invisibly.* Nothing in this decision touches either half.

- `READ_SURFACE` members are planners (ADR-0004, AUTHOR-2) — they persist nothing, so there is no path for
  them to be ungoverned *on*.
- Write-freedom is a property of the **type**, not of reviewer vigilance: a planner returns a payload and
  never receives a store handle. This is the structural resolution of coupling **C2** in
  `design/authoring.md` §3.3 — FR-A4 (governance preserved) holds by construction, independent of what
  `READ_SURFACE` contains, so the set may grow later without re-litigating governance.
- The two sets are **disjoint** and both are single-sourced constants, so the spec-conformance guard can
  pin them independently: `GOVERNANCE_SURFACE` deep-equals its expected five, `WRITE_PATHS` its expected
  two, and `READ_SURFACE ∩ WRITE_PATHS == ∅` becomes a new mechanical check.

## Rejected alternatives

**(a) Grow `GOVERNANCE_SURFACE` to include the planners.** Rejected. It would make the governance count
meaningless — the count would then mix governed writes with read helpers, and every future convenience
door would look like a constitutional change. Disjoint sets keep the governed count exactly as load-bearing
as ADR-0003 made it.

**(b) Keep the authoring doors CLI-only.** Rejected — it directly contradicts the owner's directive, and it
would leave the agent seat (the primary consumer of a knowledge substrate) unable to author at all. It also
entrenches the existing `doctor`/`node`/`diff` asymmetry rather than fixing it.

**(c) A second MCP server process for read tools.** Rejected as ceremony: two processes, two lifecycles,
two schema publishers, to express what one disjoint constant expresses.

**(d) Advertise them but mark them experimental / undocumented.** Rejected. A door an agent cannot discover
from the tool schema is not a door (the Usability risk in `design/authoring.md` §2.2).

## Consequences

- `server.ts`'s `advertisedTools` maps the union; its "no more, no less (TOOLS-1)" comment is corrected to
  state the union and cite this ADR. **This comment is exactly the class of stale claim the
  spec-conformance guard exists to catch** — it is updated in the same change, and the guard gains the
  `READ_SURFACE ∩ WRITE_PATHS == ∅` check.
- The already-built `doctor`/`node`/`diff` legs join `READ_SURFACE` in the same campaign, closing a
  pre-existing transport asymmetry that predates this work.
- Every advertised tool continues to publish its `description` + `inputSchema` from `handler.schema(tool)`
  — the handler stays the single schema owner (TOOLS-3); no schema is hand-authored at the transport.
- `INV-MCP-4` parity goldens are required for each new door; the existing black-box harness already drives
  both transports, so this is an extension of a built capability, not a new one.
