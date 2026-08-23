// @atlas/cli — src/map.ts  (CLI-1a command→leg map · CLI-2 authority matrix · CLI-3b status→exit f)
//
// The three PURE DATA oracles the CLI is enumerated against — no I/O, no clock, no handler. Housed apart from
// the parser/dispatch so the totality proofs (CLI-1a/2) read the same table the runtime routes through.

import { WRITE_PATHS } from '@atlas/tools';
import type { Tool, Verdict } from '@atlas/tools';

/** The finite command surface — EXACTLY these seventeen, no more (CLI-1a). Order fixed; membership load-bearing.
 *  [EXTENDED — WP-SAMEAS] `link` joins as the CLI door of the governed sameAs write (routes to `atlas-link`).
 *  [EXTENDED — WP-PROMOTE] `promote` joins as the CLI door of the governed promotion of staged candidates. It
 *  binds `atlas-emit`, the door it actually publishes through (ADR-0008: a curator door is an ordinary USE of
 *  the existing emit door), so it is not a sixth tool and `WRITE_PATHS` does not move.
 *  [EXTENDED — WP-OWN] `own` joins as the CLI door of the `own_<scope>` curated briefing (RETR-12). It binds
 *  `atlas-query` — a READ authority oracle, like `node` and `doctor` — so `GOVERNANCE_SURFACE` stays 5 and
 *  `WRITE_PATHS` is untouched. `authorityOf` DERIVES that from `WRITE_PATHS`; it is not asserted here.
 *  [EXTENDED — #99a] `relations` joins as the CLI door of the grounded-relation read fold (`relationsOf`,
 *  ADR-0015 D2). Like `own` it binds `atlas-query` — a READ authority oracle — so `GOVERNANCE_SURFACE` stays 5
 *  and `WRITE_PATHS` is untouched; `authorityOf` DERIVES that from `WRITE_PATHS`, it is not asserted here.
 *  [EXTENDED — REVERIFY-GATE] `verify-store` joins as the CLI door of the whole-store re-verification pass —
 *  re-proves every `seal:'proven'` fact's OWN witness against the live index (`re-proven`/`broken`/
 *  `unverifiable`, `reverify-store.ts`). Like `verify-fact` it binds `atlas-query` — a READ authority oracle —
 *  so `GOVERNANCE_SURFACE` stays 5 and `WRITE_PATHS` is untouched.
 *  [EXTENDED — #99 WP-R7] `derive-relations` joins as the CLI door of the sound-relation MECHANICAL PROJECTION —
 *  it derives PROVEN `depends-on` relations from the index and PERSISTS them through the governed emit door. Like
 *  `promote` it is a WRITE command that binds `atlas-emit` (the door it publishes through, ADR-0008: a projection
 *  pass is an ordinary USE of the existing emit door), so it is not a new tool, `GOVERNANCE_SURFACE` stays 5 and
 *  `WRITE_PATHS` does not move. `authorityOf` DERIVES its WRITE class from `WRITE_PATHS`; it is not asserted here.
 *  [EXTENDED — #234] `transitions` joins as the CLI door of the grounded-transition read fold (`transitionsOf`,
 *  ADR-0015 D4). Like `relations`/`negations` it binds `atlas-query` — a READ authority oracle — so
 *  `GOVERNANCE_SURFACE` stays 5 and `WRITE_PATHS` is untouched. `transition` joins as the reachable 2-rev
 *  transition PRODUCER (`atlas transition <unit> <revBefore> <revAfter>`); it binds `genesis run-controller`
 *  (the genesis production entry `mine` also binds) — it opens NO governed WRITE token (its flagged limit:
 *  it persists an advisory-class justified transition directly through `commitProjection`, not the governed
 *  authz door), so it carries no WRITE_PATHS door and `authorityOf` reads it as a genesis entry, exactly as `mine`. */
export const COMMANDS = ['init', 'query', 'emit', 'reconcile', 'doctor', 'mine', 'node', 'link', 'promote', 'own', 'relations', 'negations', 'transitions', 'transition', 'verify-fact', 'verify-store', 'derive-relations'] as const;
export type Command = (typeof COMMANDS)[number];

/** The leg a command routes to — a governance `Tool`, or the genesis entry (data-only; NOT executed here —
 *  the `mine` driver is a SEPARATE WP, WP-9.3.6-b.CLI). Present only so the map is total over EVERY
 *  command. The count is deliberately NOT written here any more: this line said "all six" until `node` and
 *  `link` were added, then "all EIGHT" while the array already held nine — twice wrong, three feet from the
 *  array that decides it. `COMMANDS.length` is the oracle; a sentence beside it is a second one. */
export type Leg = Tool | 'genesis run-controller';

/**
 * CLI-1a: the TOTAL + MUTUALLY-EXCLUSIVE command→leg map — the enumeration oracle. `doctor` binds a READ
 * leg (`atlas-query`) so the authority partition (CLI-2) classifies it read — but at runtime `doctor`
 * SUB-DISPATCHES to the read/advisory `DoctorApi` legs, plus the `index` leg that reads the file tree and
 * the SCIP dump instead of the store (see src/doctor.ts), never through the wired handler; the leg here is
 * the authority oracle, not the dispatch target. `mine` binds the genesis entry
 * (data-only). Every command maps to EXACTLY one leg.
 *
 * `promote` binds `atlas-emit`, and that is the HONEST classification rather than a convenient one: it is
 * intercepted before the handler (like `node`), but unlike `node` it really does write, and the leg it writes
 * through IS `atlas-emit` (`createGovernedEmit`, the same factory `wire.ts` binds). So CLI-2 classifies it
 * `write` — which is true — while `WRITE_PATHS` stays `{atlas-emit, atlas-link}`, because a third COMMAND
 * funnelling into an existing door is not a third DOOR. Binding it to the genesis entry (as `mine` is) would
 * have read `read` and understated a command that publishes durable governed knowledge.
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
  promote: 'atlas-emit', // WRITE authority oracle (KNOW-8 governed promotion); intercepted before the handler
  //                        (cli.ts) and driven over the composition root's promotion leg, which publishes
  //                        through THIS leg's own door — the same `createGovernedEmit` `wire.ts` binds
  relations: 'atlas-query', // READ authority oracle (#99a grounded-relation fold); intercepted before the handler
  //                           (cli.ts) and driven over the composition root's `relations` leg, which reads the
  //                           SAME durable projection this leg's query readback rides. Carries NO write authority.
  negations: 'atlas-query', // READ authority oracle (#99b grounded-negation + abstention folds); intercepted
  //                           before the handler (cli.ts) and driven over the composition root's `negations`
  //                           leg, which reads the SAME durable projection. Carries NO write authority — it
  //                           opens no governed token, GOVERNANCE_SURFACE stays 5, WRITE_PATHS untouched.
  transitions: 'atlas-query', // READ authority oracle (#234 grounded-transition fold); intercepted before the
  //                             handler (cli.ts) and driven over the composition root's `transitions` leg, which
  //                             reads the SAME durable projection. Carries NO write authority — GOVERNANCE_SURFACE
  //                             stays 5, WRITE_PATHS untouched.
  transition: 'genesis run-controller', // the 2-rev transition PRODUCER (#234); the genesis production entry
  //                                        `mine` also binds, driven over the composition root's `transition` leg.
  //                                        Opens NO governed WRITE token (flagged limit: persists a justified
  //                                        transition directly via commitProjection, not the governed authz door),
  //                                        so it is not a WRITE_PATHS door — `authorityOf` reads it a genesis entry.
  'verify-fact': 'atlas-query', // READ authority oracle (sound-genesis PROVEN family); intercepted before the
  //                               handler (cli.ts) and driven over the composition root's `verifyFact` leg, a
  //                               program oracle over the code index. Carries NO write authority — it opens no
  //                               governed token, GOVERNANCE_SURFACE stays 5, WRITE_PATHS untouched.
  own: 'atlas-query', // READ authority oracle (RETR-12 `own_<scope>` briefing); intercepted before the handler
  //                     (cli.ts) and driven over the composition root's `own` leg, which reads the SAME
  //                     durable store this leg's query readback rides. Carries NO write authority — the
  //                     briefing is composed by index reads alone and no store-mutating method is reachable
  //                     from it. Bound to `atlas-query` rather than a leg of its own because that is the
  //                     door whose READ it is a second projection of, exactly as `node` and `doctor` are.
  'verify-store': 'atlas-query', // READ authority oracle (REVERIFY-GATE whole-store pass); intercepted before
  //                                the handler (cli.ts) and driven over the composition root's `reverify`
  //                                thunk, which re-proves every stored witness through the SAME `verifyFact`
  //                                oracle. Carries NO write authority — it opens no governed token,
  //                                GOVERNANCE_SURFACE stays 5, WRITE_PATHS untouched.
  'derive-relations': 'atlas-emit', // WRITE authority oracle (#99 WP-R7 sound-relation projection); intercepted
  //                                   before the handler (cli.ts) and driven over the composition root's
  //                                   `deriveRelations` leg, which PERSISTS proven `depends-on` relations THROUGH
  //                                   this leg's own door — the same `createGovernedEmit` `wire.ts` binds. A
  //                                   fourth write COMMAND over the SAME two write doors; WRITE_PATHS untouched.
};

export type Authority = 'read' | 'write';

/**
 * CLI-2: a command carries WRITE authority IFF its leg is a `WRITE_PATHS` door. Asserted against the frozen
 * `WRITE_PATHS` constant (@atlas/tools) — NOT a re-typed list — so the read/write partition cannot drift
 * here. Today that is `emit`, `link` and `promote` (ADR-0003 ratified the second governed door); this comment
 * used to say "the single-door partition (`atlas-emit` only)", which the constant it points at already
 * contradicted. THREE write COMMANDS over TWO write DOORS: `promote` funnels into `atlas-emit`, so the set of
 * write-authority commands and the set of governed write doors are deliberately not the same size, and this
 * function is what keeps the first derived from the second instead of transcribed beside it.
 * Read XOR write, total over the whole surface.
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
