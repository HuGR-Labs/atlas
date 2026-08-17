// @atlas/cli — test/mine-arms-render.test.ts  (SOUND-DEFAULT-MINE AC-B5 — the merged report exposes per-arm counts)
//
// The operator must SEE what each arm produced: a DEFAULT (multi-arm) run renders PER-ARM counts
// (advisory / dependency / count) with the union as the total. A single-arm EXPLICIT run renders BYTE-IDENTICAL
// to today's single-pass fold — the bench harness reads the same shape it always has.

import { describe, it, expect } from 'vitest';
import { driveMinePass, runMineArms } from '../src/mine.js';
import { foldVerdict } from '../src/mine-render.js';
import { MINE_SLOT_ENV } from '../src/mine-proposer.js';
import {
  recordingProposer,
  gateEmitAll,
  injectedHistory,
  skeletonSource,
  fakeStore,
  budget,
  NO_MODEL_ENV,
} from './mine-fixtures.js';
import type { MineDeps } from '../src/mine.js';

const seams = (): Partial<MineDeps> => ({
  proposer: recordingProposer().proposer,
  gate: gateEmitAll(),
  history: injectedHistory,
  skeleton: skeletonSource,
  store: fakeStore(),
});

describe('AC-B5 — merged render exposes per-arm counts; single-arm renders as before', () => {
  it('a DEFAULT multi-arm run names each arm (advisory / dependency / count) in the output', async () => {
    const v = await runMineArms('fix-repo', { env: {}, ...seams() });
    expect(v.stdout).toMatch(/advisory/);
    expect(v.stdout).toMatch(/dependency/);
    expect(v.stdout).toMatch(/count/);
    // the per-arm exposure line is distinct from the single-pass fold (which never mentions all three arms).
    expect(v.stdout).toMatch(/arm/i);
    // and each arm carries its FULL body, not just a coverage ledger — the union header line is present too.
    expect(v.stdout).toMatch(/\[union\]/);
  });

  it('every arm block carries the honesty why-empty line (the #129/#163 next-step is not dropped)', async () => {
    // A 0-fact multi-arm run must still tell the user WHY each arm produced nothing — the same cause the
    // single-pass fold emits, once per arm, never elided to a bare "coverage CLOSES 0 sites".
    // budget ceiling 0 ⇒ 0 sites visited on every arm ⇒ a genuinely empty pass. Injected seams keep it
    // hermetic (proposer/gate never reached at ceiling 0); NO_MODEL_ENV only drives resolveMineSlots ⇒ 3 arms.
    const empty: Partial<MineDeps> = {
      proposer: recordingProposer().proposer,
      history: injectedHistory,
      skeleton: skeletonSource,
      store: fakeStore(),
      gate: gateEmitAll(),
    };
    const v = await runMineArms('fix-repo', { env: NO_MODEL_ENV, ...empty, budget: budget(0) });
    const armHeadings = v.stdout.split('\n').filter((l) => l.startsWith('arm: '));
    expect(armHeadings).toHaveLength(3);
    const whyLines = v.stdout.split('\n').filter((l) => l.startsWith('mine: 0 candidate facts'));
    expect(whyLines.length).toBe(3); // one honesty line per arm — never dropped
  });

  it('an EXPLICIT single-arm run is BYTE-IDENTICAL to the frozen single-pass fold', async () => {
    const deps = seams();
    const explicit = await runMineArms('fix-repo', { env: { [MINE_SLOT_ENV]: 'advisory' }, ...deps });
    const single = foldVerdict(driveMinePass('fix-repo', { ...deps, slot: 'advisory' }));
    expect(explicit.stdout).toBe(single.stdout);
    expect(explicit.exitCode).toBe(single.exitCode);
  });
});
