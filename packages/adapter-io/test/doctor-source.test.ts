// @atlas/adapter-io — test/doctor-source.test.ts  (DOCTORSOURCE — the real read-only DoctorSource port)
//
// The teeth for the REAL `DoctorSource`: a temp git repo whose one grounded fact is seeded at a v1 anchor,
// then the anchored file is CHANGED + committed (v2 = HEAD) so the recorded anchor MOVES. Over that repo:
//   - `hotSetSize()` reflects the current-node count of the durable projection.
//   - `lineage()` returns the CAS chain (scope-filtered).
//   - `drift()` returns a `DriftItem` for the moved fact / `undefined` for the stable one / `undefined` for
//     an unknown fact (totality).
//   - `plan()` returns a well-formed `GroundedFact` (retire on the semantic drift; the reground template is
//     exercised directly for a well-formed re-grounded fact).
// TEETH: a mutant making `drift` always-undefined flips the drifted golden RED; a mutant making
// `hotSetSize` return 0 flips the count golden RED. ⚠ ALL temp paths under `os.tmpdir()` (CI-portable).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StructRef } from '@atlas/contracts';
import { build } from '@atlas/index';
import type { IndexNode } from '@atlas/index';
import { asNodeKey } from '@atlas/kernel';
import type { GroundedFact, StoreProjection } from '@atlas/knowledge';
import { walkFileTree } from '../src/fs.js';
import { createDiskStore } from '../src/store.js';
import type { DiskStore } from '../src/store.js';
import { createRevIndex } from '../src/rev-index.js';
import { createDoctorSource, regroundTemplate } from '../src/doctor-source.js';

const UTIL_V1 = 'export function greet(name: string): string {\n  return `hi ${name}`;\n}\n';
const UTIL_V2 = 'export function greet(name: string): string {\n  return `HELLO ${name}!!`;\n}\n';

/** Find the built index node whose key ends with `suffix` — robust to whatever key format `build` uses. */
function findBySuffix(node: IndexNode, suffix: string): IndexNode | undefined {
  if (node.key.endsWith(suffix)) return node;
  for (const c of node.children) {
    const hit = findBySuffix(c, suffix);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/** A grounded advisory fact anchored at `anchor`, scoped to `scope`. */
function seedFact(id: string, anchor: StructRef, scope: string): GroundedFact {
  return {
    kind: 'advisory',
    id: asNodeKey(id),
    tier: 'T2',
    claimNorm: `a grounded claim (${id})`,
    grounding: { entries: [{ anchor, path: 'src/util.ts' }] },
    freshness: 'FRESH',
    claims: [],
    authoring: 'ADVISORY',
    scope,
  };
}

let repo: string;
let store: DiskStore;
let source: ReturnType<typeof createDoctorSource>;
let anchorV1: StructRef;
let anchorV2: StructRef;
let driftFactV1: GroundedFact;
let chDrift: string;
let chStable: string;

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'atlas-doctor-src-'));
  const git = (...args: string[]): void => void execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src', 'util.ts'), UTIL_V1);
  git('init', '-q');
  git('config', 'user.email', 'doctor@atlas.test');
  git('config', 'user.name', 'atlas-doctor');
  git('config', 'commit.gpgsign', 'false');
  git('add', '-A');
  git('commit', '-q', '-m', 'v1');

  // v1 anchor — the RECORDED grounding anchor, read from the v1 working tree (== committed v1).
  const nodeV1 = findBySuffix(build(walkFileTree(repo), { documents: [] }).spatial, 'util.ts')!;
  anchorV1 = { kind: 'file', qualifiedPath: nodeV1.key, subtreeHash: nodeV1.subtreeHash };
  store = createDiskStore(join(repo, '.atlas', 'cas'));
  driftFactV1 = seedFact('fact-drift', anchorV1, 'core');
  chDrift = store.put(driftFactV1);

  // Move the anchor: change the file body + commit v2 (= HEAD).
  writeFileSync(join(repo, 'src', 'util.ts'), UTIL_V2);
  git('add', '-A');
  git('commit', '-q', '-m', 'v2');

  // The DoctorSource's revIndex is created AFTER v2 so its memoized HEAD resolves to v2 (a process pins HEAD
  // once). The stable fact is anchored at the v2 HEAD anchor, so it does NOT drift.
  const revIndex = createRevIndex(repo);
  anchorV2 = revIndex.resolveAnchorAt('HEAD', anchorV1.qualifiedPath)!;
  const stableFact = seedFact('fact-stable', anchorV2, 'core');
  chStable = store.put(stableFact);

  const projection: StoreProjection = {
    current: new Map([
      ['fact-drift', { nodeKey: 'fact-drift', family: 'advisory', contentHash: chDrift, claims: [] }],
      ['fact-stable', { nodeKey: 'fact-stable', family: 'advisory', contentHash: chStable, claims: [] }],
    ]),
    cas: new Set([chDrift, chStable]),
  };
  store.persistProjection(projection);
  source = createDoctorSource(store, revIndex);
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe('DOCTORSOURCE — the real read-only DoctorSource port', () => {
  it('hotSetSize() reflects the durable current-node count (TEETH: a 0-returning mutant flips this RED)', () => {
    expect(source.hotSetSize()).toBe(2);
  });

  it('lineage() returns the CAS chain, scope-filtered', () => {
    const all = source.lineage();
    expect([...all].sort()).toEqual([chDrift, chStable].sort());
    expect([...source.lineage('core')].sort()).toEqual([chDrift, chStable].sort()); // both in scope core
    expect(source.lineage('nonexistent-scope')).toEqual([]); // no node in that scope
  });

  it('drift(fact) returns a DriftItem when the recorded anchor MOVED (TEETH: an always-undefined mutant flips this RED)', () => {
    const item = source.drift('fact-drift');
    expect(item).toBeDefined();
    expect(item!.fact).toBe('fact-drift');
    expect(item!.anchorWas.subtreeHash).toBe(anchorV1.subtreeHash); // the RECORDED (v1) anchor
    expect(item!.anchorNow.subtreeHash).toBe(anchorV2.subtreeHash); // the HEAD (v2) anchor
    expect(item!.anchorNow.subtreeHash).not.toBe(item!.anchorWas.subtreeHash); // it really moved
    expect(item!.class).toBe('semantic'); // the primary claim no longer re-derives at HEAD
  });

  it('drift(fact) is undefined when the anchor is stable, and for an unknown fact (totality)', () => {
    expect(source.drift('fact-stable')).toBeUndefined();
    expect(source.drift('no-such-fact')).toBeUndefined();
    expect(() => source.drift('no-such-fact')).not.toThrow();
  });

  it('plan(fact) returns a well-formed GroundedFact — retire on the semantic drift', () => {
    const p = source.plan('fact-drift');
    expect(p).toBeDefined();
    expect(p!.action).toBe('retire');
    expect(p!.emit.kind).toBe('advisory'); // a real, well-formed GroundedFact
    expect(p!.emit.grounding.entries.length).toBeGreaterThan(0);
    expect(p!.emit.authoring).toBe('SUPERSEDED'); // tagged for retire
    expect(source.plan('fact-stable')).toBeUndefined(); // no drift ⇒ no plan
    expect(source.plan('no-such-fact')).toBeUndefined();
  });

  it('regroundTemplate produces a well-formed re-grounded fact (primary anchor swapped to anchorNow)', () => {
    const emit = regroundTemplate(driftFactV1, anchorV2);
    expect(emit.kind).toBe('advisory');
    expect(emit.grounding.entries[0]!.anchor.subtreeHash).toBe(anchorV2.subtreeHash); // re-grounded at HEAD
    expect(emit.freshness).toBe('FRESH');
    expect(emit.grounding.entries[0]!.anchor.subtreeHash).not.toBe(anchorV1.subtreeHash);
  });
});
