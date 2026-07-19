// WP-4.10-a.KNOW · RED/GREEN — the knowledge drift-verdict binding (KNOW-3) against the FROZEN grounding
// drift-oracle seam. Transcribes the visible `-1` goldens SCN-KNOW-3a-1 / 3b-1 / 3c-1
// (docs/requirements/goldens-knw.md). Held-out `-2` fixtures are NOT referenced here.
//
// BUILD-AHEAD: `@atlas/grounding` ships zero runtime, so the oracle is supplied as a FIXTURE `DriftApi`
// that simulates GROUND's `grounding/ref/subtree.ts` (`subtreeHash(normalize(unit)) ==
// fact.grounding.subtreeHash ? FRESH : DRIFTED`). The test verifies the KNOWLEDGE-LAYER BINDING —
// that `bindFreshness` consumes the oracle verdict and narrows it to the 2-state KnowledgeFreshness —
// NOT the oracle's hashing (owned by GROUND). No raw hashing, no line numbers.

import { describe, it, expect } from 'vitest';
import { asSubtreeHash, asNodeKey } from '@atlas/kernel';
import type { Freshness as GroundingFreshness, StructRef } from '@atlas/contracts';
import type { Axes, IndexNode } from '@atlas/index';
import type { DriftApi, Grounding } from '@atlas/grounding';
import type { GroundedFact } from '@atlas/knowledge';
import { bindFreshness } from '../src/lifecycle/freshness.js';

// ── fixtures ────────────────────────────────────────────────────────────────

const emptyRoot = (axis: IndexNode['axis']): IndexNode => ({
  axis,
  level: 'repo',
  key: `${axis}:root`,
  subtreeHash: asSubtreeHash(`root-${axis}`),
  children: [],
  objects: [],
});

/** A built-index snapshot whose spatial rail carries each unit's CURRENT subtreeHash keyed by its
 *  qualifiedPath — the drift source-of-truth the oracle re-checks against. */
const mkTree = (current: Record<string, string>): Axes => ({
  spatial: {
    axis: 'spatial',
    level: 'repo',
    key: 'spatial:root',
    subtreeHash: asSubtreeHash('root-spatial'),
    objects: [],
    children: Object.entries(current).map(([key, h]): IndexNode => ({
      axis: 'spatial',
      level: 'item',
      key,
      subtreeHash: asSubtreeHash(h),
      children: [],
      objects: [],
    })),
  },
  territory: emptyRoot('territory'),
  dependency: emptyRoot('dependency'),
  edges: [],
});

/** A fixture oracle standing in for GROUND (`grounding/ref/subtree.ts`): FRESH iff EVERY anchor's
 *  `subtreeHash` equals the unit's CURRENT `subtreeHash` in `src` — an unresolvable anchor is DRIFTED
 *  (fail-closed, GROUND-3). Keys on `subtreeHash` alone: never a line number, never `displayLines`. */
const subtreeOracle: DriftApi = {
  driftDetect(grounding: Grounding, src: Axes): GroundingFreshness {
    const current = new Map(src.spatial.children.map((n) => [n.key, String(n.subtreeHash)]));
    const allMatch = grounding.entries.every((e) => {
      const cur = current.get(e.anchor.qualifiedPath);
      return cur !== undefined && cur === String(e.anchor.subtreeHash);
    });
    return allMatch ? 'FRESH' : 'DRIFTED';
  },
};

const anchor = (qualifiedPath: string, subtreeHash: string): StructRef => ({
  kind: 'symbol',
  qualifiedPath,
  subtreeHash: asSubtreeHash(subtreeHash),
});

/** An advisory fact grounded at one anchor. `claims`/`freshness` legs are irrelevant to the binding —
 *  the served verdict is RECOMPUTED from the oracle, never read off the stored `freshness`. */
const factAt = (qualifiedPath: string, subtreeHash: string, displayLines?: string): GroundedFact => {
  const entry = displayLines === undefined
    ? { anchor: anchor(qualifiedPath, subtreeHash), path: 'src/queue.ts' }
    : { anchor: anchor(qualifiedPath, subtreeHash), path: 'src/queue.ts', displayLines };
  return {
    kind: 'advisory',
    id: asNodeKey('nk-hdr'),
    tier: 'T2',
    claimNorm: 'cn-parseheader',
    grounding: { entries: [entry] } satisfies Grounding,
    freshness: 'FRESH',
    claims: [],
    authoring: 'ADVISORY',
  };
};

// ── the binding under test ───────────────────────────────────────────────────

const freshness = bindFreshness(subtreeOracle);

describe('WP-4.10-a.KNOW — knowledge drift verdict binds to the grounding subtreeHash oracle', () => {
  it('SCN-KNOW-3a-1 — freshness is a function of the subtreeHash alone (FRESH on match)', () => {
    // fact grounded at st-77; the cited unit re-hashes to st-77 after normalize.
    const fact = factAt('fn parseHeader', 'st-77');
    const tree = mkTree({ 'fn parseHeader': 'st-77' });
    expect(freshness(fact, tree)).toBe('FRESH');
  });

  it('SCN-KNOW-3a-1 — no line number enters the computation (displayLines is inert)', () => {
    // same fact + tree, but with a nav-only displayLines hint — the verdict MUST be identical.
    const tree = mkTree({ 'fn parseHeader': 'st-77' });
    const withLines = factAt('fn parseHeader', 'st-77', '42-50');
    const withoutLines = factAt('fn parseHeader', 'st-77');
    expect(freshness(withLines, tree)).toBe('FRESH');
    expect(freshness(withLines, tree)).toBe(freshness(withoutLines, tree));
  });

  it('SCN-KNOW-3b-1 — reformat / rename / import-above stays FRESH (normalize byte-unchanged)', () => {
    // cosmetic edit leaves normalize(unit) byte-unchanged, so subtreeHash is still st-77 → FRESH.
    const fact = factAt('fn parseHeader', 'st-77');
    const cosmeticTree = mkTree({ 'fn parseHeader': 'st-77' });
    expect(freshness(fact, cosmeticTree)).toBe('FRESH');
  });

  it('SCN-KNOW-3c-1 — a real change to the cited unit DRIFTs (subtreeHash st-77 → st-C9)', () => {
    // the unit's body semantically changed so its subtreeHash moved → the fact is DRIFTED.
    const fact = factAt('fn parseHeader', 'st-77');
    const changedTree = mkTree({ 'fn parseHeader': 'st-C9' });
    expect(freshness(fact, changedTree)).toBe('DRIFTED');
  });

  it('a knowledge fact is 2-state — never surfaces the grounding STALE (fail-closed to DRIFTED)', () => {
    // an oracle returning the 3rd (advisory) state must narrow to DRIFTED at the 2-state knowledge leg.
    const staleOracle: DriftApi = { driftDetect: (): GroundingFreshness => 'STALE' };
    const staleFreshness = bindFreshness(staleOracle);
    const fact = factAt('fn parseHeader', 'st-77');
    expect(staleFreshness(fact, mkTree({ 'fn parseHeader': 'st-77' }))).toBe('DRIFTED');
  });
});
