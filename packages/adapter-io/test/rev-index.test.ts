// @atlas/adapter-io — test/rev-index.test.ts  (COMPOSE-C — createRevIndex)
//
// Acceptance suite for the standalone arbitrary-rev code index (`createRevIndex`, rev-index.ts). A throwaway
// git repo is materialized under the scratchpad with TWO commits — A authors `src/unit.ts`, B rewrites its
// body (a real structural change) — so drift is genuine (not HEAD-only / inert). Each golden names the
// mutant that flips it (TEETH), and each was verified to bite.
//
// Resolution note: `axesAt` builds via a TEMP detached worktree; the file-leaf `subtreeHash` is
// content-only (build.ts:29, `id({content})`), so a body change re-keys the unit — the exact drift oracle.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import type { AdvisoryNode } from '@atlas/knowledge';
import type { Hash, NodeKey, StructRef } from '@atlas/contracts';
import { createRevIndex } from '../src/rev-index.js';

const QP = 'src/unit.ts';
const UNIT_A = 'export function foo(name: string): string {\n  return `hi ${name}`;\n}\n';
const UNIT_B = 'export function foo(name: string): string {\n  return `hello there ${name}`;\n}\n'; // body changed

// ── throwaway A/B repo ───────────────────────────────────────────────────────────────────────────────
interface AbRepo {
  readonly repoPath: string;
  readonly A: string; // full sha of commit A (structure v1)
  readonly B: string; // full sha of commit B (structure v2)
  cleanup(): void;
}

const g = (repo: string, args: readonly string[]): string =>
  execFileSync('git', args as string[], { cwd: repo, encoding: 'utf8' }).trim();

function makeAbRepo(): AbRepo {
  const repoPath = mkdtempSync(join(tmpdir(), 'revidx-repo-'));
  g(repoPath, ['init', '-q']);
  g(repoPath, ['config', 'user.email', 't@t.t']);
  g(repoPath, ['config', 'user.name', 'T']);
  g(repoPath, ['config', 'commit.gpgsign', 'false']);
  mkdirSync(join(repoPath, 'src'), { recursive: true });

  writeFileSync(join(repoPath, QP), UNIT_A);
  g(repoPath, ['add', '-A']);
  g(repoPath, ['commit', '-q', '-m', 'A: author foo']);
  const A = g(repoPath, ['rev-parse', 'HEAD']);

  writeFileSync(join(repoPath, QP), UNIT_B);
  g(repoPath, ['add', '-A']);
  g(repoPath, ['commit', '-q', '-m', 'B: rewrite foo body']);
  const B = g(repoPath, ['rev-parse', 'HEAD']);

  return { repoPath, A, B, cleanup: () => rmSync(repoPath, { recursive: true, force: true }) };
}

// A minimal AdvisoryNode grounded at `qp`/`subtreeHash` (only required fields, none invented).
function advisoryAt(qp: string, subtreeHash: StructRef['subtreeHash']): AdvisoryNode {
  return {
    kind: 'advisory',
    id: `F_${qp}` as NodeKey,
    tier: 'T2',
    claimNorm: `claim anchored at ${qp}`,
    grounding: { entries: [{ anchor: { kind: 'file', qualifiedPath: qp, subtreeHash }, path: qp }] },
    freshness: 'FRESH',
    claims: [],
    authoring: 'ADVISORY',
  };
}

let repo: AbRepo | undefined;
afterEach(() => {
  repo?.cleanup();
  repo = undefined;
});

describe('createRevIndex — arbitrary-rev code index (COMPOSE-C)', () => {
  it('axesAt(A) ≠ axesAt(B): the changed unit re-keys the spatial root [teeth: build ignores content ⇒ RED]', () => {
    repo = makeAbRepo();
    const rev = createRevIndex(repo.repoPath);

    const axA = rev.axesAt(repo.A);
    const axB = rev.axesAt(repo.B);
    // A real structural change ⇒ the file leaf's content-hash differs ⇒ the whole spatial rollup re-keys.
    expect(String(axA.spatial.subtreeHash)).not.toBe(String(axB.spatial.subtreeHash));
    // MUTANT: if `build`/`walkFileTree` folded no content, both revs would hash identically → this flips.
  });

  it('reDerives: FRESH at the grounded rev, DRIFTED after the body change [teeth: skip subtreeHash compare ⇒ RED]', () => {
    repo = makeAbRepo();
    const rev = createRevIndex(repo.repoPath);

    const anchorA = rev.resolveAnchorAt(repo.A, QP);
    expect(anchorA).toBeDefined();
    const fact = advisoryAt(QP, anchorA!.subtreeHash);

    expect(rev.reDerives(fact, repo.A as Hash)).toBe(true); // grounding holds at A
    expect(rev.reDerives(fact, repo.B as Hash)).toBe(false); // body moved at B ⇒ drifted
    // MUTANT: drop `current !== e.anchor.subtreeHash` in driftDetect and B would falsely read FRESH → flips.
  });

  it('resolveAnchorAt: returns the StructRef for a present unit, undefined for an absent path [teeth: return node regardless of key ⇒ RED]', () => {
    repo = makeAbRepo();
    const rev = createRevIndex(repo.repoPath);

    const ref = rev.resolveAnchorAt(repo.A, QP);
    expect(ref).toBeDefined();
    expect(ref!.kind).toBe('file');
    expect(ref!.qualifiedPath).toBe(QP);
    expect(String(ref!.subtreeHash).length).toBeGreaterThan(0);

    expect(rev.resolveAnchorAt(repo.A, 'does/not/exist')).toBeUndefined();
    // MUTANT: if findNode ignored `key` and returned any node, the absent path would resolve → flips.
  });

  it('memoization: an immutable rev is checked out at most once [teeth: drop the Map ⇒ RED]', () => {
    repo = makeAbRepo();
    let adds = 0;
    const countingGit = (r: string, args: readonly string[]): string => {
      if (args[0] === 'worktree' && args[1] === 'add') adds += 1;
      return g(r, args);
    };
    const rev = createRevIndex(repo.repoPath, { runGit: countingGit });

    rev.axesAt(repo.A);
    rev.axesAt(repo.A); // memoized — no second checkout
    rev.resolveAnchorAt(repo.A, QP); // rides the cache
    rev.reDerives(advisoryAt(QP, rev.resolveAnchorAt(repo.A, QP)!.subtreeHash), repo.A as Hash);
    expect(adds).toBe(1);
    // MUTANT: remove the `cache` Map and every call re-checks-out → adds > 1 → flips.
  });

  it('totality: a bad rev does not throw and leaves the repo pristine [teeth: drop cleanup ⇒ RED]', () => {
    repo = makeAbRepo();
    const rev = createRevIndex(repo.repoPath);

    // A bad/unknown rev is fail-closed: empty snapshot, no throw; no anchor resolves; reDerives false.
    expect(() => rev.axesAt('deadbeef-not-a-rev')).not.toThrow();
    expect(rev.resolveAnchorAt('deadbeef-not-a-rev', QP)).toBeUndefined();
    expect(rev.reDerives(advisoryAt(QP, rev.resolveAnchorAt(repo.A, QP)!.subtreeHash), 'deadbeef' as Hash)).toBe(false);

    // And several good builds leave ZERO leftover worktrees — the target repo is pristine.
    rev.axesAt(repo.A);
    rev.axesAt(repo.B);
    const worktrees = execFileSync('git', ['worktree', 'list'], { cwd: repo.repoPath, encoding: 'utf8' })
      .split('\n')
      .filter((l) => l.length > 0);
    expect(worktrees).toHaveLength(1); // only the main worktree
    // MUTANT: drop the WHOLE `finally` cleanup block and stale worktrees pile up → length > 1 → flips.
    // (Verified: the three steps — worktree remove / rmSync / worktree prune — are redundant nets, so
    // dropping any ONE alone still cleans; the tooth bites on removing the entire block.)
  });
});
