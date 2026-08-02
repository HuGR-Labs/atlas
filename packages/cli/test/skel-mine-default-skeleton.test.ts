// @atlas/cli — test/skel-mine-default-skeleton.test.ts  (the `atlas mine` default S0 seam)
//
// THE FINDING: `mine.ts` used to default `skeleton` to a hand-built `emptySkeleton()` whose `axes.edges` is
// `[]`. `structuralSeeds` (genesis/rank.ts:321) ranks by dep-graph DEGREE and reads ONLY `axes.edges`, so an
// empty skeleton ⇒ 0 seeds ⇒ `rank` 0 candidates ⇒ the run-controller visits 0 sites and spends 0 calls.
// A default `atlas mine` therefore reported `llmCalls 0 · budgetSpent 0` — and the user-facing line
// "no proposer model wired" named a REAL but NON-OPERATIVE cause: wiring a live model on top of an empty
// skeleton would still have produced exactly 0. The operative cause was the absent skeleton.
//
// THE BITE (revert-checked): case 1 asserts the DEFAULT pass VISITS sites on a real, indexed repo
// (`budgetSpent`/`llmCalls` > 0). Against `emptySkeleton()` those are 0, so case 1 is RED before the wiring
// and GREEN after — it cannot pass on the old default.
//
// THE OUTCOME IS UNCHANGED WHERE IT SHOULD BE (cases 2-4): with sites now genuinely visited, the still-null
// default proposer ABSTAINS at every one of them. Zero facts, typed `WhyNot` per site, exit 0, and the exact
// `MINE_ABSTAIN_LINE` — that is the CORRECT result, and no admission check was weakened to move a number.

import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { create } from '@bufbuild/protobuf';
import {
  serializeSCIP,
  IndexSchema,
  MetadataSchema,
  ToolInfoSchema,
  DocumentSchema,
  OccurrenceSchema,
  SymbolRole,
} from '@c4312/scip';
import { createSkeletonSource } from '@atlas/adapter-io';
import { runExtract } from '@atlas/genesis';
import type { GenesisBudget, HistorySource, MinedSignals, SiteProposer } from '@atlas/genesis';
import { runMine, driveMine, buildControllerDeps } from '../src/mine.js';
import type { MineDeps } from '../src/mine.js';

// ── a REAL indexed repo: git-tracked sources + the `.atlas/index.scip` dump `build` derives edges from ──
// The dump is written INSIDE the repo (the production source reads `<repo>/.atlas/index.scip`, the same path
// `composeRuntime` uses), which is why the frozen adapter-io `fix-scip` harness — it writes to its own temp
// dir, in another package's test tree — cannot be reused verbatim here. The corpus is the same controlled
// minimum: `greet` DEFINED in util.ts, REFERENCED in app.ts (⇒ a resolved edge), plus one reference with no
// definition anywhere (⇒ an `unresolved` edge, INDEX-13 — declared, never guessed).
const SYM_GREET = 'util/greet().';
const SYM_MISSING = 'util/missingHelper().';

const temps: string[] = [];

function makeIndexedRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-skel-cli-'));
  temps.push(dir);
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'util.ts'), 'export function greet(n: string): string {\n  return `hi ${n}`;\n}\n');
  writeFileSync(join(dir, 'src', 'app.ts'), "import { greet } from './util';\n\nexport function main(): string {\n  return greet('world') + missingHelper();\n}\n");
  const git = (...args: string[]): void => {
    execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  };
  git('init', '-q');
  git('config', 'user.email', 'fixture@atlas.test');
  git('config', 'user.name', 'atlas fixture');
  git('add', '-A');
  git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture');

  const index = create(IndexSchema, {
    metadata: create(MetadataSchema, {
      projectRoot: 'file:///fixture',
      toolInfo: create(ToolInfoSchema, { name: 'atlas-fixture', version: '0' }),
    }),
    documents: [
      create(DocumentSchema, {
        relativePath: 'src/util.ts',
        occurrences: [create(OccurrenceSchema, { symbol: SYM_GREET, symbolRoles: SymbolRole.Definition })],
      }),
      create(DocumentSchema, {
        relativePath: 'src/app.ts',
        occurrences: [
          create(OccurrenceSchema, { symbol: SYM_GREET, symbolRoles: 0 }),
          create(OccurrenceSchema, { symbol: SYM_MISSING, symbolRoles: 0 }),
        ],
      }),
    ],
  });
  mkdirSync(join(dir, '.atlas'), { recursive: true });
  writeFileSync(join(dir, '.atlas', 'index.scip'), serializeSCIP(index));
  return dir;
}

afterAll(() => {
  while (temps.length > 0) rmSync(temps.pop()!, { recursive: true, force: true });
});

// NOTE: this suite used to pin the literal constant
//   'mine: 0 candidates — no proposer model wired (abstain-by-design; facts are never fabricated)'
// That constant no longer exists. The empty-pass cause is now COMPUTED from the run's own report
// (`mineOutcome` → `mineWhyEmpty`), precisely because one fixed sentence cannot describe both an
// un-seeded frontier and a seeded one. That change and this one meet here: wiring the REAL skeleton is
// what finally puts a run into the SEEDED state, which is the only state in which "no model is wired"
// is the true cause. So the two assertions below are stronger than the constant they replace — they
// pin the two states apart, and each names the cause that actually applies to it.

describe('SKEL — the default `atlas mine` S0 seam is the REAL structural skeleton', () => {
  it('1. THE BITE: a default pass VISITS sites on an indexed repo (0 under the old emptySkeleton default)', () => {
    const repo = makeIndexedRepo();
    const report = driveMine(repo); // NO deps injected — this is the production default path

    // Both counters are incremented once per VISITED site (run-controller.ts drive()). Under the previous
    // `emptySkeleton()` default they were 0 because `rank` produced no candidate to visit at all.
    expect(report.budgetSpent).toBeGreaterThan(0);
    expect(report.llmCalls).toBeGreaterThan(0);
    // exactly the two dep-graph participants of the corpus (app.ts + util.ts) — a real, bounded frontier.
    expect(report.budgetSpent).toBe(2);
  });

  it('2. sites are visited and STILL zero facts are seeded — the null proposer abstains (never fabricates)', () => {
    const repo = makeIndexedRepo();
    const report = driveMine(repo);
    expect(report.budgetSpent).toBeGreaterThan(0); // sites WERE visited…
    expect(report.seeded.length).toBe(0); // …and produced nothing: abstain, not fabricate
    expect(report.ratified.length).toBe(0); // candidate-only stays structural
    expect(report.resumeToken).toBeUndefined(); // a complete pass, not an interruption
  });

  it('3. each visited site yields a TYPED WhyNot abstention (GEN-12), one per site, and 0 facts', () => {
    const repo = makeIndexedRepo();
    // Reconstruct the DEFAULT plan (the same seams `withDefaults` installs) to reach the per-site verdicts:
    // `buildControllerDeps`'s `visit` leg forwards only `.facts`, so the abstentions are not observable on
    // the report — they are observed here on the same `runExtract` call that leg makes.
    const nullProposer: SiteProposer = { propose: () => null };
    const zero: MinedSignals = { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] };
    const noHistory: HistorySource = {
      commitCount: () => 0,
      shallow: () => false,
      blameConcentration: () => 0,
      frontier: () => [],
      signals: () => zero,
    };
    const deps = {
      rev: 'HEAD',
      proposer: nullProposer,
      history: noHistory,
      skeleton: createSkeletonSource(repo),
      // NOTE: this literal is a `DiskStore` only through the `as unknown as MineDeps` cast below, so tsc does
      // not check it (the package tsconfig includes `src` only). It reaches `.plan()`/`runExtract` and never
      // `.upsert`, but the write doors are spelled out anyway: an incomplete store fails as a bare `TypeError`
      // from inside the run-controller's total `catch`, i.e. as an anonymous "interrupted pass".
      store: { put: () => '' as never, get: () => undefined, persistProjection: () => {}, loadProjection: () => undefined, commitProjection: () => ({ settled: true as const, out: undefined }), commitStaging: () => ({ settled: true as const, out: undefined }) },
      gate: { emit: () => ({ emitted: false as const, whyNot: { site: { kind: 'file' as const, qualifiedPath: 'x', subtreeHash: '' as never }, reason: 'unused' } }) },
      handoffTo: (): void => {},
    } as unknown as MineDeps;

    const plan = buildControllerDeps(repo, deps).plan(repo, 'HEAD', undefined);
    expect(plan.sites.length).toBe(2); // the real ranked frontier — 0 before the wiring

    const OFF = { enabled: false, maxDepth: 0, epsilon: 0 } as const;
    const budget: GenesisBudget = { ceiling: plan.sites.length, deepening: { review: OFF, enrich: OFF, expand: OFF } };
    const res = runExtract(plan.sites, budget, { proposer: nullProposer, gate: deps.gate });

    expect(res.facts.length).toBe(0); //                        zero facts…
    expect(res.abstained.length).toBe(plan.sites.length); //     …one typed WhyNot per visited site
    for (const w of res.abstained) {
      expect(w.reason).toContain('model abstained');
      expect(w.site.qualifiedPath.length).toBeGreaterThan(0); // the abstention is GROUNDED at a real site
    }
  });

  it('4. SEEDED by the real skeleton ⇒ the empty pass now correctly blames the ABSENT MODEL', async () => {
    const repo = makeIndexedRepo();
    const v = await runMine(repo);
    expect(v.exitCode).toBe(0);
    expect(v.stdout).toContain('seeded 0');
    // the cost line is now HONEST about the work actually done (it read `llmCalls 0 · budgetSpent 0` before).
    expect(v.stdout).toContain('cost: llmCalls 2 · budgetSpent 2');
    // …and BECAUSE sites were visited, the model is genuinely the operative cause here.
    expect(v.stdout).toContain('2 site(s) visited and every one abstained');
    expect(v.stdout).toContain('no proposer model is wired');
    expect(v.stdout).toContain('never fabricated');
    expect(v.stdout).not.toContain('0 sites visited'); // the structural cause does NOT apply to this run
  });

  it('5. TOTALITY preserved: a non-existent repo path is a clean, empty pass that blames the STRUCTURE', async () => {
    const v = await runMine('no-such-repo-anywhere');
    expect(v.exitCode).toBe(0);
    expect(v.stdout).toContain('seeded 0');
    expect(v.stdout).toContain('cost: llmCalls 0 · budgetSpent 0'); // fail-closed ⇒ nothing to visit
    // The CONTRAST with case 4, from the same code: 0 sites visited ⇒ the model was never reached, so
    // blaming it would be a lie. This pair is the whole point — one render, two honest causes.
    expect(v.stdout).toContain('0 sites visited');
    expect(v.stdout).not.toContain('no proposer model is wired');
    expect(v.stdout).toContain('wiring a model would not change this 0');
  });
});
