// @atlas/cli — src/slots.ts  (WP-10.A2-a.CLI — the `atlas slots` read/planner verdict builder)
//
// `slots` is a READ/DISCOVERY PLANNER (ADR-0004, AUTHOR-5), NOT a governed door: it answers "what can I
// say?" with EXACTLY the members of the closed `PredicateSlot` union, each with its meaning, in the
// mapping's own order — nothing invented, nothing omitted, persisting NOTHING. This module is the CLI-side
// verdict builder, mirroring `anchors.ts`: it maps the (arity-0) `slots` invocation onto the frozen
// `SlotsApi.slots` leg (composed over @atlas/tools's own `PredicateSlot`-derived mapping, WP-10.A2-a.TOOLS)
// and wraps the `SlotsOut` in a `Verdict` the shared `renderVerdict` path renders. It lives HERE, not in
// @atlas/adapter-io, because the leg is FROZEN this pass (consumed, not edited) and the CLI owns its own
// dispatch verdicts.
//
// TOTAL: `slots()` takes no input and never throws — there is no failure mode to fail closed on.

import type { Guidance, SlotsApi, SlotsOut, Verdict } from '@atlas/tools';

/** The one property a reader should check the rendered bytes against. */
const READ_INVARIANT =
  'AUTHOR-5: `atlas slots` returns EXACTLY the members of the closed `PredicateSlot` union — all of them, none besides — each with its meaning, DERIVED from the union (never hand-transcribed), so a spec revision that adds a slot cannot leave this door stale';

/**
 * The SHARED slots read-verdict builder — the SAME `slots` leg yields a byte-identical `Verdict` every call
 * (no input, no clock), so the CLI and a future MCP transport cannot diverge. TOTAL: no input, never a
 * throw.
 */
export function slotsVerdict(leg: SlotsApi['slots']): Verdict<SlotsOut> {
  const out = leg();
  const guidance: Guidance = {
    next: `${out.slots.length} slot(s) in the closed predicate vocabulary — pick one and draft a fact with \`atlas draft <anchor> <slot> <claim>\``,
    invariant: READ_INVARIANT,
  };
  return { ok: true, guidance, data: out };
}
