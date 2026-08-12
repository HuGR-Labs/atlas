// @atlas/genesis — src/verify-negation.ts  (spike/verify-fact — the NEGATION class of the PROVEN fact family)
//
// A PURE, TOTAL oracle: PROVE / REFUTE / ABSTAIN on a "NO unit under scope A references global symbol B"
// claim, riding the SAME live `SymbolReverseApi` mechanics as the dependency (`verify-fact.ts`) and count
// (`verify-count.ts`) oracles and the shipped negation door (`adapter-io/src/governed-emit-negation.ts`,
// gate-1 + #220). This is the genesis-side, `--class`-driven restatement of that door's logic — TRANSCRIBED,
// not invented — as a PROVEN oracle. It does NOT touch the shipped sealed door.
//
// THE DUALITY (why this oracle EMITS `refuted` where the dependency oracle deliberately does not).
// A negation is an ABSENCE claim, so the two verdicts have OPPOSITE soundness conditions from the positive
// dependency oracle's:
//   - REFUTE (the negation is FALSE): witness ONE caller of B under A. A witnessed caller is a positive
//     EXISTENCE — sound in ANY world, because an incomplete index cannot FABRICATE a caller. So refuting a
//     negation needs NO closed-world proof. This is the sound direction here — the exact mirror of the
//     dependency oracle, where PROVE was the any-world-sound direction and REFUTE the unsound one.
//   - PROVE (the negation HOLDS): "no caller anywhere in A" is a closed-world claim — sound only if the index
//     has NO unresolved/dynamic reference in the world it ranges over (`holeSources() ∩ worldScope == ∅`); a
//     hole could be an unseen caller of B. World open ⇒ abstain('scope-open'), never a false `proven`.
//   - A PHANTOM target (`!resolves(target)`, #220): `reverseCallers` is `[]` by CONSTRUCTION for a symbol with
//     no in-index definition, so "no caller" would VACUOUSLY prove the negation for a target Atlas cannot even
//     see. Fail closed: abstain('target-unresolvable') BEFORE any prove — exactly the shipped door's #220 fix.
//
// `underScope`/`anyInScope` come from the shared `scope-predicate.ts` (one transcription for the whole PROVEN
// family). `pathOfHash` and `isLocal` are supplied by the CALLER, as `verifyDependency` requires them (see
// `harness/probes/verify-fact.mjs`).

import type { Hash } from '@atlas/contracts';
import type { SymbolReverseApi } from '@atlas/index';
import { anyInScope } from './scope-predicate.js';

/** One "NO unit under `sourceScope` references global symbol `target`" claim. `worldScope` is the directory
 *  the closed-world completeness check ranges over (a hole under it blocks a `proven`); it mirrors `DepClaim`.
 *  Typically `worldScope ⊇ sourceScope` — you cannot soundly prove an absence over a scope wider than the
 *  world you have checked for holes, but that is the CALLER's contract to honour; this oracle is total for any
 *  pair. */
export type NegationClaim = {
  readonly sourceScope: string;
  readonly target: string;
  readonly worldScope: string;
};

/** PROVE / REFUTE / ABSTAIN — the negation oracle's verdict. Unlike the dependency oracle's `FactVerdict`
 *  (which has NO `refuted`, because there a refute would be the unsound closed-world direction), THIS oracle
 *  emits `refuted` as its SOUND, any-world direction (a witnessed counterexample caller). `oracle` stays
 *  `'symbol-reverse'`: it is the same feed answering an absence question, not a second decision-maker. */
export type NegationVerdict = {
  readonly verdict: 'proven' | 'refuted' | 'abstain';
  readonly reason?: string;
  readonly oracle: 'symbol-reverse';
};

const abstain = (reason: string): NegationVerdict => ({ verdict: 'abstain', reason, oracle: 'symbol-reverse' });

/**
 * PROVE / REFUTE / ABSTAIN on the negation `claim`, over the live `reverse` feed (`SymbolReverseApi`,
 * @atlas/index). PURE + TOTAL: no IO, no clock, never throws. The ladder:
 *
 *   0. malformed (`target`/`sourceScope`/`worldScope` any empty) ⇒ abstain('malformed').
 *   1. `isLocal(target)` (a `local ` SCIP symbol — document-scoped, #99b v1 scope) ⇒ abstain('target-not-global').
 *   2. `!reverse.resolves(target)` (#220 — a PHANTOM: `reverseCallers` is `[]` by construction, so "no caller"
 *      would VACUOUSLY prove the negation) ⇒ abstain('target-unresolvable').
 *   3. a real caller of `target` lies under `sourceScope` ⇒ REFUTED — a witnessed counterexample, SOUND IN ANY
 *      WORLD (no closed-world requirement; the negation is simply false).
 *   4. no caller under `sourceScope`, AND the world is OPEN (`holeSources() ∩ worldScope ≠ ∅`) ⇒ abstain('scope-open')
 *      — an unseen reference could exist, so the absence cannot be trusted.
 *   5. no caller under `sourceScope`, AND the world is CLOSED ⇒ PROVEN — a sound closed-world negative.
 */
export function verifyNegation(
  claim: NegationClaim,
  reverse: SymbolReverseApi,
  pathOfHash: (h: Hash) => string | undefined,
  isLocal: (sym: string) => boolean,
): NegationVerdict {
  const { sourceScope, target, worldScope } = claim;
  if (target.length === 0 || sourceScope.length === 0 || worldScope.length === 0) return abstain('malformed');
  if (isLocal(target)) return abstain('target-not-global');
  if (!reverse.resolves(target)) return abstain('target-unresolvable');

  // REFUTE: a witnessed caller under sourceScope is a positive existence — sound in ANY world, no closed-world
  // test. The negation is false.
  if (anyInScope(reverse.reverseCallers(target), pathOfHash, sourceScope)) {
    return { verdict: 'refuted', oracle: 'symbol-reverse' };
  }

  // No caller witnessed under sourceScope. PROVING the absence is closed-world: a hole in the world could be an
  // unseen caller of target.
  if (anyInScope(reverse.holeSources(), pathOfHash, worldScope)) return abstain('scope-open');
  return { verdict: 'proven', oracle: 'symbol-reverse' };
}
