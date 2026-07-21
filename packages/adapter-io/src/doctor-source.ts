// @atlas/adapter-io — src/doctor-source.ts  (DOCTORSOURCE — the real read-only DoctorSource port)
//
// The last governed seam: the REAL `DoctorSource` (@atlas/tools) `atlas doctor` reads over. It is built
// from the SAME durable store + arbitrary-rev index the governed emit leg rides — NOT a fresh oracle:
//   - `hotSetSize()` — the current-node count of the rehydrated durable projection (@atlas/knowledge).
//   - `lineage(scope?)` — the monotone CAS supersede-chain of the current nodes: each node's `contentHash`
//     plus its `supersededBy` pointer, canonically ordered, optionally filtered by the fact's `scope`.
//   - `drift(fact)` — DETECT: the RECORDED grounding no longer holds at HEAD (`reDerives(fact,HEAD)` is NOT
//     FRESH — the recorded anchor's `qualifiedPath` is gone OR now carries different content). CLASSIFY (the
//     KNOW-5 split, mirroring `bindReconcile`): does the recorded anchor's CONTENT (`subtreeHash`) still
//     re-derive SOMEWHERE at HEAD (`resolveBySubtreeAt('HEAD', anchorWas.subtreeHash)`)? If YES the claim
//     MOVED but survives ⇒ `mechanical`, `anchorNow` = that new location (re-groundable). If NO the claim
//     rotted ⇒ `semantic`, `anchorNow` names what the recorded path holds now (or the recorded anchor when
//     the path too is gone). Crucially it does NOT re-compare the recorded hash to itself on the SAME anchor
//     (the old bug: that made mechanical structurally unreachable — a detected drift was ALWAYS semantic).
//   - `plan(fact)` — only when drifted: mechanical ⇒ a `reground` template (primary anchor swapped to
//     `anchorNow`), semantic ⇒ a `retire` template (the fact tagged SUPERSEDED). The emitted candidate is
//     a well-formed `GroundedFact` — the payload the doctor plan funnels through the single write door.
//
// TOTAL + READ-ONLY: an unknown fact, an absent anchor, a missing HEAD resolution ⇒ `undefined`/empty,
// NEVER a throw and NEVER a write. Every read rides the total store/revIndex seams (both fail-closed).

import type { Hash, StructRef } from '@atlas/contracts';
import { asHash } from '@atlas/kernel';
import { currentNodes } from '@atlas/knowledge';
import type { GroundedFact } from '@atlas/knowledge';
import type { DoctorSource, DriftItem } from '@atlas/tools';
import type { RevIndex } from './rev-index.js';
import { rehydrateProjection } from './store.js';
import type { DiskStore } from './store.js';

/** The rev `drift`/`plan` diff against — the composition root pins HEAD once per process (revIndex memoizes
 *  the built `Axes` by rev), so `drift` compares the RECORDED anchor vs HEAD-at-compose-time. */
const HEAD: Hash = asHash('HEAD');

/** The RECORDED primary grounding anchor — the first entry's `StructRef` (entries sorted by anchor). The
 *  broader/secondary citations feed drift too, but the primary is the identity anchor `drift` keys on
 *  (KNOW-15g). `undefined` when the grounding carries no entries (fail-closed — never a throw). EXPORTED so
 *  the reconcile classifier (compose.ts) keys its content-addressed re-derivation on the SAME primary anchor
 *  `drift` does — one shared pick, never two divergent copies of the "which anchor" decision (N10). */
export function primaryAnchor(fact: GroundedFact): StructRef | undefined {
  return fact.grounding.entries[0]?.anchor;
}

/**
 * The MECHANICAL re-ground candidate: the SAME claim with its primary grounding anchor swapped to
 * `anchorNow` (the HEAD-resolved `StructRef`, subtreeHash updated) and freshness reset to FRESH — the
 * emittable template the reground plan funnels through `atlas-emit`. Pure + total; an anchorless grounding
 * is returned unchanged (nothing to re-ground). Narrowed on `kind` so the discriminated union stays intact.
 */
export function regroundTemplate(fact: GroundedFact, anchorNow: StructRef): GroundedFact {
  const first = fact.grounding.entries[0];
  if (first === undefined) return fact;
  const entries = [{ ...first, anchor: anchorNow }, ...fact.grounding.entries.slice(1)];
  const grounding = { entries };
  return fact.kind === 'predicate'
    ? { ...fact, grounding, freshness: 'FRESH' }
    : { ...fact, grounding, freshness: 'FRESH' };
}

/**
 * The SEMANTIC retire candidate: the fact tagged for retire (`authoring: 'SUPERSEDED'`, valid on both
 * node families) — the claim no longer re-derives, so it is retired through the single write door, not
 * re-grounded. Pure + total; the claim body is otherwise unchanged.
 */
export function retireTemplate(fact: GroundedFact): GroundedFact {
  return fact.kind === 'predicate'
    ? { ...fact, authoring: 'SUPERSEDED' }
    : { ...fact, authoring: 'SUPERSEDED' };
}

/**
 * Build the REAL read-only `DoctorSource` over the durable `store` + the arbitrary-rev `revIndex`. Every
 * leg reads; NONE writes. The persisted `GroundedFact` is read back from CAS (invariant-6:
 * `store.get(contentHash)` returns the WHOLE fact governed-emit `put`), so `drift`/`plan` operate on the
 * recorded grounding, never a re-derived guess.
 */
export function createDoctorSource(store: DiskStore, revIndex: RevIndex): DoctorSource {
  /** The current nodes of the rehydrated durable projection (exactly one per nodeKey). */
  const nodes = () => currentNodes(rehydrateProjection(store));

  /** Read a fact back from CAS by its content hash (invariant-6). `undefined` on any miss/tamper. */
  const factOf = (contentHash: string): GroundedFact | undefined =>
    store.get(contentHash as Hash) as GroundedFact | undefined;

  const hotSetSize = (): number => nodes().length;

  const lineage = (scope?: string): readonly Hash[] => {
    const chain: string[] = [];
    for (const n of nodes()) {
      if (scope !== undefined && factOf(n.contentHash)?.scope !== scope) continue; // scope-filtered
      chain.push(n.contentHash);
      if (n.supersededBy !== undefined) chain.push(n.supersededBy); // the CAS supersede pointer
    }
    return [...new Set(chain)].sort() as Hash[]; // canonical (dedup + lexicographic) order
  };

  const drift = (fact: string): DriftItem | undefined => {
    const node = nodes().find((n) => n.nodeKey === fact);
    const grounded = node && factOf(node.contentHash);
    if (!grounded) return undefined; // unknown fact / missing bytes — fail-closed
    const anchorWas = primaryAnchor(grounded);
    if (anchorWas === undefined) return undefined; // no anchor to diff
    // DETECT: the recorded grounding still holds at HEAD (every anchor re-derives FRESH) ⇒ NOT drifted. This
    // fires on BOTH a moved anchor (recorded qualifiedPath gone at HEAD) AND a changed unit (same path, new
    // subtreeHash) — never a self-compare of the recorded hash against itself.
    if (revIndex.reDerives(grounded, HEAD)) return undefined;
    // CLASSIFY (KNOW-5, mirrors bindReconcile): does the recorded CONTENT re-derive somewhere at HEAD?
    const reAnchor = revIndex.resolveBySubtreeAt(String(HEAD), String(anchorWas.subtreeHash));
    if (reAnchor !== undefined) {
      // Mechanical: the claim MOVED but survives — re-groundable to its new location.
      return { fact, class: 'mechanical', anchorWas, anchorNow: reAnchor };
    }
    // Semantic: the content rotted away. `anchorNow` names what the recorded path holds now, or — when the
    // path itself is gone — the recorded anchor (a total, honest pointer; never a throw).
    const anchorNow = revIndex.resolveAnchorAt(String(HEAD), anchorWas.qualifiedPath) ?? anchorWas;
    return { fact, class: 'semantic', anchorWas, anchorNow };
  };

  const plan = (fact: string): { readonly action: 'reground' | 'retire'; readonly emit: GroundedFact } | undefined => {
    const item = drift(fact);
    if (item === undefined) return undefined; // only a drifted fact carries a plan
    const node = nodes().find((n) => n.nodeKey === fact);
    const grounded = node && factOf(node.contentHash);
    if (!grounded) return undefined; // totality guard (drift implies present, but never assume)
    return item.class === 'mechanical'
      ? { action: 'reground', emit: regroundTemplate(grounded, item.anchorNow) }
      : { action: 'retire', emit: retireTemplate(grounded) };
  };

  return { hotSetSize, lineage, drift, plan };
}
