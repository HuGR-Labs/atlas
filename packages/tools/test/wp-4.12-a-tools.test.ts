// @atlas/tools — test/wp-4.12-a-tools.test.ts   (WP-4.12-a.TOOLS)
//
// RED→GREEN transcription of the VISIBLE goldens for `atlas-reconcile`'s drift-classification +
// exit-code surface (TOOLS-8, spec A-3/A-4):
//   - SCN-TOOLS-8a-1 (happy) — the DRIFTED subset splits into a REVIEWABLE `DriftItem[]`
//                              (`[dm:mechanical, ds:semantic]`), never one all-or-nothing verdict.
//   - SCN-TOOLS-8b-1 (guard) — a run carrying semantic drift exits `2`, never a silent green.
//   - SCN-TOOLS-8c-1 (happy) — a mechanical-only run exits `0` (no spurious block).
//   - SCN-TOOLS-8d-1 (happy) — reconcile re-authors `== |semantic|` (the 1 semantic item), never the
//                              whole store.
// The facet is imported DIRECTLY from ../src/reconcile.js (the barrel is wired by the lead at SEAL). The
// mechanical/semantic split is the @atlas/knowledge KNOW-5 classifier CONSUMED as an injected port +
// FIXTURE (build-ahead, dep WP-4.12-a.KNOW) — referenced, NEVER redefined here. The drifted set (with its
// old/new grounding anchors) is the GROUND drift-detection seam, also an injected FIXTURE. Held-out `-2`
// fixtures (SCN-TOOLS-8{a,b,c,d}-2) are NOT transcribed — the GATE runs those.

import { describe, it, expect } from 'vitest';
import { asHash, asNodeKey, asSubtreeHash } from '@atlas/kernel';
import type { DriftedFact, ReconcileApi as Know5Classifier } from '@atlas/knowledge';
import type { AdvisoryNode } from '@atlas/knowledge';
import { createReconcile } from '../src/reconcile.js';
import type { DriftPair, DriftSource } from '../src/reconcile.js';

const MERGE = asHash('merge-base');

/** A minimal grounded advisory fact whose grounding anchors to a structural block. `name` is the
 *  fact identity (`nk:<name>`) surfaced as the reviewable `DriftItem.fact`. */
function advisory(name: string, subtree: string): AdvisoryNode {
  const anchor = { kind: 'block' as const, qualifiedPath: `reference/${name}.md#${name}`, subtreeHash: asSubtreeHash(subtree) };
  return {
    kind: 'advisory',
    id: asNodeKey(`nk:${name}`),
    tier: 'T1',
    claimNorm: name,
    grounding: { entries: [{ anchor, path: `reference/${name}.md` }] },
    freshness: 'DRIFTED',
    claims: [],
    authoring: 'ADVISORY',
  };
}

/** A drifted fact paired with its old + new grounding anchors (the GROUND drift-detection surface the
 *  reconcile tool composes into a reviewable `DriftItem`). `oldSt`→`newSt` is the moved `subtreeHash`. */
function pair(name: string, oldSt: string, newSt: string): DriftPair {
  const drifted: DriftedFact = { fact: advisory(name, oldSt), newSha: asHash(`sha:${name}:new`) };
  const qp = `reference/${name}.md#${name}`;
  return {
    drifted,
    anchorWas: { kind: 'block', qualifiedPath: qp, subtreeHash: asSubtreeHash(oldSt) },
    anchorNow: { kind: 'block', qualifiedPath: qp, subtreeHash: asSubtreeHash(newSt) },
  };
}

/** A FIXTURE DRIFT source standing in for GROUND drift-detection (build-ahead): the drifted set at a
 *  merge base, each item carrying its old/new anchor. */
function driftSourceOf(pairs: readonly DriftPair[]): DriftSource {
  return { driftAt: () => pairs };
}

/**
 * A FIXTURE KNOW-5 classifier standing in for @atlas/knowledge `ReconcileApi.reconcile` (build-ahead):
 * partition the DRIFTED subset by `reDerives(claim, newSha)` — a fact whose id is in `reDerives` still
 * re-derives at its new `@sha` (`mechanical`), else its claim is BROKEN (`semantic`). This is the KNOW-5
 * split CONSUMED by the tool, never redefined here.
 */
function classifierWith(reDerives: ReadonlySet<string>): Know5Classifier {
  return {
    reconcile(drifted: readonly DriftedFact[]) {
      const mechanical = drifted.filter((d) => reDerives.has(d.fact.id)).map((d) => d.fact);
      const semantic = drifted.filter((d) => !reDerives.has(d.fact.id)).map((d) => d.fact);
      return { mechanical, semantic, reauthorCount: semantic.length, exitCode: semantic.length > 0 ? 2 : 0 };
    },
  };
}

describe('WP-4.12-a.TOOLS — atlas-reconcile classifies drift, exit 2 only on semantic (visible goldens)', () => {
  it('SCN-TOOLS-8a-1: DRIFTED splits into a reviewable DriftItem set, never all-or-nothing', () => {
    // D = {dm, ds}: dm = anchor moved but claim re-derives (mechanical); ds = claim no longer re-derives.
    const pairs = [pair('ceo', 'st-ceo-old', 'st-ceo-new'), pair('arr', 'st-arr-old', 'st-arr-new')];
    const out = createReconcile(driftSourceOf(pairs), classifierWith(new Set(['nk:ceo']))).reconcile(MERGE);

    // a REVIEWABLE set of BOTH items — never collapsed to a single all-or-nothing `DRIFTED` verdict.
    expect(out.drift.length).toBe(2);
    const byName = new Map(out.drift.map((d) => [d.fact, d.class]));
    expect(byName.get('nk:ceo')).toBe('mechanical');
    expect(byName.get('nk:arr')).toBe('semantic');
    // teeth (breaks-on "one all-or-nothing DRIFTED verdict — the split is collapsed"): BOTH classes present.
    expect(new Set(out.drift.map((d) => d.class))).toEqual(new Set(['mechanical', 'semantic']));

    // the reviewable item carries the moved anchor (was→now), so a human can see WHAT drifted.
    const dm = out.drift.find((d) => d.fact === 'nk:ceo')!;
    expect(dm.anchorWas.subtreeHash).toBe(asSubtreeHash('st-ceo-old'));
    expect(dm.anchorNow.subtreeHash).toBe(asSubtreeHash('st-ceo-new'));
  });

  it('SCN-TOOLS-8b-1: a run with semantic drift exits 2, never a silent green', () => {
    // D = {dm, ds} with |semantic| = 1.
    const pairs = [pair('ceo', 'st-ceo-old', 'st-ceo-new'), pair('arr', 'st-arr-old', 'st-arr-new')];
    const out = createReconcile(driftSourceOf(pairs), classifierWith(new Set(['nk:ceo']))).reconcile(MERGE);

    // teeth (breaks-on "a run with semantic drift exits 0 (silent green) — the semantic drift is masked").
    expect(out.exitCode).toBe(2);
    expect(out.semantic.length).toBe(1);
  });

  it('SCN-TOOLS-8c-1: a mechanical-only run exits 0 (no spurious block)', () => {
    // D′ = {dm} with |semantic| = 0 — drift entirely mechanical.
    const pairs = [pair('ceo', 'st-ceo-old', 'st-ceo-new')];
    const out = createReconcile(driftSourceOf(pairs), classifierWith(new Set(['nk:ceo']))).reconcile(MERGE);

    // teeth (breaks-on "a mechanical-only run exits 2 — a spurious merge block").
    expect(out.exitCode).toBe(0);
    expect(out.semantic.length).toBe(0);
    expect(out.mechanical).toContain('nk:ceo');
  });

  it('SCN-TOOLS-8d-1: reconcile re-authors exactly |semantic|, never the whole store', () => {
    // D = {dm, ds} with |semantic| = 1 (the item ds).
    const pairs = [pair('ceo', 'st-ceo-old', 'st-ceo-new'), pair('arr', 'st-arr-old', 'st-arr-new')];
    const out = createReconcile(driftSourceOf(pairs), classifierWith(new Set(['nk:ceo']))).reconcile(MERGE);

    // re-author bounded to the semantic subset — the 1 broken item, never the 2-row store.
    expect(out.reauthorCount).toBe(1);
    expect(out.semantic).toEqual(['nk:arr']);
    // teeth (breaks-on "re-authors the whole store (all N rows) instead of just the 1 semantic item").
    expect(out.reauthorCount).not.toBe(out.drift.length);
    // this facet performs NO auto-re-ground write (TOOLS-13 owned by WP-4.12-b.TOOLS): nothing re-grounded.
    expect(out.regroundedCount).toBe(0);
  });
});
