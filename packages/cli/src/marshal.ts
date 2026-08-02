// @atlas/cli — src/marshal.ts  (ARG-MARSHALLING: parsed positionals/flags → each leg's NAMED arg shape)
//
// The CLI parses into a uniform `{command, positionals, flags}` bag, but every governance leg (@atlas/adapter-io
// wire.ts) destructures a NAMED shape: init reads `.path`, query reads `.scope`, emit reads `{node, at}`,
// reconcile reads `{mergeBase, options?}`. Without this map, `handle(tool, {positionals, flags})` fails CLOSED
// with "malformed args" for every routed command. This module is the per-command marshaller — TOTAL: a missing
// required flag, an unreadable emit fact file, or malformed fact JSON fails CLOSED to a structured error string
// (never a throw), preserving CLI-1b totality.

import { readFileSync } from 'node:fs';
import type { Command } from './map.js';

/** A marshalled named-arg object bound for `handle`, OR a structured failure reason (never a throw). */
export type MarshalResult =
  | { readonly ok: true; readonly args: unknown }
  | { readonly ok: false; readonly error: string };

/**
 * Map ONE command's `{positionals, flags}` to the exact named-arg object its wired leg reads (wire.ts):
 *   init      → `{ path }`                        (leg: `(args as { path }).path`)
 *   query     → `{ scope }`                       (leg: `(args as { scope }).scope`)
 *   reconcile → `{ mergeBase, options }`          (leg: `.mergeBase` + `.options?: {acceptReground?}`)
 *   emit      → `{ node, at }`                    (leg: `.node: GroundedFact` + `.at: Hash`)
 *   link      → `{ a, b, retract }`               (leg: `.a` + `.b` — the two nodeKeys to equate, WP-SAMEAS;
 *                                                   `.retract` selects the A-D3 retraction MODE. This one
 *                                                   REFUSES unknown/odd flags — see `marshalLink`)
 * `doctor` / `mine` / `node` are dispatched BEFORE the handler (cli.ts) and never reach here — the default fails closed.
 */
export function marshalArgs(
  command: Command,
  positionals: readonly string[],
  flags: Readonly<Record<string, string>>,
): MarshalResult {
  switch (command) {
    case 'init':
      // `atlas init [path]` — parse enforces arity 1, so positionals[0] is present via the normal flow; the
      // `?? '.'` honors the card's documented default when marshalled directly (defensive totality).
      return { ok: true, args: { path: positionals[0] ?? '.' } };
    case 'query': {
      // `atlas query <scope> [--by scope|dependency|trigger]` — the leg reads `.scope` (back-compat) + `.by`
      // (the retrieval mode). `--by` defaults to `scope` (the pre-existing behavior). VALIDATE fail-CLOSED:
      // an unknown mode yields a structured marshal error, mirroring the emit missing-`--at` guard below.
      const by = (flags['by'] as string | undefined) ?? 'scope';
      if (by !== 'scope' && by !== 'dependency' && by !== 'trigger') {
        return { ok: false, error: `query --by must be one of scope|dependency|trigger` };
      }
      return { ok: true, args: { scope: positionals[0], by } };
    }
    case 'reconcile':
      // `atlas reconcile <mergeBase>` — the leg reads `mergeBase` + `options?: {acceptReground?}`. There is NO
      // `topic` in the leg's shape, so nothing else is marshalled; `--accept-reground` drives the one option.
      return {
        ok: true,
        args: { mergeBase: positionals[0], options: { acceptReground: flags['accept-reground'] === 'true' } },
      };
    case 'emit':
      return marshalEmit(positionals, flags);
    case 'link':
      return marshalLink(positionals, flags);
    default:
      // doctor/mine are intercepted before routing; a stray command here fails closed rather than routing blind.
      return { ok: false, error: `command '${command}' has no argument marshaller` };
  }
}

/** The ONLY flag `atlas link` accepts, and the only values that select the retraction MODE. `parse` folds a
 *  bare `--retract` to the string `'true'`, and `--retract=true` arrives as the same string, so ONE literal
 *  covers both spellings a user would reasonably type. */
const LINK_FLAG = 'retract';
const LINK_TRUE = 'true';

/**
 * `atlas link <a> <b> [--retract]` — the governed sameAs door (WP-SAMEAS / A-D3). The leg reads
 * `{a, b, retract}` (wire.ts). `parse` enforces arity 2, so both positionals are present via the normal flow.
 *
 * `retract` is converted to a REAL boolean because the published input schema (TOOLS-3) declares it as one
 * and the door type-checks declared properties; passing the raw string through would make the CLI fail
 * `malformed-args` on a call MCP accepts — a transport divergence on a governed door.
 *
 * ── WHY THIS DOOR REFUSES WHAT EVERY OTHER COMMAND IGNORES (measured; cold-review finding F4) ─────────────
 * `parse` deliberately never fails on an unknown or oddly-valued flag: an unrecognised `--x` folds into the
 * bag as `'true'` and is dropped by whichever marshaller does not read it (CLI-1b totality). For a READ
 * command that is harmless. For THIS one it silently INVERTED THE MODE — measured through the real parser:
 * `--retract=1`, `--retract=TRUE`, `--retract=false` and the typo `--retracted` every one of them produced
 * `retract: false`, i.e. an ASSERTION. An operator who asked to withdraw an equivalence got `linked: a ≡ b`
 * on screen and a fresh generation published.
 *
 * A governed WRITE door must not silently discard an argument its operator supplied, so this marshaller
 * fails CLOSED on anything it does not recognise, with a structured reason naming the accepted spellings
 * (never a throw — CLI-1b totality is preserved; the refusal is a `MarshalResult`, exit 1). The strictness
 * is scoped to `link` ALONE: no other command's flag handling moves, so no other command's totality
 * semantics change.
 *
 * `--retract=false` is REFUSED rather than read as "assert": the way to not retract is to omit the flag, and
 * refusing a confused invocation on a write door beats guessing which of two opposite acts was meant.
 *
 * NOT CLOSED HERE, and stated rather than left to be discovered: an EXTRA POSITIONAL (`atlas link a b c`) is
 * still silently ignored, since `parse` enforces a minimum arity and this reads only the first two. Same
 * class of defect, not part of the reviewed finding, and tightening arity touches every command's parser
 * contract — recorded for a follow-up rather than widened into this pass.
 */
function marshalLink(positionals: readonly string[], flags: Readonly<Record<string, string>>): MarshalResult {
  for (const name of Object.keys(flags)) {
    if (name !== LINK_FLAG) {
      return {
        ok: false,
        error: `link: unknown flag '--${name}'. The only flag this door accepts is '--retract' (withdraw a previously asserted equivalence); a governed write door does not ignore an argument you supplied`,
      };
    }
  }
  const raw = flags[LINK_FLAG];
  if (raw !== undefined && raw !== LINK_TRUE) {
    return {
      ok: false,
      error: `link: '--retract' is a bare flag — write '--retract' or '--retract=true'; got '--retract=${raw}'. To assert (not retract), omit the flag entirely`,
    };
  }
  return { ok: true, args: { a: positionals[0], b: positionals[1], retract: raw === LINK_TRUE } };
}

/**
 * `atlas emit <factJsonPath> --at <sha>` — the write door via CLI: a templated `GroundedFact` lives in a JSON
 * file (positionals[0]); `at` is the anchor rev the fact must re-derive at (`--at`). Reads + parses the file
 * to the `node`. TOTAL: a missing `--at`, an unreadable file, or malformed JSON fails CLOSED to a structured
 * error — never a throw.
 */
function marshalEmit(positionals: readonly string[], flags: Readonly<Record<string, string>>): MarshalResult {
  const at = flags['at'];
  if (at === undefined || at === 'true' || at.length === 0) {
    return { ok: false, error: `emit requires --at <sha>: the anchor rev the fact must re-derive at` };
  }
  const factPath = positionals[0];
  if (factPath === undefined) {
    return { ok: false, error: `emit requires a fact JSON file path (positional 1)` };
  }
  let raw: string;
  try {
    raw = readFileSync(factPath, 'utf8');
  } catch {
    return { ok: false, error: `emit: cannot read fact file '${factPath}'` };
  }
  let node: unknown;
  try {
    node = JSON.parse(raw);
  } catch {
    return { ok: false, error: `emit: fact file '${factPath}' is not valid JSON` };
  }
  return { ok: true, args: { node, at } };
}
