// @atlas/cli — src/map.ts  (CLI-1a command→leg map · CLI-2 authority matrix · CLI-3b status→exit f)
//
// The three PURE DATA oracles the CLI is enumerated against — no I/O, no clock, no handler. Housed apart from
// the parser/dispatch so the totality proofs (CLI-1a/2) read the same table the runtime routes through.

import { WRITE_PATHS } from '@atlas/tools';
import type { Tool, Verdict } from '@atlas/tools';

/** The finite command surface — EXACTLY these eight, no more (CLI-1a). Order fixed; membership load-bearing.
 *  [EXTENDED — WP-SAMEAS] `link` joins as the CLI door of the governed sameAs write (routes to `atlas-link`). */
export const COMMANDS = ['init', 'query', 'emit', 'reconcile', 'doctor', 'mine', 'node', 'link'] as const;
export type Command = (typeof COMMANDS)[number];

/** The leg a command routes to — a governance `Tool`, or the genesis entry (data-only; NOT executed here —
 *  the `mine` driver is a SEPARATE WP, WP-9.3.6-b.CLI). Present only so the map is total over all six. */
export type Leg = Tool | 'genesis run-controller';

/**
 * CLI-1a: the TOTAL + MUTUALLY-EXCLUSIVE command→leg map — the enumeration oracle. `doctor` binds a READ
 * leg (`atlas-query`) so the authority partition (CLI-2) classifies it read — but at runtime `doctor`
 * SUB-DISPATCHES to the four read/advisory `DoctorApi` legs (see src/doctor.ts), never through the wired
 * handler; the leg here is the authority oracle, not the dispatch target. `mine` binds the genesis entry
 * (data-only). Every command maps to EXACTLY one leg.
 */
export const COMMAND_LEG: Record<Command, Leg> = {
  init: 'atlas-init',
  query: 'atlas-query',
  emit: 'atlas-emit',
  reconcile: 'atlas-reconcile',
  doctor: 'atlas-query', // READ authority oracle (TOOLS-6 projection); runtime sub-dispatches to DoctorApi
  mine: 'genesis run-controller', // data-only entry; not driven at this seam
  node: 'atlas-query', // READ authority oracle (TOOLS-10 per-node read); intercepted before the handler (cli.ts),
  //                      resolves via handler.resolveNode over the read-only NodeSource — carries NO write authority
  link: 'atlas-link', // WRITE authority oracle (WP-SAMEAS governed sameAs door); routes through the one handler
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
 * GOVERNANCE rejection is `rejected` (exit 2): a `data` reporting a non-zero `exitCode` (reconcile semantic
 * flip), `emitted:false` (a fail-closed emit), OR `linked:false` (a fail-closed sameAs link, WP-SAMEAS) —
 * each an `ok:false` verdict carrying its record on `data` (F2/F5). Any OTHER `ok:false` (malformed args,
 * unwired tool) is a usage/wiring `error` (exit 1).
 * Otherwise `ok`. The `exitCode`/`emitted` probes duck-type the two carrier records structurally — only
 * `ReconcileOut` carries `exitCode`, only `EmitOut` carries `emitted` — so the governance-refusal classes are
 * distinguished from a bare error BEFORE the `ok:false` fallback, keeping this a pure function of the verdict.
 */
export function deriveStatus(v: Verdict): Status {
  const data = v.data as
    | { readonly exitCode?: unknown; readonly emitted?: unknown; readonly linked?: unknown }
    | undefined;
  if (data && data.emitted === false) return 'rejected'; // fail-closed emit — a governed refusal (F2/F5)
  if (data && data.linked === false) return 'rejected'; // fail-closed link — a governed refusal (WP-SAMEAS)
  if (data && typeof data.exitCode === 'number' && data.exitCode !== 0) return 'rejected'; // reconcile flip
  if (v.ok === false) return 'error'; // malformed args / unwired tool — a usage/wiring error
  return 'ok';
}
