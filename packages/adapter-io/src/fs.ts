// @atlas/adapter-io — src/fs.ts  (ADAPT-FS-1: the faithful filesystem walk)
//
// The raw fs adapter: walk a repo path into the frozen `FileTree` (@atlas/index) along the spatial rail
// repo→crate→module→file→item→block. SKELETON — signature frozen, body deferred to the ADAPT-FS WP.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FileTree } from '@atlas/index';
import { runGit } from './run-git.js';

// A mutable directory node under construction: an ordered map from the next path segment to either a
// nested directory builder or a materialized file leaf. Directories are keyed so siblings stay unique;
// order is imposed at the end by an ASCII sort on `path`, matching `T_ref`.
interface DirBuild {
  readonly path: string;
  readonly dirs: Map<string, DirBuild>;
  readonly files: FileTree[];
}

const newDir = (path: string): DirBuild => ({ path, dirs: new Map(), files: [] });

/**
 * Walk a real repo into the frozen `FileTree` (ADAPT-FS-1). The tracked set is derived from
 * `git ls-files` run in `repoPath` — which honors `.gitignore` by construction (ignored/untracked paths
 * are never listed), so no ignore parser is needed and no gitignored path can leak in. Each tracked
 * file's working-tree bytes become its leaf `content`; the paths are assembled into the nested
 * `FileTree` (root `path: '.'`; directory nodes carry `children` and no `content`; files are leaves with
 * `children: []`). Sibling order is ASCII sort by `path`. Every value derives purely from git-tracked
 * bytes — no wall-clock, nonce, or counter on any node, so two walks are byte-identical.
 */
export function walkFileTree(repoPath: string): FileTree {
  // Fail CLOSED at the composition boot path (compose.ts `composeRuntime`, wire.ts `assembleHandler`):
  // `git ls-files` exits 128 in a NON-git dir (and the shared `runGit` seam THROWS on a non-zero exit / when
  // git is absent). An unguarded throw would propagate uncaught out of both the `atlas`/`atlas-mcp` bins at boot
  // (raw stack trace). Degrade to the EMPTY tracked set — the SAME structural view as an empty repo — never
  // a throw. The valid-git-repo happy path is byte-identical (only the throwing paths are absorbed). Same
  // no-shell git seam + `try {} catch {}` idiom as `gitUserEmail`/`readScipOrEmpty`.
  const tracked = gitLsFiles(repoPath);

  const root = newDir('.');
  for (const rel of tracked) {
    const segments = rel.split('/');
    let node = root;
    // Walk/create the directory chain (all but the final segment).
    for (let i = 0; i < segments.length - 1; i++) {
      const dirPath = segments.slice(0, i + 1).join('/');
      let next = node.dirs.get(dirPath);
      if (next === undefined) {
        next = newDir(dirPath);
        node.dirs.set(dirPath, next);
      }
      node = next;
    }
    // The final segment is the file leaf; `rel` (POSIX) is already the repo-relative path. A path listed by
    // `git ls-files` but UNREADABLE in the working tree (tracked-but-deleted ⇒ ENOENT, or permission) must
    // NOT crash boot: SKIP it so the walk stays TOTAL. A readable tracked file is byte-identical.
    const content = readFileOrSkip(join(repoPath, rel));
    if (content === undefined) continue;
    node.files.push({ path: rel, children: [], content });
  }

  return freeze(root);
}

/**
 * The NUL-delimited git-tracked path set at `repoPath`, or `[]`. TOTAL — never throws: a non-git dir (git
 * exit 128), git absent, or ANY `execFileSync` failure ⇒ `[]` (fail-closed to the empty index). NUL-delimited
 * so paths with spaces/newlines survive; the trailing empty segment is dropped.
 */
function gitLsFiles(repoPath: string): string[] {
  try {
    const out = runGit(repoPath, ['ls-files', '-z']);
    return out.split('\0').filter((p) => p.length > 0);
  } catch {
    return [];
  }
}

/** The working-tree bytes at `abs`, or `undefined` when unreadable (deleted/permission) — never throws. */
function readFileOrSkip(abs: string): string | undefined {
  try {
    return readFileSync(abs, 'utf8');
  } catch {
    return undefined;
  }
}

/** Materialize a `DirBuild` into an immutable `FileTree`, with siblings ASCII-sorted by `path`. */
function freeze(node: DirBuild): FileTree {
  const children: FileTree[] = [
    ...node.files,
    ...[...node.dirs.values()].map(freeze),
  ].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { path: node.path, children };
}
