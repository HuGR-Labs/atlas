// @atlas/cli — src/draft.ts  (WP-10.A2-a.CLI — the `atlas draft <anchor> <slot> <claim>` verdict builder)
//
// `draft` is a READ/COMPOSITION PLANNER (ADR-0004, AUTHOR-6/7), NOT a governed door: it answers "give me a
// payload the door will accept" by composing a candidate `GroundedFact` from EXACTLY the three fields the
// author supplies — `anchor`, `slot`, `claim` (AUTHOR-6d) — with `id`/`grounding`/`rev` ALWAYS computed
// (AUTHOR-6b/6c/7a), persisting NOTHING. This module is the CLI-side verdict builder, mirroring
// `anchors.ts`/`slots.ts`: it maps the parsed `(anchor, slot, claim)` positionals onto the frozen
// `DraftApi.draft` leg (WP-10.A2-a.TOOLS) and wraps the `DraftOut` in a `Verdict` the shared `renderVerdict`
// path renders. It lives HERE, not in @atlas/adapter-io, for the same reason `anchors.ts` does: the leg is
// FROZEN this pass, the CLI owns its own dispatch verdicts.
//
// TOTAL, mirroring `anchors`: a missing/empty positional or an out-of-vocabulary slot fails CLOSED to a
// structured `ok:false` verdict, never a throw. The `slot` argument is validated against the SAME closed
// vocabulary `atlas slots` reports — via the injected `SlotsApi.slots` leg, NEVER a second transcribed list
// (AUTHOR-5's "derived, not transcribed" discipline extends to this door's own input validation).

import type { DraftApi, DraftOut, Guidance, GroundingCandidate, SlotsApi, Verdict } from '@atlas/tools';
import type { PredicateSlot } from '@atlas/knowledge';

/** The one property a reader should check the rendered bytes against. */
const READ_INVARIANT =
  'AUTHOR-6/6d/7: the author supplies EXACTLY the anchor, the slot, and the claim — `id` (the product\'s own `nodeKey` formula), the grounding\'s `subtreeHash` (the ONE grounding computer\'s current value) and the `rev` it was computed at are ALWAYS computed, NEVER demanded of the author; a draft is rev-stamped so a later mismatch at `atlas emit` is nameable, not attributed to the claim';

/** A structured `ok:false` verdict for a missing/empty required argument — CLI-1b, mirrors `anchors.ts`. */
function missingArg(field: 'anchor' | 'claim'): Verdict<DraftOut> {
  const what = field === 'anchor' ? 'the groundable unit to cite (see `atlas anchors <path>`)' : 'the claim body to draft';
  const guidance: Guidance = {
    next: `\`atlas draft <anchor> <slot> <claim>\` requires a non-empty ${field}: ${what}`,
    invariant: 'CLI-1b: a malformed invocation yields a structured error + guidance + non-zero exit, never a crash',
  };
  return { ok: false, rejected: `missing ${field}: atlas draft requires a non-empty ${field}`, guidance };
}

/**
 * The SHARED draft composition-verdict builder — identical `(anchor, slot, claim)` over the SAME `draft`
 * leg yields a byte-identical `Verdict`. TOTAL: a missing/empty `anchor`/`claim`, or a `slot` outside the
 * closed vocabulary the injected `slots` leg reports, fails CLOSED to a structured `ok:false` verdict,
 * never a throw and never a call into `leg`.
 */
export function draftVerdict(
  leg: DraftApi['draft'],
  slotsLeg: SlotsApi['slots'],
  anchor: string,
  slotRaw: string,
  claim: string,
): Verdict<DraftOut> {
  if (typeof anchor !== 'string' || anchor.length === 0) return missingArg('anchor');
  if (typeof claim !== 'string' || claim.length === 0) return missingArg('claim');

  const known = slotsLeg().slots.map((s) => s.slot);
  if (!known.includes(slotRaw as PredicateSlot)) {
    const guidance: Guidance = {
      next: `unknown slot '${slotRaw}' — one of: ${known.join(', ')} (see \`atlas slots\`)`,
      invariant: 'AUTHOR-5: the predicate slot is the CLOSED vocabulary — nothing outside it is a valid draft target',
    };
    return { ok: false, rejected: `unknown slot '${slotRaw}': not a member of the closed PredicateSlot vocabulary`, guidance };
  }

  const candidate: GroundingCandidate = { anchor, slot: slotRaw as PredicateSlot, claim };
  const out = leg(candidate);
  const requiresNote = out.requires !== undefined ? ` (requires ${out.requires})` : '';
  const guidance: Guidance = {
    next: `drafted a ${out.operation} '${candidate.slot}' fact at '${anchor}' — rev ${out.rev}, route ${out.route}${requiresNote}; emit it with \`atlas emit <file> --at ${out.rev}\` (the SAME rev — a different one is refused as a rev mismatch, not a bad claim)`,
    invariant: READ_INVARIANT,
  };
  return { ok: true, guidance, data: out };
}
