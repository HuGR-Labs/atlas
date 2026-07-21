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
 *   link      → `{ a, b }`                         (leg: `.a` + `.b` — the two nodeKeys to equate, WP-SAMEAS)
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
      // `atlas link <a> <b>` — the governed sameAs door (WP-SAMEAS). The leg reads `{a,b}` (wire.ts). `parse`
      // enforces arity 2, so both positionals are present via the normal flow.
      return { ok: true, args: { a: positionals[0], b: positionals[1] } };
    default:
      // doctor/mine are intercepted before routing; a stray command here fails closed rather than routing blind.
      return { ok: false, error: `command '${command}' has no argument marshaller` };
  }
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
