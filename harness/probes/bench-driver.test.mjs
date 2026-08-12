// harness/probes/bench-driver.test.mjs — proves the D2 manifest JOIN (site → cost → outcome → fact →
// provenance) end to end, at $0, on the FAKE model.
//
// This drives the REAL `atlas mine` CLI (built dist, `packages/cli/dist/src/bin.js` — present once
// `npm run typecheck`/`tsc -b` has run, which CI always does before `npm test`) as a real subprocess, over a
// tiny two-package fixture corpus committed at `harness/probes/__fixtures__/bench-driver-corpus/` (each
// package pre-indexed with `scip-typescript`, so no external tool is required at test time). The model
// itself is a canned stand-in: `roles.propose.cmd` is wired to the REAL `metered-claude.mjs` (so the
// metering half of the pipeline is exercised for real, not mocked), which is pointed at a tiny fake `claude`
// binary (`$METERED_CLAUDE_BIN`) that echoes a fixed JSON envelope — the SAME technique
// `metered-claude.test.mjs` uses, so this test spends no real tokens and needs no network.
//
// What this proves, per the D2 return card:
//   - the manifest's per-site rows join OUTCOME (the printed `RunCoverage` ledger, via `mine-report.mjs`)
//     to COST (the metering sidecar, via the pool-safe site key) to FACT + PROVENANCE (the staging store +
//     CAS-addressed `answerRef`, via `atlas-store-read.mjs`) to the MODEL identity the caller stamped the
//     run with — for every corpus unit, not just one.
//   - `mine-report.mjs`'s rewritten `parseMineReport`/`parseFullMineReport` correctly reads a report that
//     SEEDED (the "mine: … site(s) visited …" line is absent on that branch — see that file's header for
//     the measured gap this closes).
//
// Harness invariant (harness/README.md): no `@atlas/*` import.

import { describe, it, expect, beforeAll } from 'vitest';
import { chmodSync, cpSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildModelConfig,
  buildUnitManifest,
  readCorpus,
  runCorpus,
  writeModelConfig,
} from './bench-driver.mjs';
import { parseFullMineReport } from './mine-report.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_CORPUS = join(HERE, '__fixtures__', 'bench-driver-corpus');
const CLI_BIN = join(HERE, '..', '..', 'packages', 'cli', 'dist', 'src', 'bin.js');
const METERED_CLAUDE = join(HERE, 'metered-claude.mjs');

/** A fake `claude`: ignores args, drains stdin, echoes the JSON in `$FAKE_CLAUDE_JSON` — identical
 *  technique to `metered-claude.test.mjs`'s own fake, so NO real model call is ever made here. */
const FAKE_CLAUDE_SRC = `#!/usr/bin/env node
import { readFileSync } from 'node:fs';
readFileSync(0);
process.stdout.write(process.env.FAKE_CLAUDE_JSON || '{}');
`;

/** One well-formed `atlas-fact` answer, priced at a fixed, obviously-synthetic cost — never a real spend. */
const FAKE_ENVELOPE = JSON.stringify({
  result: 'free reasoning, never a real model.\n```atlas-fact\n{"claim":"a fake but well-formed claim"}\n```\n',
  usage: { input_tokens: 111, output_tokens: 22, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  total_cost_usd: 0.0321,
  is_error: false,
  duration_api_ms: 250,
});

let tmp;
let corpus;
let modelConfigPath;
let fakeClaudeBin;

/** `atlas mine`'s spatial-axis skeleton walk needs the corpus unit to be a real (committed) git repo — a
 *  bare directory with only a `.atlas/index.scip` reports "no path on the spatial axis" and drops every
 *  node (INDEX-13). MEASURED. So each fixture package is copied into a fresh git repo per test run. */
function gitInit(dir) {
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['-c', 'user.email=bench@atlas.test', '-c', 'user.name=bench', 'commit', '-q', '-m', 'init'], { cwd: dir });
}

beforeAll(() => {
  if (!existsSync(CLI_BIN)) {
    throw new Error(
      `bench-driver.test.mjs: ${CLI_BIN} is not built. Run \`npm run build\` (or \`npm run typecheck\`, which builds it) first — CI always does, in that order, before \`npm test\`.`,
    );
  }
  tmp = mkdtempSync(join(tmpdir(), 'atlas-bench-driver-test-'));
  const pkgA = join(tmp, 'pkg-a');
  const pkgB = join(tmp, 'pkg-b');
  cpSync(join(FIXTURE_CORPUS, 'pkg-a'), pkgA, { recursive: true });
  cpSync(join(FIXTURE_CORPUS, 'pkg-b'), pkgB, { recursive: true });
  gitInit(pkgA);
  gitInit(pkgB);
  const corpusPath = join(tmp, 'corpus.json');
  writeFileSync(corpusPath, JSON.stringify([{ repo: pkgA, label: 'pkg-a' }, { repo: pkgB, label: 'pkg-b' }]));
  corpus = readCorpus(corpusPath);
  modelConfigPath = writeModelConfig(join(tmp, 'config'), METERED_CLAUDE);
  fakeClaudeBin = join(tmp, 'fake-claude.mjs');
  writeFileSync(fakeClaudeBin, FAKE_CLAUDE_SRC);
  chmodSync(fakeClaudeBin, 0o755);
}, 30_000);

describe('readCorpus', () => {
  it('rejects a non-array corpus file', () => {
    const p = join(mkdtempSync(join(tmpdir(), 'atlas-bench-bad-')), 'bad.json');
    writeFileSync(p, JSON.stringify({ not: 'an array' }));
    expect(() => readCorpus(p)).toThrow(/non-empty JSON array/);
  });

  it('rejects an entry with no `repo`', () => {
    const p = join(mkdtempSync(join(tmpdir(), 'atlas-bench-bad-')), 'bad.json');
    writeFileSync(p, JSON.stringify([{ label: 'no repo here' }]));
    expect(() => readCorpus(p)).toThrow(/corpus\[0\]/);
  });
});

describe('buildModelConfig / writeModelConfig', () => {
  it('shapes exactly the `roles.propose.cmd/args` `loadModelConfig` reads, nothing else', () => {
    expect(buildModelConfig('/abs/metered-claude.mjs')).toEqual({
      roles: { propose: { cmd: 'node', args: ['/abs/metered-claude.mjs'] } },
    });
  });
});

describe('the manifest join — site → cost → outcome → fact → provenance (fake model, $0)', () => {
  it('joins every planned site across a MULTI-UNIT corpus', () => {
    const sidecarPath = join(tmp, 'sidecar.jsonl');
    const manifest = runCorpus({
      corpus,
      cliBin: CLI_BIN,
      model: 'fake-model-x',
      modelConfigPath,
      sidecarPath,
      claudeBin: fakeClaudeBin,
      extraEnv: { FAKE_CLAUDE_JSON: FAKE_ENVELOPE },
    });

    expect(manifest.model).toBe('fake-model-x');
    expect(manifest.units).toHaveLength(2);

    for (const unit of manifest.units) {
      expect(unit.parseError, `unit ${unit.repo} did not parse: ${unit.parseError}`).toBeUndefined();
      expect(unit.exitCode).toBe(0);
      expect(unit.coverageVerdict).toMatch(/^coverage CLOSES/);
      expect(unit.malformedSiteRows).toEqual([]);
      // two source files per fixture package, each importing the other — both PLANNED and both SEEDED.
      expect(unit.sites).toHaveLength(2);

      for (const site of unit.sites) {
        expect(site.outcome).toBe('seeded');
        expect(site.model).toBe('fake-model-x');

        // COST: joined by the pool-safe site key (`metered-claude.mjs` `deriveSiteKey`), not by call order.
        expect(site.costJoined).toBe(true);
        expect(site.cost).toHaveLength(1);
        expect(site.cost[0].site).toBe(site.path);
        expect(site.cost[0].total_cost_usd).toBeCloseTo(0.0321, 6);
        expect(site.cost[0].input_tokens).toBe(111);
        expect(site.cost[0].output_tokens).toBe(22);
        expect(site.cost[0].abstained).toBe(false);
        expect(site.cost[0].is_error).toBe(false);

        // FACT + PROVENANCE: joined via the staging store (`by-primary-anchor`) and the CAS-addressed
        // answer receipt (`answerRef`/`answerText` — `mine-answer.ts`, read back through `atlas-store-read.mjs`).
        expect(site.factLookup).toBe('by-primary-anchor');
        expect(site.facts).toHaveLength(1);
        const fact = site.facts[0];
        expect(fact.nodeKey).toMatch(/^[0-9a-f]{64,}$/);
        expect(fact.claims).toEqual(['a fake but well-formed claim']);
        expect(fact.tier).toBe('T2');
        expect(fact.scope).toBe('atlas:mined');
        expect(fact.answerRef).toMatch(/^[0-9a-f]{64,}$/);
        // the CAS-addressed answer text round-trips byte for byte back to what the fake model emitted.
        expect(fact.answerText).toContain('a fake but well-formed claim');
      }
    }

    // every site across both units carries a DISTINCT nodeKey — no cross-unit collision in the join.
    const nodeKeys = manifest.units.flatMap((u) => u.sites.flatMap((s) => s.facts.map((f) => f.nodeKey)));
    expect(new Set(nodeKeys).size).toBe(nodeKeys.length);
  }, 30_000);
});

describe('mine-report.mjs — parseFullMineReport on a report that SEEDED (the "mine:" line is ABSENT here)', () => {
  it('still parses seeded/ratified/llmCalls/budgetSpent/sites/candidates + the coverage verdict + site rows', () => {
    const text = [
      'genesis: seeded 2 candidate fact(s); ratified 0',
      'cost: llmCalls 2 · budgetSpent 2',
      'coverage: coverage CLOSES — all 2 planned site(s) accounted for: 2 seeded, 0 abstained, 0 unrecorded, 0 interrupted, 0 never visited',
      'site: {"rank":1,"outcome":"seeded","kind":"file","path":"src/a.ts","facts":["src/a.ts"]}',
      'site: {"rank":2,"outcome":"seeded","kind":"file","path":"src/b.ts","facts":["src/b.ts"]}',
      '',
    ].join('\n');
    const r = parseFullMineReport(text);
    expect(r).toBeDefined();
    expect(r).toMatchObject({ seeded: 2, ratified: 0, llmCalls: 2, budgetSpent: 2, sites: 2, candidates: 2, allAbstained: false });
    expect(r.coverageVerdict).toMatch(/^coverage CLOSES/);
    expect(r.siteRows).toHaveLength(2);
    expect(r.malformedSiteRows).toEqual([]);
  });

  it('still refuses a report with no header/cost lines at all', () => {
    expect(parseFullMineReport('not a mine report')).toBeUndefined();
  });

  it('still refuses a 0-seeded report with no "mine:" line — that combination has no honest reading', () => {
    const text = 'genesis: seeded 0 candidate fact(s); ratified 0\ncost: llmCalls 0 · budgetSpent 0\n';
    expect(parseFullMineReport(text)).toBeUndefined();
  });
});

describe('buildUnitManifest', () => {
  it('reports a parse error rather than fabricating zeros for stdout it cannot read', () => {
    const unit = buildUnitManifest({ repo: '/nowhere', label: 'x', model: 'm', stdout: 'garbage', sidecarLines: [] });
    expect(unit.parseError).toBeDefined();
    expect(unit.sites).toEqual([]);
  });
});
