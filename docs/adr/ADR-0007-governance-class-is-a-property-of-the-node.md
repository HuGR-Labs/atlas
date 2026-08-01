# ADR-0007 — a write's governance class is a property of the NODE it targets, not of the write

- **Status:** Accepted (2026-07-25). This closes a live confused-deputy hole on `master`, reproduced before
  any code was changed; the fix ships with the red tests that reproduced it.
- **Owner-authorized:** yes — the owner granted the lead full ownership of this repo and direct
  responsibility for holding the SOTA bar (2026-07-25). Recorded here because this ADR changes the behaviour
  of a **governed** path, which the escalation rule would otherwise route to the owner.
- **Spec author:** lead, grounded against `master` @ `5de122e`.
- **Amends:** nothing frozen. `GOVERNANCE_SURFACE` stays 5, `WRITE_PATHS` stays `['atlas-emit','atlas-link']`
  (INV-TOOLS-1 / ADR-0003 untouched). The `StoreProjection` / `CurrentNode` seam is **unchanged** — see
  §"What this deliberately does not do".
- **Introduces:** the tier lattice (`isWeakerTier` / `strictestTier`, `@atlas/knowledge`), the emit door's
  INCUMBENT GUARD, and the link door's tier gate.
- **Discharges:** the deferral recorded in `governed-link.ts` (*"the T0→billy tier gate emit runs is
  deferred — sameAs is non-destructive"*).

## Context

`atlas-emit` runs three fail-closed gates and then routes the write through `upsert`. Which gate a write
must clear was decided by `route(candidate, ctx)` reading the candidate's `tier` and `check`; which node the
write lands on is decided by

```
nodeKey = hash(primaryAnchorId ‖ predicateSlot [‖ normalize(check)])
```

**The identity contains neither `tier` nor `scope`.** So "which node" and "which gate" were computed from
two different things, and the author controlled the second one. That is the whole hole:

1. billy ratifies a `T0` fact at some anchor. The node now requires the `billy` token to write.
2. An actor emits a fact at the **same anchor and slot** — same minted `nodeKey` — but declares `tier: 'T2'`
   and no `check`. `route` sees *grounded ∧ lowRisk ∧ T2 ∧ advisory ∧ ¬contested* and returns `auto-accept`.
   **No token is consulted at all.**
3. `upsert` finds the `nodeKey` present, family advisory, and routes `UPDATE` — set-unioning the new claim
   into the billy-ratified node.

The same shape holds in the authorization dimension: `actorInScope(policy, actor, node.scope)` gates on the
scope **the write declares**, so an actor declares a scope they happen to own and writes a node that lives
in someone else's.

This is not a novel defect; it is a *confused deputy*, and the literature name for the specific instance is
**capability gating is not authorization** — deciding *which gate applies* is a different question from
deciding *whether this call, with these argument values, may touch this resource*. The object-capability
answer (Miller; KeyKOS/EROS/Capsicum) is the one adopted here: **authority is derived from the resource, not
asserted by the request.**

Note what was already right, and why it was not enough: WP-F3 had established that the *routing identity* is
minted from content and never trusted from the payload (`SCN-GE-6` / `SCN-GE-7`). That closed identity
spoofing. It did not close this, because here the attacker does not spoof the identity — they let the real
identity collide, and lie about the **class** instead.

## Decision

**1. A write may re-state or RAISE the governance class of the node it targets. It may never lower it.**

`Tier` is an ordered lattice (`T0` ≻ `T1` ≻ `T2`), written down for the first time in
`@atlas/knowledge/ratify/tier.ts`. Before this, the ordering existed only as scattered `=== 'T0'` /
`=== 'T2'` equality checks, so no code could ask the one question a write door has to ask.

**2. The emit door resolves its target BEFORE it chooses a gate.** It rehydrates the projection, mints the
`nodeKey`, and — if a node is already there — reads that node's **own stored fact** back from CAS (the same
content-addressed read-back the link door already used for its authz gate). A write declaring a weaker
`tier`, or a different `scope`, than that stored fact is refused `governance-downgrade`.

**3. An unreadable incumbent fails closed.** If the projection names a node whose CAS bytes are absent
(pruned store, partial restore), the class it requires is unknowable, so the write is refused
`unverifiable target` — never gated on the write's own claim, which is exactly the hole.

**4. `atlas-link` runs the same KNOW-8 law, over the JOIN of its two endpoints' tiers.** A link touching a
`T0` node is a `T0` act and needs `billy`. `sameAs` being non-destructive was the reason the tier gate was
deferred here, but *non-destructive* is not *ungoverned*: the edge is symmetric and the read-side union-find
fold walks it, so the weaker endpoint was a side door onto the stronger one.

### Why refuse a downgrade rather than merely gate it on the stricter class

Gating the downgrade on the stricter class would also close the bypass — the write would demand `billy`, and
`billy` might sign it. But then the *stored* fact is the `T2` one, and the node's class has been lowered as a
side effect of emitting a claim, which is not what the signer was asked to approve. Since a pack bounds `T2`
OUT (TOOLS-6), that quietly erases the invariant from every read as effectively as deleting it.

Refusing outright keeps the stored `tier` **monotone**, so no later reader has to distrust it, and no new
carrier is needed to remember what the class used to be. Re-classification remains possible — it is simply
not an emit. It is a separate governed act, and it does not exist yet (see below).

## What this deliberately does not do

- **It does not extend the frozen `StoreProjection` / `CurrentNode` seam.** An earlier draft carried `tier`
  and `scope` on the projection node. That is unnecessary once downgrades are refused: the stored fact is
  already monotone, so it is a sound source of truth, and `pack-shape.ts` reading `fact.tier` stays correct.
  Amending a frozen seam to hold a value that is already derivable would have been the expensive way to get
  the same guarantee.
- **It does not implement re-classification.** Lowering a node's tier, or moving it between scopes, has no
  door. This is a stated gap, not a hidden one: the refusal message names re-classification as a separate
  governed act. Nothing in the product needs it yet.
- **It does not wire the real `lowRisk` / `contested` verdicts.** `DOOR_RATIFY_CTX` still defaults them
  conservatively (unchanged from WP-N7). The teeth here do not depend on those defaults — they come from the
  target node's own class.
- **An incumbent with no stored `scope` constrains nothing.** Such nodes predate the KNOW-11 gate; the
  declared-scope authz check still applies to writes touching them. Recorded as a known limit, not silently
  fallen through.

## Consequences

- Two new fail-closed reasons on `atlas-emit`: `governance-downgrade` and `unverifiable target`. Both are
  legible on the CLI and MCP surfaces via the existing rejection channel (WP-F2F5).
- `atlas-link` gains `unverifiable endpoint`, and its `unratified` reason now names the `billy` condition.
  Previously an unreadable fact degraded to an absent scope and was reported merely `unauthorized` — which
  reads as a policy problem an admin would try to fix by *granting a scope*.
- The projection is rehydrated once per emit instead of twice.
- **A pre-existing node emitted at `T2` can still be raised to `T0` by anyone holding `billy`.** That is
  intended: strictness ratchets up freely, because raising a class cannot be an attack.

## Evidence

- Reproduced first, in `packages/adapter-io/test/governed-emit.test.ts` — `SCN-GE-I1` (tier), `SCN-GE-I2`
  (scope), `SCN-GE-I5` (unreadable incumbent). All three failed on `master` before the guard existed.
- `SCN-GE-I3` / `SCN-GE-I4` are the anti-over-blocking controls: re-emitting at the same class still
  set-unions, and raising strictness is allowed. Both passed *before* the fix and still pass — so the guard
  is not simply denying more.
- `packages/adapter-io/test/governed-link.test.ts` is new. The second governed write door had **no unit
  test at all** — only an end-to-end happy-path story, which cannot plant a gate-level mutant.
- Mutation-verified: deleting the incumbent-guard block fails exactly `SCN-GE-I1/I2/I5`; restoring the old
  non-empty-token check in the link door fails exactly `SCN-GL-6`. No other test moved.
