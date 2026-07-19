// @atlas/adapter-io — test/scip.test.ts   (WP-9.1.1-b.SCIP — EPIC-1-b, REQ-ADAPTER-2, ADAPT-SCIP-1)
//
// Acceptance suite for the faithful SCIP reader `readScip` (ADAPT-SCIP-1). It transcribes the three
// frozen goldens (docs/requirements/goldens-adapters.md) against the SHARED fix-scip harness
// (test/harness/fix-scip.ts — CONSUMED, never redefined):
//   • SCN-ADAPTER-2a-1 — the projection equals the oracle: exactly the 3 recorded occurrences  (happy)
//   • SCN-ADAPTER-2b-1 — SYM_MISSING is only a reference, no fabricated definition anywhere    (guard)
//   • SCN-ADAPTER-2c-1 — no synthesized cross-file edge (no compute()/service.py occurrence)   (guard)

import { describe, it, expect, afterEach } from 'vitest';
import type { ScipOutput, ScipOccurrence } from '@atlas/index';
import { readScip } from '../src/scip.js';
import { makeFixScip, expectedScipOutput, SYM_GREET, SYM_MISSING } from './harness/fix-scip.js';
import type { FixScip } from './harness/fix-scip.js';

let fx: FixScip | undefined;
afterEach(() => {
  fx?.cleanup();
  fx = undefined;
});

/** Flatten every occurrence across all documents — for presence/absence assertions. */
function allOccurrences(out: ScipOutput): ScipOccurrence[] {
  return out.documents.flatMap((d) => d.occurrences);
}

describe('readScip — faithful SCIP projection (ADAPT-SCIP-1)', () => {
  it('SCN-ADAPTER-2a-1 — projects exactly the recorded occurrences, no more (happy)', () => {
    fx = makeFixScip();
    // teeth: a reader that synthesizes an extra document-level `imports` occurrence diverges here.
    expect(readScip(fx.scipPath)).toStrictEqual(expectedScipOutput);
  });

  it('SCN-ADAPTER-2b-1 — missingHelper stays a dangling reference, greet has a definition (guard)', () => {
    fx = makeFixScip();
    const occ = allOccurrences(readScip(fx.scipPath));

    const missing = occ.filter((o) => o.symbol === SYM_MISSING);
    // teeth: a reader that fabricates a definition for the dangling missingHelper breaks this.
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.every((o) => o.role === 'reference')).toBe(true);
    expect(occ.some((o) => o.symbol === SYM_MISSING && o.role === 'definition')).toBe(false);

    // greet DOES carry a definition (so it resolves downstream).
    expect(occ.some((o) => o.symbol === SYM_GREET && o.role === 'definition')).toBe(true);
  });

  it('SCN-ADAPTER-2c-1 — no synthesized cross-file compute()/service.py edge (guard)', () => {
    fx = makeFixScip();
    const out = readScip(fx.scipPath);
    const occ = allOccurrences(out);

    // teeth: a reader adding a heuristic same-name occurrence would surface a compute/service.py symbol.
    expect(occ.some((o) => o.symbol.includes('compute'))).toBe(false);
    expect(out.documents.some((d) => d.relativePath.includes('service.py'))).toBe(false);
    expect(occ.some((o) => o.symbol.includes('service.py'))).toBe(false);
  });
});
