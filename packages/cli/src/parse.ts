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
  node: 1, // node <addr>
  link: 2, // link <a> <b> — the two nodeKeys to equate (WP-SAMEAS)
  // `promote` takes NO positional. The repo it promotes in is `process.cwd()` — the same root the entrypoint
  // composes the runtime over — because the staging sidecar it reads and the projection it writes are both
  // under that one composed store. A path argument would let the two disagree (read one repo's candidates,
  // publish into another's knowledge), which is a confusion no gate downstream is positioned to catch.
  promote: 0,
  own: 1, // own <scope> — the scope-unit path the briefing is composed for (RETR-12)
  // `relations <unit> [out|in|both]` — the unit is the only REQUIRED positional; the direction is an OPTIONAL
  // second positional (defaults to `both`, validated by the shared verdict builder), so arity is 1.
  relations: 1,
  // `negations <scope> [--abstained]` — the scope is the only REQUIRED positional; `--abstained` is an
  // OPTIONAL boolean flag (focuses the render on the honest abstentions), so arity is 1 (#99b).
  negations: 1,
  // `transitions <unit>` — the unit lineage key is the only positional (#234, ADR-0015 D4 read door).
  transitions: 1,
  // `transition <unit> <revBefore> <revAfter>` — the unit lineage + the TWO revs it spans are all required
  // positionals, so arity is 3 (#234, ADR-0015 D4 producer).
  transition: 3,
  // `test-vacuities <unit>` — the unit key whose grounded test-vacuity facts to read is the only positional
  // (#95, ADR-0015 D5 read door).
  'test-vacuities': 1,
  // `test-vacuity <path>` — the repo path to scan is the only required positional (like `mine <repo>`, the
  // producer scans the composed `process.cwd()`); arity is 1 (#95, ADR-0015 D5 producer).
  'test-vacuity': 1,
  // `verify-fact <kind> <target> --scope <s> [--world <w>] [--min <n>] [--exact]` — the class and the target
  // symbol are BOTH required positionals (the scope + count bounds ride valued flags), so arity is 2.
  'verify-fact': 2,
  // `verify-store` takes NO positional — same reasoning as `promote`: it re-verifies the WHOLE durable store
  // at `process.cwd()`, the same root the entrypoint composes the runtime over, so a path argument would let
  // the store re-verified diverge from the one every other command reads.
  'verify-store': 0,
  // `derive-relations` takes NO positional — same reasoning as `promote`/`verify-store`: it projects the WHOLE
  // index at `process.cwd()` (the root the entrypoint composes the runtime over) to proven `depends-on`
  // relations and persists them into THAT repo's store, so a path argument would let the index projected diverge
  // from the store written and the one every other command reads (#99 WP-R7).
  'derive-relations': 0,
};

const COMMAND_LIST = 'init|query|emit|reconcile|doctor|mine|node|link|promote|own|relations|negations|verify-fact|verify-store|derive-relations';

function isCommand(s: string): s is Command {
  return Object.prototype.hasOwnProperty.call(COMMAND_LEG, s);
}

/**
 * Flags that carry a VALUE token, accepting both the joined `--flag=v` and the space `--flag v` forms.
 * Valued today: `--at`/`--by` (emit anchor rev / query axis) and `--scope`/`--world`/`--min` (verify-fact's
 * claim scope, completeness world, and count lower bound). Everything else stays a bare boolean. Any unknown
 * flag simply folds into the bag (a bare `--x` becomes `'true'`) — never a parse error, preserving totality.
 */
const VALUED_FLAGS = new Set(['at', 'by', 'scope', 'world', 'min']);

/**
 * Fold one `-x`/`--x`/`--x=y`/`--x y` token into the flag bag — a bare flag is `'true'`. For a VALUED flag in
 * the space form (`--at <v>`), the following token `next` is consumed as the value; the return is the number of
 * EXTRA tokens consumed (0, or 1 when a valued flag swallowed its value). Never throws. The value is only
 * consumed when `next` is a real value token (not another flag / not absent) — so a following positional that
 * belongs to a non-valued flag is never swallowed and totality is preserved (a valueless `--at` folds to
 * `'true'`, which the emit marshaller rejects as a missing `--at`).
 */
function foldFlag(tok: string, next: string | undefined, flags: Record<string, string>): number {
  const body = tok.replace(/^-+/, '');
  const eq = body.indexOf('=');
  if (eq >= 0) {
    flags[body.slice(0, eq)] = body.slice(eq + 1);
    return 0;
  }
  if (VALUED_FLAGS.has(body) && next !== undefined && !next.startsWith('-')) {
    flags[body] = next;
    return 1;
  }
  flags[body] = 'true';
  return 0;
}

/**
 * Parse `argv` TOTALLY. Failures: empty argv, a flag where the command belongs, an unknown command, or a
 * missing positional. Every failure is a `ParseError` — never a throw, never `process.exit`. Unknown flags
 * are never a failure — they fold into the flag bag and are ignored by the marshallers that do not read them.
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
  const rest = argv.slice(1);
  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i];
    if (tok === undefined) continue;
    if (tok.startsWith('-')) i += foldFlag(tok, rest[i + 1], flags);
    else positionals.push(tok);
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
