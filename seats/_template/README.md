# seats/_template — the reference seat harness (the craft bar)

Every seat is built in **its own repo** (one session per seat), against the frozen
[`@orchestra/contracts`](../../packages/contracts/src/seat.ts) seam, then vendored into this mono under
`seats/<id>/` via `git subtree`. This template is the **skeleton and the craft bar** — a seat that
doesn't meet it is not a seat.

## A seat repo MUST ship

```
seats/<id>/
  package.json            name "@orchestra/seat-<id>", bin "orchestra-<id>", dep ONLY on @orchestra/contracts
  src/
    harness.ts            implements SeatHarness (manifest() + run()) — the ONE seam
    kit/                  the seat's craft (its specialized logic, pure where possible)
    loop.ts               the Claude Agent SDK loop the seat runs its work in
  mcp/
    server.ts             the seat's MCP server exposing toolAllowlist (published input schemas)
    tools/                one file per tool — pure verdict, fail-closed, totality-tested
  cli/
    bin.ts                orchestra-<id>: `run <brief.json>` · `tool <name> <args>` · `manifest`
  skills/                 the seat's skills, loaded into ITS loop (not the lead's prompt)
  test/                   actuation probes: run() end-to-end, each tool via CLI+MCP, contract conformance
  README.md               what this seat is, its kit, its guarantees
```

## Conformance (CI-enforced, non-negotiable)

1. **Contract:** `harness.ts` implements `SeatHarness` against the pinned `@orchestra/contracts`
   version; `manifest()` is pure + total.
2. **Return-firewall:** `run()` returns a `ResultCard` and NOTHING larger — never a transcript. The
   `note` respects `returnShape.maxNoteChars`.
3. **No self-attest:** gates in the brief are RUN for real; `evidence.gateResults` are measured exit
   codes, not booleans the seat chose.
4. **CLI↔MCP parity:** every tool in `toolAllowlist` is callable both `orchestra-<id> tool <name>` and
   over MCP, with a published input schema (v1 R3/R4 lesson).
5. **Metering:** `run()` reports real `meteredTokens` (from its own SDK usage) so the lead's cost/ROI
   ledger folds honestly.
6. **Determinism:** no global clock/rand — time comes from `SeatRunContext.nowIso`.
7. **Craft:** own suite green, loc-cap per file, totality fences on every verdict export, a real README.

## Building a new seat

1. Fork this template into `orchestra-seat-<id>` (a new repo — the owner opens a session there).
2. Implement the kit + tools + loop against the contract; keep the lead-facing surface = the contract.
3. Prove it standalone: `orchestra-<id> run fixtures/brief.json` yields a valid ResultCard; every tool
   passes CLI+MCP parity; the suite is green.
4. Vendor it in: `git subtree add --prefix seats/<id> <repo-url> main --squash` (later `subtree pull`).
