// @atlas/e2e-blackbox — test/s234-transition.blackbox.test.ts  (#234 · ADR-0015 D4 — AT-9, the transition e2e)
//
// NARRATIVE. #234 adds the 2-rev TRANSITION family (ADR-0015 D4): an IMMUTABLE ADVISORY HISTORICAL record
// "unit returned A, now returns B", sealed `justified` (no HEAD oracle — D-T1), superseded not falsified
// (D-T3). This story drives the REAL chain end to end through the SHIPPED binary over a REAL 2-rev fixture:
// `atlas transition <unit> <before> <after>` produces + persists a justified transition from two commits where
// the unit's content changed, `atlas transitions <unit>` reads it back, and a THIRD commit's transition is the
// supersession CONTRAST — the older record reads SUPERSEDED, the newer TRANSITIONED, both retained.
//
// TEETH: a transition over two revs where the unit did NOT change (before === after) is REJECTED — the producer
// abstains rather than fabricate a zero-interval record.

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { makeFixtureRepo, runAtlas } from '../src/harness.js';
import type { FixtureRepo } from '../src/harness.js';

const UNIT = 'src/pay.ts';
const V1 = 'export const rate = 1;\n';
const V2 = 'export const rate = 2;\n';
const V3 = 'export const rate = 3;\n';
const INDEX = [{ path: 'src/pay.ts', defines: ['pay/rate.'] }];

let repo: FixtureRepo;
let revA = '';
let revB = '';
let revC = '';

beforeAll(() => {
  repo = makeFixtureRepo({ files: { [UNIT]: V1 }, index: INDEX });
  revA = repo.sha();
  revB = repo.commit({ [UNIT]: V2 });
  revC = repo.commit({ [UNIT]: V3 });
});
afterAll(() => repo?.cleanup());

describe('S234 — a 2-rev transition is produced, read back justified, and superseded not falsified', () => {
  it('`atlas transition <unit> A B` produces + persists a JUSTIFIED transition (exit 0)', () => {
    const run = runAtlas(repo.repoPath, ['transition', UNIT, revA, revB]);
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain('status: ok');
    expect(run.stdout).toContain('seal: justified');
    expect(run.stdout).toContain(UNIT);
  });

  it('`atlas transitions <unit>` reads the record back as the current TRANSITIONED head', () => {
    const read = runAtlas(repo.repoPath, ['transitions', UNIT]);
    expect(read.exitCode).toBe(0);
    expect(read.stdout).toContain('status: ok');
    expect(read.stdout).toContain('1 current (TRANSITIONED)');
    expect(read.stdout).toContain('0 SUPERSEDED');
  });

  it('a SECOND transition B→C supersedes the first on the same lineage — both retained (D-T3)', () => {
    const second = runAtlas(repo.repoPath, ['transition', UNIT, revB, revC]);
    expect(second.exitCode).toBe(0);
    expect(second.stdout).toContain('status: ok');

    const read = runAtlas(repo.repoPath, ['transitions', UNIT]);
    expect(read.exitCode).toBe(0);
    // both records survive; exactly one is the current head, one is superseded (superseded, NOT falsified).
    expect(read.stdout).toContain('2 transition(s)');
    expect(read.stdout).toContain('1 current (TRANSITIONED)');
    expect(read.stdout).toContain('1 SUPERSEDED');
  });

  it('TEETH — a transition over two revs where the unit did NOT change is REJECTED (no zero-interval fabrication)', () => {
    const noop = runAtlas(repo.repoPath, ['transition', UNIT, revA, revA]);
    expect(noop.exitCode).toBe(2);
    expect(noop.stdout).toContain('status: rejected');
  });

  it('reading an unknown lineage is an honest empty, never a throw', () => {
    const empty = runAtlas(repo.repoPath, ['transitions', 'src/does-not-exist.ts']);
    expect(empty.exitCode).toBe(0);
    expect(empty.stdout).toContain('no grounded transition');
  });
});
