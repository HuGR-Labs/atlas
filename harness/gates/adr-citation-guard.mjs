#!/usr/bin/env node
// adr-citation-guard — every ADR this corpus CITES must be an ADR this corpus CONTAINS.
//
// ── THE DEFECT THIS EXISTS TO STOP RETURNING ─────────────────────────────────────────────────────────
// `ADR-0013` was cited by name in 24 places under `docs/` — including two RATIFIED rows of
// `requirements/invariant-register.md`, five clauses of `requirements/req-tls.md`, and ADR-0002 itself
// ("the consumer has arrived: ADR-0013's advisory band") — while `docs/adr/` ran `0001..0012` and stopped.
// Two PRs that IMPLEMENT the decision were merged; the document carrying the measurement they rest on sat
// on an unmerged branch and was very nearly deleted as debris. The repository is public, so for that whole
// window every one of those 24 pointers was an invitation to read a file that was not there.
//
// Nothing caught it. `id-integrity` is the corpus's id-graph gate and it does not see this: its ID-2/ID-5
// legs check `<relpath>.md#<ID>` POINTERS, and the corpus overwhelmingly cites ADRs the way prose does —
// the bare token `ADR-0013`, in a sentence, with no path beside it. `ADR-` appears in that gate's source
// only inside waiver strings. The citation form the corpus actually uses was the one form nothing checked.
//
// ── WHAT IT CHECKS ───────────────────────────────────────────────────────────────────────────────────
// Every `ADR-<NNNN>` token occurring anywhere in any `docs/**/*.md` MUST resolve to a file matching
// `docs/adr/ADR-<NNNN>-*.md`. On failure it names `citing file:line → missing id` for EVERY occurrence,
// not the first: one missing ADR strands pointers in many files at once, and reporting only the first
// citer trains the reader to fix one line and re-run.
//
// The token is matched EVERYWHERE in the file — inside fenced blocks, inside tables, inside HTML comments.
// A reader following `ADR-0013` does not care that it was written inside a fence, and an illustrative
// placeholder ADR id is a shape this corpus does not use. Widening the gate later to exempt fences would
// mean a citation can be hidden from it by indenting four spaces.
//
// ── ANTI-VACUITY: EVERY WAY OF CHECKING NOTHING IS AN EXPLICIT FAILURE ───────────────────────────────
// The worst outcome for this gate is not a false alarm — it is a green run over an empty corpus. "All
// citations resolve" and "the walk found nothing" print the same word. This repo has already shipped two
// files that sat in `harness/gates/`, ran to completion and exited 0 having asserted nothing (#172), so
// each of these is a NAMED refusal rather than a vacuous pass:
//
//   A-0  `docs/` does not exist.
//   A-1  the `docs/**/*.md` walk resolves EMPTY — nothing scanned is not a clean scan.
//   A-2  `docs/adr/` does not exist — an absent ADR directory satisfies every citation by making the
//        index empty, which is precisely the state that produced the defect above, inverted.
//   A-3  `docs/adr/` contains ZERO files matching `ADR-<NNNN>-*.md` — an empty index is not "all
//        citations satisfied", and a corpus that cites ADRs while owning none is not a state this
//        repository can reach by accident.
//
// ── WHAT IT DELIBERATELY DOES NOT CHECK (stated so it cannot be mistaken for coverage) ───────────────
//  a) CONTENT. That `ADR-0013.md` says what its citer claims it says. Existence and numbering only. A gate
//     that grades an ADR's prose becomes an editor, and an editor nobody elected gets worked around.
//  b) THE REVERSE LEG. An ADR file nobody cites is NOT reported. `command-doc-guard` checks its
//     correspondence both ways because an orphan command page documents a door that does not open; an
//     uncited ADR is a decision nobody had occasion to reference, which is normal and not a defect.
//  c) DUPLICATE / AMBIGUOUS IDS. Two files both matching `ADR-0007-*.md` would both satisfy a citation.
//     That is a defect, and it is not this gate's: it is one branch away from ID-1 uniqueness, and adding
//     an ownership rule here would put a second id-uniqueness authority in the tree.
//  d) NON-DOCS CARRIERS. `ADR-0013` is also named in 25 files under `packages/**` (source and tests). Those
//     are out of scope by construction: this gate's corpus is `docs/`, and widening it silently would make
//     its success line describe a sweep it did not do.
//
// Run: `node harness/gates/adr-citation-guard.mjs` (reads markdown only — no build, no git).

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Repo root, OVERRIDABLE so the gate's own twin can point it at fixture trees. Without this the anti-vacuity
// branches above could only ever be exercised by hand — which is the same "trust me" the gate exists to end.
const ROOT = process.env.ADR_CITATION_GUARD_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOCS = join(ROOT, 'docs');
const ADR_DIR = join(DOCS, 'adr');

/** The citation token, as prose writes it. Four digits, and `\b` on both sides so `ADR-00131` is not a hit. */
const CITATION = /\bADR-(\d{4})\b/g;
/** The filename convention `docs/adr/` is written in: the id, a hyphen, a slug, `.md`. */
const ADR_FILE = /^ADR-(\d{4})-.+\.md$/;

const rel = (p) => relative(ROOT, p).split('\\').join('/');

function refuse(code, message) {
  console.error('adr-citation-guard: FAIL\n');
  console.error(`  ✗ ${code} — ${message}\n`);
  console.error(
    'The gate refuses to report on a corpus it could not read. An empty sweep prints the same word as a ' +
      'clean one, so it is not allowed to print it. Fix the corpus or the path, never this branch.',
  );
  process.exit(1);
}

/** Every `.md` under `dir`, recursively, sorted — absolute paths. */
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

// ── A-0 / A-2 — the two directories this gate stands on ──────────────────────────────────────────────
if (!existsSync(DOCS) || !statSync(DOCS).isDirectory()) {
  refuse('A-0 CORPUS MISSING', `${rel(DOCS)} does not exist (or is not a directory). There is nothing to scan.`);
}
if (!existsSync(ADR_DIR) || !statSync(ADR_DIR).isDirectory()) {
  refuse(
    'A-2 ADR DIRECTORY MISSING',
    `${rel(ADR_DIR)} does not exist (or is not a directory). With no index, EVERY citation in the corpus is ` +
      'dangling — reporting "all resolve" here would be the defect this gate exists to catch, inverted.',
  );
}

// ── A-1 — the walk ───────────────────────────────────────────────────────────────────────────────────
// ORDER IS LOAD-BEARING: the walk is checked BEFORE the index. Every ADR file is itself a `.md` under
// `docs/`, so an empty walk implies an empty index — check the index first and A-1 becomes a branch nothing
// can reach, i.e. a guard that is present and unreachable, the same lie one level in. Checked in this order
// both refusals are reachable, and the gate's own twin exercises each with its own fixture.
const corpus = walk(DOCS);
if (corpus.length === 0) {
  refuse(
    'A-1 EMPTY WALK',
    `the \`${rel(DOCS)}/**/*.md\` walk resolved to ZERO files. Nothing scanned is not a clean scan — this is ` +
      'the reading of the tree breaking, not a corpus with no prose in it.',
  );
}

// ── A-3 — the index ──────────────────────────────────────────────────────────────────────────────────
/** id → filename, for every `docs/adr/ADR-<NNNN>-*.md`. Flat: a nested file is not an ADR. */
const index = new Map();
for (const e of readdirSync(ADR_DIR, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!e.isFile()) continue;
  const m = ADR_FILE.exec(e.name);
  if (m !== null && !index.has(m[1])) index.set(m[1], e.name);
}
if (index.size === 0) {
  refuse(
    'A-3 EMPTY ADR INDEX',
    `${rel(ADR_DIR)} contains no file matching \`ADR-<NNNN>-<slug>.md\`. An empty index satisfies every ` +
      'citation vacuously. A corpus that cites ADRs while owning none is not a state this repo reaches by accident.',
  );
}

// ── the sweep ────────────────────────────────────────────────────────────────────────────────────────
const dangling = []; // every OCCURRENCE, not every id — one missing ADR usually strands many lines
const citedIds = new Set();
let nCitations = 0;

for (const abs of corpus) {
  const lines = readFileSync(abs, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(CITATION)) {
      nCitations++;
      citedIds.add(m[1]);
      if (!index.has(m[1])) dangling.push({ where: `${rel(abs)}:${i + 1}`, id: `ADR-${m[1]}` });
    }
  }
}

if (dangling.length > 0) {
  const missing = [...new Set(dangling.map((d) => d.id))].sort();
  console.error('adr-citation-guard: FAIL\n');
  for (const d of dangling) console.error(`  ✗ ${d.where} → ${d.id} — cited, and no file matches docs/adr/${d.id}-*.md`);
  console.error(
    `\n${dangling.length} dangling citation(s) across ${new Set(dangling.map((d) => d.where.split(':')[0])).size} ` +
      `file(s), naming ${missing.length} absent ADR(s): ${missing.join(', ')}.\n` +
      `The index holds ${index.size}: ${[...index.keys()].sort().map((k) => `ADR-${k}`).join(', ')}.\n` +
      'LAND THE DOCUMENT — do not delete the citations. A decision that is implemented, cited and ratified ' +
      'but absent from the tree is the exact state this gate was written for; deleting the pointers would ' +
      'clear the gate and leave the evidence base unpublished.',
  );
  process.exit(1);
}

console.log(
  `adr-citation-guard: OK — ${nCitations} \`ADR-<NNNN>\` citation(s) in ${corpus.length} docs/**/*.md file(s), ` +
    `naming ${citedIds.size} distinct ADR(s); all resolve into an index of ${index.size} under ${rel(ADR_DIR)}. ` +
    'Existence and numbering only — whether a cited ADR SAYS what its citer claims is a human job and is not ' +
    'claimed here, and the reverse leg (an ADR nobody cites) is declared uncovered, not checked.',
);
