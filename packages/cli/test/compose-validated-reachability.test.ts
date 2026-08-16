// @atlas/cli — test/compose-validated-reachability.test.ts  (ADR-0017 #196b — AC-V9)
//
// THE REACHABILITY PROOF the DoD asks for: not "admitValidated compiles" but "the injected VALIDATED
// ensemble leg threads through the REAL production composition (`buildMineAdmission`) into `AdmitDeps`,
// a grounded semantic PredicateProposal admits sealed `validated`, and that seal SURVIVES the durable
// staging write". Two legs, each the REAL production path:
//
//   1. WIRING   — `buildMineAdmission(axes, scip, verifyValidated)` (the SAME composition `atlas mine`
//                 builds its admission over) forwards the injected ensemble leg onto `AdmitDeps`, and the
//                 FROZEN `admit` reaches `admitValidated` over the REAL GROUND-4 truth door
//                 (`driftDetect === 'FRESH'`) — no reference-model deps hand-built.
//   2. DURABILITY — the admitted fact through `decideStaging` (the pure mine pass) → the seal rides the
//                 CAS bytes the commit protocol makes durable (`put`), and a real on-disk `commitStaging`
//                 round-trip reads it back from CAS by content hash with the seal intact.
//
// WHY IT LIVES IN THE CLI PACKAGE (not adapter-io, where the brief filed it): `decideStaging` is a
// `@atlas/cli` export and adapter-io MUST NOT depend on cli (cli → adapter-io is the only legal direction).
// A reachability test that drives BOTH `buildMineAdmission` (adapter-io) and `decideStaging` (cli) can only
// sit in cli, which depends on adapter-io. Reaching into `../../cli/src` from an adapter-io test breaks the
// composite build (TS5055 — a cross-package deep relative import). This is the WP-96-R e2e's home too.
//
// DEFERRED LEG, stated honestly: there is NO production READ leg that SURFACES `seal` yet — that is Wave 2
// (the read-side projection of the two-seal provenance). So durability is proven at the CAS layer (the fact
// bytes the staging protocol persists), which IS where the seal lives; a "seal rendered by a query verb"
// round-trip cannot be exercised until the read leg exists, and this test does NOT fake one.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asNodeKey, asSubtreeHash, id } from '@atlas/kernel';
import type { StructRef } from '@atlas/contracts';
import type { Axes, IndexNode, ScipOutput } from '@atlas/index';
import { emptyStore } from '@atlas/knowledge';
import type { Fact, PredicateProposal } from '@atlas/genesis';
import { admit } from '@atlas/genesis';
import { buildMineAdmission, createDiskStore } from '@atlas/adapter-io';
import { decideStaging } from '../src/mine-decide.js';

// ── a FRESH-grounding fixture: the grounding anchor's subtreeHash RESOLVES to the same unit in `axes`
//    (driftDetect ⇒ FRESH), so `buildMineAdmission`'s REAL GROUND-4 truth door passes. ────────────────────
const QP = 'src/pay.ts#charge';
const ST = asSubtreeHash('st-a10'); // ≠ its own key, so `findByKey` treats it as a real content hash

const anchor: StructRef = { kind: 'block', qualifiedPath: QP, subtreeHash: ST };
// the spatial rail carries a unit keyed `QP` whose CURRENT subtreeHash == the recorded `ST` ⇒ FRESH.
const unit: IndexNode = { axis: 'spatial', level: 'block', key: QP, subtreeHash: ST, children: [], objects: [] };
const spatial: IndexNode = { axis: 'spatial', level: 'repo', key: '.', subtreeHash: asSubtreeHash('root'), children: [unit], objects: [] };
const territory: IndexNode = { axis: 'territory', level: 'repo', key: '.', subtreeHash: asSubtreeHash('terr'), children: [], objects: [] };
const axes: Axes = { spatial, territory, dependency: spatial, edges: [] };
const scip: ScipOutput = { documents: [{ relativePath: 'src/pay.ts', occurrences: [] }] };

const validatedProposal = (): PredicateProposal => ({
  kind: 'predicate',
  site: { site: anchor, rank: 1, ppr: 0.42, signals: { hotspot: 3, szzBugCommits: 2, coChanged: [], owners: [], messages: [] } },
  slot: 'invariant', // a SEMANTIC slot — sound arms fall through, synthesize yields no check ⇒ admitValidated
  nodeKey: asNodeKey('nk:inv-charge-nonneg'),
  claimNorm: 'charge() never posts a negative amount to the ledger',
  grounding: { entries: [{ anchor, path: 'src/pay.ts' }] } as PredicateProposal['grounding'],
  tier: 'T1',
});

let tmp: string | undefined;
afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = undefined;
});

describe('ADR-0017 #196b AC-V9 — the VALIDATED leg is reachable through REAL production composition', () => {
  it('admit-through-buildMineAdmission yields a validated fact, and the seal survives the durable staging write', () => {
    // LEG 1 — WIRING: the port threads through the production admission composition, not a hand-built deps.
    const { deps } = buildMineAdmission(axes, scip, () => 'validated');
    expect(deps.verifyValidated).toBeDefined(); // forwarded onto AdmitDeps

    const a = admit(validatedProposal(), deps);
    expect(a.outcome).toBe('admitted');
    if (a.outcome !== 'admitted') throw new Error('unreachable — the wired validated leg did not admit');
    expect(a.fact.seal).toBe('validated');
    expect(a.label).toBeUndefined();

    // LEG 2a — DURABILITY (pure decision): the seal rides the CAS bytes `commitStaging` persists (`put`).
    const dec = decideStaging(emptyStore(), [a.fact as Fact], new Map());
    const putFacts = (dec.put ?? []) as Array<{ seal?: string }>;
    expect(putFacts.some((o) => o.seal === 'validated')).toBe(true);

    // LEG 2b — DURABILITY (real on-disk round-trip): commit through the actual staging door, then read the
    // fact back OUT OF CAS by its content hash and assert the seal survived the disk write→read cycle.
    tmp = mkdtempSync(join(tmpdir(), 'atlas-validated-reach-'));
    const store = createDiskStore(join(tmp, 'cas'));
    const res = store.commitStaging((p) => decideStaging(p, [a.fact as Fact], new Map()));
    expect(res.settled).toBe(true);
    if (!res.settled) throw new Error('unreachable — staging did not settle');

    const minted = [...res.out.values()][0]; // the MintedFact === the CAS-durable fact bytes
    expect(minted).toBeDefined();
    const back = store.get(id(minted)) as { seal?: string } | undefined;
    expect(back).toBeDefined();
    expect(back!.seal).toBe('validated'); // the seal survived CAS persist → fresh read-back
  });
});
