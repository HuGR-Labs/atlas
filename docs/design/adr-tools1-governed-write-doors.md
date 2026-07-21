# ADR — TOOLS-1 evolves: "single write door" → "governed write doors (same bar)"

- **Status:** accepted (2026-07-21) — owner-ratified the amendment when WP-SAMEAS surfaced the conflict.
- **Amends:** the ratified invariant **TOOLS-1**, previously "the ONLY write path is `atlas-emit`; the
  governance surface is EXACTLY four tools; the write surface is exactly one door."
- **Scope:** `packages/tools` (`Tool` union, `GOVERNANCE_SURFACE`, `WRITE_PATHS`, the fail-closed write
  guard), and every surface-count assertion derived from it.

## Context

WP-SAMEAS (#43, owner-authorized) adds a human-asserted `sameAs` equivalence: a person links two EXISTING
nodeKeys that name the same fact at unrelated code sites. That is a **write** — it mutates the durable
projection — but it is NOT an `atlas-emit` (it grounds no new fact; it relates two facts that already
passed the truth gate). Making it a governed write therefore requires a write path that is not `atlas-emit`.

TOOLS-1 as originally ratified said the write surface is exactly one door (`atlas-emit`), structurally
enforced by a single-write-door guard. Building sameAs as a governed write **necessarily** conflicts with
the literal "one door / four tools" count.

## Decision

TOOLS-1 is amended from a **count** invariant to a **property** invariant:

> Every write to the durable store goes through a GOVERNED door — one that enforces KNOW-11 owner-scoped
> authorization AND a KNOW-8 ratifier, and whose refusal is FAIL-CLOSED-VISIBLE on both transports (a
> rejected write surfaces as a governance rejection — CLI exit 2 / MCP `isError` — never a silent ok,
> F2/F5). The set of governed write doors is closed and enumerated (`WRITE_PATHS`); today it is two:
> `atlas-emit` (grounded-fact write) and `atlas-link` (sameAs-equivalence write).

The read/derive tools (`atlas-init`, `atlas-query`, `atlas-reconcile`) and the read projections
(`doctor` / `diff` / `node`) remain writeless. The governance SURFACE is now five tools; the WRITE surface
is two doors. Both are single-sourced from the `Tool` union, so surface-count assertions derive from one
place.

## Why this preserves what TOOLS-1 protected

TOOLS-1's real guarantee was never "the number four." It was: **there is no ungoverned path to mutate the
store, and no write can silently succeed-or-fail invisibly.** That guarantee is intact:
- `atlas-link` is gated by `createGovernedLink` — distinct-nodes, both-nodes-exist, KNOW-11 authz on BOTH
  endpoints' scopes (resolved from each fact's CAS bytes), and a non-empty ratifier — the same fail-closed
  discipline `atlas-emit` enforces. Actor + ratifier are env-sourced by the composition root, never read
  from the tool payload (the spoof-guard).
- Both write doors funnel through ONE generalized guard (`isFailClosedWrite`: `emitted:false` OR
  `linked:false`), so a refused link is as visible as a refused emit (F2/F5), on both doors.
- `sameAs` is NON-destructive on read (a derived observability edge, like `subsumes`), never a fact merge —
  it cannot corrupt an existing fact.

## Rejected alternative — fold sameAs into `atlas-emit`

Keeping the literal single door by modeling a link as a "link-flavored emit" was rejected: it overloads the
emit semantics (emit means "a new grounded fact passed the truth gate"; a link asserts a relation over two
already-grounded facts), and it would smuggle a second operation behind one tool's contract — LESS honest
than a named, separately-gated door. The count-invariant was the accidental part of TOOLS-1; the
governance-property is the essential part, and a second named governed door serves it better.

## v1 scope boundary — the ratifier gate (conscious deferral)

`atlas-link`'s ratifier gate is a **non-empty-token** check, NOT emit's tier-graded KNOW-8 ratification.
For a non-T0 fact this is exact parity with emit (emit's gate is also non-empty-only there); the difference
is that emit additionally requires the `billy` token to write a **T0** fact, and the link door does not read
node tier — so in v1 two T0 facts can be equated by any non-empty ratifier. This is a **deliberate v1 scope
choice**, safe because `sameAs` is NON-DESTRUCTIVE (a derived observability edge, never a fact merge — it
cannot alter or weaken a T0 fact's content or grounding). Tier-graded ratification for links (T0 → billy) is
the seam to revisit if link assertions ever need to carry security-critical weight. The code states exactly
what it enforces ("non-empty ratifier"); no `atlas-link` docstring claims the full KNOW-8 tier gate.

## Consequences

- `WRITE_PATHS = ['atlas-emit', 'atlas-link']`; `GOVERNANCE_SURFACE` = 5 tools. Adding a future governed
  write door is now a bounded, precedented change (join the `Tool` union + `WRITE_PATHS` + a governed door +
  the fail-closed guard already generalizes).
- ~10 frozen surface-count assertions were updated to the real 5-tool / 2-write-door surface (honest
  surface growth, verified by cold review — not a loosened gate).
- Teeth: `packages/e2e-blackbox/test/s16-sameas.blackbox.test.ts` (authorized link surfaces the edge on both
  doors; unauthorized / unknown-node / empty-ratifier rejected fail-closed; transitive A≡B,B≡C ⇒ A≡C).
