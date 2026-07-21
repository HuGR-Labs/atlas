# ADR-0003 — INV-TOOLS-1 evolves: "single write door" → "governed write doors (same bar)"

- **Status:** Accepted (2026-07-21)
- **Owner-authorized:** yes — when WP-SAMEAS surfaced the conflict, the owner was asked to choose and
  ratified "Aceitar 2ª porta governada" (accept the second governed write door).
- **Spec author:** lead, grounded against the shipped code (`d290bd2`) + the billy/bobby/lucy cold reviews.
- **Amends:** INV-TOOLS-1 (reference/atlas-tools.md#tools-1) + REQ-TOOLS-1a/1b/16e (req-tls.md).

## Context

WP-SAMEAS (#43, owner-authorized) adds a human-asserted `sameAs` equivalence: a person links two EXISTING
nodeKeys that name the same fact at unrelated code sites. That is a **write** (it mutates the durable
projection) but it is NOT an `atlas-emit` (it grounds no new fact; it relates two facts that already passed
the truth gate). Making it a governed write therefore requires a write path that is not `atlas-emit`.

INV-TOOLS-1 as ratified said the write surface is exactly one door (`atlas-emit`), structurally enforced by
a single-write-door guard, and the governance surface is exactly four tools. Building sameAs as a governed
write **necessarily** conflicts with that literal count.

## Decision

INV-TOOLS-1 is amended from a **count** invariant to a **property** invariant:

> Every write to the durable store goes through a GOVERNED door — one enforcing KNOW-11 owner-scoped
> authorization AND a ratifier, and whose refusal is FAIL-CLOSED-VISIBLE on both transports (CLI exit 2 /
> MCP `isError`, never a silent ok — F2/F5). The set of governed write doors is closed and enumerated
> (`WRITE_PATHS`); today it is two: `atlas-emit` (grounded-fact write) and `atlas-link` (sameAs write).

The read/derive tools (`atlas-init`, `atlas-query`, `atlas-reconcile`) and the read projections
(`doctor` / `diff` / `node`) remain writeless. Governance surface = 5 tools; write surface = 2 doors — both
single-sourced from the `Tool` union, so surface-count assertions derive from one place.

## Why this preserves what INV-TOOLS-1 protected

The real guarantee was never "the number four." It was: **no ungoverned path mutates the store, and no write
silently succeeds-or-fails invisibly.** Intact:
- `atlas-link` (`createGovernedLink`) gates distinct-nodes → both-nodes-exist → KNOW-11 authz on BOTH
  endpoints' scopes → non-empty ratifier — the same fail-closed discipline `atlas-emit` enforces. Actor +
  ratifier are env-sourced by the composition root, never the payload (the spoof-guard).
- Both doors funnel through ONE generalized guard (`isFailClosedWrite`: `emitted:false` OR `linked:false`),
  so a refused link is as visible as a refused emit (F2/F5), on both doors.
- `sameAs` is NON-DESTRUCTIVE on read (a derived observability edge, like `subsumes`), never a fact merge.

## Rejected alternative — fold sameAs into `atlas-emit`

Keeping the literal single door by modeling a link as a "link-flavored emit" was rejected: it overloads
emit's semantics (emit = "a new grounded fact passed the truth gate"; link = a relation over two
already-grounded facts) and smuggles a second operation behind one contract — LESS honest than a named,
separately-gated door. The count was the accidental part of INV-TOOLS-1; the governance property is the
essential part, and a second named governed door serves it better.

## Consequences

- `WRITE_PATHS = ['atlas-emit', 'atlas-link']`; `GOVERNANCE_SURFACE` = 5. Adding a future governed write door
  is now a bounded, precedented change (join `Tool` + `WRITE_PATHS` + a governed door; the guard generalizes).
- ~10 frozen surface-count assertions were updated to the real 5-tool / 2-write-door surface (honest surface
  growth, cold-reviewed as NOT a loosened gate).
- **v1 scope boundary (conscious deferral):** `atlas-link`'s ratifier is a NON-EMPTY check, NOT emit's
  tier-graded ratification (a T0 fact's `by === 'billy'` requirement). For a non-T0 fact this is exact parity
  with emit; the link door does not read node tier, so in v1 two T0 facts can be equated by any non-empty
  ratifier. Safe because `sameAs` is non-destructive (it cannot alter a T0 fact's content or grounding). The
  code states exactly what it enforces ("non-empty ratifier"); no `atlas-link` docstring claims the full tier
  gate. Tier-graded link ratification is the seam to revisit if link assertions ever need T0 weight.
- Teeth: `packages/e2e-blackbox/test/s16-sameas.blackbox.test.ts` (authorized link surfaces the edge on both
  doors; unauthorized / unknown-node / empty-ratifier rejected fail-closed; transitive A≡B,B≡C ⇒ A≡C) +
  `packages/knowledge/test/wp-sameas.test.ts` (white-box union-find / reducer goldens).
