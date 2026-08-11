// @atlas/cli — src/mine-claim-scrub.ts  (T0 — the mined CLAIM's own scrub-before-hash, sibling of mine-answer.ts)
//
// #195(b) scrubbed the ANSWER bytes (`mine-answer.ts` → `answerRef`) but left the SEPARATE text that becomes
// the fact's `claimNorm` untouched — and `claimNorm` is not a transport field like `rawAnswer`: it is the
// identity-bearing claim body itself (KNOW-4c dedup ingredient), stamped straight onto the fact object that
// `mine-decide.ts` hashes into CAS (`id(f)`) and onto the `WriteRequest.claimNorm` carrier. A model answer
// that contains a credential shape therefore still reached CAS raw, through the CLAIM, even though the
// separately-stored answer copy was already scrubbed — same class as #207 / #118 / #121.
//
// SCRUB, THEN HASH (KNOW-11) — same order and the SAME `@atlas/persist` primitive `mine-answer.ts` uses,
// applied to the ADVISORY claim body before anything derives identity or bytes from it. `mine-decide.ts`
// calls this ONCE, before `id(f)` / `nodeKey` / `WriteRequest.claimNorm` are computed, so every downstream
// consumer of the claim text sees the same (scrubbed) bytes — there is no separate raw copy anywhere.
//
// WHY THE SCRUBBED TEXT BECOMES THE ONE CLAIM, RATHER THAN A SEPARATE STORED COPY (unlike the answer
// receipt): `claimNorm` for an ADVISORY fact does not feed `nodeKey` at all (`nodeKey` = `hash(primaryAnchor
// ‖ slot)`, body-wording independent — knowledge/src/write/router.ts `nodeKey`), so scrubbing it changes
// WHAT is claimed but never WHICH node claims it: no advisory nodeKey can collide or relocate because of
// this scrub. It only narrows `contentHash` (`id(f)`), which is a CAS dedup key — two claims that scrub to
// the same bytes really are the same public claim, and content-address dedup collapsing them is correct,
// not a defect (`mine-claim-scrub.test.ts` pins that two DISTINCT non-secret claims still diverge).
//
// SCOPE — ADVISORY ONLY, ON PURPOSE. A predicate fact's `claimNorm` is `normalizeCheck(f.check)`, and
// `f.check` also folds into the predicate `nodeKey` (KNOW-15c: "a distinct check ⇒ distinct node"). Scrubbing
// `check.expr`/`check.query` would touch that identity leg — a materially bigger design decision than the
// one this fix makes, and the interaction (predicate identity via a scrubbed check) is UNMEASURED. Left as
// a known, reported second gap (framing error), not silently folded into this fix.

import { scrub } from '@atlas/persist';

/**
 * Scrub a mined ADVISORY claim's body — the same whole-buffer `@atlas/persist` `scrub` `mine-answer.ts`
 * uses for the answer, applied here BEFORE the claim becomes part of any hashed/stored bytes. `scrub` only
 * redacts credential SHAPES to an ASCII placeholder and preserves valid UTF-8, so the result round-trips
 * losslessly through the CAS object `mine-decide.ts` hashes.
 */
export function scrubClaimNorm(claimNorm: string): string {
  const scrubbed = scrub(Buffer.from(claimNorm, 'utf8'));
  return Buffer.from(scrubbed).toString('utf8');
}
