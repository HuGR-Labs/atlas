// @atlas/cli — src/cli.ts  (CLI-1/2: the `atlas` entrypoint)
//
// The argv → outcome entrypoint: parse the command, assemble the one wired handler (@atlas/wire), route,
// and render. SKELETON — signature frozen, body deferred to the CLI WP. The wire import pins the edge.

import { assembleHandler } from '@atlas/wire';

/** The `atlas` entrypoint: parse argv, route through the one wired handler, return a process exit code. */
export async function main(argv: string[]): Promise<number> {
  void argv;
  void assembleHandler;
  throw new Error('unimplemented: CLI-1 — the atlas argv entrypoint');
}
