// @atlas/adapter-io — src/rev-index.ts  (COMPOSE-C: the arbitrary-rev code index)
//
// The standalone capability `atlas-reconcile` needs to detect REAL drift: build the code-index `Axes` at
// an ARBITRARY git rev (not just HEAD). A rev is immutable, so the built `Axes` is MEMOIZED by rev — one
// checkout per rev, reused by every repeated call + concurrent reconcile. Each build runs in a TEMPORARY
// detached git worktree that is torn down immediately (the cache holds the `Axes`, never the worktree), so
// the target repo is always left pristine. Every method is TOTAL + deterministic: a bad/unknown rev, a
// checkout failure, or an absent path yields `undefined`/`false`/an empty snapshot — NEVER a throw; no
// clock, no random (the temp-path counter is pid-scoped, off the identity path). Wiring into the
// composition root is a SEPARATE step (this file exports the capability only).
//
// All git I/O flows through one seam (`execFileSync` — NO shell), mirroring git-history.ts. `build`,
// `walkFileTree`, and `driftDetect` are the FROZEN ingredients — consumed, never reimplemented.

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '@atlas/index';
import type { Axes, IndexNode } from '@atlas/index';
import { driftDetect } from '@atlas/grounding';
import type { Hash, StructRef } from '@atlas/contracts';
import type { GroundedFact } from '@atlas/knowledge';
import { walkFileTree } from './fs.js';

/** The arbitrary-rev code-index capability. `axesAt` builds (once, memoized) the index at a rev; the two
 *  derived readers ride on it — `resolveAnchorAt` re-derives a grounding anchor's `StructRef` at that rev,
 *  and `reDerives` is the drift oracle `driftDetect` evaluated against that rev's snapshot. */
export interface RevIndex {
  /** The built `Axes` at `rev` (via a temp detached worktree), memoized — a rev is immutable so it is
   *  built at most once. A bad/unknown rev or checkout failure returns an empty snapshot, never throws. */
  axesAt(rev: string): Axes;
  /** The `StructRef` for `qp` in `axesAt(rev)` (kind/qualifiedPath/subtreeHash), or `undefined` if `qp`
   *  is not a structural unit in that rev's tree. Mirrors grounding's `resolveCurrent` (drift.ts): a node
   *  is keyed by `IndexNode.key` (= the FileTree path). Total: never throws. */
  resolveAnchorAt(rev: string, qp: string): StructRef | undefined;
  /** Does `fact`'s grounding still hold at `newSha` — `driftDetect(fact.grounding, axesAt(newSha))` is
   *  `FRESH`. `false` on any drift, an absent unit, or a bad `newSha` (fail-closed, never throws). */
  reDerives(fact: GroundedFact, newSha: Hash): boolean;
}

/**
 * Optional dependency seam (testability). The frozen surface is `createRevIndex(repoPath): RevIndex`; this
 * second param is OPTIONAL with a default, so single-arg callers are unaffected (the same arity-widening
 * precedent as git-history.ts). `runGit` is the repo-scoped git runner used for the worktree lifecycle —
 * injected only so a test can COUNT checkouts (memo golden). `walkFileTree`'s own internal git (run inside
 * the temp worktree) is NOT routed through here — it is a frozen dependency, consumed as-is.
 */
export interface RevIndexDeps {
  readonly runGit?: (repo: string, args: readonly string[]) => string;
}

/** The one git seam — `execFileSync`, NO shell (mirrors git-history.ts's `git`). `stdin` is closed and
 *  `stderr` is CAPTURED (not inherited) so git's benign worktree progress ("Preparing worktree…") never
 *  leaks to the parent process's stderr during `atlas reconcile`. Capturing (not `'ignore'`) preserves
 *  failure surfacing: on a non-zero exit `execFileSync` still THROWS, and the thrown error carries the
 *  captured stderr on `.stderr` — a real git failure is diagnosable, never silently swallowed. */
const realGit = (repo: string, args: readonly string[]): string =>
  execFileSync('git', args as string[], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** The deterministic empty snapshot returned on any checkout/build failure (fail-closed totality). Built
 *  once from an empty tree — `build` is deterministic, so this is a stable, side-effect-free sentinel: no
 *  real file-path anchor resolves in it, so `driftDetect` against it is DRIFTED (⇒ `reDerives` false). */
const EMPTY_AXES: Axes = build({ path: '.', children: [] }, { documents: [] });

/** Resolve the `IndexNode` whose key is `qp`, across the three axes — the SAME traversal grounding's
 *  `resolveCurrent`/`findByKey` (drift.ts) uses, so `resolveAnchorAt` and `reDerives` agree by construction.
 *  Total: an absent unit returns `undefined`, never a throw. */
function findNode(node: IndexNode, key: string): IndexNode | undefined {
  if (node.key === key) return node;
  for (const child of node.children) {
    const hit = findNode(child, key);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/** Classify a resolved node into a `StructRef.kind`. The build's `IndexNode.level` is DEPTH-based
 *  (repo→crate→module→file→…), so it is NOT a reliable `kind` source; the structural shape is. The root is
 *  the `repo`; a leaf spatial/territory node is a `file`; any interior unit is a `block`. `kind` is NEVER
 *  the drift oracle (that is `subtreeHash` alone, GROUND-1) — it is descriptive metadata only. */
function kindOf(node: IndexNode): StructRef['kind'] {
  if (node.key === '.') return 'repo';
  return node.children.length === 0 ? 'file' : 'block';
}

/**
 * Construct the arbitrary-rev code-index capability over `repoPath` (COMPOSE-C).
 *
 * `axesAt(rev)` checks the rev out into a throwaway detached worktree under the OS temp dir, runs the
 * frozen `build(walkFileTree(dir), { documents: [] })`, then tears the worktree down — memoizing the
 * resulting `Axes` by rev (build-once for an immutable rev). Every temp worktree is removed on BOTH the
 * happy and error paths (`finally`), and `git worktree prune` reaps any stale admin entry, so the target
 * repo is left pristine.
 */
export function createRevIndex(repoPath: string, deps: RevIndexDeps = {}): RevIndex {
  const runGit = deps.runGit ?? realGit;
  const cache = new Map<string, Axes>();
  const base = join(tmpdir(), 'atlas-revcache');
  let seq = 0;

  /** A fresh, non-pre-existing worktree path (git creates the leaf dir; a colliding leaf would make
   *  `worktree add` fail). Pid-scoped + a monotonic counter — deterministic per process, off the identity
   *  path (it never enters the built `Axes`). */
  const nextDir = (): string => join(base, `${process.pid}-${seq++}`);

  function axesAt(rev: string): Axes {
    const cached = cache.get(rev);
    if (cached !== undefined) return cached;

    mkdirSync(base, { recursive: true });
    const dir = nextDir();
    try {
      // Detach the rev into the throwaway worktree; a bad/unknown rev makes this throw → caught below.
      runGit(repoPath, ['worktree', 'add', '--detach', dir, rev]);
      const axes = build(walkFileTree(dir), { documents: [] });
      cache.set(rev, axes); // memoize the immutable rev's Axes (NOT the worktree)
      return axes;
    } catch {
      return EMPTY_AXES; // fail-closed: bad rev / checkout / build failure ⇒ empty snapshot, never a throw
    } finally {
      // Tear down unconditionally so the repo stays pristine — each step is independently guarded.
      try {
        runGit(repoPath, ['worktree', 'remove', '--force', dir]);
      } catch {
        /* not a registered worktree (add failed) — ignore */
      }
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* dir may never have been created — ignore */
      }
      try {
        runGit(repoPath, ['worktree', 'prune']);
      } catch {
        /* prune is best-effort — ignore */
      }
    }
  }

  function resolveAnchorAt(rev: string, qp: string): StructRef | undefined {
    const axes = axesAt(rev);
    for (const root of [axes.spatial, axes.territory, axes.dependency]) {
      const node = findNode(root, qp);
      if (node !== undefined) {
        return { kind: kindOf(node), qualifiedPath: node.key, subtreeHash: node.subtreeHash };
      }
    }
    return undefined;
  }

  function reDerives(fact: GroundedFact, newSha: Hash): boolean {
    return driftDetect(fact.grounding, axesAt(String(newSha))) === 'FRESH';
  }

  return { axesAt, resolveAnchorAt, reDerives };
}
