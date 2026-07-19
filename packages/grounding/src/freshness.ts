// @atlas/grounding — src/freshness.ts   (WP-4.10-b.GROUND · EPIC-10-b · GROUND-11)
//
// The TRANSITIVE freshness fold. A fact's freshness folds BOTH (a) its own grounding-set `subtreeHash`
// AND (b) its forward-closure's INTERFACE/signature-level `rState` on the INDEX-12 dependency axis —
// NEVER the callee's full-body `subtreeHash`. Folding a callee's body would drift every caller on any
// behaviour-PRESERVING edit (a transitive over-approximation); folding only the interface means a callee
// whose SIGNATURE/CONTRACT changed DRIFTS its callers, while a pure-body refactor of that callee does
// NOT. The verdict is the STRUCTURAL predicate `Freshness` — it phrases freshness as "the cited unit and
// its dependencies' interfaces are structurally unchanged," NEVER "the claim is true" (FRESH ≠ true).
// Transcribed against the frozen GROUND-11 interface-fold seam (`../ref/drift.ts` `InterfaceRState`) +
// atlas-grounding#ground-11; goldens SCN-GROUND-11a-1 … 11f-1.
//
// SCOPE (card WP-4.10-b.GROUND): this facet is ONLY the two-part fold + its structural rendering. NOT the
// local single-entry drift oracle `driftDetect`/`ground`/`subtreeHash` (owned by WP-4.10-a.GROUND, the
// SIBLING `ref/drift.ts`/`ground.ts`/`subtree.ts`); NOT the GROUND-13 advisory→STALE router (drift.ts);
// NOT the truth-gate `gateHolds` admission (EPIC-11). The sibling `driftDetect` CONSUMES this fold to
// obtain the forward-closure arm of its verdict.
//
// SEAM (sealed @atlas/kernel): the fold does NO hashing. The per-object `subtreeHash` and the per-node
// interface-level `rState` are computed UPSTREAM (the kernel encoder seam / INDEX-12); this module only
// COMPARES already-derived branded values (own hash + closure INTERFACE), never a callee body (INV).

import type { Freshness, Hash, SubtreeHash } from '@atlas/contracts';
import type { InterfaceRState } from '../ref/drift.js';

/**
 * One member of a fact's forward closure (a dependency-axis callee), as seen at a single snapshot.
 * A callee carries BOTH an interface and a body, but ONLY the interface enters the fold (GROUND-11b):
 *   - `node`             — the callee's CAS `Hash` (dependency-axis identity, INDEX-13).
 *   - `interfaceRState`  — the callee's INTERFACE/signature-level `rState` (INDEX-12). THE folded leg:
 *                          a signature/contract change flips it and DRIFTS every caller.
 *   - `bodySubtreeHash`  — the callee's FULL-BODY `subtreeHash`. Present for the record; it MUST NEVER
 *                          enter the fold — a behaviour-preserving body refactor changes this and MUST
 *                          leave callers FRESH (GROUND-11b/11d).
 */
export interface ClosureMember {
  readonly node: Hash;
  readonly interfaceRState: InterfaceRState;
  readonly bodySubtreeHash: SubtreeHash;
}

/**
 * The structural snapshot the freshness fold reads, at a single point in time:
 *   - `ownSubtreeHashes` — the fact's OWN grounding-set anchors' `subtreeHash`es (GROUND-11a), canonical
 *                          order (a `Grounding` is sorted by anchor).
 *   - `closure`          — the fact's forward closure (GROUND-11b), interface-level only.
 */
export interface FreshnessSnapshot {
  readonly ownSubtreeHashes: readonly SubtreeHash[];
  readonly closure: readonly ClosureMember[];
}

/** Ordered equality over the fact's own grounding-set subtreeHashes (GROUND-11a). */
function ownUnchanged(pinned: readonly SubtreeHash[], current: readonly SubtreeHash[]): boolean {
  return pinned.length === current.length && pinned.every((h, i) => h === current[i]);
}

/**
 * Interface-level equality over the forward closure (GROUND-11b): the SAME membership AND every member's
 * `interfaceRState` unchanged. The `bodySubtreeHash` is DELIBERATELY not read — a body-only refactor
 * MUST NOT drift a caller. Membership is keyed by the callee `node` `Hash`; a dependency appearing or
 * vanishing is itself structural drift.
 */
function closureInterfaceUnchanged(
  pinned: readonly ClosureMember[],
  current: readonly ClosureMember[],
): boolean {
  if (pinned.length !== current.length) return false;
  const now = new Map<Hash, InterfaceRState>(current.map((m) => [m.node, m.interfaceRState]));
  for (const member of pinned) {
    const currentIface = now.get(member.node);
    // interface-only fold: `bodySubtreeHash` is never consulted (GROUND-11b/11d).
    if (currentIface === undefined || currentIface !== member.interfaceRState) return false;
  }
  return true;
}

/**
 * The GROUND-11 transitive freshness fold. `FRESH` iff BOTH the fact's own grounding-set `subtreeHash`
 * AND its forward-closure's INTERFACE `rState` are structurally unchanged from `pinned` to `current`;
 * otherwise `DRIFTED`. The callee's full body is NEVER folded (11b). Pure + total: no clock, no IO, no
 * global state, no hashing, no throw. The verdict is a STRUCTURAL predicate — it does NOT, and cannot,
 * assert the claim is true (11e; FRESH ≠ true).
 */
export function freshness(pinned: FreshnessSnapshot, current: FreshnessSnapshot): Freshness {
  const structurallyUnchanged =
    ownUnchanged(pinned.ownSubtreeHashes, current.ownSubtreeHashes) &&
    closureInterfaceUnchanged(pinned.closure, current.closure);
  return structurallyUnchanged ? 'FRESH' : 'DRIFTED';
}

/**
 * Render a freshness verdict as a STRUCTURAL statement (GROUND-11e/11f). `FRESH` reads as "the cited unit
 * and its dependencies' interfaces are structurally unchanged" — it MUST NEVER read as "the claim is
 * true." `DRIFTED`/`STALE` are likewise phrased structurally, never as a truth guarantee.
 */
export function describeFreshness(verdict: Freshness): string {
  switch (verdict) {
    case 'FRESH':
      return "the cited unit and its dependencies' interfaces are structurally unchanged";
    case 'DRIFTED':
      return "the cited unit or a dependency's interface changed structurally";
    case 'STALE':
      return 'an advisory fact’s grounding drifted structurally — served with flag, non-blocking';
  }
}
