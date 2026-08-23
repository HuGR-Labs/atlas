# `atlas transition`

Produce a **grounded transition** for a unit across **two git revs**. A transition (ADR-0015 **D4** / #234) is
an **immutable advisory historical record** — *unit `unitKey` returned A at `revBefore`, returns B at
`revAfter`*. This command is the **reachable producer**: given a unit and two revs, it reads the unit's **real
content** at each rev through the arbitrary-rev code index, admits a **`justified`** transition (there is no
mechanical HEAD oracle for a historical claim, so it is never `proven` — D-T1), and **persists** it.

## Invocation

```
atlas transition <unit> <revBefore> <revAfter>
```

- `<unit>` — required. The **unit lineage key** (a `qualifiedPath`, e.g. `src/pay.ts::charge`). It must be the
  **same** key at both revs — a move/rename that changes the key is **out of scope** (D-T4).
- `<revBefore>` / `<revAfter>` — required. Two git revs (a sha, tag, or ref). The unit's `subtreeHash` at each
  becomes the content-addressed `shaBefore` / `shaAfter` the record spans.

## Outcome (exit code is the whole contract)

- **exit 0** — a transition was admitted from the two revs and settled durably. Read it back with
  [`atlas transitions <unit>`](./transitions.md).
- **exit 2** — the producer **abstained** (nothing fabricated): the unit did not resolve at a rev, or its
  content was **identical** across the two revs (`shaBefore === shaAfter` spans no interval, so it is not a
  transition) — or the atomic persist did not settle (a contended store).

```
$ atlas transition src/pay.ts::charge HEAD~1 HEAD
status: ok
next: justified transition on 'src/pay.ts::charge' is durable (<id>) — read it back with `atlas transitions src/pay.ts::charge`; a later transition on this lineage supersedes it (D-T3)
invariant: #234 D4: a transition is an IMMUTABLE ADVISORY HISTORICAL record admitted from TWO real revs where the unit changed — sealed `justified` NEVER `proven` (no HEAD oracle exists, D-T1), grounded on the rev-pair (never re-checked at HEAD, D-T2), superseded not falsified by a later transition on the same lineage (D-T3); rename/move is OUT of scope (D-T4)
transition: src/pay.ts::charge @ <hash>… → <hash>… (seal: justified)
```

## Honest limits (flagged, not silent)

- **Write path.** The producer persists the finished transition node directly through the store's atomic
  `commitProjection` door, **not** the governed authz/ratify door the other write commands ride. A transition
  node is *complete* after admission (it grounds on the rev-pair it carries and needs no door to construct
  anything — unlike a negation), so this is a real, safe persist; routing transitions through the governed gate
  is a named follow-up.
- **Derivation prose.** The `derivation` the `justified` seal names is **mechanically generated** ("the unit
  changed content across these revs"), not authored by a model that read both bodies. A full model-authored
  producer that describes *what* changed is out of #234's scope; the transition **fact** is fully admitted from
  real revs — only the richness of the justification prose is deferred.
- **Rename/move** reconciliation (D-T4) and a **proven-flip** (D-T5) are explicitly deferred, documented as
  honest limits rather than silent non-behavior.
