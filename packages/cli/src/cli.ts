// @atlas/cli — src/cli.ts  (CLI-1/2: the `atlas` entrypoint)
//
// The argv → outcome entrypoint: parse the command TOTALLY (never a throw), route it through the ONE wired
// handler (@atlas/adapter-io), render the verdict deterministically, and return a process exit code. The
// handler is assembled LAZILY (only after a successful, non-`mine` parse) so `main([])` — the `bin.ts`
// smoke path — returns a structured error WITHOUT touching the (WIRE-deferred) assembler.

import { assembleHandler } from '@atlas/adapter-io';
import type { WiredHandler } from '@atlas/adapter-io';
import type { Guidance, Tool, Verdict } from '@atlas/tools';
import { COMMAND_LEG } from './map.js';
import { parse } from './parse.js';
import { renderVerdict } from './render.js';

/** Optional dependency injection seam (additive): tests inject a FAKE `WiredHandler`; prod assembles it. */
export interface CliDeps {
  readonly handler?: WiredHandler;
}

/** A structured error verdict for a CLI-layer failure (parse / unwired command) — guidance always present. */
function errorVerdict(message: string): Verdict {
  const guidance: Guidance = {
    next: message,
    invariant: 'CLI-1b: a malformed invocation yields a structured error + guidance + non-zero exit, never a crash',
  };
  return { ok: false, rejected: message, guidance };
}

/**
 * The `atlas` entrypoint: parse argv, route through the one wired handler, return a process exit code.
 * TOTAL — a malformed invocation renders a structured non-zero error, never a throw / `process.exit`.
 */
export async function main(argv: string[], deps: CliDeps = {}): Promise<number> {
  const parsed = parse(argv);
  if (!parsed.ok) {
    return emit(errorVerdict(parsed.error));
  }

  const { command, positionals, flags } = parsed;

  if (command === 'mine') {
    // CLI-1a: `mine` is in the map for TOTALITY only — its genesis driver is a separate WP (WP-9.3.6-b.CLI).
    // Fail closed at this seam, never throw.
    return emit(errorVerdict("command 'mine' is not wired at this CLI seam — see WP-9.3.6-b.CLI"));
  }

  // The remaining five commands each route to a governance `Tool` (doctor → atlas-query read path).
  const tool = COMMAND_LEG[command] as Tool;
  const handler: WiredHandler =
    deps.handler ?? assembleHandler({ repoPath: process.cwd(), casPath: '.atlas/cas' });
  const verdict = handler.handle(tool, { positionals, flags });
  return emit(verdict);
}

/** Render a verdict, write its stdout, and return its exit code. */
function emit(verdict: Verdict): number {
  const rendered = renderVerdict(verdict);
  process.stdout.write(rendered.stdout);
  return rendered.exitCode;
}
