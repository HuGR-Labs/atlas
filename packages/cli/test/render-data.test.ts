// @atlas/cli — test/render-data.test.ts   (WIRE-LOOP Seam-2: CLI renders verdict.data, closes GAP-B)
//
// The CLI used to DROP `verdict.data` entirely — an emitted fact / a resolved pack / the derived subsumes
// were invisible at the user surface. `renderVerdict` now appends a DETERMINISTIC `data:` block for a known
// `ok` data shape, byte-identical per verdict (CLI-3c), and NOTHING for an unknown/absent shape (back-compat:
// the pre-existing status/next/invariant bytes are untouched). Each tooth NAMES the mutant it kills.

import { describe, it, expect } from 'vitest';
import type { Verdict } from '@atlas/tools';
import { renderVerdict } from '../src/render.js';

const guidance = { next: 'do the next thing', invariant: 'the governing invariant' };

/** The fixed status/next/invariant prefix every render carries — a data block is APPENDED after it. */
const PREFIX = 'status: ok\nnext: do the next thing\ninvariant: the governing invariant\n';

describe('renderVerdict — Seam-2 deterministic data: block', () => {
  it('query envelope { pack, subsumes } → inv lines + stale + subsumes (kills the drop-verdict.data mutant)', () => {
    const v: Verdict = {
      ok: true,
      data: {
        pack: {
          territory: 't', axisHash: 'a', tokenEstimate: 0, stale: false,
          invariants: [{ tier: 'T1', nodeId: 'n1', claim: 'claim one' }, { tier: 'T0', nodeId: 'n2', claim: 'claim two' }],
        },
        subsumes: [{ broader: 'b1', narrower: 'q1' }],
      } as unknown,
      guidance,
    };
    const { stdout } = renderVerdict(v);
    // TEETH: the original render printed ONLY status/next/invariant — none of the below appeared (GAP-B).
    // N12: `tokenEstimate` now rides the CLI query block too (CLI/MCP parity), after `stale`, before subsumes.
    expect(stdout).toBe(
      PREFIX +
        'data:\n  inv T1 n1: claim one\n  inv T0 n2: claim two\n  stale: false\n  tokenEstimate: 0\n  subsumes b1 ⊃ q1\n',
    );
  });

  it('the query data block is BYTE-IDENTICAL across two renders of the same verdict (CLI-3c determinism)', () => {
    const v: Verdict = {
      ok: true,
      data: { pack: { territory: 't', axisHash: 'a', tokenEstimate: 0, stale: true, invariants: [{ tier: 'T1', nodeId: 'n', claim: 'c' }] }, subsumes: [] } as unknown,
      guidance,
    };
    // TEETH: a clock/nonce/path leaked into the block would make two renders differ.
    expect(renderVerdict(v).stdout).toBe(renderVerdict(v).stdout);
    expect(renderVerdict(v).stdout).toContain('  stale: true\n');
  });

  it('emit { id } → an id line (kills the mutant that never surfaces the persisted CAS id)', () => {
    const v: Verdict = { ok: true, data: { emitted: true, id: 'abc123' } as unknown, guidance };
    expect(renderVerdict(v).stdout).toBe(PREFIX + 'data:\n  id: abc123\n');
  });

  it('init { territories } → territory lines SORTED by name (kills the insertion-order mutant)', () => {
    const v: Verdict = {
      ok: true,
      data: { territories: [{ name: 'zeta' }, { name: 'alpha' }], blastRadius: [], t0Candidates: [] } as unknown,
      guidance,
    };
    expect(renderVerdict(v).stdout).toBe(PREFIX + 'data:\n  territory: alpha\n  territory: zeta\n');
  });

  it('an UNKNOWN data shape (reconcile) appends NO block — back-compat bytes unchanged (kills the always-emit mutant)', () => {
    const v: Verdict = {
      ok: true,
      data: { drift: [], mechanical: [], semantic: [], regroundedCount: 0, reauthorCount: 0, exitCode: 0 } as unknown,
      guidance,
    };
    // TEETH: a mutant that always prints a `data:` header would break every non-enumerated shape.
    expect(renderVerdict(v).stdout).toBe(PREFIX);
    expect(renderVerdict(v).stdout).not.toContain('data:');
  });

  it('ABSENT data (ok, no data) and a REJECTED verdict both append no block (existing output unchanged)', () => {
    const okNoData: Verdict = { ok: true, guidance };
    expect(renderVerdict(okNoData).stdout).toBe(PREFIX);
    const rejected: Verdict = { ok: false, rejected: 'nope', guidance };
    // status derives to 'error' for ok:false; the data block never renders on a non-ok verdict.
    expect(renderVerdict(rejected).stdout).not.toContain('data:');
  });
});
