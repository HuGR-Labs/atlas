// @atlas/adapter-io — src/doctor-source.ts  (DOCTORSOURCE — the real read-only DoctorSource port)
//
// The last governed seam: the REAL `DoctorSource` (@atlas/tools) `atlas doctor` reads over. It is built
// from the SAME durable store + arbitrary-rev index the governed emit leg rides — NOT a fresh oracle:
//   - `hotSetSize()` — the current-node count of the rehydrated durable projection (@atlas/knowledge).
//   - `lineage(scope?)` — the monotone CAS supersede-chain of the current nodes: each node's `contentHash`
//     plus its `supersededBy` pointer, canonically ordered, optionally filtered by the fact's `scope`.
//   - `drift(fact)` — DETECT: the RECORDED grounding no longer holds at HEAD (`reDerives(fact,HEAD)` is NOT
//     FRESH — some cited anchor's `qualifiedPath` is gone OR now carries different content). CLASSIFY (the
//     KNOW-5 split, mirroring `bindReconcile`) over THE ENTRIES THAT ACTUALLY DRIFTED: does each one's
//     CONTENT (`subtreeHash`) still re-derive SOMEWHERE at HEAD (`resolveBySubtreeAt('HEAD', …)`)? If EVERY
//     drifted entry does, the claim MOVED but survives ⇒ `mechanical`, `anchorNow` = the first such entry's
//     new location (re-groundable). If ANY of them does not, that citation rotted ⇒ `semantic`, keyed on the
//     ROTTED entry, `anchorNow` naming what its recorded path holds now (or the recorded anchor when the
//     path too is gone). Crucially it does NOT re-compare the recorded hash to itself on the SAME anchor
//     (the old bug: that made mechanical structurally unreachable — a detected drift was ALWAYS semantic).
//   - `plan(fact)` — only when drifted: mechanical ⇒ a `reground` template (EVERY drifted entry re-anchored
//     to where its content lives at HEAD), semantic ⇒ a `retire` template (the fact tagged SUPERSEDED). The
//     emitted candidate is a well-formed `GroundedFact` — the payload the doctor plan funnels through the
//     governed `atlas-emit` write door.
//
// ── SYMMETRY: DETECTION, CLASSIFICATION AND REPAIR ALL SPAN EVERY ENTRY ───────────────────────────────────
// Detection has always been total over the grounding (`reDerives` → `driftDetect`, a conjunction over every
// citation). Classification and repair used to touch `entries[0]` ALONE, and that asymmetry WAS the defect: a
// fact that drifted because a SECONDARY citation went stale still resolved its primary anchor at HEAD, read
// `mechanical`, and emitted a "repair" that swapped the primary anchor to effectively where it already was —
// a plan that could never land, stamped `freshness: 'FRESH'` by a template that had re-derived nothing.
//
// THE HONEST SEVERITY, MEASURED, NOT ROUNDED UP (`test/doctor-entry-symmetry.test.ts`): the FRESH stamp never
// reached the projection. `governed-emit.ts` gate 1 re-derives the WHOLE grounding through `buildGate` and
// REFUSES a non-HOLDS node (`REJECTED_UNGROUNDED`, nothing persisted) — and it recomputes freshness from the
// index, never reading the node's own `freshness` field, so the stamp is inert at the door. The live defect
// was therefore a MISCLASSIFICATION plus a repair plan that could not land, not a false FRESH in the store.
//
// TOTAL + READ-ONLY: an unknown fact, an absent anchor, a missing HEAD resolution ⇒ `undefined`/empty,
// NEVER a throw and NEVER a write. Every read rides the total store/revIndex seams (both fail-closed).

import type { Freshness, Hash, StructRef } from '@atlas/contracts';
import type { GroundingEntry } from '@atlas/grounding';
import { asHash } from '@atlas/kernel';
import { currentNodes } from '@atlas/knowledge';
import type { GroundedFact } from '@atlas/knowledge';
import type { DoctorSource, DriftItem } from '@atlas/tools';
import type { RevIndex } from './rev-index.js';
import { rehydrateProjection } from './store.js';
import type { DiskStore } from './store.js';
import { refuseUntrustedRead } from './read-provenance.js';
import type { SidecarTrust } from './store-provenance.js';

/** The rev `drift`/`plan` diff against — the composition root pins HEAD once per process (revIndex memoizes
 *  the built `Axes` by rev), so `drift` compares the RECORDED anchor vs HEAD-at-compose-time. */
const HEAD: Hash = asHash('HEAD');

/** The RECORDED primary grounding anchor — the first entry's `StructRef` (entries sorted by anchor). It is
 *  the fact's IDENTITY anchor (KNOW-15g: `nodeKey` keys on it), and here that is now ALL it is: `drift` and
 *  `plan` below no longer key on it, because DETECTION never did. `undefined` when the grounding carries no
 *  entries (fail-closed — never a throw).
 *
 *  EXPORTED for its ONE production caller, the reconcile classifier in compose.ts — and the asymmetry that
 *  leaves is STATED rather than implied. That classifier still asks its mechanical/semantic question about
 *  entry 0 ALONE, exactly as `drift` used to: it is a second copy of the defect fixed below, living in the
 *  composition root, which this seam does not own (recorded as the open item on
 *  `docs/requirements/work-packages/wp-fix-doctor-entries.md`). What this comment must NOT keep saying is
 *  that the two classifiers are "one shared pick" — after the fix they are not, and the sentence that
 *  claimed they were is precisely what kept the second copy invisible. */
export function primaryAnchor(fact: GroundedFact): StructRef | undefined {
  return fact.grounding.entries[0]?.anchor;
}

/** The fact restricted to ONE grounding entry — the unit a per-entry drift verdict is taken on.
 *
 *  This is a DECOMPOSITION of the detection oracle, not a second oracle. `reDerives` reads only
 *  `fact.grounding`, and `driftDetect` (@atlas/grounding src/drift.ts) is a CONJUNCTION over entries (any
 *  unresolvable-or-changed anchor ⇒ DRIFTED; all resolve ⇒ FRESH), so for a grounding with ≥1 entry
 *      reDerives(fact, rev)  ⇔  ∀ e ∈ entries. reDerives(restrictTo(fact, e), rev)
 *  — the per-entry verdicts partition exactly the whole-fact verdict `drift` detects on. (`isGrounded`'s
 *  `entries.length >= 1` leg is why the equivalence is stated for a non-empty grounding; the empty case is
 *  refused before any of this runs.) Narrowed on `kind` so the discriminated union stays intact. */
function restrictTo(fact: GroundedFact, entry: GroundingEntry): GroundedFact {
  const grounding = { entries: [entry] };
  return fact.kind === 'predicate' ? { ...fact, grounding } : { ...fact, grounding };
}

/**
 * The MECHANICAL re-ground candidate: the SAME claim with every grounding entry re-anchored to where its
 * content was ESTABLISHED at HEAD. `resolved` is POSITIONAL over `fact.grounding.entries`:
 *   - `resolved[i]` a `StructRef` — entry `i`'s established HEAD location (its recorded anchor when the
 *     entry never drifted; its NEW location when the content moved). The entry is rewritten to it.
 *   - `resolved[i]` `undefined` (or absent — a short array) — entry `i`'s freshness could NOT be
 *     established. Its recorded anchor is left alone and the repair is PARTIAL.
 *
 * FRESHNESS IS DERIVED, NEVER ASSERTED, and that is what the second parameter is for. This template used to
 * rewrite `entries[0]` and stamp `freshness: 'FRESH'` unconditionally — on a fact whose drift may have come
 * from ANY entry, so the stamp described a re-derivation that had not happened. Here it is `FRESH` iff EVERY
 * entry is established (the same conjunction `driftDetect` computes) and `DRIFTED` otherwise: a partial
 * repair says so in the field the reader trusts. Pure + total; an anchorless grounding is returned unchanged
 * (nothing to re-ground). Narrowed on `kind` so the discriminated union stays intact.
 */
export function regroundTemplate(fact: GroundedFact, resolved: readonly (StructRef | undefined)[]): GroundedFact {
  const recorded = fact.grounding.entries;
  if (recorded.length === 0) return fact;
  const entries = recorded.map((e, i) => {
    const now = resolved[i];
    return now === undefined ? e : { ...e, anchor: now };
  });
  const grounding = { entries };
  const freshness: Freshness = recorded.every((_, i) => resolved[i] !== undefined) ? 'FRESH' : 'DRIFTED';
  return fact.kind === 'predicate'
    ? { ...fact, grounding, freshness }
    : { ...fact, grounding, freshness };
}

/**
 * The SEMANTIC retire candidate: the fact tagged for retire (`authoring: 'SUPERSEDED'`, valid on both
 * node families) — the claim no longer re-derives, so it is retired through the governed `atlas-emit` write door, not
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
export function createDoctorSource(store: DiskStore, revIndex: RevIndex, trusted?: SidecarTrust): DoctorSource {
  /** The current nodes of the rehydrated durable projection (exactly one per nodeKey).
   *
   *  PROVENANCE FIRST, and this is the ONE place in this module that is not total. Every doctor leg funnels
   *  through here, so one guard covers `hotSetSize`/`lineage`/`drift`/`plan` and no future leg can be added
   *  that forgets it. Without it, a COMMITTED store made `atlas doctor hotset` report `size=0` and exit 0 —
   *  "your knowledge base is empty and healthy" — about a store the read doors had just refused to serve.
   *  Reporting health for state you have refused to read is worse than reporting nothing.
   *
   *  `DoctorSource` is documented TOTAL, and this throw is a deliberate, narrow exception to that: the port
   *  has no refusal channel (its legs return `number` / `Hash[]` / `DriftItem | undefined`, all of which
   *  would have to LIE), and the one production caller, `cli/src/doctor.ts`, converts the throw into the
   *  same structured error + guidance + non-zero exit every other doctor failure renders. The absent-seam
   *  case is unaffected: `refuseUntrustedRead` is a no-op for a store built without the provenance seam. */
  const nodes = () => {
    refuseUntrustedRead(trusted);
    return currentNodes(rehydrateProjection(store));
  };

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

  /** EVERY recorded entry that no longer re-derives at HEAD, in recorded order, each paired with its
   *  POSITION and with where its CONTENT lives at HEAD (`now`; `undefined` = nowhere, or at ≥2 distinct
   *  paths, which `resolveBySubtreeAt` REFUSES rather than guesses — either way not mechanically
   *  re-groundable). This spans the whole grounding because detection does; the two used to disagree. */
  const driftedAt = (
    fact: GroundedFact,
  ): readonly { readonly index: number; readonly entry: GroundingEntry; readonly now: StructRef | undefined }[] =>
    fact.grounding.entries.flatMap((entry, index) =>
      revIndex.reDerives(restrictTo(fact, entry), HEAD)
        ? []
        : [{ index, entry, now: revIndex.resolveBySubtreeAt(String(HEAD), String(entry.anchor.subtreeHash)) }],
    );

  const drift = (fact: string): DriftItem | undefined => {
    const node = nodes().find((n) => n.nodeKey === fact);
    const grounded = node && factOf(node.contentHash);
    if (!grounded) return undefined; // unknown fact / missing bytes — fail-closed
    if (grounded.grounding.entries.length === 0) return undefined; // no citation to diff
    // DETECT (unchanged, and it always spanned the WHOLE grounding): the recorded grounding still holds at
    // HEAD (every anchor re-derives FRESH) ⇒ NOT drifted. This fires on BOTH a moved anchor (a recorded
    // qualifiedPath gone at HEAD) AND a changed unit (same path, new subtreeHash) — never a self-compare of
    // the recorded hash against itself, and never a look at entry 0 alone.
    if (revIndex.reDerives(grounded, HEAD)) return undefined;
    // CLASSIFY (KNOW-5, mirrors bindReconcile) over the entries that ACTUALLY drifted — matching detection.
    const drifted = driftedAt(grounded);
    // Semantic FIRST, because it is the fail-closed answer: if ANY drifted citation's content re-derives
    // NOWHERE at HEAD, no automatic re-ground can make this fact whole again (the reground would rewrite the
    // movable entries and leave that one broken — an emit the truth door refuses, i.e. a plan that cannot
    // land). Keying the item on the ROTTED entry names the citation a human actually has to re-author,
    // instead of naming entry 0 whatever happened. `anchorNow` names what that entry's recorded path holds
    // now, or — when the path itself is gone — its recorded anchor (a total, honest pointer; never a throw).
    const rotted = drifted.find((d) => d.now === undefined);
    if (rotted !== undefined) {
      const anchorWas = rotted.entry.anchor;
      const anchorNow = revIndex.resolveAnchorAt(String(HEAD), anchorWas.qualifiedPath) ?? anchorWas;
      return { fact, class: 'semantic', anchorWas, anchorNow };
    }
    // Mechanical: every drifted citation MOVED but survives — the whole fact is re-groundable. `DriftItem`
    // carries ONE anchor pair (atlas-tools:24, frozen), so it reports the FIRST drifted entry's move; the
    // repair below is not limited to it. When only the primary drifted — the case that already worked — this
    // is byte-for-byte the item the entry-0 classifier produced.
    const moved = drifted[0];
    if (moved?.now === undefined) return undefined; // totality: a DRIFTED fact has ≥1 drifted entry
    return { fact, class: 'mechanical', anchorWas: moved.entry.anchor, anchorNow: moved.now };
  };

  const plan = (fact: string): { readonly action: 'reground' | 'retire'; readonly emit: GroundedFact } | undefined => {
    const item = drift(fact);
    if (item === undefined) return undefined; // only a drifted fact carries a plan
    const node = nodes().find((n) => n.nodeKey === fact);
    const grounded = node && factOf(node.contentHash);
    if (!grounded) return undefined; // totality guard (drift implies present, but never assume)
    if (item.class !== 'mechanical') return { action: 'retire', emit: retireTemplate(grounded) };
    // REPAIR spans the same entries CLASSIFICATION did. Position by position: a drifted entry is established
    // at the HEAD location its content re-derived to; an entry that did NOT drift is already established at
    // its recorded anchor (that is what "did not drift" means), so it is passed through unchanged. The
    // classifier only reaches here when every drifted entry resolved, so the template's FRESH stamp is
    // EARNED — the emitted fact re-derives at HEAD end to end, and `regroundTemplate` would stamp DRIFTED if
    // it did not.
    const drifted = driftedAt(grounded);
    const resolved = grounded.grounding.entries.map((e, i) => {
      const d = drifted.find((x) => x.index === i);
      return d === undefined ? e.anchor : d.now; // a drifted-and-unresolved entry stays `undefined` ⇒ PARTIAL
    });
    return { action: 'reground', emit: regroundTemplate(grounded, resolved) };
  };

  return { hotSetSize, lineage, drift, plan };
}
