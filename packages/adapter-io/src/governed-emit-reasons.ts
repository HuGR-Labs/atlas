// @atlas/adapter-io — src/governed-emit-reasons.ts  (the emit door's structured refusal vocabulary)
//
// SPLIT OUT OF `governed-emit.ts` (ADR-0007 carrier WP), which crossed the 400-LOC ceiling when the carrier
// separated `unauthorized for target` from `unverifiable target` again. A real seam, not a line-count
// dodge: these strings are the door's USER-VISIBLE CONTRACT and its DISCLOSURE SURFACE — each one carries
// the paragraph explaining what it may and may not tell the caller — while the module they came from is
// control flow. They are consumed ONLY by `governed-emit.ts`; the split changes no behaviour and no export
// (they were module-private there and are package-private here — `src/index.ts` does not re-export them).
//
// THE PRECEDENCE RULE THEY ENCODE lives in `governed-emit.ts`'s header, where the gate ORDER is: a refusal
// may never tell the caller more about the incumbent than the gates it has already CLEARED entitle it to.

/** The structured fail-closed reasons (TOOLS-7b / KNOW-11 / KNOW-8) — an ungrounded, unauthorized, OR
 *  unratified write never lands. */
export const REJECTED_UNGROUNDED = 'ungrounded: citation does not re-derive FRESH at source (TOOLS-7b / GROUND-6)';
export const REJECTED_UNAUTHORIZED = 'unauthorized: actor not in fact scope (KNOW-11)';
export const REJECTED_UNRATIFIED = 'unratified: T0/contested fact requires human+billy ratification (KNOW-8)';
export const REJECTED_DOWNGRADE =
  'governance-downgrade: this write declares a weaker tier than the node it targets — re-classification is ' +
  'a separate governed act, never a side effect of emitting a fact (KNOW-8: a T0 class is human-ratified)';
export const REJECTED_UNAUTHORIZED_TARGET =
  'unauthorized for target: the actor is not in the scope the node it targets already lives in (KNOW-11) — ' +
  'being authorized for the scope this write DECLARES is not authority over the node it lands on. The SAME ' +
  'refusal, byte for byte, also covers a target whose ROW carries no confirmable scope at all — a node ' +
  'minted before the governance carrier existed, or a row whose stored scope is malformed. In that state no ' +
  'scope can authorize ANYONE, so the refusal is identical for every caller and discloses nothing; it is ' +
  'never read as "authority granted". Re-classification is the separate governed act that would repair it ' +
  '(ADR-0009, task #88)';
export const REJECTED_UNVERIFIABLE_TARGET =
  'unverifiable target: the stored fact behind this node is not readable from CAS (pruned store / partial ' +
  'restore), or its bytes do not corroborate the governance the projection row declares, so the write ' +
  'cannot be checked against what the node actually is. This is a STORAGE fault, not an authorization one, ' +
  'and it is reported as itself ONLY to a caller already shown to hold authority in the row\'s scope — an ' +
  'operator who can act on it. A caller without that authority gets `unauthorized for target` in BOTH byte-' +
  'states, so this reason can never be used as a storage-health oracle over someone else\'s scope';
export const REJECTED_MALFORMED_TIER =
  'malformed tier: a fact must declare one of the three governance classes (T0 | T1 | T2). `Tier` is a ' +
  'type-only union with no runtime validator upstream, so an off-lattice value is refused HERE or nowhere';
export const REJECTED_MALFORMED_SCOPE =
  'malformed scope: a fact must declare its owning scope as a NON-EMPTY STRING — the other half of the ' +
  '`(scope, tier)` pair a reader trusts, and just as type-only. A scope is used as a property KEY by the ' +
  'authz lookup, and property keys COERCE: `["core"]` and `{toString:…}` read as the scope `core` there ' +
  'while staying `!==`-unequal to every string AND to every later copy of themselves — so an unvalidated ' +
  'scope passes authz and then fails the relocation gate forever, bricking the node for everyone';
export const REJECTED_MALFORMED_FAMILY =
  'malformed family: `kind` disagrees with `check`. The node family is discriminated by check PRESENCE — ' +
  '`nodeKey` folds a check into the identity and `route` sends any check-bearing candidate to full ' +
  'ratification — while `upsert` was handed the declared `kind`, and both are author-supplied. So a ' +
  '`predicate` MUST carry a well-formed `check` (index-query | assertion, with a string body) and an ' +
  '`advisory` MUST carry none: keeping the check while declaring `kind:"advisory"` routed an UPDATE onto a ' +
  'predicate node (free text on a checked fact, one generation of supersede lineage dropped), and declaring ' +
  '`kind:"predicate"` with no check threw a raw TypeError out of the door instead of refusing';
export const REJECTED_RELOCATION =
  'governance-relocation: this write declares a DIFFERENT scope than the node it targets — moving a node ' +
  'between scopes is a re-classification, an explicit out-of-band signed act, never a side effect of ' +
  'emitting a claim (ADR-0009). That act has NO DOOR YET (task #88), so a node cannot be migrated at all ' +
  'today; a renamed scope is recovered by the admin declaring both names in the policy';
