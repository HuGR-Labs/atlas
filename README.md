# Orchestra

A governed engineering orchestrator. The **lead** holds all judgment and dispatches work so pre-decided
that executing it is verifiable-not-judged; the work is executed by a fleet of **seats**, each a full,
independently-shippable agent **harness**; every guarantee is enforced in code, folded from live
evidence — never asserted in prose.

> **Status: design-first.** The architecture is decided in [ARCHITECTURE.md](./ARCHITECTURE.md) and the
> keystone seam is drafted in [`packages/contracts/src/seat.ts`](./packages/contracts/src/seat.ts).
> No product code is built until the design is ratified. This is a ground-up rebuild of Maestro-v1 —
> it keeps only the primitives v1 *proved*, and fixes v1's three failures: no architecture, hollow
> `.md` "seats", and a dream product built without craft.

## Layout

```
packages/     the Orchestra CORE (built in this repo)
  kernel        pure, zero-dep, deterministic primitives
  contracts     the frozen seat-harness seam + governance contracts   ← the keystone
  governance    guarantees · ledger · policy/guard · ed25519 approval
  memory        grounded MemoryFact model + store
  orchestrator  the LEAD: plan → dispatch → integrate
  cli           the `orchestra` root CLI
  testkit       shared actuation-probe / fence helpers
seats/        each seat = an independently-built HARNESS, vendored in via git subtree
  _template     the reference seat skeleton — the craft bar
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full design, the SOTA grounding, and the build order.
