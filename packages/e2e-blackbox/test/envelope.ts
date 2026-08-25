// @atlas/e2e-blackbox — test/envelope.ts  (WP-10.A2-a.E2E — the PURE, IMPORT-FREE envelope reconstructor)
//
// THE PROBLEM THIS FILE SOLVES. `atlas draft <anchor> <slot> <claim>` is a real subprocess door, but its
// RENDERED stdout (render.ts's `draft { fact, rev, operation, route, requires? }` branch) prints only a
// SUBSET of the drafted `GroundedFact`'s fields — `id`/`tier`/`predicateSlot`/`claimNorm`/`rev`/`operation`/
// `route`/`requires` — never `grounding`/`kind`/`freshness`/`claims`/`authoring`/`scope`. There is NO CLI
// flag that prints the full envelope as machine-readable JSON (checked: `parse.ts`'s `VALUED_FLAGS`, every
// dispatch in `cli.ts`, `cli-verdict.ts` — none of them serialize `verdict.data`). So a literal
// `draft-stdout-piped-into-emit-stdin` subprocess relay is NOT POSSIBLE with the shipped surface today —
// this is the missing door this WP's return card reports (a `--json` output mode for `draft`/`anchors`
// would close it directly).
//
// THE SOLUTION THIS FILE TAKES, WITHOUT IMPORTING `@atlas/*`. `atlas draft`'s composition recipe
// (`packages/tools/src/draft.ts`, `createDraft`) is FROZEN and fully read (not guessed): every field the
// rendered text omits is either (a) a LITERAL STRUCTURAL CONSTANT the shipped `draft` leg always emits for
// an advisory draft (`kind:'advisory'`, `freshness:'FRESH'`, `claims:[]`, `authoring:'ADVISORY'` — draft.ts
// mints ONLY the advisory family, never a `check`), (b) a ONE-LINE PURE STRING TRANSFORM of the anchor the
// caller already supplied (`scope = scopeOf(anchor)`, transcribed verbatim below with a pointer to its
// source), or (c) a value ALREADY observed over the wire — the grounding anchor's `{kind, qualifiedPath,
// subtreeHash}` is exactly one row of `atlas anchors <path>`'s own rendered listing (the SAME
// `GroundingComputer` port both doors read, AUTHOR-1), and `id`/`tier`/`claimNorm`(=the raw claim, verbatim
// — draft.ts never normalizes it)/`rev`/`operation`/`route`/`requires` are `atlas draft`'s own printed text.
//
// Nothing here EXECUTES product code — every value is either a byte transcribed from a real subprocess's
// stdout or a hand-copied literal from the frozen source text quoted above. `governed-emit.ts`'s gate 0
// (`evalShapeGate`) RECOMPUTES the routing `nodeKey` from the submitted `grounding`/`slot`/`tier` — it never
// trusts the submitted `id` for routing — so this reconstruction's `id` field is inert decoration; the
// fields the truth/shape gates actually read (`grounding`, `tier`, `scope`, `predicateSlot`, `claimNorm`)
// are the ones this module is careful to get byte-exact off the observed wire values (measured end-to-end
// against the real `atlas draft`→`atlas emit` pair before this file existed — see the WP return card).
//
// FRAMING RISK, NAMED RATHER THAN HIDDEN: if `packages/tools/src/draft.ts`'s literal defaults
// (`kind`/`freshness`/`claims`/`authoring`) ever change, this reconstruction goes STALE silently — it would
// keep compiling and would simply start failing every combo the SAME way (a payload the shape gate refuses
// for `malformed family`/`malformed grounding`), which is a LOUD, not a silent, failure of this story. It
// is not a claim that the CLI itself exposes these fields; it is a claim that `atlas draft`'s current
// documented recipe is exactly what this file encodes.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runAtlas } from '../src/harness.js';
import type { AtlasRun, FixtureRepo } from '../src/harness.js';

// ── parsed shapes (plain data — no @atlas/* type import) ───────────────────────────────────────────────

/** One row of `atlas anchors <path>`'s rendered `unit <kind> <qualifiedPath> [<subtreeHash>]` listing. */
export interface AnchorRow {
  readonly kind: 'file' | 'dir' | 'symbol';
  readonly qualifiedPath: string;
  readonly subtreeHash: string;
}

/** The parsed `data:` block of an `atlas anchors <path>` run. */
export interface AnchorsListing {
  readonly rev: string;
  readonly units: readonly AnchorRow[];
}

/** The parsed `data:` block of an `atlas draft <anchor> <slot> <claim>` run — the fields the rendered text
 *  actually carries (render.ts's `draft` branch). */
export interface ParsedDraft {
  readonly id: string;
  readonly tier: string;
  readonly slot: string;
  readonly claim: string;
  readonly rev: string;
  readonly operation: string;
  readonly route: string;
  readonly requires: string | undefined;
}

// ── parsers (pure string → structured data, no execution) ──────────────────────────────────────────────

const UNIT_LINE = /^ {2}unit (\S+) (.+) \[([0-9a-f]+)\]$/;

/** Parse `atlas anchors <path>`'s stdout. Throws (a TEST-SETUP fault, not a product assertion) if the
 *  invocation did not carry the expected `data:` block — a caller that gets `undefined` back silently would
 *  build an envelope off an empty unit set and every downstream `emit` would fail for the WRONG reason. */
export function parseAnchors(stdout: string): AnchorsListing {
  const revMatch = stdout.match(/^ {2}anchors: rev (\S+) —/m);
  if (revMatch?.[1] === undefined) {
    throw new Error(`envelope.ts: could not parse 'anchors: rev …' out of:\n${stdout}`);
  }
  const units: AnchorRow[] = [];
  for (const line of stdout.split('\n')) {
    const m = line.match(UNIT_LINE);
    if (m === null) continue;
    const kind = m[1];
    if (kind !== 'file' && kind !== 'dir' && kind !== 'symbol') continue;
    units.push({ kind, qualifiedPath: m[2] ?? '', subtreeHash: m[3] ?? '' });
  }
  return { rev: revMatch[1], units };
}

/** Parse `atlas draft <anchor> <slot> <claim>`'s stdout — every field the render carries, verbatim. */
export function parseDraft(stdout: string): ParsedDraft {
  const get = (label: string): string | undefined => stdout.match(new RegExp(`^ {2}${label}: (.*)$`, 'm'))?.[1];
  const id = get('draft');
  const tier = get('tier');
  const slot = get('slot');
  const claim = get('claim');
  const rev = get('rev');
  const operation = get('operation');
  const route = get('route');
  if (id === undefined || tier === undefined || slot === undefined || claim === undefined || rev === undefined || operation === undefined || route === undefined) {
    throw new Error(`envelope.ts: could not parse a full 'draft { … }' data block out of:\n${stdout}`);
  }
  return { id, tier, slot, claim, rev, operation, route, requires: get('requires') };
}

// ── the ONE-LINE structural transform, transcribed from `packages/tools/src/draft.ts`'s `scopeOf` ─────────
/** MIRRORS `packages/tools/src/draft.ts`'s `scopeOf` verbatim (AUTHOR-6d's "computed or defaulted" default
 *  for `scope`): the first `/`-delimited path segment of the anchor, or the whole anchor when it has none. */
export function scopeOf(anchor: string): string {
  const i = anchor.indexOf('/');
  const first = i < 0 ? anchor : anchor.slice(0, i);
  return first.length > 0 ? first : 'root';
}

/** MIRRORS `packages/adapter-io/src/grounding-computer.ts`'s coarse→`StructRef` kind widening: the
 *  `atlas anchors` listing's `dir` becomes the grounding anchor's `directory` (`structKindOf`); `file`/
 *  `symbol` pass through unchanged. Not gate-relevant (`groundingWellFormed` never reads `anchor.kind`), but
 *  kept faithful so the reconstructed envelope is not merely gate-legal but genuinely SHAPE-correct. */
function structKind(k: AnchorRow['kind']): 'file' | 'directory' | 'symbol' {
  return k === 'dir' ? 'directory' : k;
}

/**
 * Reconstruct the `atlas emit`-ready envelope `{ fact, rev, operation, route, requires? }` a REAL
 * `atlas draft <unit.qualifiedPath> <slot> <claim>` subprocess call would have produced — see this file's
 * header for exactly which byte comes from which real subprocess output vs which frozen structural
 * constant. `unit` MUST be the `AnchorRow` for `draft.slot`'s own anchor (the SAME `qualifiedPath` passed to
 * `atlas draft`), off the SAME `atlas anchors` listing computed at the SAME rev.
 */
export function reconstructEnvelope(unit: AnchorRow, draft: ParsedDraft): Record<string, unknown> {
  const fact: Record<string, unknown> = {
    kind: 'advisory', // draft.ts mints ONLY the advisory family (no `check`) — a frozen literal, never guessed
    id: draft.id,
    tier: draft.tier,
    claimNorm: draft.claim, // draft.ts: `claimNorm: input.claim` — UNMODIFIED, so the rendered text IS it
    grounding: {
      entries: [
        {
          anchor: { kind: structKind(unit.kind), qualifiedPath: unit.qualifiedPath, subtreeHash: unit.subtreeHash },
          path: unit.qualifiedPath, // draft.ts: `path: anchor.qualifiedPath` — the SAME string, not `filePathOf`
        },
      ],
    },
    freshness: 'FRESH', // draft.ts literal default
    claims: [], // draft.ts literal default
    authoring: 'ADVISORY', // draft.ts literal default
    scope: scopeOf(unit.qualifiedPath),
    predicateSlot: draft.slot,
  };
  const envelope: Record<string, unknown> = { fact, rev: draft.rev, operation: draft.operation, route: draft.route };
  if (draft.requires !== undefined) envelope['requires'] = draft.requires;
  return envelope;
}

// ── subprocess drivers (the ONLY place bytes cross the process boundary) ───────────────────────────────

/** `atlas anchors <path>` as a real subprocess, parsed. */
export function anchorsOf(repoPath: string, path: string): AnchorsListing {
  const run = runAtlas(repoPath, ['anchors', path]);
  if (run.exitCode !== 0) throw new Error(`envelope.ts: 'atlas anchors ${path}' exited ${run.exitCode}:\n${run.stdout}${run.stderr}`);
  return parseAnchors(run.stdout);
}

/** `atlas slots` as a real subprocess — the closed 13-member vocabulary, by name, in the door's own order. */
export function slotNames(repoPath: string): readonly string[] {
  const run = runAtlas(repoPath, ['slots']);
  if (run.exitCode !== 0) throw new Error(`envelope.ts: 'atlas slots' exited ${run.exitCode}:\n${run.stdout}${run.stderr}`);
  const names: string[] = [];
  for (const line of run.stdout.split('\n')) {
    const m = line.match(/^ {2}slot (\S+):/);
    if (m?.[1] !== undefined) names.push(m[1]);
  }
  return names;
}

/** `atlas draft <anchor> <slot> <claim>` as a real subprocess, parsed. */
export function draftOf(repoPath: string, anchor: string, slot: string, claim: string): ParsedDraft {
  const run = runAtlas(repoPath, ['draft', anchor, slot, claim]);
  if (run.exitCode !== 0) throw new Error(`envelope.ts: 'atlas draft ${anchor} ${slot} …' exited ${run.exitCode}:\n${run.stdout}${run.stderr}`);
  return parseDraft(run.stdout);
}

/** Write `envelope` to a fresh temp file under the repo and drive the REAL `atlas emit <file> --at=<rev>`
 *  subprocess. Returns the raw `{stdout, stderr, exitCode}` — the caller asserts. */
export function emitEnvelope(repo: FixtureRepo, envelope: Record<string, unknown>, at: string): AtlasRun {
  const path = join(repo.repoPath, `envelope-${randomUUID()}.json`);
  writeFileSync(path, JSON.stringify(envelope));
  return runAtlas(repo.repoPath, ['emit', path, `--at=${at}`]);
}

/** The composed one-call convenience: `draft` then `emit`, over a real `AnchorRow`. Returns the emit run
 *  (the caller asserts `exitCode === 0` — PROP-AUTH-8's acceptance). */
export function draftThenEmit(repo: FixtureRepo, unit: AnchorRow, slot: string, claim: string, rev: string): AtlasRun {
  const draft = draftOf(repo.repoPath, unit.qualifiedPath, slot, claim);
  const envelope = reconstructEnvelope(unit, draft);
  return emitEnvelope(repo, envelope, rev);
}
