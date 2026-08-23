// @atlas/adapter-io — test/transition-producer.test.ts  (#234 · ADR-0015 D4 — AT-8 reachability + AT-4 reverify-skip)
//
// AT-8: the transition family is reachable through the SHIPPED producer (`createTransitionProducer`) over REAL
// 2-rev git input — NOT a test injector. The producer reads a unit's real content at two commits through the
// frozen arbitrary-rev index (`createRevIndex`), admits a JUSTIFIED transition (D-T1), persists it atomically,
// and the SHIPPED read leg (`createTransitionLeg`) reads it back. Supersession contrast (D-T3) and the
// reverify-store SKIP (AT-4/D-T2 — a justified transition is out of scope for the proven-only reverify gate)
// are exercised here too, where the real store + oracle live.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import type { CurrentNode, GroundedFact } from '@atlas/knowledge';
import { initAst } from '../src/index.js';
import { createRevIndex } from '../src/rev-index.js';
import { createDiskStore } from '../src/store.js';
import { createTransitionProducer, createTransitionLeg } from '../src/transition-source.js';
import { reverifyFact } from '../src/reverify-store.js';

await initAst(); // warm the grammar so the arbitrary-rev index folds the SAME AST units production folds

const UNIT = 'src/pay.ts'; // a whole-FILE unit lineage — resolves at each rev via resolveAnchorAt

const g = (repo: string, args: readonly string[]): string =>
  execFileSync('git', args as string[], { cwd: repo, encoding: 'utf8' }).trim();

interface Sandbox {
  readonly repoPath: string;
  readonly A: string; // rev before
  readonly B: string; // rev after (unit changed)
  readonly C: string; // a third rev (unit changed again) — for the supersession contrast
  cleanup(): void;
}

/** A real git repo: A→B→C, each changing `src/pay.ts`'s bytes, so each rev-pair is a genuine transition. */
function makeRepo(): Sandbox {
  const repoPath = mkdtempSync(join(tmpdir(), 'transition-'));
  g(repoPath, ['init', '-q']);
  g(repoPath, ['config', 'user.email', 't@t.t']);
  g(repoPath, ['config', 'user.name', 'T']);
  g(repoPath, ['config', 'commit.gpgsign', 'false']);
  mkdirSync(join(repoPath, 'src'), { recursive: true });
  const write = (body: string, msg: string): string => {
    writeFileSync(join(repoPath, UNIT), body);
    g(repoPath, ['add', '-A']);
    g(repoPath, ['commit', '-q', '-m', msg]);
    return g(repoPath, ['rev-parse', 'HEAD']);
  };
  const A = write('export const rate = 1;\n', 'A');
  const B = write('export const rate = 2;\n', 'B');
  const C = write('export const rate = 3;\n', 'C');
  return { repoPath, A, B, C, cleanup: () => rmSync(repoPath, { recursive: true, force: true }) };
}

let sbx: Sandbox | undefined;
afterEach(() => {
  sbx?.cleanup();
  sbx = undefined;
});

describe('AT-8 — reachable through the SHIPPED producer over REAL 2-rev git input (not an injector)', () => {
  it('produces + persists a JUSTIFIED transition from two real revs, and reads it back through the shipped leg', () => {
    sbx = makeRepo();
    const store = createDiskStore(join(sbx.repoPath, '.atlas'));
    const revIndex = createRevIndex(sbx.repoPath);
    const produce = createTransitionProducer(store, revIndex); // THE SHIPPED PRODUCER
    const read = createTransitionLeg(store); //                    THE SHIPPED READ LEG

    const run = produce(UNIT, sbx.A, sbx.B);
    expect(run.admitted).toBe(true);
    expect(run.persisted).toBe(true);
    expect(run.shaBefore).toBeTruthy();
    expect(run.shaAfter).toBeTruthy();
    expect(run.shaBefore).not.toBe(run.shaAfter); // the unit really changed across the two revs

    const rows = read(UNIT);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.unitKey).toBe(UNIT);
    expect(rows[0]!.authoring).toBe('TRANSITIONED'); // the lineage head
    expect(rows[0]!.freshness).toBe('FRESH'); // stamped at emit (D-T2)
  });

  it('ABSTAINS (never fabricates) when the unit did not change across the two revs — same content ⇒ no transition', () => {
    sbx = makeRepo();
    const store = createDiskStore(join(sbx.repoPath, '.atlas'));
    const produce = createTransitionProducer(store, createRevIndex(sbx.repoPath));
    // A→A: identical rev ⇒ identical content hash ⇒ zero interval ⇒ refused (not admitted, nothing written).
    const run = produce(UNIT, sbx.A, sbx.A);
    expect(run.admitted).toBe(false);
    expect(run.reason).toBeTruthy();
  });

  it('ABSTAINS when the unit does not resolve at a rev (no leg to ground the transition on)', () => {
    sbx = makeRepo();
    const store = createDiskStore(join(sbx.repoPath, '.atlas'));
    const produce = createTransitionProducer(store, createRevIndex(sbx.repoPath));
    const run = produce('src/does-not-exist.ts', sbx.A, sbx.B);
    expect(run.admitted).toBe(false);
  });
});

describe('AT-3 (shipped) — supersession contrast on the same lineage through the real store', () => {
  it('A→B then B→C: the read leg marks A→B SUPERSEDED and B→C the current TRANSITIONED head, both retained', () => {
    sbx = makeRepo();
    const store = createDiskStore(join(sbx.repoPath, '.atlas'));
    const revIndex = createRevIndex(sbx.repoPath);
    const produce = createTransitionProducer(store, revIndex);
    const read = createTransitionLeg(store);

    expect(produce(UNIT, sbx.A, sbx.B).admitted).toBe(true);
    expect(produce(UNIT, sbx.B, sbx.C).admitted).toBe(true);

    const rows = read(UNIT);
    expect(rows).toHaveLength(2); // both retained (superseded, not deleted)
    const shaA = String(revIndex.resolveAnchorAt(sbx.A, UNIT)!.subtreeHash);
    const shaB = String(revIndex.resolveAnchorAt(sbx.B, UNIT)!.subtreeHash);
    const shaC = String(revIndex.resolveAnchorAt(sbx.C, UNIT)!.subtreeHash);
    const ab = rows.find((r) => r.shaBefore === shaA && r.shaAfter === shaB);
    const bc = rows.find((r) => r.shaBefore === shaB && r.shaAfter === shaC);
    expect(ab?.authoring).toBe('SUPERSEDED');
    expect(bc?.authoring).toBe('TRANSITIONED');
  });
});

describe('AT-4 (shipped) — reverify-store SKIPS a transition (justified is out of the proven-only gate)', () => {
  it('reverifyFact returns undefined for a justified transition — never counted re-proven/broken/unverifiable', () => {
    const transition: GroundedFact = {
      kind: 'transition',
      id: 'tk' as unknown as GroundedFact['id'],
      tier: 'T2',
      unitKey: UNIT,
      shaBefore: 'sha-A',
      shaAfter: 'sha-B',
      grounding: { entries: [] },
      freshness: 'FRESH',
      claims: [],
      authoring: 'TRANSITIONED',
      seal: 'justified',
    };
    const node = { nodeKey: 'tk', family: 'transition', contentHash: 'ch', claims: [], primaryAnchor: UNIT } as unknown as CurrentNode;
    // The seal gate admits ONLY `proven`; a justified transition falls out to `undefined` (D-T2 — never re-checked).
    const row = reverifyFact(node, transition, () => { throw new Error('oracle must NOT be called'); }, () => true);
    expect(row).toBeUndefined();
  });
});
