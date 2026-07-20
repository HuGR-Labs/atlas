// @atlas/cli — src/parse.ts  (CLI-1b/1c: the hand-rolled TOTAL argv parser)
//
// argv → a structured `{command, positionals, flags}` OR a structured `ParseError`. Hand-rolled on purpose:
// cac/yargs/commander throw or call `process.exit` on bad input (violating CLI-1c totality). This parser
// NEVER throws and NEVER touches `process.exit` — a malformed invocation fails CLOSED to a `ParseError`.

import { COMMAND_LEG } from './map.js';
import type { Command } from './map.js';

/** A successful parse — the routed command plus its captured positionals/flags. */
export interface ParseOk {
  readonly ok: true;
  readonly command: Command;
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, string>>;
}

/** A structured parse failure — a reason string, never a throw (CLI-1b). */
export interface ParseError {
  readonly ok: false;
  readonly error: string;
}

export type ParseResult = ParseOk | ParseError;

/** The minimum positional arity each command requires (CLI-1b: a missing positional is a parse error). */
const ARITY: Record<Command, number> = {
  init: 1, // init <path>
  query: 1, // query <scope>
  emit: 1, // emit <node>
  reconcile: 1, // reconcile <mergeBase>
  doctor: 1, // doctor <scope>
  mine: 1, // mine <repo>
};

const COMMAND_LIST = 'init|query|emit|reconcile|doctor|mine';

function isCommand(s: string): s is Command {
  return Object.prototype.hasOwnProperty.call(COMMAND_LEG, s);
}

/** Fold one `-x`/`--x`/`--x=y` token into the flag bag — a bare flag is `'true'`. Never throws. */
function foldFlag(tok: string, flags: Record<string, string>): void {
  const body = tok.replace(/^-+/, '');
  const eq = body.indexOf('=');
  if (eq >= 0) flags[body.slice(0, eq)] = body.slice(eq + 1);
  else flags[body] = 'true';
}

/**
 * Parse `argv` TOTALLY. Failures: empty argv, a flag where the command belongs, an unknown command, a
 * malformed typed flag (`--depth` must be an integer), or a missing positional. Every failure is a
 * `ParseError` — never a throw, never `process.exit`.
 */
export function parse(argv: readonly string[]): ParseResult {
  if (argv.length === 0) {
    return { ok: false, error: `no command: expected one of ${COMMAND_LIST}` };
  }
  const cmd = argv[0];
  if (cmd === undefined || cmd.startsWith('-')) {
    return { ok: false, error: `no command: the first argument is a flag — expected one of ${COMMAND_LIST}` };
  }
  if (!isCommand(cmd)) {
    return { ok: false, error: `unknown command '${cmd}': expected one of ${COMMAND_LIST}` };
  }

  const positionals: string[] = [];
  const flags: Record<string, string> = {};
  for (const tok of argv.slice(1)) {
    if (tok.startsWith('-')) foldFlag(tok, flags);
    else positionals.push(tok);
  }

  // bad flag: a typed flag with a malformed value is a parse error (CLI-1b — the `--depth=notanumber` case).
  if (Object.prototype.hasOwnProperty.call(flags, 'depth')) {
    const raw = flags['depth'];
    if (raw === undefined || raw === 'true' || !Number.isInteger(Number(raw))) {
      return { ok: false, error: `bad flag: --depth must be an integer, got '${raw ?? ''}'` };
    }
  }

  // missing positional
  const need = ARITY[cmd];
  if (positionals.length < need) {
    return {
      ok: false,
      error: `command '${cmd}' requires ${need} positional argument(s), got ${positionals.length}`,
    };
  }

  return { ok: true, command: cmd, positionals, flags };
}
