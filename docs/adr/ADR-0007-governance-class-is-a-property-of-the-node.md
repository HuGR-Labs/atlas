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
- **Introduces:** the tier lattice at L4 (`isTier` / `tierRank` / `isWeakerTier` / `strictestTier`,
  `@atlas/knowledge/src/ratify/tier.ts`), the emit door's gate-0 class validator and its
  INCUMBENT GUARD, the link door's class-wide tier gate, and `sameAsClassOf` (`@atlas/knowledge`).
- **Revised after review (2026-07-25).** The first draft of this decision was reviewed by two independent
  seats and **rejected**: its guard was bypassable by declaring an off-lattice `tier`, and its link gate
  joined only the two endpoints of a transitive relation. What is written below is the design that survived
  that, not the one that was proposed. The rejected version is described in §"What the review broke", because
  an ADR that quietly presents its remediated form as its original judgement is a false record.
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

`Tier` is an ordered lattice (`T0` ≻ `T1` ≻ `T2`), written down for the first time — at **L4, beside the
ratification facet that owns the question** (`@atlas/knowledge/src/ratify/tier.ts`), NOT beside the type it
orders. `@atlas/contracts` is L0 vocabulary with **zero runtime** (ARCHITECTURE.md), and an ORDER is policy,
not vocabulary; every consumer of the lattice (`retrieval` L5, `tools` L7, the `adapter-io` ring) already sits
at or above L4 and already depends on `@atlas/knowledge`, so nothing about this inverts the DAG. Before this
the ordering existed only as scattered `=== 'T0'` / `=== 'T2'` equality checks plus three private
`Record<Tier, number>` copies in `@atlas/retrieval`, so no code could ask the one question a write door has to
ask, and every private copy produced `undefined` on a value outside the union. The defect was the DUPLICATION,
not the layer.

**1b. The lattice is TOTAL over `unknown` and fails closed.** `Tier` is a type-only union: it does not exist
at runtime, and nothing upstream validates it — the CLI wire is `JSON.parse` + a cast and the MCP `node`
schema is a bare `object`. So every lattice operation takes `unknown`: an unrecognized DECLARED class is
always weaker, an unrecognized INCUMBENT always strictest, and a join with garbage is `T0`.

**1c. Both doors validate the class before anything else** (`gate 0`, `malformed tier`). The lattice guard
alone is not sufficient: on a CREATE there is no incumbent to compare against, and the read side bounds packs
with `tier !== 'T2'`, so a node minted at `'T3'` would be served as though it were ratified. The read door is
made total for the same reason — membership in the lattice, not `!== 'T2'`.

**2. The emit door resolves its target BEFORE it chooses a gate.** It rehydrates the projection, mints the
`nodeKey`, and — if a node is already there — reads that node's **own stored fact** back from CAS (the same
content-addressed read-back the link door already used for its authz gate). Two questions are then asked of
the target rather than of the write:

- **Authority** — is the actor in the scope the node ALREADY LIVES IN? Gate 2 asked only about the scope the
  write *declares*, which the attacker picks. Failing this is `unauthorized for target`. This is membership,
  **not** name equality: equality was tried first and was wrong in both directions — it carved out
  scope-less nodes (every `mine`-written row, capturable by any actor), and it made an admin RENAMING a scope
  brick every existing node permanently, for everyone including `billy`.
- **Class** — is the declared `tier` weaker than the stored one? Failing this is `governance-downgrade`.

**3. An unreadable incumbent fails closed.** If the projection names a node whose CAS bytes are absent
(pruned store, partial restore), the class it requires is unknowable, so the write is refused
`unverifiable target` — never gated on the write's own claim, which is exactly the hole.

**4. `atlas-link` runs the same KNOW-8 law, over the JOIN of every class the link MERGES.** A link touching a
`T0` node is a `T0` act and needs `billy`. `sameAs` being non-destructive was the reason the tier gate was
deferred here, but *non-destructive* is not *ungoverned*: the edge is symmetric and the read-side union-find
fold walks it, so the weaker endpoint was a side door onto the stronger one.

The join is over the merged **equivalence class**, not the two endpoints. `deriveSameAs` is transitive, so
the security boundary is the class; gating the edge gated one edge of a graph whose reachability the link was
extending. `sameAsClassOf` computes it, and is a deliberate **sound over-approximation** — it also follows
dangling peers and half-written edges, so it can return a class LARGER than `deriveSameAs` would derive, but
never smaller. Larger means "asks for a stronger signature than strictly needed"; smaller would mean a
bypass. Pinned by `PROP-SAMEAS-1` (`packages/knowledge/test/wp-sameas.test.ts`, `numRuns: 5000`). NOTE: this line
asserted the property test existed BEFORE it did — an architecture review caught it (`grep -rln sameAsClassOf`
returned three files and zero tests). The 5000 runs had been a reviewer's transcript, not committed code. The
test now exists and fast-check shrinks the counterexample to a single asymmetric edge.

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
- **It does not make `mine` a governed door.** `mine` still CREATES nodes without passing either door; it is
  now merely prevented from re-authoring established ones, and its rows carry the reserved `atlas:mined`
  scope so they are fail-closed until an admin appoints a curator. The remainder is task #87.
- **It does not distinguish two legitimate owners of one symbol.** Because `nodeKey` carries no scope, a
  second properly-authorized scope colliding at the same anchor is refused exactly as an attacker would be.
  Recorded as a real limit of deriving authority from a scope-free identity, not as a safe corner.

## What the review broke

Recorded because the first draft's own §Decision asserted things a cold review then reproduced as false:

1. **"a ratified `T0` node can never be quietly re-served as `T2`."** False. Declaring `tier:'T3'` made the
   comparison `0 < undefined` — i.e. "not a downgrade" — so `T0 → T3 → T2` walked past the guard in two
   commands with no `billy` token, and the invariant vanished from every read. Every off-lattice shape worked.
2. **"the JOIN of its two endpoints' tiers."** Insufficient against a transitive relation (two-hop bypass).
3. A fix for an unrelated availability bug (`mine` writing rows whose CAS bytes were absent) turned an
   unreachable capture into a live one, because a scope-less node had been carved out of the scope check.

## Consequences

- Four new fail-closed reasons on `atlas-emit`: `malformed tier`, `unauthorized for target`,
  `governance-downgrade` and `unverifiable target`. All are legible on the CLI and MCP surfaces via the
  existing rejection channel (WP-F2F5).
- `atlas-link` gains `unverifiable endpoint`, and its `unratified` reason now names the `billy` condition.
  Previously an unreadable fact degraded to an absent scope and was reported merely `unauthorized` — which
  reads as a policy problem an admin would try to fix by *granting a scope*.
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
- Mutation-verified, with the killers stated exactly (an earlier draft of this line claimed a mutant that
  did not hold, which a cold review caught):
  - deleting the incumbent-guard block → exactly `SCN-GE-I1` / `SCN-GE-I2` / `SCN-GE-I5`;
  - restoring the old non-empty-token check in the link door → `SCN-GL-6`, and also `SCN-GL-8` / `SCN-GL-9`,
    since those depend on the same call;
  - dropping gate 0 → `SCN-GE-I7`; weakening `isTier` to `in` → `SCN-GE-I6`; de-totalising the lattice →
    `SCN-GL-9`; endpoint-only join → `SCN-GL-8`; `mine`'s collision skip → `SCN-CLI-4e`; `mine`'s
    `store.put` → `SCN-CLI-4f`;
  - an unrecognized INCUMBENT no longer strictest → `SCN-TIER-4`; the link join's `member === undefined`
    leg → `SCN-GL-9b`; `sameAsClassOf`'s dangling-peer inclusion → `SCN-SA-2` / `SCN-SA-4` /
    `PROP-SAMEAS-1`; its reverse-direction `touches` half → `SCN-SA-3`; one-sided `REJECTED_UNVERIFIABLE`
    → `SCN-GL-10` / `SCN-GL-11`.
  Each of the five above was mutation-verified by its author AND re-verified independently by the lead;
  the two the lead re-ran personally are `SCN-TIER-4` and the `sameAsClassOf` dangling-peer leg.
- Two independent cold-review seats returned **REJECT** and **FIX-FIRST** on the first draft. Every finding
  they reproduced is either fixed above or recorded as an open task (#87, #88).
