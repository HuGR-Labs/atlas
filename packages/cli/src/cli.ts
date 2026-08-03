// @atlas/cli — src/cli.ts  (CLI-1/2: the `atlas` entrypoint)
//
// The argv → outcome entrypoint: parse the command TOTALLY (never a throw), route it through the ONE wired
// handler (@atlas/adapter-io), render the verdict deterministically, and return a process exit code. The
// handler is assembled LAZILY (only after a successful, non-`mine` parse) so `main([])` — the `bin.ts`
// smoke path — returns a structured error WITHOUT touching the (WIRE-deferred) assembler.

import type { Hash } from '@atlas/contracts';
import { asHash } from '@atlas/kernel';
import { headSha } from '@atlas/adapter-io';
import type { PromoteOut, WiredHandler } from '@atlas/adapter-io';
import type { DoctorSource, Guidance, Tool, Verdict } from '@atlas/tools';
import { runDoctor } from './doctor.js';
import { ensureAtlasIgnored } from './gitignore.js';
import { COMMAND_LEG } from './map.js';
import { marshalArgs } from './marshal.js';
import { runMine } from './mine.js';
import { runPromote } from './promote.js';
import { parse } from './parse.js';
import { renderRefusal, renderVerdict } from './render.js';
import type { CliVerdict } from './render.js';

/** Optional dependency injection seam (additive): tests inject a FAKE `WiredHandler` + a FAKE read-only
 *  `DoctorSource`; prod assembles both at the composition-root WP. */
export interface CliDeps {
  readonly handler?: WiredHandler;
  readonly doctorSource?: DoctorSource;
  /**
   * The PROVENANCE refusal for the composed runtime's durable store, or absent when it is trustworthy
   * (`@atlas/adapter-io` `readProvenanceRefusal`). PRESENT means `.atlas/` is TRACKED BY GIT — it arrived by
   * COMMIT rather than through a governed door — so nothing in it can be shown to have passed a gate.
   *
   * It is rendered HERE, before dispatch, for a reason the leg-level guards cannot cover: `doctor`
   * sub-dispatches to `DoctorApi` without going through the handler at all. One refusal at the entrypoint
   * makes every command legible in the CLI's own prose, and gives the whole invocation ONE outcome class
   * (a governance rejection, exit 2) rather than one per dispatch route.
   *
   * [AMENDED] this used to add "…instead of through the handler's catch-all, which labels every leg throw
   * `malformed args`" — that catch-all is fixed: it now attributes each throw to the caller's arguments, a
   * door's refusal, or a fault inside Atlas (`@atlas/tools` `src/fault.ts`), and `resolveNode` is wrapped
   * too. The entrypoint refusal is kept because it is the only place that covers `doctor`, not because the
   * handler would mislabel it.
   */
  readonly readRefusal?: string;
  /**
   * The composition root's governed PROMOTION leg (`ComposedRuntime.promote`) — KNOW-8's route out of
   * staging. Injected on the SAME seam as `handler` and for the same reason: the CLI must never stand up a
   * second runtime, or the store it promotes INTO stops being the store `atlas query` reads back.
   *
   * It is NOT reached through `handler.handle`, because it is not a `Tool`: `GOVERNANCE_SURFACE` stays 5 and
   * `WRITE_PATHS` stays `{atlas-emit, atlas-link}` — ADR-0008 pre-decided that a curator door is an ordinary
   * USE of the existing emit door, not new surface. `promote` publishes through `createGovernedEmit`, the
   * very leg `atlas-emit` binds; what it does not have is a tool token to dispatch on.
   *
   * ABSENT ⇒ `atlas promote` fails closed with the same "runtime is not composed yet" guidance every other
   * routed command gives, never a silent success over nothing.
   */
  readonly promote?: (at: Hash) => PromoteOut;
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
 * A structured GOVERNANCE-REFUSAL verdict for a gate that fired at the entrypoint. Distinct from
 * {@link errorVerdict} in BOTH of the things a caller reads.
 *
 * The INVARIANT line, because `errorVerdict`'s says "a malformed invocation" — and this invocation was not
 * malformed. Stamping the usage-error invariant on a governance refusal is the same blame-shift this seat
 * removed from the handler's catch, one layer up.
 */
function refusalVerdict(message: string): Verdict {
  const guidance: Guidance = {
    next: message,
    invariant:
      'CLI-3b: a governed refusal exits 2 — the invocation was well-formed and a gate declined it, so re-running it with different arguments will not help; exit 1 is reserved for a usage/wiring error',
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

  // PROVENANCE — refuse the whole invocation over a COMMITTED durable store, with the reason, BEFORE any
  // door is opened. `init` is deliberately EXEMPT and it is the only exemption: it reads the tree
  // structurally, touches no durable state, and it is the command that writes the `.gitignore` rule which
  // stops this happening again — refusing the remedy along with the symptom would leave a user with an
  // Atlas that is off and no supported way to turn it back on.
  //
  // EXIT CODE — 2 (`rejected`), not 1 (`error`), and the difference is the whole contract a script has with
  // this binary. `EXIT` is `ok:0 · error:1 · rejected:2`, where 1 means "your invocation was wrong" and 2
  // means "your invocation was fine and a governance gate declined it". The provenance tripwire is a
  // governance gate: nothing under `.atlas/` can be shown to have passed the truth, authz or ratification
  // gates, so it is refused for the same reason and in the same family as an unauthorized or unratified
  // write — every one of which already exits 2. It exited 1 only because this gate happens to fire in the
  // CLI before the door, and WHERE a control runs is an implementation detail; an exit code classifies the
  // OUTCOME. Nothing pinned it either way (S20 asserts `not.toBe(0)`), so it is pinned now, in both
  // directions: the write doors AND the read doors.
  if (deps.readRefusal !== undefined && command !== 'init') {
    return emitCli(renderRefusal(refusalVerdict(deps.readRefusal)));
  }

  if (command === 'mine') {
    // CLI-4: `mine` drives the FROZEN genesis run-controller (`runMine`) over the repo at cwd as ONE governed
    // pass, projecting the outcome to a `CliVerdict`. It routes NOT through `deps.handler` (genesis is its own
    // composed driver, mine.ts) but its rendered `CliVerdict` reaches the console over the SAME emit/exit path
    // as every other command (uniform bytes). Every mined write is CANDIDATE-only (GEN-4/12); never throws.
    // [ADR-0011] A misconfigured MODEL is not a mining outcome. It must stay loud — rendering it as
    // "0 candidate facts" would be indistinguishable from a repo that genuinely holds none — but a raw
    // stack trace is below this CLI's own bar. It is rendered through the SAME refusal path as every other
    // governed decline, carrying the loader's actionable message verbatim. Any OTHER throw is re-raised:
    // our own crash must not be dressed up as the caller's bad configuration (the #129 blame-shift).
    //
    // `ModelCommandError` (the command is missing / timed out / exited non-zero) is the THIRD name here, and
    // it reached this catch only after `mine.ts` started re-throwing it: it is raised inside a per-site
    // `visit`, and GEN-8c catches that bare, so the run used to end as an anonymous partial (`exit 1 ·
    // llmCalls 0 · resume at rank -1`) with neither the command name nor its stderr. Exit 2, like the other
    // two — a run that legitimately ran out of budget still exits 1 with its report, so the two are
    // distinguishable from the outside.
    try {
      return emitCli(await runMine(process.cwd()));
    } catch (e) {
      const name = (e as { name?: unknown } | null)?.name;
      if (name !== 'ModelConfigError' && name !== 'PromptError' && name !== 'ModelCommandError') throw e;
      return emitCli(renderRefusal(refusalVerdict((e as Error).message)));
    }
  }

  if (command === 'promote') {
    // CLI-7: `atlas promote` drives the composition root's governed PROMOTION leg ONE pass over the repo at
    // cwd — read the explorer's staging sidecar, present every staged candidate to the governed emit door,
    // fold the per-row outcomes into ONE verdict. Like `mine`, it does not route through `deps.handler`
    // (there is no `Tool` token: it opens no new governed surface, ADR-0008) but its rendered `CliVerdict`
    // reaches the console over the SAME emit/exit path as every other command (uniform bytes).
    //
    // It is a WRITE command, so it fails closed on an uncomposed runtime exactly as the routed ones do.
    if (!deps.promote) {
      return emit(
        errorVerdict('atlas runtime is not composed yet — the WireConfig seams need the composition-root WP'),
      );
    }
    // The anchor rev: the repo's LIVE HEAD, read through the shared no-shell git seam. `headSha` is total
    // (no git / no commit ⇒ `undefined`), and the composed truth-gate ignores this value today — it
    // re-derives freshness against the built `Axes`, not against a sha (compose.ts `buildGate`). It is still
    // the true HEAD rather than a placeholder, so a gate that later starts reading it gets a fact.
    return emitCli(runPromote(deps.promote, asHash(headSha(process.cwd()) ?? '')));
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

  // The remaining five governance commands each route to a `Tool` through the one wired handler.
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
  // command fails closed with `malformed-args` (the door reads its own published schema and reports the
  // argument it wanted by name). TOTAL: a missing --at / unreadable emit fact file → a
  // structured error + guidance + non-zero exit, never a throw (CLI-1b).
  // `init` is the move-in command, and moving in has a DEPLOYMENT dependency the product never discharged:
  // Atlas refuses a durable store that is TRACKED BY GIT, so a repo with no ignore rule is one `git add -A`
  // away from a silently disabled Atlas. The rule is installed HERE, at the entrypoint, and not behind the
  // `atlas-init` leg — `createInit` is a pure planner (ADR-0004 AUTHOR-2) and stays one. No knowledge byte
  // is touched, so `WRITE_PATHS` and the CLI-2 authority matrix are unchanged; see `gitignore.ts`.
  //
  // AFTER the unwired-runtime guard above, deliberately: a command that cannot run must not leave a changed
  // working tree behind. It is against `process.cwd()` — the repository root the entrypoint composes over —
  // not against the `path` argument, which may name a SUBTREE, and a subtree is not where `.gitignore` lives.
  const ignoreNote = command === 'init' ? ensureAtlasIgnored(process.cwd()).note : undefined;
  const marshalled = marshalArgs(command, positionals, flags);
  if (!marshalled.ok) {
    return emit(errorVerdict(marshalled.error));
  }
  const verdict = deps.handler.handle(tool, marshalled.args);
  // The gitignore outcome rides the SAME single process-outcome path as everything else (uniform bytes) —
  // one appended line, never a second write to stdout, and never a changed exit code: failing to install an
  // ignore rule does not make a structural move-in wrong, it makes it INCOMPLETE, and the line says so.
  return emitCli(withNote(renderVerdict(verdict), ignoreNote));
}

/** Append one advisory line to a rendered outcome, or return it unchanged. Pure. */
function withNote(cv: CliVerdict, note: string | undefined): CliVerdict {
  return note === undefined ? cv : { exitCode: cv.exitCode, stdout: `${cv.stdout}${note}\n` };
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
