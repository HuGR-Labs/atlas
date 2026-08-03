// @atlas/adapter-io — test/git-history-frontier-szz.test.ts
//
// Regression coverage for the SZZ-composes-with-churn fix (`git-history.ts` frontier admission). Before
// the fix, `(szz.get(f) ?? 0) >= 1` short-circuited `HOTSPOT_MIN_CHURN`: a file touched by exactly ONE
// `fix:` commit entered the frontier on that single touch, collapsing the frontier toward "every file
// ever fixed" in a conventional-commits repo — the file-count-proportional LLM spend REQ-GEN-3a/3b
// forbid (`frontierBudget` IS the ranked-site count). The fix adds `HOTSPOT_MIN_SZZ = 2`, symmetric to
// `HOTSPOT_MIN_CHURN`, so the SZZ leg requires the same evidence-of-recurrence.
//
// This suite owns a SMALL, LOCAL fixture (not the shared `git-sbx`/`fix-repo` oracles other WPs consume —
// those aren't shaped to isolate a single-fix-touch file from a two-fix-touch file at the frontier
// boundary). Every commit here touches exactly ONE file, so `churn`/`szz` per file are exact and no
// `coupling` leg (which needs a ≥2-file basket) can interfere.
//
// Fixture topology (4 files, each with its own commit history):
//   fileA.ts — ONE commit total, subject `fix: …`     → churn=1, szz=1  (the single-fix-touch file)
//   fileB.ts — TWO commits, BOTH `fix: …`               → churn=2, szz=2  (the two-fix-touch file)
//   fileC.ts — TWO commits, one `chore:` one `fix:`      → churn=2, szz=1  (churn-leg control, SZZ-agnostic)
//   fileD.ts — ONE commit, `chore: …` (never a fix)      → churn=1, szz=0  (negative control)
//
// Expected frontier — pinned as OUTPUT, not as a re-assertion of the constant (a constant test guards
// nothing; the arithmetic that consumes it is what must be pinned):
//   fileA.ts is ADMITTED pre-fix (szz=1 >= old bound 1) and EXCLUDED post-fix (szz=1 < HOTSPOT_MIN_SZZ=2,
//   churn=1 < HOTSPOT_MIN_CHURN=2) — this is the assertion that must fail against the pre-fix source.
//   fileB.ts and fileC.ts stay admitted throughout (both clear churn>=2 independent of the SZZ leg).
//   fileD.ts is never admitted (churn=1, szz=0 — not a hotspot by any leg).

import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHistorySource } from '../src/git-history.js';

interface SzzSbx {
  readonly repoPath: string;
  readonly rev: string;
  cleanup(): void;
}

/** One-file-per-commit fixture: `commits` is `[filename, content, subject]` in commit order. */
function makeSzzSbx(commits: ReadonlyArray<readonly [string, string, string]>): SzzSbx {
  const repoPath = mkdtempSync(join(tmpdir(), 'atlas-szz-churn-sbx-'));
  const git = (...args: string[]): void => {
    execFileSync('git', args, { cwd: repoPath, stdio: 'pipe' });
  };
  git('init', '-q');
  git('config', 'user.email', 'fix@atlas.test');
  git('config', 'user.name', 'atlas-fixture');
  git('config', 'commit.gpgsign', 'false');
  for (const [file, content, subject] of commits) {
    writeFileSync(join(repoPath, file), content);
    git('add', file);
    git('commit', '-q', '-m', subject);
  }
  const rev = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoPath, encoding: 'utf8' }).trim();
  return { repoPath, rev, cleanup: () => rmSync(repoPath, { recursive: true, force: true }) };
}

describe('git-history frontier — SZZ composes with the churn bar', () => {
  let sbx: SzzSbx | undefined;
  afterEach(() => sbx?.cleanup());

  it('admits the two-fix / churn>=2 files, excludes the single-fix / churn=1 file', () => {
    sbx = makeSzzSbx([
      ['fileA.ts', 'export const a = 1;\n', 'fix: create and patch A'], // churn=1, szz=1
      ['fileB.ts', 'export const b = 1;\n', 'fix: create B with initial patch'], // churn=1, szz=1 so far
      ['fileB.ts', 'export const b = 2;\n', 'fix: patch B further'], // churn=2, szz=2
      ['fileC.ts', 'export const c = 1;\n', 'chore: add C'], // churn=1, szz=0 so far
      ['fileC.ts', 'export const c = 2;\n', 'fix: patch C'], // churn=2, szz=1
      ['fileD.ts', 'export const d = 1;\n', 'chore: add D only'], // churn=1, szz=0
    ]);
    const { repoPath, rev } = sbx;
    const hist = createHistorySource(repoPath, rev);

    const frontierPaths = hist.frontier(repoPath, rev).map((r) => r.qualifiedPath);

    // The pinned OUTPUT: churn-desc then path-asc (fileB/fileC tie at churn=2, fileB < fileC by path).
    expect(frontierPaths).toEqual(['fileB.ts', 'fileC.ts']);

    // The load-bearing single assertion: the one-touch fix file must NOT reach the frontier. Against the
    // pre-fix source (`szz.get(f) >= 1`), fileA.ts (szz=1) WOULD be admitted — this line fails there.
    expect(frontierPaths).not.toContain('fileA.ts');
    // Negative control: the never-fixed, once-touched file is excluded either way (unaffected by SZZ).
    expect(frontierPaths).not.toContain('fileD.ts');
  });

  it('does not admit a solo fix: touch on its own (the exact bug this closes)', () => {
    // A fixture with ONLY the single-fix-touch file (no other file to satisfy churn/coupling), so the
    // frontier is empty iff the SZZ leg genuinely requires HOTSPOT_MIN_SZZ, not just >=1.
    sbx = makeSzzSbx([['solo.ts', 'export const solo = 1;\n', 'fix: solo bug fix']]);
    const { repoPath, rev } = sbx;
    const hist = createHistorySource(repoPath, rev);
    expect(hist.frontier(repoPath, rev)).toEqual([]);
  });
});
