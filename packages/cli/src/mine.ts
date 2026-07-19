// @atlas/cli — src/mine.ts  (CLI-4: drive the genesis bootstrap from the CLI)
//
// Drive the frozen genesis run-controller (@atlas/genesis) over a repo and project the outcome to a
// `CliVerdict`. SKELETON — signature frozen, body deferred to the CLI WP. The genesis import pins the edge.

import { makeRunController } from '@atlas/genesis';
import type { CliVerdict } from './render.js';

/** Run the one-time genesis bootstrap over a repo, projecting the outcome to a `CliVerdict` (CLI-4). */
export async function runMine(repoPath: string): Promise<CliVerdict> {
  void repoPath;
  void makeRunController;
  throw new Error('unimplemented: CLI-4 — drive the genesis run-controller');
}
