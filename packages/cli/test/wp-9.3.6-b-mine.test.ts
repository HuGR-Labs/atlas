// @atlas/cli — test/wp-9.3.6-b-mine.test.ts  (WP-9.3.6-b.CLI — CLI-4: the `atlas mine` driver)
//
// The `atlas mine` driver COMPOSES the frozen genesis run-controller as ONE governed pass. This suite proves
// the three CLI-4 goldens WITHOUT a live model, mirroring packages/e2e/test/s02-genesis-mining.e2e.test.ts:
//   • 4a  the driver's write-set == a parallel `makeRunController(sameDeps).genesis(...)` oracle over the same
//         inputs — teeth: re-ordering the stages (extract before rank) diverges from the oracle;
//   • 4b  every mined write is CANDIDATE-only (never ratified) — teeth: stamping a proposal `ratified` is RED;
//   • 4c  the driver adds 0 admission of its own — its admitted set == the run-controller's — teeth: a local
//         pre-filter before the controller diverges.
// The LLM is the INJECTED `SiteProposer.propose` seam (a recorded call-counter, never a model); the emit
// verdict is the INJECTED `EmitGate` (a double, or `makeAdmitGate` forwarding the FROZEN `admit` verbatim).

import { describe, it, expect } from 'vitest';
import { asSubtreeHash, asHash, asNodeKey } from '@atlas/kernel';
import type { StructRef, Hash } from '@atlas/contracts';
import type { Axes, DepEdge, IndexNode, Manifest } from '@atlas/index';
import { makeRunController } from '@atlas/genesis';
import type {
  Candidate,
  Fact,
  MinedSignals,
  Skeleton,
  SiteProposer,
  EmitGate,
  HistorySource,
  SkeletonSource,
  GenesisBudget,
  AdmitDeps,
} from '@atlas/genesis';
import type { DiskStore } from '@atlas/adapter-io';
import type { StoreProjection, CurrentNode } from '@atlas/knowledge';
import { runMine, driveMine, buildControllerDeps, makeAdmitGate, MINE_ABSTAIN_LINE } from '../src/mine.js';
import type { MineDeps } from '../src/mine.js';

// ── the ranked-frontier skeleton fixture (mirrors s02's acme skeleton) ─────────────────────────────────
const struct = (id: string): StructRef => ({ kind: 'symbol', qualifiedPath: `pkg/${id}.ts::${id}`, subtreeHash: asSubtreeHash(id) });
const A = struct('st-a10');
const B = struct('st-b22');
const C = struct('st-c31');
const D = struct('st-d40');
const FRONTIER: readonly StructRef[] = [A, B, C, D];

const edge = (from: string, to: string | null): DepEdge => ({ from: asHash(from), to: to === null ? null : asHash(to), kind: 'resolved' });
// def→ref: st-a10 is the hub (referenced by b/c/d) ⇒ highest PPR; st-d40 is cold.
const REF_EDGES: readonly DepEdge[] = [
  edge('st-b22', 'st-a10'),
  edge('st-c31', 'st-a10'),
  edge('st-c31', 'st-b22'),
  edge('st-d40', 'st-a10'),
  edge('st-d40', 'st-b22'),
  edge('st-d40', 'st-c31'),
];
const leaf = (key: string): IndexNode => ({ axis: 'dependency', level: 'symbol', key, subtreeHash: asSubtreeHash(key), children: [], objects: [] as readonly Hash[] });
const axisRoot = (keys: readonly string[]): IndexNode => ({ axis: 'dependency', level: 'repo', key: 'root', subtreeHash: asSubtreeHash('root'), children: keys.map(leaf), objects: [] });
const skeletonOf = (): Skeleton => {
  const keys = ['st-a10', 'st-b22', 'st-c31', 'st-d40'];
  const axes: Axes = { spatial: axisRoot(keys), territory: axisRoot(keys), dependency: axisRoot(keys), edges: REF_EDGES };
  const manifest: Manifest = { territories: [] };
  return { axes, manifest };
};
const BASE_SKELETON = skeletonOf();

// ── injected seams ─────────────────────────────────────────────────────────────────────────────────────
const ZERO_SIGNALS: MinedSignals = { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] };
const idOf = (c: Candidate): string => c.site.subtreeHash;

/** A grounded fact whose anchor re-derives from the site — the gate only forwards a verdict. */
const factFor = (c: Candidate, claim: string): Fact =>
  ({
    kind: 'advisory',
    id: asNodeKey(`nk-${c.site.qualifiedPath}`),
    tier: 'T2',
    claimNorm: claim,
    grounding: { entries: [{ anchor: c.site, path: c.site.qualifiedPath }] },
    freshness: 'FRESH',
    claims: [],
    authoring: 'ADVISORY',
  }) as unknown as Fact;
const anchorOf = (f: Fact): string => (f as unknown as { grounding: { entries: { anchor: StructRef }[] } }).grounding.entries[0]!.anchor.subtreeHash;
const anchorSet = (fs: readonly Fact[]): Set<string> => new Set(fs.map(anchorOf));

const skeletonSource: SkeletonSource = { skeleton: () => BASE_SKELETON };

/** A non-thin history whose frontier IS the injected FRONTIER (so `createMine` ranks it, never a git shell). */
const injectedHistory: HistorySource = {
  commitCount: () => 5,
  shallow: () => false,
  blameConcentration: () => 0,
  frontier: () => FRONTIER,
  signals: () => ZERO_SIGNALS,
};

/** The recorded proposer — a live call-counter (the `$0`-LLM proof), returns proposal `P0` at every site. */
const recordingProposer = (): { proposer: SiteProposer; calls: () => number } => {
  let n = 0;
  return { proposer: { propose: (c) => { n += 1; return { cand: c, claim: `P0@${idOf(c)}` }; } }, calls: () => n };
};

const gateEmitAll = (): EmitGate => ({ emit: (seed, c) => ({ emitted: true, fact: factFor(c, seed.claim) }) });
const gateEmitFor = (ids: ReadonlySet<string>): EmitGate => ({
  emit: (seed, c) => (ids.has(idOf(c)) ? { emitted: true, fact: factFor(c, seed.claim) } : { emitted: false, whyNot: { site: c.site, reason: 'not in admitted set' } }),
});

const fakeStore = (): DiskStore => ({ put: () => asHash('x'), get: () => undefined, persistProjection: () => {}, loadProjection: () => undefined });

const OFF = { enabled: false, maxDepth: 0, epsilon: 0 } as const;
const budget = (ceiling: number): GenesisBudget => ({ ceiling, deepening: { review: OFF, enrich: OFF, expand: OFF } });

const depsOf = (over: Partial<MineDeps> = {}): MineDeps => ({
  rev: 'HEAD',
  proposer: over.proposer ?? recordingProposer().proposer,
  history: over.history ?? injectedHistory,
  skeleton: over.skeleton ?? skeletonSource,
  store: over.store ?? fakeStore(),
  gate: over.gate ?? gateEmitAll(),
  handoffTo: over.handoffTo ?? ((): void => {}),
  ...(over.budget !== undefined ? { budget: over.budget } : {}),
});

const REPO = 'fix-repo';

// ── SCN-CLI-4a — the driver's write-set equals the frozen run-controller's ─────────────────────────────
describe('CLI-4a — mine drives the frozen run-controller; write-set == the oracle', () => {
  it('the driver seeds exactly what makeRunController(sameDeps).genesis(...) seeds over the same inputs', () => {
    const deps = depsOf({ budget: budget(FRONTIER.length) });
    const driver = driveMine(REPO, deps);
    const oracle = makeRunController(buildControllerDeps(REPO, deps)).genesis(REPO, deps.rev, deps.budget);
    expect(anchorSet(driver.seeded)).toEqual(anchorSet(oracle.seeded));
    expect(driver.seeded.length).toBe(FRONTIER.length); // gate-emit-all over the full ceiling
  });

  it('$0-LLM: ranking spends 0 model calls; the proposer fires only at extraction (live counter)', () => {
    const rec = recordingProposer();
    const deps = depsOf({ proposer: rec.proposer, budget: budget(FRONTIER.length) });
    // ranking the frontier (S0/S1) is a pure function of the skeleton — it must not touch the model.
    buildControllerDeps(REPO, deps); // constructing the ports ranks nothing yet
    expect(rec.calls()).toBe(0);
    const report = driveMine(REPO, deps);
    expect(rec.calls()).toBe(FRONTIER.length); // one bounded call per visited site — the counter IS live
    expect(report.llmCalls).toBe(FRONTIER.length);
  });

  it('TEETH: re-ordering the stages (extract before rank) diverges from the oracle', () => {
    // a sub-frontier ceiling ⇒ WHICH sites are seeded depends on the highest-PPR-first rank order.
    const deps = depsOf({ budget: budget(2) });
    const oracle = makeRunController(buildControllerDeps(REPO, deps)).genesis(REPO, deps.rev, deps.budget);
    // wrong variant: a plan that does NOT rank (extract-before-rank) — sites carry a REVERSED rank order.
    const cdWrong = buildControllerDeps(REPO, deps);
    const unranked = [...FRONTIER].map((site, i): Candidate => ({ site, signals: ZERO_SIGNALS, ppr: 0, rank: FRONTIER.length - i }));
    const wrong = makeRunController({ ...cdWrong, plan: () => ({ malformed: false, skeleton: BASE_SKELETON, sites: unranked }) }).genesis(REPO, deps.rev, deps.budget);
    expect(oracle.seeded.length).toBe(2);
    expect(anchorSet(wrong.seeded)).not.toEqual(anchorSet(oracle.seeded)); // a re-order changes the seeded set
  });
});

// ── SCN-CLI-4b — every mined write is candidate-only (never ratified) ──────────────────────────────────
describe('CLI-4b — mined writes are candidate-only; never ratified', () => {
  it('the report seeds candidate facts and ratifies nothing (the controller hard-codes ratified: [])', () => {
    const report = driveMine(REPO, depsOf({ budget: budget(FRONTIER.length) }));
    expect(report.seeded.length).toBeGreaterThan(0); // facts WERE produced from proposal P0
    expect(report.ratified.length).toBe(0); // candidate-only — nothing reaches ratified (structural)
  });

  it('TEETH: a report that stamps a seeded fact `ratified` breaks the never-ratified guard', () => {
    const report = driveMine(REPO, depsOf({ budget: budget(FRONTIER.length) }));
    const stamped = { ...report, ratified: report.seeded }; // a driver that promoted candidates to ratified
    const candidateOnly = (r: { ratified: readonly Fact[] }): boolean => r.ratified.length === 0;
    expect(candidateOnly(report)).toBe(true); //  the real driver: candidate-only (never ratified)
    expect(candidateOnly(stamped)).toBe(false); // the guard is real: it FLIPS RED on a stamping driver
  });
});

// ── SCN-CLI-4c — the driver adds 0 admission of its own ────────────────────────────────────────────────
describe('CLI-4c — admission is the frozen gate\'s; the driver invents none', () => {
  // the gate forwards the FROZEN `admit` verbatim: an advisory 2-door bar that admits ONLY these anchors.
  const admittedIds = new Set([A.subtreeHash, C.subtreeHash]);
  const admitDeps: AdmitDeps = {
    predicate: { synthesize: () => null, verify: () => 'NA', teeth: () => false },
    doors: { grounded: (g) => admittedIds.has(g.entries[0]!.anchor.subtreeHash), nonObvious: () => true },
    typeOracle: { expressible: () => false, diagnose: () => 'NA' },
    refine: () => null,
    indexState: leaf('idx'),
    K: 1,
  };

  it('the driver\'s admitted set == the run-controller\'s admitted set (admission forwarded verbatim)', () => {
    const deps = depsOf({ gate: makeAdmitGate(admitDeps), budget: budget(FRONTIER.length) });
    const driver = driveMine(REPO, deps);
    const oracle = makeRunController(buildControllerDeps(REPO, deps)).genesis(REPO, deps.rev, deps.budget);
    expect(anchorSet(driver.seeded)).toEqual(admittedIds); // exactly what `admit` admits — no more, no less
    expect(anchorSet(driver.seeded)).toEqual(anchorSet(oracle.seeded));
  });

  it('TEETH: a local pre-filter before the controller diverges from the frozen admitted set', () => {
    const deps = depsOf({ gate: makeAdmitGate(admitDeps), budget: budget(FRONTIER.length) });
    const oracle = makeRunController(buildControllerDeps(REPO, deps)).genesis(REPO, deps.rev, deps.budget);
    // wrong variant: a driver that PRE-FILTERS — it drops candidate C before the controller ever visits it.
    const cdWrong = buildControllerDeps(REPO, deps);
    const prefiltered = makeRunController({
      ...cdWrong,
      plan: () => ({ malformed: false, skeleton: BASE_SKELETON, sites: [A, B, D].map((site, i): Candidate => ({ site, signals: ZERO_SIGNALS, ppr: 1 - i / 10, rank: i + 1 })) }),
    }).genesis(REPO, deps.rev, deps.budget);
    expect(anchorSet(prefiltered.seeded)).not.toEqual(anchorSet(oracle.seeded)); // C was admitted-by-admit but pre-filtered out
  });
});

// ── the CliVerdict projection ──────────────────────────────────────────────────────────────────────────
describe('runMine — folds the GenesisReport to a CliVerdict', () => {
  it('a completed pass exits 0 and reports the seeded count on stdout', async () => {
    const v = await runMine(REPO, depsOf({ budget: budget(FRONTIER.length) }));
    expect(v.exitCode).toBe(0);
    expect(v.stdout).toContain(`seeded ${FRONTIER.length}`);
  });

  it('runMine(repo) is a valid all-default call (deps optional — bin.ts stays valid)', async () => {
    const v = await runMine(REPO); // honest fail-closed defaults ⇒ an empty, total pass (no model, no git)
    expect(v.exitCode).toBe(0);
    expect(v.stdout).toContain('seeded 0');
  });
});

// ── WP-F6 — the abstain-by-design render is LEGIBLE (mining is model-gated, fails closed) ────────────────
// FINDING: `atlas mine` writes 0 grounded candidates with no model wired. VERDICT: NOT a bug — the extractor
// abstains fail-closed (genesis/extract.ts:118) rather than fabricate an ungrounded fact. FIX: make the
// abstention LEGIBLE, do NOT invent a fake miner. This suite proves the 0-candidate render EXPLAINS itself.
describe('WP-F6 — a default (no-model) mine render is a legible abstain, not a silent 0', () => {
  it('a no-proposer pass seeds 0, exits clean (0), and renders the abstain-by-design line', async () => {
    const v = await runMine(REPO); // no proposer injected ⇒ model-gated abstain-by-design
    expect(v.exitCode).toBe(0); //             clean abstain — an empty pass is NOT an error
    expect(v.stdout).toContain('seeded 0'); // still 0 candidates (no fabricated fact)
    expect(v.stdout).toContain(MINE_ABSTAIN_LINE); // the WHY is legible on stdout
    expect(v.stdout).toContain('no proposer model wired'); // names the model-gate cause
    expect(v.stdout).toContain('never fabricated'); // states the honesty invariant
  });

  it('a real-model pass that DOES seed suppresses the abstain line (line means "no model", not "0 facts")', async () => {
    const v = await runMine(REPO, depsOf({ budget: budget(FRONTIER.length) })); // recordingProposer wired
    expect(v.stdout).not.toContain(MINE_ABSTAIN_LINE); // a wired model that seeded facts never claims abstain
  });

  it('MUTANT — a silent 0-candidate render (drops the abstain line) leaves the empty pass unexplained', async () => {
    const v = await runMine(REPO); // the real driver: legible
    // the mutant render — same seeded/cost lines, but the model-gate explanation stripped out.
    const silent = v.stdout.split('\n').filter((l) => l !== MINE_ABSTAIN_LINE).join('\n');
    expect(v.stdout).toContain(MINE_ABSTAIN_LINE); //  the real driver EXPLAINS the 0
    expect(silent).not.toContain(MINE_ABSTAIN_LINE); // the mutant hides WHY it is 0 — the guard flips RED
    expect(silent).toContain('seeded 0'); //           yet still reports 0: a silent, mysterious empty render
  });
});

// ── SCN-CLI-4d — mine must not DESTROY the governed projection it shares a store with ──────────────────
//
// `atlas mine` writes to the SAME durable store the governed emit door writes to
// (`createDiskStore(<repo>/.atlas/cas)`), through the SAME `persistProjection` sidecar. But the driver seeds
// its projection from `emptyStore()` and never rehydrates, then persists unconditionally — so a mine pass
// overwrites the sidecar with ONLY what that pass mined, silently dropping every previously emitted node.
// The facts' CAS bytes survive (put is content-addressed and append-only), but the projection is the index
// every read goes through, so the knowledge is gone as far as `query`/`doctor` are concerned.
//
// TEETH: revert `buildControllerDeps` to `let projection = emptyStore()` and this goes RED.
describe('CLI-4d — a mine pass PRESERVES the governed projection (it shares the store with the emit door)', () => {
  it('an already-emitted node survives a mine pass that mines nothing', () => {
    const persisted: StoreProjection[] = [];
    const existing: CurrentNode = { nodeKey: 'nk-already-emitted', family: 'advisory', contentHash: 'ch-1', claims: ['a governed claim'] };
    const store: DiskStore = {
      put: () => asHash('x'),
      get: () => undefined,
      persistProjection: (p) => void persisted.push(p),
      // the durable sidecar the governed emit door already wrote
      loadProjection: () => (persisted.length > 0 ? persisted[persisted.length - 1]! : { current: new Map([[existing.nodeKey, existing]]), cas: new Set(['ch-1']) }),
    };
    const cd = buildControllerDeps(REPO, depsOf({ store }));
    cd.upsert([]); // a site that yielded no fact — the abstain case, and the common one

    expect(persisted).toHaveLength(1);
    expect(persisted[0]!.current.get('nk-already-emitted')).toEqual(existing);
    expect(persisted[0]!.cas.has('ch-1')).toBe(true);
  });

  it('a mine pass ADDS to the existing projection rather than replacing it', () => {
    const persisted: StoreProjection[] = [];
    const existing: CurrentNode = { nodeKey: 'nk-already-emitted', family: 'advisory', contentHash: 'ch-1', claims: ['a governed claim'] };
    const store: DiskStore = {
      put: () => asHash('x'),
      get: () => undefined,
      persistProjection: (p) => void persisted.push(p),
      loadProjection: () => (persisted.length > 0 ? persisted[persisted.length - 1]! : { current: new Map([[existing.nodeKey, existing]]), cas: new Set(['ch-1']) }),
    };
    const deps = depsOf({ store, budget: budget(FRONTIER.length) });
    driveMine(REPO, deps);

    const last = persisted[persisted.length - 1]!;
    expect(last.current.get('nk-already-emitted')).toEqual(existing); // the emitted node is still there…
    expect(last.current.size).toBeGreaterThan(1); // …alongside what this pass mined
  });
});
