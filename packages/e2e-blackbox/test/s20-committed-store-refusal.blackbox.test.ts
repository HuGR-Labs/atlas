// @atlas/e2e-blackbox — test/s20-committed-store-refusal.blackbox.test.ts  (S20 — the refusal is LEGIBLE)
//
// The provenance tripwire made a COMMITTED durable store unreadable. It did not make it EXPLICABLE: the read
// path resolved to `undefined`, `rehydrateProjection` folded that to the empty store, and `atlas query`
// answered `status: ok` with an empty pack — the exact signature of a repo that simply has no knowledge yet.
// A user who ran `git add -A` after an emit therefore saw an Atlas that had quietly stopped working, with no
// reason line on any door.
//
// This story drives the three user-facing read doors of the REAL CLI binary over a repo whose `.atlas/`
// arrived by COMMIT, and asserts each one names the condition and exits non-zero.

import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixtureRepo, runAtlas } from '../src/harness.js';
import type { FixtureRepo } from '../src/harness.js';

const SRC = 'export function greet(name: string): string {\n  return `hi ${name}`;\n}\n';

/** The refusal's DISCRIMINANT — the reason NAME, the text before the first `:`. Asserted as a name, never as
 *  a fragment of the surrounding prose (refusal texts in this repo quote each other by name). */
const REASON = 'untrusted-store';

let repo: FixtureRepo | undefined;
afterEach(() => {
  repo?.cleanup();
  repo = undefined;
});

/** A repo whose durable store was landed by `git add -f` — the ONE flag a `.gitignore` costs an attacker,
 *  and the accident an ordinary `git add -A` produces for free when the rule is missing. */
function committedStoreRepo(): FixtureRepo {
  const r = makeFixtureRepo({ files: { 'src/greet.ts': SRC } });
  writeFileSync(join(r.repoPath, '.atlas', 'projection.json'), '{"current":[],"cas":[]}');
  execFileSync('git', ['add', '-f', '.atlas/projection.json'], { cwd: r.repoPath, stdio: 'ignore' });
  execFileSync('git', ['commit', '-q', '-m', 'ship the store'], { cwd: r.repoPath, stdio: 'ignore' });
  return r;
}

describe('S20 — a COMMITTED durable store is refused with a reason on every user door', () => {
  it('RED: `atlas query` answered ok with an empty pack; it now refuses and names the condition', () => {
    repo = committedStoreRepo();
    const run = runAtlas(repo.repoPath, ['query', 'src']);
    expect(run.exitCode).not.toBe(0);
    expect(run.stdout).toContain(REASON);
    // The remediation, not just the diagnosis: a refusal a user cannot act on is a dead end.
    expect(run.stdout).toContain('git rm -r --cached');
  });

  it('RED: `atlas doctor hotset` reported a healthy empty store; it now refuses', () => {
    repo = committedStoreRepo();
    const run = runAtlas(repo.repoPath, ['doctor', 'hotset', '5']);
    expect(run.exitCode).not.toBe(0);
    expect(run.stdout).toContain(REASON);
  });

  it('RED: `atlas node <addr>` reads CAS directly, going AROUND the projection — it now refuses too', () => {
    repo = committedStoreRepo();
    const run = runAtlas(repo.repoPath, ['node', '0'.repeat(64)]);
    expect(run.exitCode).not.toBe(0);
    expect(run.stdout).toContain(REASON);
  });

  it('`atlas init` is the ONE exemption — it is the command that repairs this, so it must still run', () => {
    repo = committedStoreRepo();
    const run = runAtlas(repo.repoPath, ['init', '.']);
    expect(run.exitCode).toBe(0);
    expect(run.stdout).not.toContain(REASON);
  });

  it('CONTROL: the same repo WITHOUT the store committed answers normally — the refusal discriminates', () => {
    repo = makeFixtureRepo({ files: { 'src/greet.ts': SRC } });
    const run = runAtlas(repo.repoPath, ['query', 'src']);
    expect(run.exitCode).toBe(0);
    expect(run.stdout).not.toContain(REASON);
  });
});
