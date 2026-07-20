// @atlas/cli — src/map.ts  (CLI-1a command→leg map · CLI-2 authority matrix · CLI-3b status→exit f)
//
// The three PURE DATA oracles the CLI is enumerated against — no I/O, no clock, no handler. Housed apart from
// the parser/dispatch so the totality proofs (CLI-1a/2) read the same table the runtime routes through.

import { WRITE_PATHS } from '@atlas/tools';
import type { Tool, Verdict } from '@atlas/tools';

/** The finite command surface — EXACTLY these six, no more (CLI-1a). Order fixed; membership load-bearing. */
export const COMMANDS = ['init', 'query', 'emit', 'reconcile', 'doctor', 'mine'] as const;
export type Command = (typeof COMMANDS)[number];

/** The leg a command routes to — a governance `Tool`, or the genesis entry (data-only; NOT executed here —
 *  the `mine` driver is a SEPARATE WP, WP-9.3.6-b.CLI). Present only so the map is total over all six. */
export type Leg = Tool | 'genesis run-controller';

/**
 * CLI-1a: the TOTAL + MUTUALLY-EXCLUSIVE command→leg map — the enumeration oracle. `doctor` binds the read
 * path (`atlas-query`); `mine` binds the genesis entry (data-only). Every command maps to EXACTLY one leg.
 */
export const COMMAND_LEG: Record<Command, Leg> = {
  init: 'atlas-init',
  query: 'atlas-query',
  emit: 'atlas-emit',
  reconcile: 'atlas-reconcile',
  doctor: 'atlas-query', // read path (TOOLS-6 projection)
  mine: 'genesis run-controller', // data-only entry; not driven at this seam
};

export type Authority = 'read' | 'write';

/**
 * CLI-2: a command carries WRITE authority IFF its leg is a `WRITE_PATHS` door. Asserted against the frozen
 * `WRITE_PATHS` constant (@atlas/tools) — NOT a re-typed list — so the single-door partition (`atlas-emit`
 * only) cannot drift here. Read XOR write, total over the whole surface.
 */
export function authorityOf(command: Command): Authority {
  const leg = COMMAND_LEG[command];
  return (WRITE_PATHS as readonly string[]).includes(leg) ? 'write' : 'read';
}

/** The CLI-layer process status synthesized from a verdict (NOT a field on the frozen `Verdict`). */
export type Status = 'ok' | 'rejected' | 'error';

/** CLI-3b: the ratified `status → exitCode` map — `ok:0 · error:1 · rejected:2`. */
export const EXIT: Record<Status, number> = { ok: 0, error: 1, rejected: 2 };

/**
 * CLI-3b: the ratified status derivation `f` — a PURE function of ONE verdict (no tool tag, no clock). A
 * `false` verdict is an `error`; a truthy verdict whose `data` reports a non-zero `exitCode` (reconcile) OR
 * `emitted:false` (emit) is `rejected`; otherwise `ok`. The `exitCode`/`emitted` probes duck-type the two
 * carrier records structurally — only `ReconcileOut` carries `exitCode`, only `EmitOut` carries `emitted` —
 * so this stays a pure function of the verdict while implementing the tool-qualified rule.
 */
export function deriveStatus(v: Verdict): Status {
  if (v.ok === false) return 'error';
  const data = v.data as { readonly exitCode?: unknown; readonly emitted?: unknown } | undefined;
  if (data && typeof data.exitCode === 'number' && data.exitCode !== 0) return 'rejected';
  if (data && data.emitted === false) return 'rejected';
  return 'ok';
}
