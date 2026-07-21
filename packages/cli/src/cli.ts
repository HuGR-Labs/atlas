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
import { marshalArgs } from './marshal.js';
import { runMine } from './mine.js';
import { parse } from './parse.js';
import { renderVerdict } from './render.js';
import type { CliVerdict } from './render.js';

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
    // CLI-4: `mine` drives the FROZEN genesis run-controller (`runMine`) over the repo at cwd as ONE governed
    // pass, projecting the outcome to a `CliVerdict`. It routes NOT through `deps.handler` (genesis is its own
    // composed driver, mine.ts) but its rendered `CliVerdict` reaches the console over the SAME emit/exit path
    // as every other command (uniform bytes). Every mined write is CANDIDATE-only (GEN-4/12); never throws.
    return emitCli(await runMine(process.cwd()));
  }

  if (command === 'doctor') {
    // CLI-1a: `doctor` sub-dispatches to the four read/advisory `DoctorApi` legs over the INJECTED read-only
    // `DoctorSource` — it NEVER touches `deps.handler` (opens no write door; carries no write authority).
    // Fails closed (no source / unknown subcommand) with guidance + non-zero exit, never a throw.
    const dv = runDoctor(positionals, deps.doctorSource);
    process.stdout.write(dv.stdout);
    return dv.exitCode;
  }

  if (command === 'node') {
    // N6/TOOLS-10: `atlas node <addr>` — the READ-ONLY per-node door. It resolves a node by its CONTENT
    // ADDRESS through the ONE wired handler's `resolveNode` over the injected read-only `NodeSource`; it opens
    // NO write door (writes still funnel through `atlas-emit`, TOOLS-1). Rendered through the SAME shared
    // `renderVerdict` path (exit 0 on a hit carrying the `GroundedFact`; a structured `error` + exit 1 on a
    // miss / an uncomposed runtime). Never a throw — the handler's `resolveNode` is total (TOOLS-2).
    if (!deps.handler) {
      return emit(
        errorVerdict('atlas runtime is not composed yet — the WireConfig seams need the composition-root WP'),
      );
    }
    const addr = positionals[0] as Parameters<WiredHandler['resolveNode']>[0];
    return emit(deps.handler.resolveNode(addr, 'cli'));
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
  // ARG-MARSHALLING: map the parsed positionals/flags to the NAMED arg shape THIS command's leg reads
  // (init→{path}, query→{scope}, emit→{node,at}, reconcile→{mergeBase,options}). Without it every routed
  // command fails closed with "malformed args". TOTAL: a missing --at / unreadable emit fact file → a
  // structured error + guidance + non-zero exit, never a throw (CLI-1b).
  const marshalled = marshalArgs(command, positionals, flags);
  if (!marshalled.ok) {
    return emit(errorVerdict(marshalled.error));
  }
  const verdict = deps.handler.handle(tool, marshalled.args);
  return emit(verdict);
}

/** The ONE process-outcome path: write a `CliVerdict`'s stdout and return its exit code (uniform bytes —
 *  every command's outcome, whether a rendered handler `Verdict` or a `mine`/`doctor` `CliVerdict`, exits
 *  through here). */
function emitCli(cv: CliVerdict): number {
  process.stdout.write(cv.stdout);
  return cv.exitCode;
}

/** Render a verdict to a `CliVerdict`, then emit it over the one process-outcome path. */
function emit(verdict: Verdict): number {
  return emitCli(renderVerdict(verdict));
}
