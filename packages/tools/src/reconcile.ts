// @atlas/tools — src/reconcile.ts   (WP-4.12-a.TOOLS — TOOLS-8, spec A-3/A-4)
//
// `atlas-reconcile`'s drift-classification + exit-code surface — the merge gate's REVIEWABLE face. At
// merge-time it takes the DRIFTED subset, partitions it via the @atlas-knowledge KNOW-5 mechanical/semantic
// split (CONSUMED as an injected port, NEVER redefined here — owned by WP-4.12-a.KNOW), and PRESENTS the
// result as a reviewable `DriftItem[]` set — never one all-or-nothing verdict. The exit-gate is
// deterministic and OWNED here (TOOLS): `exitCode == 2` ONLY when `|semantic| > 0` (block; never a silent
// green there), `0` when drift is entirely `mechanical`, and `reauthorCount == |semantic|` (never the whole
// store, A-4). Read-only classification: it persists NOTHING. Transcribed against the frozen oracle
// `../ref/reconcile.ts` (`ReconcileApi.reconcile`) + `../ref/types.ts` (`ReconcileOut` / `DriftItem`);
// goldens SCN-TOOLS-8{a,b,c,d}-1.
//
// SCOPE (this facet): the DriftItem[] surface + the exit-code/re-author gate only. EXCLUDED by the card —
// DEFINING the mechanical/semantic split (owned by WP-4.12-a.KNOW), the `--accept-reground` auto-re-ground
// WRITER (TOOLS-13, EPIC-12-b / WP-4.12-b.TOOLS), and advisory→STALE resolution (WP-4.12-a.GROUND). Since
// the auto-writer is out of facet, `regroundedCount` stays `0` here — nothing is re-grounded at this seam.

import type { Hash, StructRef } from '@atlas/contracts';
import type { DriftedFact, GroundedFact, ReconcileApi as Know5Classifier } from '@atlas/knowledge';
import type { ReconcileApi, ReconcileOptions } from '../ref/reconcile.js';
import type { DriftItem, ReconcileOut } from '../ref/types.js';

/**
 * One drifted fact paired with its old + new grounding anchors (the GROUND drift-detection surface, an
 * injected seam / build-ahead). `drifted` ({fact, newSha}) is fed to the KNOW-5 classifier verbatim;
 * `anchorWas`/`anchorNow` are the moved `StructRef` anchors composed into the reviewable `DriftItem`.
 * Anchor RESOLUTION is owned by GROUND — this facet only presents what it is handed.
 */
export interface DriftPair {
  readonly drifted: DriftedFact;
  readonly anchorWas: StructRef;
  readonly anchorNow: StructRef;
}

/** The DRIFT-detection seam (GROUND): the drifted set at a merge base, each with its old/new anchor. */
export interface DriftSource {
  driftAt(mergeBase: Hash): readonly DriftPair[];
}

/** A fact's reviewable name — its create/update identity leg (`NodeKey`), surfaced as a bare string. */
const factName = (f: GroundedFact): string => f.id;

/**
 * Build `atlas-reconcile` over an injected DRIFT-detection seam + the KNOW-5 classifier port. The returned
 * `reconcile` conforms EXACTLY to the frozen `ReconcileApi.reconcile(mergeBase, options?)` signature. Pure
 * + total: no clock, no IO, no throw, and no write — a read-only classification.
 */
export function createReconcile(
  drift: DriftSource,
  classifier: Know5Classifier,
): { readonly reconcile: ReconcileApi['reconcile'] } {
  const reconcile = (mergeBase: Hash, options?: ReconcileOptions): ReconcileOut => {
    const pairs = drift.driftAt(mergeBase);

    // KNOW-5 split — CONSUMED, never redefined (owned by WP-4.12-a.KNOW). The classifier decides
    // `mechanical` (claim re-derives at the new @sha) vs `semantic` (BROKEN); this facet only presents it.
    const split = classifier.reconcile(pairs.map((p) => p.drifted));
    const semanticIds = new Set(split.semantic.map(factName));

    // The reviewable set — input order preserved, one `DriftItem` per drifted fact, NEVER all-or-nothing.
    const driftItems: DriftItem[] = pairs.map((p) => {
      const name = factName(p.drifted.fact);
      return {
        fact: name,
        class: semanticIds.has(name) ? 'semantic' : 'mechanical',
        anchorWas: p.anchorWas,
        anchorNow: p.anchorNow,
      };
    });

    const semantic = split.semantic.map(factName);
    const mechanical = split.mechanical.map(factName);

    // Exit-code / re-author surface OWNED here (TOOLS-8): derived from the classified `semantic` subset.
    // exit 2 ONLY on semantic (never a silent green); re-author == |semantic| (never the whole store, A-4).
    const reauthorCount = semantic.length;
    const exitCode = semantic.length > 0 ? 2 : 0;

    // TOOLS-13 auto-re-ground WRITE is EXCLUDED (EPIC-12-b, WP-4.12-b.TOOLS): even under `acceptReground`
    // nothing is re-grounded at this seam — the flag's writer is a downstream facet.
    void options;
    const regroundedCount = 0;

    return { drift: driftItems, mechanical, semantic, regroundedCount, reauthorCount, exitCode };
  };
  return { reconcile };
}

// differential-vs-oracle (compile-time): the impl's `reconcile` conforms to the frozen
// `ReconcileApi.reconcile` signature (../ref/reconcile.ts). TOOLS-13's auto-re-ground is a DISTINCT,
// out-of-facet req — not asserted here.
const _reconcileConforms: ReconcileApi['reconcile'] = createReconcile(
  { driftAt: () => [] },
  { reconcile: () => ({ mechanical: [], semantic: [], reauthorCount: 0, exitCode: 0 }) },
).reconcile;
void _reconcileConforms;
