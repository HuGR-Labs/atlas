// @atlas/adapter-io — src/git-history.ts  (ADAPT-GIT-1: history)
//
// The S1 mining `HistorySource` (@atlas/genesis) — real `git log`/`blame`/coupling over a rev, feeding
// ranking only (GEN-6: it MINTS NO FACT — this file imports NO store/upsert seam). Every emitted LIST is
// CANONICALLY SORTED (never git-output / Map-insertion order) so a fixed rev yields byte-identical signals.

import { execFileSync } from 'node:child_process';
import type { StructRef } from '@atlas/contracts';
import type { HistorySource, MinedSignals } from '@atlas/genesis';
import { asSubtreeHash, id } from '@atlas/kernel';

/** All git I/O flows through this one seam (execFileSync — no shell). */
const git = (repo: string, args: readonly string[]): string =>
  execFileSync('git', args as string[], { cwd: repo, encoding: 'utf8' });

/** Non-empty output lines (git pads a trailing newline; `--format=` emits blank separators). */
const nonEmpty = (out: string): string[] => out.split('\n').filter((l) => l.length > 0);

/** The single canonical string order used for every emitted list (determinism / SCN-8b). */
const byPath = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * A `file` StructRef for a tracked path. `subtreeHash` is synthesised through the sealed-kernel
 * `id({ file })` seam (the SAME path→node keying `@atlas/index` build uses, index-adapter.ts:17). The
 * isolated ADAPTER goldens (8a/8b/8c) do NOT require index correspondence; the mine-driver integration
 * (out of scope for this WP) does — this is the honest content-addressed placeholder until then.
 */
const fileRef = (qualifiedPath: string): StructRef => ({
  kind: 'file',
  qualifiedPath,
  subtreeHash: asSubtreeHash(id({ file: qualifiedPath })),
});

/**
 * Construct the S1 mining `HistorySource` at a git revision (ADAPT-GIT-1).
 *
 * Widened from `(rev)` → `(repoPath, rev)`: the factory closes over both so `signals(site)` — whose frozen
 * signature carries NEITHER repo nor rev — can shell git at the pinned rev. The `(repo, rev)`-carrying
 * methods use their own params; `signals` uses the closure. `wire.ts` / `index.ts` only symbol-reference
 * `createHistorySource` (no call site), so the arity widening breaks nothing.
 */
export function createHistorySource(repoPath: string, rev: string): HistorySource {
  /** SHAs of commits touching `qp` at `rev`, reverse-chronological (git-log order). */
  const commitsTouching = (qp: string): string[] =>
    nonEmpty(git(repoPath, ['log', '--format=%H', rev, '--', qp]));

  return {
    // rev-list count of commits reachable from rev.
    commitCount(repo, r) {
      return Number(git(repo, ['rev-list', '--count', r]).trim());
    },

    // shallow-clone probe (repository-wide; rev unused — the frozen (repo,rev) shape is honoured).
    shallow(repo, _r) {
      void _r;
      return git(repo, ['rev-parse', '--is-shallow-repository']).trim() === 'true';
    },

    // Over ALL tracked files at rev, aggregate per-commit blame attributions; return the single
    // most-attributed commit's share of total lines (0 when there are no lines). Deterministic.
    blameConcentration(repo, r) {
      const files = nonEmpty(git(repo, ['ls-tree', '-r', '--name-only', r]));
      const perCommit = new Map<string, number>();
      let total = 0;
      const header = /^([0-9a-f]{40}) \d+ \d+/; // porcelain line-block header = <sha> <orig> <final> [n]
      for (const f of files) {
        const blame = git(repo, ['blame', '--line-porcelain', r, '--', f]);
        for (const line of blame.split('\n')) {
          const sha = header.exec(line)?.[1];
          if (sha !== undefined) {
            perCommit.set(sha, (perCommit.get(sha) ?? 0) + 1);
            total += 1;
          }
        }
      }
      if (total === 0) return 0;
      const top = Math.max(...perCommit.values());
      return top / total;
    },

    // Tracked files ranked by change-frequency (commit-touch count), count desc then path asc.
    frontier(repo, r) {
      const tracked = nonEmpty(git(repo, ['ls-tree', '-r', '--name-only', r]));
      const counts = new Map<string, number>(tracked.map((f): [string, number] => [f, 0]));
      for (const f of nonEmpty(git(repo, ['log', '--format=', '--name-only', r]))) {
        const seen = counts.get(f);
        if (seen !== undefined) counts.set(f, seen + 1);
      }
      return [...counts.entries()]
        .sort(([fa, ca], [fb, cb]) => cb - ca || byPath(fa, fb))
        .map(([f]) => fileRef(f));
    },

    // The mined ranking heuristics for a site (GEN-6), scoped to the closed-over rev.
    signals(site): MinedSignals {
      const qp = site.qualifiedPath;

      // messages — commit subjects touching qp, in git-log order (deterministic at a fixed rev; NOT sorted).
      const messages = nonEmpty(git(repoPath, ['log', '--format=%s', rev, '--', qp]));

      // szzBugCommits — message-based SZZ: subjects matching /^fix/i (deterministic).
      const szzBugCommits = messages.filter((s) => /^fix/i.test(s)).length;

      // hotspot — change-frequency (churn count, complexity factor deferred to v0), --follow across renames.
      const hotspot = nonEmpty(git(repoPath, ['log', '--format=%H', '--follow', rev, '--', qp])).length;

      // owners — distinct authors of commits touching qp, sorted.
      const owners = [...new Set(nonEmpty(git(repoPath, ['log', '--format=%an', rev, '--', qp])))].sort(byPath);

      // coChanged — distinct OTHER files that appeared in the same commits as qp, sorted by path.
      // NB: `git log --name-only -- <qp>` FILTERS the file list to the pathspec (git behaviour), so the
      // co-change basket is gathered per touching-commit (full changed-file set), honouring the semantics.
      const co = new Set<string>();
      for (const sha of commitsTouching(qp)) {
        for (const f of nonEmpty(git(repoPath, ['show', '--format=', '--name-only', sha]))) {
          if (f !== qp) co.add(f);
        }
      }
      const coChanged = [...co].sort(byPath).map(fileRef);

      return { hotspot, szzBugCommits, coChanged, owners, messages };
    },
  };
}
