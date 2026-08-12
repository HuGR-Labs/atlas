// @atlas/genesis — src/verify-fact.ts  (spike/verify-fact — the POSITIVE DUAL of the #99b negation door)
//
// A PURE, TOTAL oracle: PROVE or ABSTAIN on a "scope A depends on global symbol B" claim, riding the
// SAME live `SymbolReverseApi` mechanics `governed-emit-negation.ts` (the negation door, @atlas/adapter-io)
// already uses. This is that door's gate-1 logic, restated as its POSITIVE counterpart — TRANSCRIBED, not
// invented:
//   - a POSITIVE existence (`reverseCallers(target) ∩ sourceScope ≠ ∅`) is SOUND IN ANY WORLD — no
//     closed-world requirement, unlike a negative. `proven` therefore needs no `holeSources` check at all;
//     this is the one place the positive dual is CHEAPER than the negation door's admit.
//   - a REFUTATION is deliberately NOT emitted (see `FactVerdict`): it would need a closed-world completeness
//     proof the SCIP feed does not give cross-package (PV-recall 2026-08-12), so an absence is ABSTAINED, not
//     refuted. The `holeSources() ∩ worldScope` test survives only to discriminate the abstain reason.
//   - everything else the negation door abstains on, this door abstains on too (malformed / non-global
//     target / unresolvable target / an open or un-closeable world).
//
// LAYERING NOTE (flagged, NOT invented — the frozen contract said "use the real `underScope`... never a
// string `.includes`" but did not anticipate this): the negation door recovers a docHash's path via
// `indexPathsByHash(axes.spatial, nodeHashOfPath)` (adapter-io/src/governed-emit-negation.ts), walking the
// FULL spatial axis, and its `∩ S` containment is `adapter-io/src/anchor-scope.ts`'s `underScope`.
// `@atlas/genesis` is L8 (ARCHITECTURE.md), strictly BELOW the ring `@atlas/adapter-io` sits in
// (`harness/gates/layer-guard.mjs` ARCH-1/2) — importing `underScope` from adapter-io here would be a
// FORBIDDEN upward edge (genesis may only import from packages strictly below it). So `underScope` is
// TRANSCRIBED verbatim (byte-identical predicate — cite the source, never invent a second one) in the ONE
// shared home `scope-predicate.ts`, imported here as `anyInScope` — a single copy for the whole PROVEN
// family, not one transcription per oracle (see that module's header). `pathOfHash` is supplied by the
// CALLER — see `harness/probes/verify-fact.mjs`, which builds it straight off the SCIP feed's own
// `documents[].relativePath`, provably every hash `SymbolReverseApi` can ever return: `createSymbolReverse`
// mints `nodeHashOfPath(doc.relativePath)` for exactly those documents and no others
// (`packages/index/src/symbol-reverse.ts`), so that is a deliberate MINIMAL-but-COMPLETE restriction of
// `indexPathsByHash`, not an approximation of it.

import type { Hash } from '@atlas/contracts';
import type { SymbolReverseApi } from '@atlas/index';
import { anyInScope } from './scope-predicate.js';

/** One "scope A depends on global symbol B" claim. `worldScope` is the directory the completeness check
 *  ranges over — retained as the `scope-open` diagnostic discriminant. (It formerly gated a REFUTE; that
 *  verdict is suppressed — see `FactVerdict` and step 4 below.) */
export type DepClaim = {
  readonly sourceScope: string;
  readonly target: string;
  readonly worldScope: string;
};

/** The oracle's verdict — PROVE or ABSTAIN, never a throw, never a silent guess. `reason` is present on
 *  `abstain` (the durable-record discriminant, mirroring `AbstainedRecord['reason']`'s shape) and absent on
 *  a `proven` decision.
 *
 *  [SOUND-CONSERVATIVE — PV-recall 2026-08-12] There is deliberately NO `refuted`. A positive `proven` is
 *  a witnessed EXISTENCE — sound under an incomplete index (an index cannot fabricate a caller). A REFUTE
 *  is a closed-world ABSENCE claim, sound only if the completeness feed (`holeSources`) captures ALL
 *  incompleteness. It does NOT cross-package: `scip-typescript` attributes a cross-package reference to a
 *  `dist/*.d.ts` symbol that carries no definition, so a genuine cross-package caller can exist while
 *  `holeSources() ∩ worldScope == ∅` — which would emit a FALSE `refuted`. Rather than gate refute on a
 *  completeness guarantee the feed does not give, this oracle emits ONLY `proven` or `abstain`. Refuting
 *  is not the product goal (admitting TRUE facts is); the capability can return once cross-package SCIP
 *  completeness is established (dist↔src symbol canonicalisation, the #189 family). The SAME mechanism is a
 *  latent risk in the shipped negation door's closed-world ADMIT — flagged separately, not touched here. */
export type FactVerdict = {
  readonly verdict: 'proven' | 'abstain';
  readonly reason?: string;
  readonly oracle: 'symbol-reverse';
};

const abstain = (reason: string): FactVerdict => ({ verdict: 'abstain', reason, oracle: 'symbol-reverse' });

/**
 * PROVE/REFUTE/ABSTAIN on `claim`, over the live `reverse` completeness feed (`SymbolReverseApi`,
 * @atlas/index) — the POSITIVE DUAL of `governed-emit-negation.ts`'s gate-1 (transcribed, not invented; see
 * the module header for the full mapping). PURE + TOTAL: no IO, no clock, never throws.
 *
 *   0. malformed (`target`/`sourceScope`/`worldScope` any empty) ⇒ abstain('malformed').
 *   1. `isLocal(target)` (a `local ` SCIP symbol — document-scoped, its callers are intra-doc, #99b v1
 *      scope) ⇒ abstain('target-not-global').
 *   2. `!reverse.resolves(target)` (#220 — no in-index DEFINITION, a PHANTOM target: neither a positive nor
 *      a negative about it is groundable) ⇒ abstain('target-unresolvable').
 *   3. a real caller of `target` lies under `sourceScope` ⇒ proven — SOUND IN ANY WORLD, no closed-world
 *      requirement (a witnessed existence needs no completeness proof, unlike a negative).
 *   4. else ⇒ abstain — NO caller was witnessed under `sourceScope`. This is NOT a refute (see
 *      `FactVerdict`: cross-package completeness is not guaranteed, so an absence cannot be trusted). The
 *      reason discriminates for diagnostics only: `scope-open` if `worldScope` has an unresolved/dynamic
 *      reference (`holeSources() ∩ worldScope ≠ ∅`), else `no-caller-in-scope`.
 */
export function verifyDependency(
  claim: DepClaim,
  reverse: SymbolReverseApi,
  pathOfHash: (h: Hash) => string | undefined,
  isLocal: (sym: string) => boolean,
): FactVerdict {
  const { sourceScope, target, worldScope } = claim;
  if (target.length === 0 || sourceScope.length === 0 || worldScope.length === 0) return abstain('malformed');
  if (isLocal(target)) return abstain('target-not-global');
  if (!reverse.resolves(target)) return abstain('target-unresolvable');

  if (anyInScope(reverse.reverseCallers(target), pathOfHash, sourceScope)) {
    return { verdict: 'proven', oracle: 'symbol-reverse' };
  }
  // No witnessed caller under sourceScope. NOT a refute (cross-package completeness is not guaranteed —
  // see FactVerdict): abstain either way, the reason is a diagnostic only.
  return abstain(anyInScope(reverse.holeSources(), pathOfHash, worldScope) ? 'scope-open' : 'no-caller-in-scope');
}
