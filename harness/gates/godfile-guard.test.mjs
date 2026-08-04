// harness/gates/godfile-guard.test.mjs — the LOC ceiling's OWN teeth.
//
// The gate had two holes and both were invisible in exactly the same way: it printed OK for files it had
// never read. It ran `git ls-files packages`, so
//
//   1. an UNTRACKED file was not in the list. A 900-line module written and not yet `git add`ed scored a
//      green gate. The worst direction for this check to fail, because a file is most likely to be
//      oversized on the day it is first written.
//   2. `harness/**` was not in the list. Every gate enforcing the repo's standing bars was itself unbarred.
//
// Each fixture below is built as a REAL git repo, because the untracked leg is meaningless against a
// directory git has never heard of: `--others --exclude-standard` has to resolve `.gitignore`, and the
// point of the test is that the guard's list is git's, not a hand-rolled walk. Every case asserts on the
// EXIT CODE and on the guard's own message naming the file — a gate that fails for the wrong file, or
// fails silently, has not been tested.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GUARD = join(dirname(fileURLToPath(import.meta.url)), 'godfile-guard.mjs');
const CAP = 400;

let root;

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
const write = (rel, lines) => {
  mkdirSync(join(root, dirname(rel)), { recursive: true });
  // `lines` newline-JOINED lines with NO trailing newline, so the guard's `split('\n').length` reads
  // exactly `lines`. The fixture is written in the guard's own units so the boundary cases mean what they
  // say — a real source file, which does end in a newline, measures one MORE than its `wc -l`.
  writeFileSync(join(root, rel), Array.from({ length: lines }, (_, i) => `// line ${i}`).join('\n'));
};

/** Run the guard against the fixture root. Returns the exit code and the combined output. */
function run() {
  try {
    const stdout = execFileSync(process.execPath, [GUARD], {
      env: { ...process.env, GODFILE_GUARD_ROOT: root },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out: stdout };
  } catch (e) {
    return { code: e.status ?? -1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'atlas-godfile-'));
  git('init', '-q');
  git('config', 'user.email', 'gate@example.invalid');
  git('config', 'user.name', 'gate');
  writeFileSync(join(root, '.gitignore'), 'dist/\nnode_modules/\n');
  write('packages/core/src/ok.ts', 10);
  write('harness/gates/ok.mjs', 10);
  git('add', '-A');
  git('commit', '-qm', 'fixture');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('godfile-guard', () => {
  it('CONTROL — a clean fixture passes, and the count proves it actually read both scopes', () => {
    const { code, out } = run();
    expect(code).toBe(0);
    expect(out).toMatch(/1 packages/);
    expect(out).toMatch(/1 harness/);
  });

  it('flags an UNTRACKED over-cap file under packages/ — the file has never been `git add`ed', () => {
    write('packages/core/src/godfile.ts', CAP + 50);
    expect(git('status', '--porcelain')).toMatch(/\?\? packages\/core\/src\/godfile\.ts/);
    const { code, out } = run();
    expect(code).toBe(1);
    expect(out).toMatch(/packages\/core\/src\/godfile\.ts/);
    rmSync(join(root, 'packages/core/src/godfile.ts'));
    expect(run().code).toBe(0);
  });

  it('flags an over-cap file under harness/ — the gates are subject to the bar they enforce', () => {
    write('harness/gates/godfile.mjs', CAP + 50);
    git('add', '-A');
    const { code, out } = run();
    expect(code).toBe(1);
    expect(out).toMatch(/harness\/gates\/godfile\.mjs/);
    git('rm', '-q', '-f', 'harness/gates/godfile.mjs');
    expect(run().code).toBe(0);
  });

  // The boundary is where the ceiling is either a real bar or one line of slack nobody measured, and it is
  // pinned here because it was load-bearing the day the walk widened: `harness/gates/layer-guard.mjs`
  // measured EXACTLY 400 and therefore passed. `> CAP`, not `>= CAP` — asserted, not assumed.
  it('is EXCLUSIVE at the boundary: exactly CAP passes, CAP+1 fails', () => {
    write('packages/core/src/edge.ts', CAP);
    expect(run().code).toBe(0);
    write('packages/core/src/edge.ts', CAP + 1);
    const { code, out } = run();
    expect(code).toBe(1);
    expect(out).toMatch(new RegExp(`${CAP + 1}\\s+packages/core/src/edge\\.ts`));
    rmSync(join(root, 'packages/core/src/edge.ts'));
  });

  it('respects .gitignore rather than a denylist of its own — dist/ is out of scope', () => {
    write('packages/core/dist/generated.ts', CAP + 50);
    expect(run().code).toBe(0);
    rmSync(join(root, 'packages/core/dist'), { recursive: true });
  });

  it('exempts .d.ts, which is generated output, not a module', () => {
    write('packages/core/src/huge.d.ts', CAP + 50);
    expect(run().code).toBe(0);
    rmSync(join(root, 'packages/core/src/huge.d.ts'));
  });

  it('FAILS rather than passes when it cannot build its file list (no git ⇒ nothing was checked)', () => {
    const bare = mkdtempSync(join(tmpdir(), 'atlas-godfile-nogit-'));
    try {
      const prev = root;
      root = bare;
      const { code, out } = run();
      root = prev;
      expect(code).toBe(1);
      expect(out).toMatch(/could not list files/);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});
