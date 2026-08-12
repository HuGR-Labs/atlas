#!/usr/bin/env node
// harness/probes/bench-driver.mjs — the #95 benchmark's A1 (precision) + A3 (cost) DATA COLLECTOR.
//
// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────────────────────────────────
// The A1/A3 axes both need ONE reproducible run over a chosen corpus, joinable back to what the model was
// actually asked and what it actually cost — and until now that join was hand-orchestrated per bench run.
// The pieces already exist as separate instruments:
//   - `metered-claude.mjs`     — the metering model wrapper, keys every call by a pool-safe SITE (the
//                                `qualifiedPath` recovered from the prompt's `<unit …>` header).
//   - `cost-sum.mjs`           — rolls a metering sidecar up to a total; this file does the PER-SITE join
//                                instead, which `cost-sum.mjs` deliberately does not do.
//   - `RunCoverage`/`SiteOutcome` (`packages/genesis/src/types.ts`) — the per-site run LEDGER, printed by
//     `mine-render.ts` `siteLine`/`coverageLines` and now parsed whole by `mine-report.mjs` `parseFullMineReport`.
//   - `mine-answer.ts` `answerReceipt` — the CAS-addressed, tamper-evident receipt a mined answer carries
//     (`answerRef` in the staging sidecar row); read back here via `atlas-store-read.mjs` `casGet`.
// This file is the thing that RUNS `atlas mine` over a corpus and STITCHES those four sources into one
// per-site MANIFEST row: outcome (from the ledger) × fact + provenance (from the staging store) × cost
// (from the metering sidecar) × model identity. It does NOT adjudicate truth (that is J1's instrument over
// this manifest) and does NOT compute recall (that is A4's ground-truth trail) — it only COLLECTS.
//
// ── THE JOIN KEY ─────────────────────────────────────────────────────────────────────────────────────────
// Three different sources name a site three different ways, and all three are reconciled to ONE key here —
// the printed `path` on the coverage row, which is the `qualifiedPath` `mine-render.ts` prints (bare path for
// a file/repo anchor, `path::name` for a symbol/block — see `siteLine`):
//   - the LEDGER's `path`            — the row itself, one per PLANNED site (`mine-report.mjs` `parseSiteRows`).
//   - the SIDECAR's `site`           — `metered-claude.mjs`'s `deriveSiteKey`, reconstructed from the SAME
//                                      `<unit path="…" name="…">` header the prompt carries, so it is the
//                                      SAME qualifiedPath string by construction (MEASURED, see the `.test.mjs`).
//   - the STAGING sidecar's `primaryAnchor` — the site a candidate row is anchored to (`WireProjection`,
//                                      `packages/adapter-io/src/sidecar.ts`).
// None of the three is a synthetic id this file invents; each is read as its own source already names it.
//
// A HONEST GAP, NAMED RATHER THAN HIDDEN: a `seeded` row's `facts` array (`SiteOutcome.facts`) carries the
// PRE-write-door `Fact.id` (`packages/genesis/src/coverage.ts` — `r.facts.map(f => f.id)`), which is NOT the
// nodeKey the write door mints into the staging sidecar (MEASURED: on a real run the two differ). So a
// seeded row's facts are looked up in the staging store by `primaryAnchor === row.path` instead of by id —
// correct for one-fact-per-site (today's only mined shape: `mine.ts` seeds exactly one `AdvisoryProposal`
// per admitted site) and NAMED as an assumption (`factLookup: 'by-primary-anchor'`) rather than silently
// trusted, so a future multi-fact-per-site seed does not silently under- or over-join here.
//
// ── WHAT THIS FILE DOES NOT DO ───────────────────────────────────────────────────────────────────────────
// It does not adjudicate, does not compute recall, does not touch product code, and does not fabricate a
// cost or a precision number for a live run it has not itself driven — a live metered run is a SEPARATE,
// explicitly PENDING step (see `docs`/the D2 return card); this file's own `.test.mjs` proves the pipeline
// deterministically over the fake model, at $0, and does not claim that proves anything about a real model.
//
// Harness invariant (harness/README.md): no `@atlas/*` import.
//
// ── USAGE ────────────────────────────────────────────────────────────────────────────────────────────────
//   node harness/probes/bench-driver.mjs \
//     --corpus <corpus.json>        # array of `{ "repo": "<abs path>", "label"?: "<string>" }`
//     --cli <path/to/bin.js>        # the built @atlas/cli entrypoint (packages/cli/dist/src/bin.js)
//     --model <model-id>            # stamped onto every manifest row and passed to metered-claude as
//                                    # $METERED_MODEL
//     --manifest <out.json>         # where the joined manifest is written
//     [--model-cmd <path>]          # the propose.cmd script; default metered-claude.mjs (real metering)
//     [--claude-bin <bin>]          # $METERED_CLAUDE_BIN — the binary metered-claude.mjs shells out to;
//                                   # default `claude`. Point this at a fake for a $0 rehearsal.
//     [--sidecar <path>]            # metering sidecar path; default a fresh temp file
//     [--config-dir <dir>]          # where the generated $ATLAS_MODEL_CONFIG is written; MUST be outside
//                                   # every corpus repo (`loadModelConfig` refuses an in-repo config);
//                                   # default a fresh temp dir
//
// Every corpus entry is run as `node <cli> mine .` with `cwd: repo` — `mine`'s own CLI takes no `--scope`
// flag (`docs/reference/commands/mine.md`: "`<repo>` … currently ignored: the entrypoint calls
// `runMine(process.cwd())`"), so the ONLY way to scope one run to one corpus unit is to run it FROM that
// unit's directory. A "13 packages" corpus is therefore 13 separate `mine` invocations, one per package
// directory, each contributing its own rows to the one manifest.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { casGet, readSidecar } from './atlas-store-read.mjs';
import { parseFullMineReport } from './mine-report.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Read + validate a corpus spec: a JSON array of `{ repo: string, label?: string }`. Every `repo` is
 *  resolved to an absolute path relative to the CWD it was invoked from (not this file's directory) — a
 *  corpus file is a caller artifact, not a harness one. Throws with the offending index named; a corpus this
 *  cannot read is not a run this driver should silently run zero sites over. */
export function readCorpus(path) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`bench-driver: corpus ${path} is not valid JSON: ${(e && e.message) || e}`);
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`bench-driver: corpus ${path} must be a non-empty JSON array of { repo, label? }`);
  }
  return raw.map((entry, i) => {
    if (entry === null || typeof entry !== 'object' || typeof entry.repo !== 'string' || entry.repo.trim() === '') {
      throw new Error(`bench-driver: corpus[${i}] must be an object carrying a non-empty string \`repo\``);
    }
    return { repo: resolve(entry.repo), label: typeof entry.label === 'string' ? entry.label : entry.repo };
  });
}

/** Build the `$ATLAS_MODEL_CONFIG` JSON `loadModelConfig` reads — `roles.propose.cmd/args` only; every other
 *  field takes the product's own default. `modelCmd` is the metering wrapper's own path (not the underlying
 *  `claude`/fake binary — that is `$METERED_CLAUDE_BIN`, an env knob `metered-claude.mjs` reads itself). */
export function buildModelConfig(modelCmd) {
  return { roles: { propose: { cmd: 'node', args: [modelCmd] } } };
}

/** Write a model config OUTSIDE every corpus repo (`configDir` is the caller's job to keep clear of them) —
 *  `loadModelConfig` refuses a config read from inside the repository under analysis (`docs/reference/commands/mine.md`
 *  §"What it refuses"), so a config planted inside a corpus repo would make every run in that repo exit 2. */
export function writeModelConfig(configDir, modelCmd) {
  mkdirSync(configDir, { recursive: true });
  const path = join(configDir, 'model.json');
  writeFileSync(path, JSON.stringify(buildModelConfig(modelCmd)));
  return path;
}

/**
 * Run `atlas mine .` once, in `repo`, under the given model config + metering env. Returns the raw captured
 * stdout+stderr (merged, the same bytes an operator would see) and the exit code — NEVER throws on a
 * non-zero exit (exit 1/2 are legitimate `mine` outcomes, `docs/reference/commands/mine.md` §"Exit codes";
 * only a `node`-level spawn failure — a missing `cli` binary — throws, because that is a driver
 * misconfiguration, not a run outcome).
 */
export function runMineOnce({ repo, cliBin, modelConfigPath, model, sidecarPath, claudeBin, extraEnv = {} }) {
  const env = {
    ...process.env,
    ATLAS_MODEL_CONFIG: modelConfigPath,
    METERED_MODEL: model,
    ATLAS_COST_SIDECAR: sidecarPath,
    ...(claudeBin !== undefined ? { METERED_CLAUDE_BIN: claudeBin } : {}),
    ...extraEnv,
  };
  let status = 0;
  let out = '';
  try {
    out = execFileSync('node', [cliBin, 'mine', '.'], {
      cwd: repo,
      env,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    // A non-zero `mine` exit lands here (`execFileSync` throws on any non-zero status) — that is a real run
    // outcome (partial / governed refusal), not a driver failure, so it is folded into the return value
    // rather than re-thrown. `e.status === null` (spawn never happened — e.g. `node` itself missing) is the
    // one case that IS a driver misconfiguration, and that alone is re-thrown.
    if (e.status === null || e.status === undefined) {
      throw new Error(`bench-driver: could not spawn \`node ${cliBin} mine .\` in ${repo}: ${(e && e.message) || e}`);
    }
    status = e.status;
    out = (e.stdout ?? '') + (e.stderr ?? '');
  }
  return { stdout: out, exitCode: status };
}

/** Look up every staging row anchored at `path`, by `primaryAnchor` (see the header note on why NOT by the
 *  ledger's own fact id). Returns `[]` when the staging sidecar could not be read at all (`unreadable`) OR
 *  simply carries no such row — both cases are reported by the caller as an explicit note, never silently. */
function stagingRowsAt(repo, path) {
  const staging = readSidecar(repo, 'staging');
  if (!staging.present) return [];
  return staging.entries
    .filter((e) => Array.isArray(e) && e.length === 2 && e[1] !== null && typeof e[1] === 'object')
    .map(([nodeKey, row]) => ({ nodeKey, ...row }))
    .filter((row) => row.primaryAnchor === path);
}

/** The CAS-addressed answer receipt for one staging row, read back through `atlas-store-read.mjs`
 *  (`answerRef` is the CAS id of the scrubbed answer text — `mine-answer.ts`). `undefined` when the row
 *  carries no `answerRef` (a pre-#195 row) or the CAS object could not be read — never fabricated. */
function answerFor(repo, row) {
  if (typeof row.answerRef !== 'string') return undefined;
  const obj = casGet(repo, row.answerRef);
  return { answerRef: row.answerRef, answerText: typeof obj === 'string' ? obj : undefined };
}

/** The metering sidecar row(s) for one site, joined by the SAME qualifiedPath string `metered-claude.mjs`
 *  derives from the SAME prompt header (`deriveSiteKey`). More than one row can share a site under a pool
 *  (`metered-claude.mjs`'s own header on why a bare `ts` is not the join key) — ALL are returned, not just
 *  the first, so a caller can see a retried/duplicated call rather than have it silently dropped. */
function costRowsAt(sidecarLines, path) {
  return sidecarLines.filter((r) => r.site === path);
}

/** Parse a metering sidecar into rows, tolerating an absent/empty file (no sidecar rows yet, or a run that
 *  visited 0 sites) and skipping — not throwing on — an unparseable line, named in `malformed`. */
function readSidecarLines(sidecarPath) {
  let text;
  try {
    text = readFileSync(sidecarPath, 'utf8');
  } catch {
    return { rows: [], malformed: [] };
  }
  const rows = [];
  const malformed = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      malformed.push(line);
    }
  }
  return { rows, malformed };
}

/**
 * Build one corpus unit's manifest rows: one per PLANNED site in its ledger, joining outcome + fact +
 * provenance (staging/CAS) + cost (metering sidecar) + the model identity the caller stamped this run with.
 *
 * `factLookup: 'by-primary-anchor'` is carried on every `seeded` row's `facts` entries — the NAMED assumption
 * from the header (one fact per seeded site, today's only mined shape) rather than a silent one.
 */
export function buildUnitManifest({ repo, label, model, stdout, sidecarLines }) {
  const parsed = parseFullMineReport(stdout);
  if (parsed === undefined) {
    return {
      repo,
      label,
      model,
      parseError: 'stdout did not carry the three lines `atlas mine` pins (genesis/cost/mine) — not a run this driver can join',
      sites: [],
    };
  }
  const sites = parsed.siteRows.map((row) => {
    const cost = costRowsAt(sidecarLines, row.path);
    const base = {
      repo,
      label,
      model,
      rank: row.rank,
      kind: row.kind,
      path: row.path,
      outcome: row.outcome,
      cost: cost.length > 0 ? cost : null,
      costJoined: cost.length > 0,
    };
    if (row.outcome === 'seeded') {
      const staged = stagingRowsAt(repo, row.path);
      return {
        ...base,
        ledgerFactIds: row.facts, // the pre-write-door ids the ledger itself names — carried, not discarded
        facts: staged.map((s) => ({
          nodeKey: s.nodeKey,
          claims: s.claims,
          tier: s.tier,
          scope: s.scope,
          contentHash: s.contentHash,
          ...answerFor(repo, s),
        })),
        factLookup: 'by-primary-anchor',
      };
    }
    if (row.outcome === 'abstained') return { ...base, whyNot: row.whyNot };
    if (row.outcome === 'unrecorded') return { ...base, note: row.note };
    if (row.outcome === 'unvisited') return { ...base, cause: row.cause };
    return base; // 'interrupted' carries only the base shape
  });
  return {
    repo,
    label,
    model,
    coverageVerdict: parsed.coverageVerdict,
    malformedSiteRows: parsed.malformedSiteRows,
    aggregate: { seeded: parsed.seeded, ratified: parsed.ratified, llmCalls: parsed.llmCalls, budgetSpent: parsed.budgetSpent },
    sites,
  };
}

/**
 * Run the whole corpus and return the FULL manifest — one `units[]` entry per corpus repo, each carrying its
 * own `sites[]`. `deps` is the seam this function is unit-tested through (no subprocess in `.test.mjs`
 * assertions about the JOIN itself; `runMineOnce`/`readSidecarLines` are the only two functions that touch
 * the filesystem/a subprocess and both are swappable here).
 */
export function runCorpus({ corpus, cliBin, model, modelConfigPath, sidecarPath, claudeBin, extraEnv, deps = {} }) {
  const run = deps.runMineOnce ?? runMineOnce;
  const readLines = deps.readSidecarLines ?? readSidecarLines;
  const units = corpus.map(({ repo, label }) => {
    const { stdout, exitCode } = run({ repo, cliBin, modelConfigPath, model, sidecarPath, claudeBin, extraEnv });
    const { rows: sidecarLines } = readLines(sidecarPath);
    const unit = buildUnitManifest({ repo, label, model, stdout, sidecarLines });
    return { ...unit, exitCode };
  });
  return {
    generatedAt: new Date().toISOString(),
    model,
    cliBin,
    sidecarPath,
    modelConfigPath,
    units,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────────────
function parseArgv(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    out[a.slice(2)] = argv[++i];
  }
  return out;
}

function main(argv) {
  const args = parseArgv(argv);
  const required = ['corpus', 'cli', 'model', 'manifest'];
  const missing = required.filter((k) => args[k] === undefined);
  if (missing.length > 0) {
    process.stderr.write(
      `bench-driver: missing --${missing.join(', --')}\n` +
        'usage: node bench-driver.mjs --corpus <file.json> --cli <bin.js> --model <id> --manifest <out.json> ' +
        '[--model-cmd <path>] [--claude-bin <bin>] [--sidecar <path>] [--config-dir <dir>]\n',
    );
    process.exit(2);
  }
  const corpus = readCorpus(resolve(args.corpus));
  const cliBin = resolve(args.cli);
  const modelCmd = resolve(args['model-cmd'] ?? join(HERE, 'metered-claude.mjs'));
  const configDir = args['config-dir'] !== undefined ? resolve(args['config-dir']) : mkdtempSync(join(tmpdir(), 'atlas-bench-config-'));
  const sidecarPath = args.sidecar !== undefined ? resolve(args.sidecar) : join(mkdtempSync(join(tmpdir(), 'atlas-bench-sidecar-')), 'sidecar.jsonl');
  const modelConfigPath = writeModelConfig(configDir, modelCmd);

  const manifest = runCorpus({
    corpus,
    cliBin,
    model: args.model,
    modelConfigPath,
    sidecarPath,
    claudeBin: args['claude-bin'],
  });
  writeFileSync(resolve(args.manifest), JSON.stringify(manifest, null, 2));

  const totalSites = manifest.units.reduce((n, u) => n + u.sites.length, 0);
  const seeded = manifest.units.reduce((n, u) => n + u.sites.filter((s) => s.outcome === 'seeded').length, 0);
  process.stdout.write(
    `bench-driver: ${manifest.units.length} unit(s), ${totalSites} planned site(s), ${seeded} seeded — manifest at ${args.manifest}\n`,
  );
}

// ── entry-point guard ────────────────────────────────────────────────────────────────────────────────────
// This file IS imported (by `bench-driver.test.mjs`), so it needs the correct guard — `` `file://${argv[1]}` ``
// is NOT it (`argv[1]` is unencoded and symlink-UNresolved while `import.meta.url` is both — see
// `concurrency-report.mjs`'s header for the measured divergence under `/tmp`/spaced paths). Same fix here:
// `realpathSync` + `pathToFileURL`, with a missing/stale `argv[1]` answering "not the entry point" (the safe
// direction for an imported module).
function isEntryPoint(url) {
  if (process.argv[1] === undefined) return false;
  try {
    return pathToFileURL(realpathSync(process.argv[1])).href === url;
  } catch {
    return false;
  }
}

if (isEntryPoint(import.meta.url)) main(process.argv.slice(2));
