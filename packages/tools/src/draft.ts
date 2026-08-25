// @atlas/tools — src/draft.ts   (WP-10.A2-a.TOOLS — AUTHOR-6/7, ADR-0004)
//
// `draft` — the read-only COMPOSITION planner that answers "give me a payload the door will accept"
// (§Composition). `draft({anchor, slot, claim})` composes a candidate `GroundedFact` (advisory family —
// the author supplies no `check`) whose IDENTITY is MINTED by the product's own `nodeKey` formula
// (`@atlas/knowledge` KNOW-15b — hash(primaryAnchorId ‖ predicateSlot), NEVER invented here), whose
// GROUNDING comes from the ONE injected `GroundingComputer` port (AUTHOR-1 — the SAME seam the emit
// truth-gate re-derives against), stamped with the `rev` that grounding was computed at (AUTHOR-7). It is
// a PLANNER: it reads and returns, persists NOTHING, and carries NO write authority (AUTHOR-2) — it is NOT
// a member of `GOVERNANCE_SURFACE` or `WRITE_PATHS`.
//
// THE THREE-FIELD DISCIPLINE (AUTHOR-6d). `GroundingCandidate` (anchors.ts) is the WHOLE input: `anchor`,
// `slot`, `claim`. Every other field of the returned `fact` is COMPUTED (`id` via `nodeKey`, `grounding`
// via the injected computer) or DEFAULTED (`tier`, `freshness`, `claims`, `authoring`, `scope`) — never
// demanded of the author (AUTHOR-6f).
//
// [FRAMING NOTE — AUTHOR-9/10 are OUT OF SCOPE for this facet, and the gap is deliberate, not silent.] The
// frozen `DraftOut` (types.ts) also carries `operation: 'CREATE'|'UPDATE'` and `route:
// 'auto-accept'|'full-ratify'` — AUTHOR-9/10's concerns, not AUTHOR-6/7's, and NOT covered by this WP's
// acceptance goldens (SCN-AUTH-5*/6*/7* only). Both fields need information this planner's ONE injected
// port (`GroundingComputer` — grounding-only, AUTHOR-1) cannot supply:
//   - `operation` (AUTHOR-10) needs to know whether a node ALREADY EXISTS at the drafted (anchor, slot)
//     identity — an INCUMBENT LOOKUP against the durable store. No store handle is injected here (the same
//     "closure over a computer, no store handle" shape `anchors` uses) — claiming CREATE when a node exists
//     would violate AUTHOR-10 ("MUST NOT silently overwrite the author's mental model"), so this planner
//     states the conservative, always-true half instead: `'CREATE'`. A caller for whom UPDATE-detection
//     matters MUST confirm via `atlas query` before authoring — this is a KNOWN GAP for a follow-up WP that
//     threads an incumbent-lookup port, not a claim of correctness.
//   - `route` (AUTHOR-9) needs the store/threshold-derived `RatifyContext.lowRisk`/`contested` verdicts
//     (`@atlas/knowledge` `ratify/fastpath.ts`) — also store-derived, also unavailable here. Rather than
//     invent a value, this planner picks the SAFE DIRECTION: it always reports `'full-ratify'` with
//     `requires: 'ATLAS_RATIFY_TOKEN'` (the real env channel `composeRuntime` sources — `compose.ts`). The
//     failure mode of an over-conservative `route` is an author who prepares a ratify token the real door
//     turns out not to need (harmless); the failure mode of a false `'auto-accept'` is an author who is
//     surprised by a full-ratify refusal at emit time — exactly the discovery-by-refusal AUTHOR-9 forbids.
//     Never the dangerous direction.

import { nodeKey } from '@atlas/knowledge';
import type { Candidate, ClaimProvenance, GroundedFact } from '@atlas/knowledge';
import type { Tier } from '@atlas/contracts';
import type { Grounding } from '@atlas/grounding';
import type { DraftOut } from './types.js';
import type { GroundingCandidate, GroundingComputer } from './anchors.js';

export interface DraftApi {
  /** Compose a candidate `GroundedFact` from the author's `(anchor, slot, claim)` triple (AUTHOR-6). Pure
   *  + total over the injected `GroundingComputer`; never throws on a candidate the computer can ground —
   *  an unresolvable anchor yields the computer's own empty `subtreeHash` (fail-closed at the emit gate,
   *  not here). */
  draft(candidate: GroundingCandidate): DraftOut;
}

/** KNOW-6's move-in default — every territory ships `T2/advisory` "by construction" (`ratify/init.ts`).
 *  A hand-authored draft inherits the same honest default: nothing here has been reviewed, so it starts
 *  at the LEAST-privileged governance class, never a class the author merely typed. */
const DRAFT_TIER: Tier = 'T2';

/** The claim's receipt (KNOW-14 — every claim MUST carry a provenance). `source` names THIS planner (not
 *  a person/commit — a draft is a session-internal value, never persisted by itself) and `trusted: false`
 *  because nothing here has been reviewed; an untrusted claim is excluded from the KNOW-17 confidence
 *  gate by construction (the fast-path's `lowRisk` conjunct), which is consistent with the conservative
 *  `route` this facet always reports (see file header). */
const DRAFT_PROVENANCE: ClaimProvenance = { source: 'atlas-draft', trusted: false };

/** AUTHOR-9's "name the channel" clause — the REAL env channel `composeRuntime` (`adapter-io/src/
 *  compose.ts`) sources a KNOW-8 ratify token from (`ATLAS_RATIFY_TOKEN`), transcribed here so a draft
 *  names the SAME channel the door will actually consult, never an invented one. */
const RATIFY_CHANNEL = 'ATLAS_RATIFY_TOKEN';

/**
 * Build the `draft` planner over an injected `GroundingComputer` (AUTHOR-1) — the SAME port `anchors`
 * consumes, so a fact drafted here re-derives against the identical seam the emit truth-gate re-derives
 * against (AUTHOR-8's round-trip precondition). Pure + total and READ-ONLY: it persists NOTHING
 * (AUTHOR-2).
 */
export function createDraft(computer: GroundingComputer): DraftApi {
  const draft = (input: GroundingCandidate): DraftOut => {
    // (a) GROUNDING — the ONE computer, never a second derivation (AUTHOR-1/6c).
    const anchor = computer.groundingFor(input);
    const grounding: Grounding = { entries: [{ anchor, path: anchor.qualifiedPath }] };
    // (b) REV — the same seam's `rev` leg (AUTHOR-7). `anchorsUnder` reports the SAME `rev` for every
    //     path (it is a constant of the built axes, not a per-path value); querying it AT the drafted
    //     anchor — rather than an arbitrary root path — keeps this a read OF the cited unit, not a second,
    //     unrelated call. Only `.rev` is read; `.units`/`.holes` are discarded (this is not a listing).
    const { rev } = computer.anchorsUnder(input.anchor);

    // THE CANDIDATE VIEW — the minimal `Candidate` `nodeKey`/`primaryAnchorId` read (`.grounding`, `.slot`,
    // absent `.check` ⇒ advisory). `claimText`/`provenance`/`tier` are NOT read by the identity formula but
    // are required by the `Candidate` shape; filled from the SAME defaults the drafted fact carries, never
    // invented ad hoc for identity alone.
    const candidateView: Candidate = {
      claimText: input.claim,
      claimNorm: input.claim,
      slot: input.slot,
      grounding,
      provenance: DRAFT_PROVENANCE,
      tier: DRAFT_TIER,
    };
    // IDENTITY IS MINTED, NEVER INVENTED (AUTHOR-6b) — the SAME `nodeKey` formula the governed emit door
    // recomputes from content at write time (`governed-emit.ts`: "the author-supplied payload `node.id` is
    // NEVER used for routing"). A draft that invented its own `id` would still emit correctly (the door
    // ignores it) — which is exactly why SCN-AUTH-6b-1 compares against the FORMULA, not against a
    // round-trip through emit.
    const id = nodeKey(candidateView);

    // THE DRAFTED FACT — every field the emit door destructures (`governed-emit.ts` gate 0 / familyOf /
    // claimNormOf / candidateView) is present and well-formed: `tier` (a real `Tier`), `scope` (a
    // non-empty string — AUTHOR-6d defaults it; no anchor→scope authority oracle is available to this
    // planner, so this is a STRUCTURAL placeholder an author may override before `atlas emit`, never a
    // claim about which admin-declared scope owns the anchor), no `check` (⇒ advisory family), `claimNorm`,
    // `predicateSlot`. `freshness`/`claims`/`authoring` complete the `AdvisoryNode` shape the type demands
    // (the door does not gate on them, but a `GroundedFact` is not well-formed without them).
    const fact: GroundedFact = {
      kind: 'advisory',
      id,
      tier: DRAFT_TIER,
      claimNorm: input.claim,
      grounding,
      freshness: 'FRESH',
      claims: [],
      authoring: 'ADVISORY',
      scope: scopeOf(input.anchor),
      predicateSlot: input.slot,
    };

    return {
      fact,
      rev,
      // AUTHOR-10 — see the file-header FRAMING NOTE: no incumbent-lookup port is injected here, so the
      // conservative, always-true half is reported.
      operation: 'CREATE',
      // AUTHOR-9 — see the file-header FRAMING NOTE: the store-derived conjuncts are unavailable, so the
      // safe direction is always reported (never a false `auto-accept`).
      route: 'full-ratify',
      requires: RATIFY_CHANNEL,
    };
  };
  return { draft };
}

/** The FIRST path segment of an anchor's `qualifiedPath` (e.g. `packages/tools/src/foo.ts::bar` →
 *  `packages`) — a deterministic, purely STRUCTURAL default for `scope` (AUTHOR-6d: "computed or
 *  defaulted, never demanded"). It asserts NOTHING about which admin-declared governance scope actually
 *  owns this anchor (that binding — `scopeOwnsAnchor`, ARCH-9 — lives in the admin policy, `adapter-io/
 *  src/policy.ts`, a port not injected here); it exists only so the drafted fact is a well-formed non-empty
 *  string the emit door's gate-0 `isScope` check does not refuse outright. An author whose repository's
 *  policy names a different owning scope for this anchor MUST override the field before `atlas emit`.
 *  Never throws: an anchor with no `/` yields itself, whole. */
function scopeOf(anchor: string): string {
  const i = anchor.indexOf('/');
  const first = i < 0 ? anchor : anchor.slice(0, i);
  return first.length > 0 ? first : 'root';
}

// differential-vs-oracle (compile-time): the impl's `draft` conforms to the co-located frozen
// `DraftApi.draft` signature. `GroundingComputer` is the SAME port `anchors` declares — the port stays
// UNIMPLEMENTED here, satisfied by injection.
const _draftConforms: DraftApi['draft'] = createDraft({
  anchorsUnder: () => ({ rev: '', units: [], holes: [] }),
  groundingFor: () => ({ kind: 'file', qualifiedPath: '', subtreeHash: '' as never }),
}).draft;
void _draftConforms;
