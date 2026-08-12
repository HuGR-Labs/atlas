// @atlas/genesis — src/verify-fact.ts  (spike/verify-fact — the POSITIVE DUAL of the #99b negation door)
//
// A PURE, TOTAL oracle: PROVE / REFUTE / ABSTAIN on a "scope A depends on global symbol B" claim, riding the
// SAME live `SymbolReverseApi` mechanics `governed-emit-negation.ts` (the negation door, @atlas/adapter-io)
// already uses. This is that door's gate-1 logic, restated as its POSITIVE counterpart — TRANSCRIBED, not
// invented:
//   - a POSITIVE existence (`reverseCallers(target) ∩ sourceScope ≠ ∅`) is SOUND IN ANY WORLD — no
//     closed-world requirement, unlike a negative. `proven` therefore needs no `holeSources` check at all;
//     this is the one place the positive dual is CHEAPER than the negation door's admit.
//   - a REFUTATION needs the SAME closed-world proof the negation door's admit needs:
//     `holeSources() ∩ worldScope == ∅` (the world scope is CLOSED — no unresolved/dynamic reference
//     anywhere in it, so the absence of a caller can be trusted rather than merely unseen).
//   - everything else the negation door abstains on, this door abstains on too (malformed / non-global
//     target / unresolvable target / an open world it cannot close).
//
// LAYERING NOTE (flagged, NOT invented — the frozen contract said "use the real `underScope`... never a
// string `.includes`" but did not anticipate this): the negation door recovers a docHash's path via
// `indexPathsByHash(axes.spatial, nodeHashOfPath)` (adapter-io/src/governed-emit-negation.ts), walking the
// FULL spatial axis, and its `∩ S` containment is `adapter-io/src/anchor-scope.ts`'s `underScope`.
// `@atlas/genesis` is L8 (ARCHITECTURE.md), strictly BELOW the ring `@atlas/adapter-io` sits in
// (`harness/gates/layer-guard.mjs` ARCH-1/2) — importing `underScope` from adapter-io here would be a
// FORBIDDEN upward edge (genesis may only import from packages strictly below it). So `underScope` is
// TRANSCRIBED verbatim below (byte-identical predicate — cite the source, never invent a second one; it CAN
// drift if `anchor-scope.ts` changes and nothing here would notice). `pathOfHash` is supplied by the
// CALLER — see `harness/probes/verify-fact.mjs`, which builds it straight off the SCIP feed's own
// `documents[].relativePath`, provably every hash `SymbolReverseApi` can ever return: `createSymbolReverse`
// mints `nodeHashOfPath(doc.relativePath)` for exactly those documents and no others
// (`packages/index/src/symbol-reverse.ts`), so that is a deliberate MINIMAL-but-COMPLETE restriction of
// `indexPathsByHash`, not an approximation of it.

import type { Hash } from '@atlas/contracts';
import type { SymbolReverseApi } from '@atlas/index';

/** `true` iff `anchor` lies UNDER `scope` — TRANSCRIBED verbatim from `anchor-scope.ts`'s `underScope`
 *  (@atlas/adapter-io, `src/anchor-scope.ts`; layering forbids importing it here, see module header above).
 *  A SEGMENT-WISE prefix test on the anchor's FILE-PATH portion (the text before the first `::`,
 *  `/`-split), NOT a raw `startsWith`. Total: an empty scope trivially covers every anchor. */
function underScope(anchor: string, scope: string): boolean {
  const filePath = anchor.split('::')[0] ?? anchor;
  const anchorSegs = filePath.split('/');
  const scopeSegs = scope.split('/');
  if (scopeSegs.length > anchorSegs.length) return false;
  for (let i = 0; i < scopeSegs.length; i++) if (scopeSegs[i] !== anchorSegs[i]) return false;
  return true;
}

/** One "scope A depends on global symbol B" claim. `worldScope` is the directory the closed-world check
 *  ranges over — the scope Atlas must see COMPLETELY (no hole) to trust a REFUTE; mirrors the negation
 *  door's own scope, the directory it must prove closed to ADMIT a negative. */
export type DepClaim = {
  readonly sourceScope: string;
  readonly target: string;
  readonly worldScope: string;
};

/** The oracle's verdict — PROVE / REFUTE / ABSTAIN, never a throw, never a silent guess. `reason` is
 *  present on `abstain` (the durable-record discriminant, mirroring `AbstainedRecord['reason']`'s shape)
 *  and absent on a decided verdict (`proven`/`refuted` are decisions, not abstentions — no reason to give). */
export type FactVerdict = {
  readonly verdict: 'proven' | 'refuted' | 'abstain';
  readonly reason?: string;
  readonly oracle: 'symbol-reverse';
};

const abstain = (reason: string): FactVerdict => ({ verdict: 'abstain', reason, oracle: 'symbol-reverse' });

/** The subset test `∩ S` reduces to: does ANY hash in `hashes` have a KNOWN path (fail-closed on an
 *  unmapped hash — never assume it is in scope) lying UNDER `scope`? */
function anyInScope(
  hashes: readonly Hash[],
  pathOfHash: (h: Hash) => string | undefined,
  scope: string,
): boolean {
  return hashes.some((h) => {
    const p = pathOfHash(h);
    return p !== undefined && underScope(p, scope);
  });
}

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
 *   4. else, if `worldScope` is CLOSED (`holeSources() ∩ worldScope == ∅` — no unresolved/dynamic
 *      reference anywhere Atlas must see to answer) ⇒ refuted (nothing in the source scope calls the
 *      target, and the world was seen completely — the closed-world proof the negation door's ADMIT needs).
 *   5. else (the world is OPEN — an unresolved/dynamic reference lives in it) ⇒ abstain('scope-open'): the
 *      absence of a witness cannot be told apart from a witness Atlas simply cannot see.
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
  if (!anyInScope(reverse.holeSources(), pathOfHash, worldScope)) {
    return { verdict: 'refuted', oracle: 'symbol-reverse' };
  }
  return abstain('scope-open');
}
