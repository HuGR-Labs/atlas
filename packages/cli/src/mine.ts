// @atlas/cli — src/mine.ts  (CLI-4: drive the genesis bootstrap from the CLI)
//
// Drive the FROZEN genesis run-controller (@atlas/genesis) over a repo as ONE governed pass and project the
// outcome to a `CliVerdict` (CLI-4). This facet ONLY COMPOSES the frozen parts: it re-orders NO stage
// (`scan→rank→extract→admit→…`), invents NO admission of its own (the gate forwards the frozen `admit`
// verbatim, GEN-4/12), and every write is CANDIDATE-ONLY — the controller hard-codes `ratified: []`, so
// never-ratified is a STRUCTURAL property of the seam, not a stamp this driver applies.
//
// The five `ControllerDeps` ports (plan/visit/upsert/changed/handoffTo) are assembled INLINE from the real
// adapters (`createSiteProposer`/`createHistorySource`/`createDiskStore`) + the genesis stage-builders
// (`createScan`/`createMine`/`runExtract`/`admit`). Each seam is INJECTABLE (`Partial<MineDeps>`) so a
// conformance test supplies a recorded proposer + an injected frontier + a gate double and never touches a
// live model (mirrors packages/e2e/test/s02-genesis-mining.e2e.test.ts). `upsert` routes through the KNOW-15
// write-decision (`@atlas/knowledge` `upsert`/`routeWrite`), NEVER a bare `store.put`.

import { makeRunController, createScan, createMine, runExtract, admit } from '@atlas/genesis';
import type {
  ControllerDeps,
  Plan,
  GenesisBudget,
  GenesisReport,
  Candidate,
  Fact,
  SiteProposer,
  EmitGate,
  EmitVerdict,
  SeedProposal,
  HistorySource,
  SkeletonSource,
  Skeleton,
  AdmitDeps,
  AdvisoryProposal,
} from '@atlas/genesis';
import { createDiskStore } from '@atlas/adapter-io';
import type { DiskStore } from '@atlas/adapter-io';
import { upsert as knowledgeUpsert, emptyStore, normalizeCheck, primaryAnchorId } from '@atlas/knowledge';
import type { WriteRequest, StoreProjection, Candidate as KnowledgeCandidate } from '@atlas/knowledge';
import { id, asNodeKey, asSubtreeHash } from '@atlas/kernel';
import { join } from 'node:path';
import type { CliVerdict } from './render.js';

/**
 * The injected seams the `mine` driver assembles into `ControllerDeps`. Every member is INJECTABLE
 * (`runMine(repo, deps?)` takes a `Partial`); an omitted member falls back to a real adapter (proposer /
 * history / store) or an honest fail-closed default (skeleton / gate / handoff) so `runMine(repo)` alone is
 * a valid, total call — never a live model, never a fabricated fact.
 */
export interface MineDeps {
  readonly rev: string; //                the git rev the pass runs at
  readonly proposer: SiteProposer; //     S2 — the ONE bounded LLM entry (GEN-2); default abstains (no model wired)
  readonly history: HistorySource; //     S1 — mined ranking signals + frontier (GEN-6)
  readonly skeleton: SkeletonSource; //   S0 — the structural skeleton source (GEN-1)
  readonly store: DiskStore; //           the durable CAS the KNOW-15 projection persists to
  readonly gate: EmitGate; //             the 2-door admission gate — forwards the frozen `admit` verbatim
  readonly handoffTo: () => void; //      S4 — the born-from-work terminator (a no-op for a mine pass)
  readonly budget?: GenesisBudget; //     the hard site ceiling; omitted ⇒ the controller's defaultBudget
  readonly scope?: string; //             a subtree to seed instead of the whole repo (GEN-13)
}

/** All deepening loops OFF — a mine pass is the single-pass baseline (GEN-13/14, Δ=0). */
const OFF = { enabled: false, maxDepth: 0, epsilon: 0 } as const;

/** A one-site extract budget: the controller already enforces the run ceiling; `visit` extracts its one cand. */
const SINGLE_SITE: GenesisBudget = { ceiling: 1, deepening: { review: OFF, enrich: OFF, expand: OFF } };

/** An honest-empty, structurally-valid `Skeleton` (GEN-8b: an empty skeleton is never a fabricated full one). */
function emptySkeleton(): Skeleton {
  const node = (axis: string): unknown => ({
    axis,
    level: 'repo',
    key: 'root',
    subtreeHash: asSubtreeHash('root'),
    children: [],
    objects: [],
  });
  return {
    axes: { spatial: node('spatial'), territory: node('territory'), dependency: node('dependency'), edges: [] },
    manifest: { territories: [] },
  } as unknown as Skeleton;
}

/** The advisory claim body a write carries (the KNOW-4c set-union element); a predicate carries its check. */
const claimNormOf = (f: Fact): string => (f.kind === 'advisory' ? f.claimNorm : normalizeCheck(f.check));

/**
 * Build an `EmitGate` that forwards the FROZEN `admit` verdict VERBATIM (GEN-4/12): the seed becomes an
 * advisory candidate (the driver adds NO predicate), `admit` casts the mechanical decision, and its outcome
 * maps 1:1 to the emit verdict. The driver injects NO admission of its own — admission is `admit`'s alone.
 */
export function makeAdmitGate(deps: AdmitDeps): EmitGate {
  return {
    emit(seed: SeedProposal, cand: Candidate): EmitVerdict {
      const proposal: AdvisoryProposal = {
        kind: 'advisory',
        site: cand,
        nodeKey: asNodeKey(cand.site.qualifiedPath),
        claimNorm: seed.claim,
        grounding: { entries: [{ anchor: cand.site, path: cand.site.qualifiedPath }] } as AdvisoryProposal['grounding'],
        tier: 'T2',
      };
      const verdict = admit(proposal, deps);
      if (verdict.outcome === 'admitted') return { emitted: true, fact: verdict.fact };
      const reason = verdict.outcome === 'dropped' ? verdict.reason : verdict.whyNot.reason;
      return { emitted: false, whyNot: { site: cand.site, reason } };
    },
  };
}

/** The honest fail-closed default gate: no admission machinery is wired, so every site abstains (never a
 *  fabricated fact). A real pass injects a gate (or `makeAdmitGate` over real `admit` seams). */
function defaultGate(): EmitGate {
  return { emit: (_seed, cand) => ({ emitted: false, whyNot: { site: cand.site, reason: 'no admission seam wired (mine default)' } }) };
}

/** The honest fail-closed default proposer: no model is wired, so the model abstains at every site (GEN-12).
 *  (Inlined rather than `createSiteProposer(...)` — see the NOTE on the stale consumed adapter-io dist.) */
function defaultProposer(): SiteProposer {
  return { propose: () => null };
}

/** The honest fail-closed default history: no signals, empty frontier ⇒ the structural fallback ranks 0
 *  sites (GEN-15b). A real pass INJECTS `createHistorySource(repo, rev)`; the default never shells git.
 *  (Inlined rather than `createHistorySource(...)` — see the NOTE on the stale consumed adapter-io dist.) */
function defaultHistory(): HistorySource {
  return {
    commitCount: () => 0,
    shallow: () => false,
    blameConcentration: () => 0,
    frontier: () => [],
    signals: () => ({ hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] }),
  };
}

/** Fill the injectable seams: a real adapter for the store, honest fail-closed seams for the rest. */
function withDefaults(repoPath: string, deps?: Partial<MineDeps>): MineDeps {
  const rev = deps?.rev ?? 'HEAD';
  return {
    rev,
    proposer: deps?.proposer ?? defaultProposer(),
    history: deps?.history ?? defaultHistory(),
    skeleton: deps?.skeleton ?? { skeleton: () => emptySkeleton() },
    store: deps?.store ?? createDiskStore(join(repoPath, '.atlas', 'cas')),
    gate: deps?.gate ?? defaultGate(),
    handoffTo: deps?.handoffTo ?? ((): void => {}),
    ...(deps?.budget !== undefined ? { budget: deps.budget } : {}),
    ...(deps?.scope !== undefined ? { scope: deps.scope } : {}),
  };
}

/**
 * Assemble the five frozen `ControllerDeps` ports from the injected seams (inline glue — `Plan`/`EmitGate`
 * have no genesis-side factory; this composition IS the driver):
 *   - `plan`      — S0 `createScan` (the canonical skeleton) + S1 `createMine` (rank the frontier), in order.
 *   - `visit`     — per-site `runExtract([cand], …, { proposer, gate })` → the gate's admitted `.facts`.
 *   - `upsert`    — the KNOW-15 write-decision (`@atlas/knowledge` `upsert`), dedup-by-id, persisted durably.
 *   - `changed`   — the INDEX-12 delta seam (unused by a single `genesis()` pass; supplied for the surface).
 *   - `handoffTo` — the S4 terminator (a no-op for a mine pass).
 */
export function buildControllerDeps(repoPath: string, d: MineDeps): ControllerDeps {
  const mine = createMine({ skeleton: d.skeleton, history: d.history });
  const scan = createScan(d.skeleton);
  let projection: StoreProjection = emptyStore();
  const grounded = new Map<string, Fact>(); // KNOW-15 idempotent grounded set, keyed by fact id (0 duplicates)

  return {
    plan: (repo, rev, _scope): Plan => ({ malformed: false, skeleton: scan.scan(repo, rev), sites: mine.mine(repo, rev) }),
    visit: (cand): readonly Fact[] => runExtract([cand], SINGLE_SITE, { proposer: d.proposer, gate: d.gate }).facts,
    upsert: (incoming): readonly Fact[] => {
      for (const f of incoming) {
        const req: WriteRequest = {
          nodeKey: f.id as unknown as string,
          contentHash: id(f) as unknown as string,
          family: f.kind,
          claimNorm: claimNormOf(f),
          // ── ADJACENCY carrier (ADDITIVE) — carry the computed primary anchor + R3-optional slot onto the
          //    node for a later sibling-adjacency scan (WP-B); NOT read here, routing is byte-identical.
          //    `predicateSlot` is R3-optional; conditional spread keeps `slot` ABSENT (exactOptionalPropertyTypes).
          primaryAnchor: primaryAnchorId(f as unknown as KnowledgeCandidate) as unknown as string,
          ...(f.predicateSlot !== undefined ? { slot: f.predicateSlot } : {}),
        };
        projection = knowledgeUpsert(projection, req).store; // route the write-decision (NOT store.put)
        grounded.set(f.id as unknown as string, f);
      }
      d.store.persistProjection(projection); // durable — the mutable KNOW-15 projection sidecar
      return [...grounded.values()];
    },
    changed: (_prior, _rev) => ({ idChanged: false, stateChanged: false, changedBuckets: [] }),
    handoffTo: () => d.handoffTo(),
  };
}

/** Drive the frozen run-controller one governed pass and return its `GenesisReport` (the write-set carrier). */
export function driveMine(repoPath: string, deps?: Partial<MineDeps>): GenesisReport {
  const d = withDefaults(repoPath, deps);
  return makeRunController(buildControllerDeps(repoPath, d)).genesis(repoPath, d.rev, d.budget, d.scope);
}

/** Fold a `GenesisReport` to the CLI's process outcome. `renderVerdict` (render.ts) projects a handler
 *  `Verdict`, not a `GenesisReport`, so the fold is direct: a partial/interrupted run is a non-zero exit. */
function foldVerdict(r: GenesisReport): CliVerdict {
  const lines = [
    `genesis: seeded ${r.seeded.length} candidate fact(s); ratified ${r.ratified.length}`,
    `cost: llmCalls ${r.llmCalls} · budgetSpent ${r.budgetSpent}`,
    ...(r.resumeToken ? [`partial: resume at rank ${r.resumeToken.lastCompletedRank}`] : []),
  ];
  return { exitCode: r.resumeToken ? 1 : 0, stdout: `${lines.join('\n')}\n` };
}

/** Run the one-time genesis bootstrap over a repo, projecting the outcome to a `CliVerdict` (CLI-4). */
export async function runMine(repoPath: string, deps?: Partial<MineDeps>): Promise<CliVerdict> {
  return foldVerdict(driveMine(repoPath, deps));
}
