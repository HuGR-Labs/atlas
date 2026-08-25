// @atlas/e2e-blackbox — test/author8-subprocess.ts  (WP-10.A2-a.E2E — thin subprocess plumbing, PROP-AUTH-8)
//
// NO ENVELOPE RECONSTRUCTION HERE. WP-10.A2-a.CLI-JSON shipped `atlas draft <anchor> <slot> <claim> --json`
// (`packages/cli/src/cli.ts`'s `draft` dispatch): on a successful draft it prints the RAW `DraftOut` —
// `JSON.stringify(verdict.data)` verbatim, never hand-picked fields — so the envelope `atlas emit <file>
// --at <rev>` reads is now produced ENTIRELY by product doors. This file used to carry a hand-built
// reconstruction of that envelope (parsed off the OLD human-text-only `draft` render, before `--json`
// existed); that code is DELETED, not reused — the whole point of `--json` shipping is that this story no
// longer needs to know, let alone re-encode, a single field `draft`'s own recipe defaults to.
//
// What is left is PURE PLUMBING around three subprocess doors:
//   - `anchorsOf`/`slotNames` — parse `atlas anchors <path>` / `atlas slots`'s TEXT listings (there is no
//     `--json` for either door yet) to DISCOVER the fixture's real unit set / the 13-slot vocabulary — pure
//     text parsing of a DISCOVERY door's rendered census, not a reconstruction of anything `emit` consumes.
//   - `draftThenEmit` — `atlas draft … --json` (capture stdout verbatim) → write those EXACT bytes to a temp
//     file → `atlas emit <file> --at <rev>` (the `rev` is read OFF the SAME captured JSON via one
//     `JSON.parse`, never invented). The bytes `emit` reads are the LITERAL stdout of `draft --json` — a true
//     byte relay through two product doors, no test-authored `GroundedFact` field anywhere on this path.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runAtlas } from '../src/harness.js';
import type { AtlasRun, FixtureRepo } from '../src/harness.js';
import type { GroundedFact } from '@atlas/knowledge';
import type { Tier } from '@atlas/contracts';

// ── discovery parsing (anchors/slots have no --json yet — their rendered TEXT is the only surface) ────────

/** One row of `atlas anchors <path>`'s rendered `unit <kind> <qualifiedPath> [<subtreeHash>]` listing —
 *  used ONLY to discover WHICH anchors exist (the `qualifiedPath`/`kind` census), never to build a fact. */
export interface AnchorRow {
  readonly kind: 'file' | 'dir' | 'symbol';
  readonly qualifiedPath: string;
}

const UNIT_LINE = /^ {2}unit (\S+) (.+) \[[0-9a-f]+\]$/;

/** Parse `atlas anchors <path>`'s stdout into `{rev, units}` — the discovery census, text-parsed because
 *  `anchors` has no `--json` output mode (unlike `draft`). Throws on an unparseable block (a TEST-SETUP
 *  fault — silently returning an empty set would make every downstream assertion pass VACUOUSLY). */
export function anchorsOf(repoPath: string, path: string): { readonly rev: string; readonly units: readonly AnchorRow[] } {
  const run = runAtlas(repoPath, ['anchors', path]);
  if (run.exitCode !== 0) throw new Error(`author8-subprocess: 'atlas anchors ${path}' exited ${run.exitCode}:\n${run.stdout}${run.stderr}`);
  const revMatch = run.stdout.match(/^ {2}anchors: rev (\S+) —/m);
  if (revMatch?.[1] === undefined) throw new Error(`author8-subprocess: could not parse 'anchors: rev …' out of:\n${run.stdout}`);
  const units: AnchorRow[] = [];
  for (const line of run.stdout.split('\n')) {
    const m = line.match(UNIT_LINE);
    if (m === null) continue;
    const kind = m[1];
    if (kind !== 'file' && kind !== 'dir' && kind !== 'symbol') continue;
    units.push({ kind, qualifiedPath: m[2] ?? '' });
  }
  return { rev: revMatch[1], units };
}

/** Parse `atlas slots`'s stdout into the 13 slot NAMES, in the door's own order (text-parsed — `slots` has
 *  no `--json` output mode either; only the closed vocabulary's names are needed here, not its meanings). */
export function slotNames(repoPath: string): readonly string[] {
  const run = runAtlas(repoPath, ['slots']);
  if (run.exitCode !== 0) throw new Error(`author8-subprocess: 'atlas slots' exited ${run.exitCode}:\n${run.stdout}${run.stderr}`);
  const names: string[] = [];
  for (const line of run.stdout.split('\n')) {
    const m = line.match(/^ {2}slot (\S+):/);
    if (m?.[1] !== undefined) names.push(m[1]);
  }
  return names;
}

// ── the round trip — a LITERAL byte relay, draft --json stdout → an emit input file ────────────────────────

/**
 * Drive `atlas draft <anchor> <slot> <claim> --json` (a real subprocess) and `atlas emit <file> --at <rev>`
 * (a second real subprocess) back to back. The bytes `emit` reads are EXACTLY `draft --json`'s stdout,
 * written to a temp file untouched — no `JSON.parse` + re-`JSON.stringify` round trip that could silently
 * normalize away a divergence, and no field of the envelope is read, inspected, or rebuilt by this test.
 * The ONE value read off the captured JSON is `.rev` — needed only because the CLI wire requires a
 * positional `--at <sha>` (marshal.ts); it is the SAME value already embedded in the bytes handed to `emit`.
 * Returns the `emit` run; the caller asserts `exitCode === 0` (PROP-AUTH-8's acceptance).
 */
export function draftThenEmit(repo: FixtureRepo, anchor: string, slot: string, claim: string): AtlasRun {
  const draftRun = runAtlas(repo.repoPath, ['draft', anchor, slot, claim, '--json']);
  if (draftRun.exitCode !== 0) {
    throw new Error(`author8-subprocess: 'atlas draft ${anchor} ${slot} … --json' exited ${draftRun.exitCode}:\n${draftRun.stdout}${draftRun.stderr}`);
  }
  const envelopeBytes = draftRun.stdout; // the LITERAL bytes `draft --json` printed — never touched
  const rev = (JSON.parse(envelopeBytes) as { rev: unknown }).rev;
  if (typeof rev !== 'string' || rev.length === 0) {
    throw new Error(`author8-subprocess: 'draft --json' printed no string '.rev':\n${envelopeBytes}`);
  }
  const path = join(repo.repoPath, `envelope-${randomUUID()}.json`);
  writeFileSync(path, envelopeBytes); // the SAME bytes, byte for byte — the relay
  return runAtlas(repo.repoPath, ['emit', path, `--at=${rev}`]);
}

// ── the happy-path fact AUTHOR — the product `draft` door, replacing the in-process author.ts fabricators ──

/** The structurally-relevant fields of the `DraftOut` envelope `atlas draft --json` prints. The product
 *  `DraftOut` (@atlas/tools types.ts) carries more — `operation`/`route`/`requires` — but a black-box author
 *  needs only the composed `fact` and the `rev` the emit wire requires; parsed off the wire, never product-
 *  imported (`@atlas/tools` is not an e2e-blackbox dependency, and the whole point is to stay black-box). */
interface DraftEnvelope {
  readonly fact: GroundedFact;
  readonly rev: string;
}

/**
 * Author a happy-path GROUNDED fact through the PRODUCT `atlas draft <anchor> <slot> <claim> --json` door —
 * a READ-ONLY composition planner that persists NOTHING (cli.ts) — and return the `GroundedFact` it composes
 * off the runtime's OWN index. This is the product-door STAND-IN replacement for the former in-process
 * happy-path fabricators (`groundedAdvisoryFact`, since RETIRED; `groundedSymbolFact`, kept in
 * adversarial-fixtures.ts only as a multi-entry building block): the parts those used to FAKE by re-building
 * `Axes` in process — the grounding, the real `subtreeHash`, the `nodeKey` identity — are now all
 * PRODUCT-computed, exactly as a user typing `atlas draft` receives them.
 *
 * TWO deliberate departures from a bare envelope, each a governance-class DECLARATION (not grounding — the
 * truth gate still re-derives the product grounding at emit, untouched):
 *   - `tier` is APPLIED here (default `T1`). `atlas draft` hard-defaults `T2` "by construction" (KNOW-6
 *     move-in, draft.ts `DRAFT_TIER`), but the visible-fact stories need `tier≥T1` (TOOLS-6 bounds `T2` OUT of
 *     the read pack) — the SAME `T1` the retired `groundedAdvisoryFact` defaulted to. `tier` is NOT in the
 *     identity formula (draft.ts), so this never shifts the drafted `id`.
 *   - `scope` is passed through from the door (it computes `scopeOf(anchor)` — the anchor's first path
 *     segment), matching the old default of `'src'` for `src/*` anchors.
 *
 * Emit is DELIBERATELY separate — callers drive `emitFact` themselves. The ordered dedup / drift / supersede
 * stories interleave `query` assertions BETWEEN emits (emit F, assert one node, re-emit F, assert dedup…), so
 * folding emit into authoring would corrupt their sequence. Returns `{fact, draft}`; the `draft` run is the
 * read-only subprocess (exit 0 already asserted here). Throws on a non-zero draft (a TEST-SETUP fault —
 * a silent empty fact would make every downstream assertion pass VACUOUSLY).
 */
export function draftFact(repo: FixtureRepo, anchor: string, slot: string, claim: string, tier: Tier = 'T1'): { readonly fact: GroundedFact; readonly draft: AtlasRun } {
  const run = runAtlas(repo.repoPath, ['draft', anchor, slot, claim, '--json']);
  if (run.exitCode !== 0) {
    throw new Error(`author8-subprocess: 'atlas draft ${anchor} ${slot} … --json' exited ${run.exitCode}:\n${run.stdout}${run.stderr}`);
  }
  const env = JSON.parse(run.stdout) as DraftEnvelope;
  if (env.fact === undefined || typeof env.rev !== 'string') {
    throw new Error(`author8-subprocess: 'draft --json' printed no {fact, rev}:\n${run.stdout}`);
  }
  return { fact: { ...env.fact, tier }, draft: run };
}

/** The declared NAME of a folded unit key — the trailing `:`-field of its last `::` segment
 *  (`file::<start>:<kind>:<name>` ⇒ `<name>`, cf. adapter-io/src/ast.ts `unitPath`). */
function unitLeafName(key: string): string {
  const seg = key.split('::').at(-1) ?? '';
  return seg.slice(seg.lastIndexOf(':') + 1);
}

/** Resolve a top-level SYMBOL name inside `filePath` to the folded `::` unit qualifiedPath `atlas draft`
 *  expects as a symbol anchor — by reading the product `atlas anchors <file>` census (the discovery door),
 *  never re-folding the index in process. Throws if no such symbol unit exists (a TEST-SETUP fault). */
export function symbolAnchorKey(repo: FixtureRepo, filePath: string, symbolName: string): string {
  const { units } = anchorsOf(repo.repoPath, filePath);
  const hit = units.find((u) => u.kind === 'symbol' && unitLeafName(u.qualifiedPath) === symbolName);
  if (hit === undefined) {
    throw new Error(`author8-subprocess: no symbol unit '${symbolName}' under '${filePath}' (anchors census has no such '::' node)`);
  }
  return hit.qualifiedPath;
}
