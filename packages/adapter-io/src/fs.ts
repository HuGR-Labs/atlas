// @atlas/adapter-io — src/fs.ts  (ADAPT-FS-1: the faithful filesystem walk)
//
// The raw fs adapter: walk a repo path into the frozen `FileTree` (@atlas/index) along the spatial rail
// repo→crate→module→file→item→block. SKELETON — signature frozen, body deferred to the ADAPT-FS WP.

import type { FileTree } from '@atlas/index';

/** Walk a real repo into the frozen `FileTree` (leaf `content` = the bytes normalized into subtreeHash). */
export function walkFileTree(repoPath: string): FileTree {
  void repoPath;
  throw new Error('unimplemented: ADAPT-FS-1 — faithful FileTree walk');
}
