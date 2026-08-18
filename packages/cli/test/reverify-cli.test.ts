// @atlas/cli — test/reverify-cli.test.ts  (CLI-11 — the `atlas verify-store` REVERIFY-GATE door at the entrypoint)
//
// Two things are under test: the argv→dispatch wiring (does `atlas verify-store` reach the composition
// root's `reverify` thunk, or is the module a reference model nothing calls) and the
// `ReverifyReport → CliVerdict` projection — in particular that `unverifiable` is NEVER folded into a pass.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReverifyReport } from '@atlas/adapter-io';
import { main } from '../src/cli.js';
import { reverifyVerdict } from '../src/reverify.js';
import { COMMANDS, COMMAND_LEG, authorityOf } from '../src/map.js';
import { parse } from '../src/parse.js';

let writes: string[];
beforeEach(() => {
  writes = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    writes.push(String(chunk));
    return true;
  });
});
afterEach(() => vi.restoreAllMocks());

const REPORT = (o: Partial<ReverifyReport>): ReverifyReport => ({
  sealedProven: 0,
  reProven: 0,
  broken: 0,
  unverifiable: 0,
  rows: [],
  ...o,
});

describe('CLI-11 — `atlas verify-store` is a real command that reaches a real leg', () => {
  it('parses with NO positional and routes to the `atlas-query` READ door', () => {
    const p = parse(['verify-store']);
    expect(p.ok).toBe(true);
    expect(p.ok && p.command).toBe('verify-store');
    expect(p.ok && p.positionals).toEqual([]);
    expect(COMMANDS).toContain('verify-store');
    expect(COMMAND_LEG['verify-store']).toBe('atlas-query');
    expect(authorityOf('verify-store')).toBe('read');
  });

  it('DISPATCH — the injected reverify thunk is CALLED once', async () => {
    // teeth: breaks-on "the verify-store branch is never wired into `main`".
    let calls = 0;
    const reverify = (): ReverifyReport => {
      calls++;
      return REPORT({});
    };
    const code = await main(['verify-store'], { reverify });
    expect(calls).toBe(1);
    expect(code).toBe(0);
    expect(writes.join('')).toContain('nothing to re-verify');
  });

  it('FAILS CLOSED when the runtime is not composed — never a silent pass over nothing', async () => {
    const code = await main(['verify-store'], {});
    expect(code).toBe(1); // a wiring error, not a governance refusal
    expect(writes.join('')).toContain('atlas runtime is not composed yet');
  });
});

describe('CLI-11 — the three buckets never merge', () => {
  it('an EMPTY store (0 sealed-proven) is an honest zero, exit 0, distinguishable from a passing populated store', () => {
    const cv = reverifyVerdict(REPORT({}));
    expect(cv.exitCode).toBe(0);
    expect(cv.stdout).toContain('nothing to re-verify (an honest zero, not a skip)');
    expect(cv.stdout).toContain('verify-store: 0 sealed-proven fact(s) — 0 re-proven, 0 broken, 0 unverifiable');
  });

  it('all RE-PROVEN ⇒ exit 0, and the sentence says so', () => {
    const cv = reverifyVerdict(
      REPORT({ sealedProven: 2, reProven: 2, rows: [
        { nodeKey: 'nk-a', outcome: 're-proven', reason: 'replayed PROVEN over (dependency, sym, src)' },
        { nodeKey: 'nk-b', outcome: 're-proven', reason: 'replayed PROVEN over (count, sym, src)' },
      ] }),
    );
    expect(cv.exitCode).toBe(0);
    expect(cv.stdout).toContain('all 2 sealed-proven fact(s) replayed PROVEN');
    expect(cv.stdout).toContain('  re-proven nk-a: replayed PROVEN over (dependency, sym, src)');
  });

  it('a BROKEN row alone ⇒ exit 2, never silently downgraded to a pass', () => {
    const cv = reverifyVerdict(
      REPORT({ sealedProven: 1, broken: 1, rows: [{ nodeKey: 'nk-a', outcome: 'broken', reason: "replay did NOT re-prove — oracle returned 'abstain'" }] }),
    );
    expect(cv.exitCode).toBe(2);
    expect(cv.stdout).toContain('status: rejected');
    expect(cv.stdout).toContain('no longer re-prove against the live index');
    expect(cv.stdout).toContain('  broken nk-a:');
  });

  it('an UNVERIFIABLE row alone ⇒ exit 2, NEVER rendered as a pass — the trap this WP names by name', () => {
    // teeth: breaks-on "unverifiable folded into re-proven/ok". A witness-less `proven` seal is precisely
    // the trust-me-it-was-proved shape this gate exists to eliminate.
    const cv = reverifyVerdict(
      REPORT({ sealedProven: 1, unverifiable: 1, rows: [{ nodeKey: 'nk-a', outcome: 'unverifiable', reason: 'seal:proven but no witness was recorded — nothing to replay' }] }),
    );
    expect(cv.exitCode).toBe(2);
    expect(cv.stdout).toContain('status: rejected');
    expect(cv.stdout).not.toContain('status: ok');
    expect(cv.stdout).toContain('carry NO witness');
    expect(cv.stdout).toContain('  unverifiable nk-a:');
  });

  it('mixed re-proven + broken + unverifiable ⇒ exit 2, every row named, counts sum to the denominator', () => {
    const cv = reverifyVerdict(
      REPORT({
        sealedProven: 3,
        reProven: 1,
        broken: 1,
        unverifiable: 1,
        rows: [
          { nodeKey: 'nk-a', outcome: 're-proven', reason: 'r' },
          { nodeKey: 'nk-b', outcome: 'broken', reason: 'b' },
          { nodeKey: 'nk-c', outcome: 'unverifiable', reason: 'u' },
        ],
      }),
    );
    expect(cv.exitCode).toBe(2);
    expect(cv.stdout).toContain('verify-store: 3 sealed-proven fact(s) — 1 re-proven, 1 broken, 1 unverifiable');
    expect(cv.stdout.split('\n').filter((l) => /^  (re-proven|broken|unverifiable) /.test(l))).toHaveLength(3);
  });

  it('the render is DETERMINISTIC — the same report renders byte-identically twice', () => {
    const r = REPORT({ sealedProven: 1, broken: 1, rows: [{ nodeKey: 'nk-a', outcome: 'broken', reason: 'x' }] });
    expect(reverifyVerdict(r).stdout).toBe(reverifyVerdict(r).stdout);
  });
});
