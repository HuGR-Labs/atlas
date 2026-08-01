// @atlas/cli — test/mine-fixtures.ts  (shared fixtures for the `atlas mine` driver suites)
//
// The injected seams every mine suite composes: a ranked-frontier skeleton, an injected history whose
// frontier IS that frontier (so `createMine` ranks it and never shells git), a recording proposer that
// counts calls instead of calling a model, gate doubles, and store fakes over the ADR-0008 STAGING
// sidecar whose knowledge-projection doors are TRAPS.
//
// Extracted from wp-9.3.6-b-mine.test.ts when the WP-F6 empty-pass suite grew into its own file and the
// combined file crossed the 400-LOC ceiling. This is a real seam — fixtures are shared by construction,
// and duplicating them would have let the two suites drift into testing different products.
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSubtreeHash, asHash, asNodeKey, id } from '@atlas/kernel';
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
import { createDiskStore } from '@atlas/adapter-io';
import type { DiskStore } from '@atlas/adapter-io';
import type { StoreProjection, CurrentNode } from '@atlas/knowledge';
import { runMine, driveMine, buildControllerDeps, makeAdmitGate, mineOutcome, mineWhyEmpty } from '../src/mine.js';
import type { MineDeps } from '../src/mine.js';

// ── the ranked-frontier skeleton fixture (mirrors s02's acme skeleton) ─────────────────────────────────
export const struct = (id: string): StructRef => ({ kind: 'symbol', qualifiedPath: `pkg/${id}.ts::${id}`, subtreeHash: asSubtreeHash(id) });
export const A = struct('st-a10');
export const B = struct('st-b22');
export const C = struct('st-c31');
export const D = struct('st-d40');
export const FRONTIER: readonly StructRef[] = [A, B, C, D];

export const edge = (from: string, to: string | null): DepEdge => ({ from: asHash(from), to: to === null ? null : asHash(to), kind: 'resolved' });
// def→ref: st-a10 is the hub (referenced by b/c/d) ⇒ highest PPR; st-d40 is cold.
export const REF_EDGES: readonly DepEdge[] = [
  edge('st-b22', 'st-a10'),
  edge('st-c31', 'st-a10'),
  edge('st-c31', 'st-b22'),
  edge('st-d40', 'st-a10'),
  edge('st-d40', 'st-b22'),
  edge('st-d40', 'st-c31'),
];
export const leaf = (key: string): IndexNode => ({ axis: 'dependency', level: 'symbol', key, subtreeHash: asSubtreeHash(key), children: [], objects: [] as readonly Hash[] });
export const axisRoot = (keys: readonly string[]): IndexNode => ({ axis: 'dependency', level: 'repo', key: 'root', subtreeHash: asSubtreeHash('root'), children: keys.map(leaf), objects: [] });
export const skeletonOf = (): Skeleton => {
  const keys = ['st-a10', 'st-b22', 'st-c31', 'st-d40'];
  const axes: Axes = { spatial: axisRoot(keys), territory: axisRoot(keys), dependency: axisRoot(keys), edges: REF_EDGES };
  const manifest: Manifest = { territories: [] };
  return { axes, manifest };
};
export const BASE_SKELETON = skeletonOf();

// ── injected seams ─────────────────────────────────────────────────────────────────────────────────────
export const ZERO_SIGNALS: MinedSignals = { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] };
export const idOf = (c: Candidate): string => c.site.subtreeHash;

/** A grounded fact whose anchor re-derives from the site — the gate only forwards a verdict. */
export const factFor = (c: Candidate, claim: string): Fact =>
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
export const anchorOf = (f: Fact): string => (f as unknown as { grounding: { entries: { anchor: StructRef }[] } }).grounding.entries[0]!.anchor.subtreeHash;
export const anchorSet = (fs: readonly Fact[]): Set<string> => new Set(fs.map(anchorOf));

export const skeletonSource: SkeletonSource = { skeleton: () => BASE_SKELETON };

/** A non-thin history whose frontier IS the injected FRONTIER (so `createMine` ranks it, never a git shell). */
export const injectedHistory: HistorySource = {
  commitCount: () => 5,
  shallow: () => false,
  blameConcentration: () => 0,
  frontier: () => FRONTIER,
  signals: () => ZERO_SIGNALS,
};

/** The recorded proposer — a live call-counter (the `$0`-LLM proof), returns proposal `P0` at every site. */
export const recordingProposer = (): { proposer: SiteProposer; calls: () => number } => {
  let n = 0;
  return { proposer: { propose: (c) => { n += 1; return { cand: c, claim: `P0@${idOf(c)}` }; } }, calls: () => n };
};

export const gateEmitAll = (): EmitGate => ({ emit: (seed, c) => ({ emitted: true, fact: factFor(c, seed.claim) }) });
export const gateEmitFor = (ids: ReadonlySet<string>): EmitGate => ({
  emit: (seed, c) => (ids.has(idOf(c)) ? { emitted: true, fact: factFor(c, seed.claim) } : { emitted: false, whyNot: { site: c.site, reason: 'not in admitted set' } }),
});

/** The knowledge-projection doors are TRAPS in every mine fixture (ADR-0008): `mine` writes CANDIDATES to
 *  staging and must never so much as READ the governed projection, so any call is a test failure, not a
 *  mismatch to assert on later. Spread into each fake store below. */
export const projectionTrap = {
  persistProjection: (): never => { throw new Error('ADR-0008: mine must never write the knowledge projection'); },
  loadProjection: (): never => { throw new Error('ADR-0008: mine must never read the knowledge projection'); },
};

export const fakeStore = (): DiskStore => ({ put: () => asHash('x'), get: () => undefined, ...projectionTrap, persistStaging: () => {}, loadStaging: () => undefined });

/** A recording fake over the STAGING sidecar: `persistStaging` appends to `staged`, `loadStaging` reads the
 *  last staged projection (or `seed`, standing in for what an earlier pass left behind), `put` records the
 *  CAS keys. The projection doors trap. */
export const stagingFake = (seed?: StoreProjection): { store: DiskStore; staged: StoreProjection[]; cas: Set<string> } => {
  const staged: StoreProjection[] = [];
  const cas = new Set<string>();
  const store: DiskStore = {
    put: (obj) => { const h = id(obj); cas.add(h as unknown as string); return h; },
    get: () => undefined,
    ...projectionTrap,
    persistStaging: (p) => void staged.push(p),
    loadStaging: () => (staged.length > 0 ? staged[staged.length - 1]! : seed),
  };
  return { store, staged, cas };
};

export const OFF = { enabled: false, maxDepth: 0, epsilon: 0 } as const;
export const budget = (ceiling: number): GenesisBudget => ({ ceiling, deepening: { review: OFF, enrich: OFF, expand: OFF } });

export const depsOf = (over: Partial<MineDeps> = {}): MineDeps => ({
  rev: 'HEAD',
  proposer: over.proposer ?? recordingProposer().proposer,
  history: over.history ?? injectedHistory,
  skeleton: over.skeleton ?? skeletonSource,
  store: over.store ?? fakeStore(),
  gate: over.gate ?? gateEmitAll(),
  handoffTo: over.handoffTo ?? ((): void => {}),
  ...(over.budget !== undefined ? { budget: over.budget } : {}),
});

export const REPO = 'fix-repo';
