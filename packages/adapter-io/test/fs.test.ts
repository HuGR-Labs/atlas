// @atlas/adapter-io — test/fs.test.ts   (WP-9.1.1-b.FS — EPIC-1-b, REQ-ADAPTER-1a/1b/1c/1d)
//
// Acceptance suite for the faithful filesystem walker `walkFileTree` (ADAPT-FS-1). It transcribes the four
// frozen goldens (docs/requirements/goldens-adapters.md) VERBATIM against the SHARED fix-repo harness
// (test/harness/fix-repo.ts — CONSUMED, never redefined):
//   • SCN-ADAPTER-1a-1 — the walk equals the reference tree, .gitignore honored          (happy)
//   • SCN-ADAPTER-1b-1 — a tracked file with no indexer is still in the tree             (guard)
//   • SCN-ADAPTER-1c-1 — no fabricated path is emitted                                   (guard)
//   • SCN-ADAPTER-1d-1 — two walks of the same tree are byte-identical                   (happy)

import { describe, it, expect, afterEach } from 'vitest';
import type { FileTree } from '@atlas/index';
import { walkFileTree } from '../src/fs.js';
import { makeFixRepo, T_ref } from './harness/fix-repo.js';
import type { FixRepo } from './harness/fix-repo.js';

let repo: FixRepo | undefined;
afterEach(() => {
  repo?.cleanup();
  repo = undefined;
});

/** Flatten every node's `path` in the tree — for phantom/presence assertions. */
function allPaths(node: FileTree, acc: string[] = []): string[] {
  acc.push(node.path);
  for (const child of node.children) allPaths(child, acc);
  return acc;
}

/** Find the first node whose `path` matches, or `undefined`. */
function findNode(node: FileTree, path: string): FileTree | undefined {
  if (node.path === path) return node;
  for (const child of node.children) {
    const hit = findNode(child, path);
    if (hit) return hit;
  }
  return undefined;
}

describe('walkFileTree — ADAPT-FS-1 faithful .gitignore-honoring FileTree walk', () => {
  it('SCN-ADAPTER-1a-1 — the walk equals the reference tree, .gitignore honored (happy)', () => {
    repo = makeFixRepo();
    const walk = walkFileTree(repo.repoPath);
    // exact paths·nesting·leaf `content` in the deterministic order
    expect(walk).toStrictEqual(T_ref);
    // dist/bundle.js + debug.log are absent (gitignored)
    const paths = allPaths(walk);
    expect(paths).not.toContain('dist/bundle.js');
    expect(paths).not.toContain('debug.log');
  });

  it('SCN-ADAPTER-1b-1 — a tracked file with no indexer is still in the tree (guard)', () => {
    repo = makeFixRepo();
    const walk = walkFileTree(repo.repoPath);
    const node = findNode(walk, 'legacy/report.rb');
    expect(node).toBeDefined();
    expect(node!.children).toStrictEqual([]);
    expect(node!.content).toBe("def report\n  'legacy'\nend\n");
  });

  it('SCN-ADAPTER-1c-1 — no fabricated path is emitted (guard)', () => {
    repo = makeFixRepo();
    const walk = walkFileTree(repo.repoPath);
    const paths = allPaths(walk);
    expect(paths).not.toContain('dist/bundle.js');
    expect(paths).not.toContain('src/generated.ts');
  });

  it('SCN-ADAPTER-1d-1 — two walks of the same tree are byte-identical (happy)', () => {
    repo = makeFixRepo();
    const w1 = walkFileTree(repo.repoPath);
    const w2 = walkFileTree(repo.repoPath);
    expect(JSON.stringify(w1)).toBe(JSON.stringify(w2));
  });
});
