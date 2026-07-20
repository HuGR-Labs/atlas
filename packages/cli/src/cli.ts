// @atlas/cli — src/cli.ts  (CLI-1/2: the `atlas` entrypoint)
//
// The argv → outcome entrypoint: parse the command TOTALLY (never a throw), route it through the ONE wired
// handler (@atlas/adapter-io), render the verdict deterministically, and return a process exit code. The
// handler is assembled LAZILY (only after a successful, non-`mine` parse) so `main([])` — the `bin.ts`
// smoke path — returns a structured error WITHOUT touching the (WIRE-deferred) assembler.

import type { WiredHandler } from '@atlas/adapter-io';
import type { DoctorSource, Guidance, Tool, Verdict } from '@atlas/tools';
import { runDoctor } from './doctor.js';
import { COMMAND_LEG } from './map.js';
import { parse } from './parse.js';
import { renderVerdict } from './render.js';

/** Optional dependency injection seam (additive): tests inject a FAKE `WiredHandler` + a FAKE read-only
 *  `DoctorSource`; prod assembles both at the composition-root WP. */
export interface CliDeps {
  readonly handler?: WiredHandler;
  readonly doctorSource?: DoctorSource;
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

  if (command === 'doctor') {
    // CLI-1a: `doctor` sub-dispatches to the four read/advisory `DoctorApi` legs over the INJECTED read-only
    // `DoctorSource` — it NEVER touches `deps.handler` (opens no write door; carries no write authority).
    // Fails closed (no source / unknown subcommand) with guidance + non-zero exit, never a throw.
    const dv = runDoctor(positionals, deps.doctorSource);
    process.stdout.write(dv.stdout);
    return dv.exitCode;
  }

  // The remaining four governance commands each route to a `Tool` through the one wired handler.
  const tool = COMMAND_LEG[command] as Tool;
  // The handler is INJECTED (dependency-inverted). Building the real one needs a fully-composed
  // `WireConfig` — including the adapter-less `seams` (heuristic/gate/classifier/driftFacts/resolveAnchorAt)
  // that WIRE-1 does NOT construct; assembling those from the core factories + the disk store is the runtime
  // composition-root WP. Until it lands, the production entrypoint fails closed WITH guidance rather than
  // constructing an incomplete config; tests (and the composition root) inject `deps.handler`.
  if (!deps.handler) {
    return emit(
      errorVerdict('atlas runtime is not composed yet — the WireConfig seams need the composition-root WP'),
    );
  }
  const verdict = deps.handler.handle(tool, { positionals, flags });
  return emit(verdict);
}

/** Render a verdict, write its stdout, and return its exit code. */
function emit(verdict: Verdict): number {
  const rendered = renderVerdict(verdict);
  process.stdout.write(rendered.stdout);
  return rendered.exitCode;
}
