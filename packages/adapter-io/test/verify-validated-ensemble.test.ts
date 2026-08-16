// @atlas/adapter-io — test/verify-validated-ensemble.test.ts  (ADR-0017 #196b Wave 2 — the VALIDATED fold)
//
// The PURE fold + the map→port adapter (AC-F1..F7), and one INTEGRATION proof (AC-F8) that the port threads
// through the REAL production admission composition (`buildMineAdmission`) into `admit` and mints seal
// 'validated' — then, with the SAME proposal's votes flipped to include a HALLUCINATED, ABSTAINS (no fact).
// This test drives only adapter-io + genesis + index/kernel/contracts (no cli), so it is legal here.

import { describe, it, expect } from 'vitest';
import { asNodeKey, asSubtreeHash } from '@atlas/kernel';
import type { StructRef } from '@atlas/contracts';
import type { Axes, IndexNode, ScipOutput } from '@atlas/index';
import type { PredicateProposal } from '@atlas/genesis';
import { admit } from '@atlas/genesis';
import {
  foldEnsembleVotes,
  makeEnsemblePort,
  CONSERVATIVE_POLICY,
  buildMineAdmission,
} from '@atlas/adapter-io';
import type { RaterVerdict, EnsemblePolicy } from '@atlas/adapter-io';

describe('foldEnsembleVotes — the ~0-FP conservative default', () => {
  it('AC-F1: 3× GROUNDED_TRUE ⇒ validated', () => {
    const votes: RaterVerdict[] = ['GROUNDED_TRUE', 'GROUNDED_TRUE', 'GROUNDED_TRUE'];
    expect(foldEnsembleVotes(votes)).toBe('validated');
  });

  it('AC-F2: a single HALLUCINATED vetoes even a true majority ⇒ abstain', () => {
    const votes: RaterVerdict[] = ['GROUNDED_TRUE', 'GROUNDED_TRUE', 'HALLUCINATED'];
    expect(foldEnsembleVotes(votes)).toBe('abstain');
  });

  it('AC-F3: an ABSTAIN breaks the unanimous default ⇒ abstain', () => {
    const votes: RaterVerdict[] = ['GROUNDED_TRUE', 'GROUNDED_TRUE', 'ABSTAIN'];
    expect(foldEnsembleVotes(votes)).toBe('abstain');
  });

  it('AC-F4: below minRaters (2 < 3) ⇒ abstain', () => {
    const votes: RaterVerdict[] = ['GROUNDED_TRUE', 'GROUNDED_TRUE'];
    expect(foldEnsembleVotes(votes)).toBe('abstain');
  });

  it('AC-F5: empty input ⇒ abstain', () => {
    expect(foldEnsembleVotes([])).toBe('abstain');
  });

  it('AC-F6: policy is real — a RELAXED policy validates 2/3 the default abstains on', () => {
    const votes: RaterVerdict[] = ['GROUNDED_TRUE', 'GROUNDED_TRUE', 'ABSTAIN'];
    const relaxed: EnsemblePolicy = { minRaters: 3, minTrueFraction: 0.66, maxHallucinated: 0 };
    // 2 GROUNDED_TRUE ≥ ceil(0.66 * 3) = 2 ⇒ validated
    expect(foldEnsembleVotes(votes, relaxed)).toBe('validated');
    // the SAME votes under the strictly stronger default ⇒ abstain
    expect(foldEnsembleVotes(votes, CONSERVATIVE_POLICY)).toBe('abstain');
  });
});

describe('makeEnsemblePort — map lookup + fold, fail-closed on absent evidence', () => {
  const proposalWithKey = (key: string): PredicateProposal =>
    ({ nodeKey: asNodeKey(key) } as PredicateProposal);

  it('AC-F7: nodeKey → 3×GROUNDED_TRUE yields validated; an ABSENT nodeKey fails closed to abstain', () => {
    const map = new Map<string, readonly RaterVerdict[]>([
      ['nk:present', ['GROUNDED_TRUE', 'GROUNDED_TRUE', 'GROUNDED_TRUE']],
    ]);
    const port = makeEnsemblePort(map);
    expect(port(proposalWithKey('nk:present'))).toBe('validated');
    expect(port(proposalWithKey('nk:absent'))).toBe('abstain'); // fail-closed
  });
});

// ── AC-F8 INTEGRATION — mirror compose-validated-reachability.test.ts's FRESH-grounding fixture. ────────────
const QP = 'src/pay.ts#charge';
const ST = asSubtreeHash('st-a10'); // ≠ its own key, so `findByKey` treats it as a real content hash
const anchor: StructRef = { kind: 'block', qualifiedPath: QP, subtreeHash: ST };
const unit: IndexNode = { axis: 'spatial', level: 'block', key: QP, subtreeHash: ST, children: [], objects: [] };
const spatial: IndexNode = { axis: 'spatial', level: 'repo', key: '.', subtreeHash: asSubtreeHash('root'), children: [unit], objects: [] };
const territory: IndexNode = { axis: 'territory', level: 'repo', key: '.', subtreeHash: asSubtreeHash('terr'), children: [], objects: [] };
const axes: Axes = { spatial, territory, dependency: spatial, edges: [] };
const scip: ScipOutput = { documents: [{ relativePath: 'src/pay.ts', occurrences: [] }] };

const NK = 'nk:inv-charge-nonneg';
const semanticProposal = (): PredicateProposal => ({
  kind: 'predicate',
  site: { site: anchor, rank: 1, ppr: 0.42, signals: { hotspot: 3, szzBugCommits: 2, coChanged: [], owners: [], messages: [] } },
  slot: 'invariant', // a SEMANTIC slot — sound arms fall through, synthesize yields no check ⇒ admitValidated
  nodeKey: asNodeKey(NK),
  claimNorm: 'charge() never posts a negative amount to the ledger',
  grounding: { entries: [{ anchor, path: 'src/pay.ts' }] } as PredicateProposal['grounding'],
  tier: 'T1',
});

describe('ADR-0017 #196b AC-F8 — the ensemble port threads through REAL buildMineAdmission composition', () => {
  it('3×GROUNDED_TRUE on the proposal nodeKey ⇒ admitted with seal validated', () => {
    const map = new Map<string, readonly RaterVerdict[]>([
      [NK, ['GROUNDED_TRUE', 'GROUNDED_TRUE', 'GROUNDED_TRUE']],
    ]);
    const { deps } = buildMineAdmission(axes, scip, makeEnsemblePort(map));
    const a = admit(semanticProposal(), deps);
    expect(a.outcome).toBe('admitted');
    if (a.outcome !== 'admitted') throw new Error('unreachable — the wired ensemble leg did not admit');
    expect(a.fact.seal).toBe('validated');
  });

  it('the SAME proposal with a HALLUCINATED vote ⇒ abstains (no fact)', () => {
    const map = new Map<string, readonly RaterVerdict[]>([
      [NK, ['GROUNDED_TRUE', 'GROUNDED_TRUE', 'HALLUCINATED']],
    ]);
    const { deps } = buildMineAdmission(axes, scip, makeEnsemblePort(map));
    const a = admit(semanticProposal(), deps);
    expect(a.outcome).not.toBe('admitted');
  });
});
