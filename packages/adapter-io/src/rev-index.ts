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
// `walkFileTree`, `foldAstUnits`, and `driftDetect` are the FROZEN ingredients — consumed, never
// reimplemented. `foldAstUnits` is applied BEFORE `build` (the SAME transform composeRuntime/assembleHandler
// apply at compose time), so the arbitrary-rev index carries the very `::` sub-file symbol nodes a grounded
// fact is authored against — otherwise a symbol/file anchor's recorded (folded) `subtreeHash` could never
// re-derive at a rev, and the drift oracle would diverge from the index the truth-gate accepted the fact on.
// It is warmup-gated (a no-op until `initAst()` is awaited — the entrypoint bins do this once), so a caller
// that never warms the grammar sees the identical file/dir-only snapshot as before.

import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '@atlas/index';
import type { Axes, IndexNode } from '@atlas/index';
import { driftDetect } from '@atlas/grounding';
import type { Hash, StructRef } from '@atlas/contracts';
import type { GroundedFact } from '@atlas/knowledge';
import { foldAstUnits } from './ast.js';
import { walkFileTree } from './fs.js';
import {
  runGit as gitExec,
  isDeterministicGitError,
  gitYieldMs,
  GIT_BACKOFF_MS,
  GIT_MAX_ATTEMPTS,
} from './run-git.js';

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
  /** The `StructRef` of the FIRST unit in `axesAt(rev)` whose `subtreeHash` equals `subtreeHash`, or
   *  `undefined` if that exact CONTENT no longer resolves ANYWHERE in the rev — the re-derivability oracle
   *  keyed on the drift oracle (`subtreeHash`, GROUND-1), NOT on the anchor's `qualifiedPath`. A moved
   *  anchor whose content survives at a NEW path re-derives here (⇒ mechanical, re-groundable to that path);
   *  content that genuinely changed/vanished does not (⇒ semantic). Total: never throws. */
  resolveBySubtreeAt(rev: string, subtreeHash: string): StructRef | undefined;
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

/** Resolve the FIRST `IndexNode` (preorder) whose `subtreeHash` equals `hash` — the content-addressed dual
 *  of `findNode` (keys on the drift oracle, not the path). Total: an absent content returns `undefined`. */
function findBySubtree(node: IndexNode, hash: string): IndexNode | undefined {
  if (String(node.subtreeHash) === hash) return node;
  for (const child of node.children) {
    const hit = findBySubtree(child, hash);
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
 * happy and error paths (`attemptBuild`'s `finally`: `worktree remove --force` + `rmSync`), so the target
 * repo is left pristine. A checkout that FAILS is CLASSIFIED (rev-index.ts): a deterministic bad rev is
 * genuine-empty at once, while a transient `git worktree` lock is retried a bounded number of times — so
 * concurrent-reconcile contention can no longer masquerade as a genuinely-empty rev (finding #73).
 */
export function createRevIndex(repoPath: string, deps: RevIndexDeps = {}): RevIndex {
  const runGit = deps.runGit ?? gitExec;
  const cache = new Map<string, Axes>();
  const base = join(tmpdir(), 'atlas-revcache');
  let seq = 0;

  /** A fresh, non-pre-existing worktree path (git creates the leaf dir; a colliding leaf would make
   *  `worktree add` fail). Pid-scoped + a monotonic counter — deterministic per process, off the identity
   *  path (it never enters the built `Axes`). */
  const nextDir = (): string => join(base, `${process.pid}-${seq++}`);

  /** One checkout+build attempt in a FRESH throwaway worktree, torn down per-attempt (so a half-created
   *  worktree from a failed attempt can never wedge the next). Returns the built `Axes` on success; RE-THROWS
   *  the git/build error to the retry loop, which classifies it. The teardown is `worktree remove` + `rmSync`
   *  only — no per-call `git worktree prune` (that rewrites the SHARED `.git/worktrees` admin state and is a
   *  contention AMPLIFIER against concurrent `worktree add`s; remove+rmSync already leave the repo pristine). */
  function attemptBuild(rev: string, dir: string): Axes {
    try {
      // Detach the rev into the throwaway worktree; a bad/unknown rev OR a transient lock makes this throw.
      runGit(repoPath, ['worktree', 'add', '--detach', dir, rev]);
      // Fold sub-file AST units BEFORE `build` — the SAME transform compose-time uses (compose.ts) — so this
      // rev's index carries the `::` symbol nodes a fact is grounded against. Warmup-gated no-op otherwise.
      return build(foldAstUnits(walkFileTree(dir)), { documents: [] });
    } finally {
      // Tear down this attempt's worktree unconditionally so the repo stays pristine — each step guarded.
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
    }
  }

  function axesAt(rev: string): Axes {
    const cached = cache.get(rev);
    if (cached !== undefined) return cached;

    mkdirSync(base, { recursive: true });

    // A bad rev fails deterministically (fast EMPTY, no retry); a TRANSIENT `git worktree` lock — many
    // concurrent reconcile/doctor subprocesses racing the shared `.git/worktrees` admin area — clears after a
    // brief clock-free yield, so it is RETRIED a BOUNDED number of times. Only a retries-EXHAUSTED transient
    // (or an unclassified error that never clears) falls through to EMPTY_AXES — a real transient never
    // masquerades as a genuinely-empty rev (finding #73: that masquerade silently dropped drift).
    for (let attempt = 0; attempt < GIT_MAX_ATTEMPTS; attempt++) {
      try {
        const axes = attemptBuild(rev, nextDir());
        cache.set(rev, axes); // memoize the immutable rev's Axes (NOT the worktree)
        return axes;
      } catch (err) {
        // DETERMINISTIC bad rev ⇒ genuine empty, immediately (retrying a bad rev only wastes latency). The
        // classifier is the shared run-git.ts one (superset of the former local BAD_REV_RE; same result).
        if (isDeterministicGitError(err)) return EMPTY_AXES;
        // Transient/lock/unclassified ⇒ yield briefly (clock-free) and retry, unless attempts are exhausted.
        if (attempt < GIT_MAX_ATTEMPTS - 1)
          gitYieldMs(GIT_BACKOFF_MS[attempt] ?? GIT_BACKOFF_MS[GIT_BACKOFF_MS.length - 1]!);
      }
    }
    return EMPTY_AXES; // fail-closed: a transient that never cleared within the bounded attempts ⇒ empty
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

  function resolveBySubtreeAt(rev: string, subtreeHash: string): StructRef | undefined {
    const axes = axesAt(rev);
    for (const root of [axes.spatial, axes.territory, axes.dependency]) {
      const node = findBySubtree(root, subtreeHash);
      if (node !== undefined) {
        return { kind: kindOf(node), qualifiedPath: node.key, subtreeHash: node.subtreeHash };
      }
    }
    return undefined;
  }

  function reDerives(fact: GroundedFact, newSha: Hash): boolean {
    return driftDetect(fact.grounding, axesAt(String(newSha))) === 'FRESH';
  }

  return { axesAt, resolveAnchorAt, resolveBySubtreeAt, reDerives };
}
