// @atlas/genesis — src/rank.ts  (WP-8.27.GEN · GEN-1 / GEN-3 / GEN-10 / GEN-11 / GEN-15 — the S0/S1 stage)
//
// The deterministic `$0`-LLM genesis floor: S0 the structural SKELETON and S1 the reproducible PPR
// RANKING, both PURE FUNCTIONS of (repo, rev). There is NO model call site anywhere in this facet — no
// proposer/embedding/vector/ANN seam is even in the signatures (GEN-1a / GEN-10b). The ranking is a
// PERSONALIZED PageRank over the def→ref graph (the Aider repo-map technique): nodes are the graph's
// hash-addressed sites, edges are `referencing → defining`, the personalization vector is the mined
// hotspot/SZZ/coupling frontier. It carries a PINNED damping and NO randomness/clock, is computed in
// INTEGER fixed-point (exact on every machine — no IEEE drift), and breaks numeric ties with a stable
// total order — so the ranking is BYTE-IDENTICAL across runs and machines (GEN-11). A cheap history
// pre-check degrades a thin/degenerate history back to STRUCTURAL centrality — history is a booster,
// never a dependency (GEN-15).
//
// SCOPE (card exclusions): this facet does NOT author the atlas-init skeleton — it CONSUMES the sealed
// @atlas/index / atlas-init walk through the injected `SkeletonSource` seam (like tools/init.ts consumes
// `MoveInIndex`); it does NOT fire the budgeted proposal (EPIC-28-a), admission/teeth (EPIC-28-b), or the
// hand-off (EPIC-30). SEAM: identity rides the sealed @atlas/kernel brand (`asSubtreeHash`), never a
// hand-rolled digest — there is no raw hashing here. Bound against the frozen oracles ../ref/scan.ts,
// ../ref/mine.ts, ../ref/rank.ts. Digest `<filled-at-freeze>` on the interface_contract is SIMULATED
// (resolved by disciplined judgment, not a real freeze hash) — FLAGGED.

import { asSubtreeHash } from '@atlas/kernel';
import type { StructRef } from '@atlas/contracts';
import type { Axes, IndexNode, Manifest } from '@atlas/index';
import type { Candidate, CostReport, MinedSignals } from '../ref/types.js';
import type { ScanApi, Skeleton } from '../ref/scan.js';
import type { HistoryProbe, MineApi } from '../ref/mine.js';
import type { RankApi } from '../ref/rank.js';

// ── PINNED determinism constants (GEN-11) ────────────────────────────────────────────────────────────
// The personalized-PageRank damping is PINNED (atlas-genesis:142, golden `damping 0.85`); re-running with
// the same pins on the same rev ⇒ an identical ranking. Ranking carries NO RNG seed — a personalized
// PageRank is seedless-deterministic; the "seed" of GEN-11 is the pinned teleport vector, not an RNG. The
// power iteration runs a PINNED, fixed number of rounds and is evaluated in INTEGER fixed-point.
export const DAMPING = 0.85 as const;
export const PPR_ITERATIONS = 64 as const;

const FP = 1_000_000_000n; // fixed-point scale (1e9) — integer arithmetic ⇒ byte-identical across machines
const D_NUM = 85n; // damping numerator   (0.85)
const D_DEN = 100n; // damping denominator (1.00)

// ── GEN-15 history-thin pre-check thresholds (PINNED) ────────────────────────────────────────────────
export const MIN_COMMITS = 2 as const; // below ⇒ young/greenfield → low-commit-count
export const BLAME_CONCENTRATION_MAX = 0.9 as const; // ≥ ⇒ one squash/mega-commit → blame-concentrated

// ── GEN-10 stage → named deterministic mechanism registry ────────────────────────────────────────────
// Every stage binds to a NAMED, deterministic structural mechanism from the admissible set — none is an
// unnamed "smart scorer" (SCN-GEN-10a-1). There is NO embedding / vector store / ANN anywhere (A-14).
export const MECHANISMS = {
  scan: ['tree-sitter', 'SCIP', 'stack-graphs'],
  mine: ['SZZ', 'hotspots', 'temporal-coupling', 'ownership'],
  rank: ['personalized-PageRank'],
} as const;

const ZERO_SIGNALS: MinedSignals = { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] };

// ── injected seams (consumed, never authored here) ───────────────────────────────────────────────────

/**
 * The S0 skeleton source — the sealed atlas-init / @atlas/index structural walk (TOOLS-5, frozen upstream).
 * `$0`-LLM: it walks the tree STRUCTURALLY and returns the axes + T2/advisory manifest. This facet CONSUMES
 * it (card exclusion: "does not author the atlas-init skeleton") and canonicalises the result; @atlas/index
 * owns the concrete walk.
 */
export interface SkeletonSource {
  skeleton(repo: string, rev: string): Skeleton;
}

/**
 * The S1 mining source — the cheap MECHANICAL history signals (SZZ / hotspots / temporal-coupling /
 * ownership) and the GEN-15 pre-check facts. Every member is a `$0`-LLM structural probe; a signal is a
 * RANKING heuristic only (GEN-6). `frontier` is the personalization vector (empty on a history-thin repo).
 */
export interface HistorySource {
  commitCount(repo: string, rev: string): number;
  shallow(repo: string, rev: string): boolean;
  blameConcentration(repo: string, rev: string): number; // fraction of blame in the single top commit
  frontier(repo: string, rev: string): readonly StructRef[]; // the mined hotspot/SZZ/coupling sites
  signals(site: StructRef): MinedSignals; // the mined ranking heuristics for a site (GEN-6)
}

/** The seams the S1 `mine` driver composes (both consumed). */
export interface MineDeps {
  readonly skeleton: SkeletonSource;
  readonly history: HistorySource;
}

// ── S0 — the structural skeleton (GEN-1) ─────────────────────────────────────────────────────────────

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// ── node-identity ↔ subtreeHash correspondence (the F1/F2 bridge) ─────────────────────────────────────
// The dep-graph keys edge endpoints by NODE IDENTITY (`DepEdge.from/to: Hash` = `IndexNode.key`, the
// reconciliation pinned in @atlas/index src/fold.ts:116-122). A mined frontier site joins by its CONTENT
// `StructRef.subtreeHash: SubtreeHash` — a DELIBERATELY ORTHOGONAL identity space (contracts/hash.ts:5,
// 22-25; KNOW-15: conflating them is how an Atlas rots). The two legs CANNOT be compared as raw strings.
// But every `IndexNode` carries BOTH legs (`key` + `subtreeHash`), so the frozen `Skeleton.axes` already
// exposes the bridge: match a frontier site's subtreeHash to a node's subtreeHash (SAME brand — legit),
// then read that node's identity `key` (the edge-endpoint space). This resolver builds both directions
// deterministically (min-key tie-break, walk-order-independent) — no invented port, no fabricated map.
function correspondence(graph: Skeleton): {
  readonly keyOfSubtree: ReadonlyMap<string, string>; // subtreeHash → node-identity key (edge space)
  readonly subtreeOfKey: ReadonlyMap<string, string>; // node-identity key → subtreeHash (StructRef leg)
} {
  const pairs: Array<readonly [string, string]> = []; // [subtreeHash, key]
  const collect = (n: IndexNode): void => {
    pairs.push([n.subtreeHash, n.key]);
    n.children.forEach(collect);
  };
  collect(graph.axes.dependency);
  collect(graph.axes.spatial);
  collect(graph.axes.territory);
  const keyOfSubtree = new Map<string, string>();
  for (const [st, key] of [...pairs].sort((a, b) => cmp(a[0], b[0]) || cmp(a[1], b[1])))
    if (!keyOfSubtree.has(st)) keyOfSubtree.set(st, key);
  const subtreeOfKey = new Map<string, string>();
  for (const [st, key] of [...pairs].sort((a, b) => cmp(a[1], b[1]) || cmp(a[0], b[0])))
    if (!subtreeOfKey.has(key)) subtreeOfKey.set(key, st);
  return { keyOfSubtree, subtreeOfKey };
}

/** Resolve a frontier site's CONTENT subtreeHash to its NODE-IDENTITY key (the edge-endpoint space) via
 *  the index correspondence. A site with NO node in the index stays a disconnected island under its own
 *  synthetic identity — NEVER brand-laundered into the node space by a raw-string coincidence. */
const resolveSiteKey = (keyOfSubtree: ReadonlyMap<string, string>, site: StructRef): string =>
  keyOfSubtree.get(site.subtreeHash) ?? `unresolved:${site.subtreeHash}`;

/** Canonicalise an axis node: children sorted by key, objects sorted — recursively. This is where the
 *  GEN-1 byte-identity is EARNED: the walk's order (mtime, hash-map iteration) is discarded for a stable
 *  structural order, so a re-run reproduces a byte-identical skeleton (SCN-GEN-1b-1). */
function canonNode(n: IndexNode): IndexNode {
  return {
    axis: n.axis,
    level: n.level,
    key: n.key,
    subtreeHash: n.subtreeHash,
    children: n.children.map(canonNode).sort((a, b) => cmp(a.key, b.key)),
    objects: [...n.objects].sort(),
  };
}

/** Canonicalise the whole skeleton — sorted axes, sorted edges, sorted territories. Deterministic ⇒ two
 *  runs on the same rev are byte-identical (GEN-1). */
export function canonicalizeSkeleton(sk: Skeleton): Skeleton {
  const axes: Axes = {
    spatial: canonNode(sk.axes.spatial),
    territory: canonNode(sk.axes.territory),
    dependency: canonNode(sk.axes.dependency),
    edges: [...sk.axes.edges].sort(
      (a, b) => cmp(a.from, b.from) || cmp(a.to ?? '', b.to ?? '') || cmp(a.kind, b.kind),
    ),
  };
  const manifest: Manifest = {
    territories: [...sk.manifest.territories].sort((a, b) => cmp(a.name, b.name)),
  };
  return { axes, manifest };
}

/** Build `scan` over the injected structural source (ScanApi). Pure + total, `$0`-LLM: no model, clock, or
 *  IO — the output is a canonical structural function of the seam. */
export function createScan(src: SkeletonSource): ScanApi {
  return { scan: (repo: string, rev: string): Skeleton => canonicalizeSkeleton(src.skeleton(repo, rev)) };
}

// ── S1 — the reproducible personalized-PageRank ranking (GEN-11) ─────────────────────────────────────

/** The def→ref adjacency of the skeleton — node identity (`IndexNode.key` = the `DepEdge` endpoint space)
 *  → its out-edge targets. `personalizationKeys` are frontier sites ALREADY RESOLVED to node identity (via
 *  the subtreeHash↔key correspondence) — they join the graph in the SAME identity space as the edges. */
function adjacency(graph: Skeleton, personalizationKeys: readonly string[]): {
  readonly nodes: readonly string[];
  readonly out: ReadonlyMap<string, readonly string[]>;
} {
  const nodes = new Set<string>();
  const out = new Map<string, string[]>();
  for (const e of graph.axes.edges) {
    nodes.add(e.from);
    if (e.to !== null) {
      nodes.add(e.to);
      const list = out.get(e.from);
      if (list) list.push(e.to);
      else out.set(e.from, [e.to]);
    }
  }
  for (const k of personalizationKeys) nodes.add(k);
  return { nodes: [...nodes].sort(), out };
}

/** Personalized PageRank in INTEGER fixed-point (exact on every machine — no IEEE drift). Teleports to the
 *  personalization set; dangling mass is redistributed to that set; a PINNED round count. Returns each
 *  node's fixed-point score. */
function pprScores(
  nodes: readonly string[],
  out: ReadonlyMap<string, readonly string[]>,
  pers: ReadonlySet<string>,
): ReadonlyMap<string, bigint> {
  const n = BigInt(nodes.length || 1);
  const p = BigInt(pers.size || 0);
  const teleDen = p > 0n ? p : n; // teleport target count (fall back to uniform if no personalization)
  const teleVal = FP / teleDen; // per-target teleport mass
  let score = new Map<string, bigint>();
  for (const node of nodes) score.set(node, FP / n);

  for (let it = 0; it < PPR_ITERATIONS; it += 1) {
    const inflow = new Map<string, bigint>();
    let dangling = 0n;
    for (const node of nodes) {
      const s = score.get(node) ?? 0n;
      const targets = out.get(node);
      if (!targets || targets.length === 0) {
        dangling += s;
        continue;
      }
      const share = s / BigInt(targets.length); // integer division — deterministic
      for (const t of targets) inflow.set(t, (inflow.get(t) ?? 0n) + share);
    }
    const danglingShare = teleDen > 0n ? dangling / teleDen : 0n;
    const next = new Map<string, bigint>();
    for (const node of nodes) {
      const isPers = pers.size === 0 || pers.has(node);
      const teleport = isPers ? teleVal : 0n;
      const extra = isPers ? danglingShare : 0n;
      const inV = inflow.get(node) ?? 0n;
      const base = ((D_DEN - D_NUM) * teleport) / D_DEN;
      const walk = (D_NUM * (inV + extra)) / D_DEN;
      next.set(node, base + walk);
    }
    score = next;
  }
  return score;
}

/** Order personalization sites by fixed-point PPR score DESCENDING, breaking numeric ties by the site's
 *  `subtreeHash` ascending — a stable total order (GEN-11). */
function orderByPpr(a: readonly [StructRef, bigint], b: readonly [StructRef, bigint]): number {
  if (a[1] !== b[1]) return a[1] > b[1] ? -1 : 1;
  return cmp(a[0].subtreeHash, b[0].subtreeHash);
}

/**
 * DETERMINISTIC personalized-PageRank ranking (GEN-11). Pure function of the S0 skeleton's def→ref graph +
 * the personalization frontier. Returns the ranked `Candidate[]` (one per personalization site) with a
 * stable total order — byte-identical across runs and machines. Carries NO model, NO randomness, NO clock.
 * `ppr` is the fixed-point score divided by the scale (a deterministic float); `signals` is the zero record
 * here — the S1 `mine` driver attaches the mined heuristics (GEN-6). NEVER a fact.
 */
export function rank(graph: Skeleton, personalization: readonly StructRef[]): readonly Candidate[] {
  // BIND: resolve each frontier site's CONTENT subtreeHash to its NODE-IDENTITY key BEFORE the PPR join,
  // so a mined site connects to the dep-graph on the real index (not a disconnected island — F1). The two
  // legs are bridged through the index correspondence, never compared as raw brand-mismatched strings.
  const { keyOfSubtree } = correspondence(graph);
  const siteKey = (s: StructRef): string => resolveSiteKey(keyOfSubtree, s);
  const { nodes, out } = adjacency(graph, personalization.map(siteKey));
  const pers = new Set<string>(personalization.map(siteKey));
  const scores = pprScores(nodes, out, pers);
  const scored = personalization.map((site): readonly [StructRef, bigint] => [
    site,
    scores.get(siteKey(site)) ?? 0n,
  ]);
  const ordered = [...scored].sort(orderByPpr);
  return ordered.map(([site, s], i) => ({
    site,
    signals: ZERO_SIGNALS,
    ppr: Number(s) / Number(FP),
    rank: i + 1,
  }));
}

/** Bind the ranker to the frozen `RankApi` (ref/rank.ts). */
export function makeRank(): RankApi {
  return { rank };
}

// ── GEN-15 — history-thin fallback to structural centrality ──────────────────────────────────────────

/** The cheap MECHANICAL history pre-check (GEN-15): commit count below threshold, shallow clone, or blame
 *  concentrated in one commit ⇒ degenerate history, fall the personalization vector back to structure. */
export function probeHistory(history: HistorySource, repo: string, rev: string): HistoryProbe {
  if (history.commitCount(repo, rev) < MIN_COMMITS) return { thin: true, reason: 'low-commit-count' };
  if (history.shallow(repo, rev)) return { thin: true, reason: 'shallow-clone' };
  if (history.blameConcentration(repo, rev) >= BLAME_CONCENTRATION_MAX)
    return { thin: true, reason: 'blame-concentrated' };
  return { thin: false };
}

/** The STRUCTURAL personalization vector (GEN-15c): the def→ref graph's structurally-central sites (highest
 *  degree = type/API-surface density), ordered deterministically. Used when history is thin OR absent — a
 *  non-uniform, non-random frontier, NEVER rank noise. */
export function structuralSeeds(graph: Skeleton): readonly StructRef[] {
  // `h` iterates over dep-graph NODE-IDENTITY keys (edge endpoints). A StructRef's `subtreeHash` is the
  // CONTENT leg, NOT the identity leg (F2) — so resolve each node key back to its real subtreeHash via the
  // index correspondence, rather than re-branding a node-identity Hash as a SubtreeHash (KNOW-15).
  const { subtreeOfKey } = correspondence(graph);
  const degree = new Map<string, number>();
  const bump = (h: string): void => {
    degree.set(h, (degree.get(h) ?? 0) + 1);
  };
  for (const e of graph.axes.edges) {
    bump(e.from);
    if (e.to !== null) bump(e.to);
  }
  const ids = [...degree.entries()].filter(([, d]) => d > 0).map(([h]) => h);
  const seeds = ids.length > 0 ? ids : [...degree.keys()];
  return seeds
    .sort((a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0) || cmp(a, b))
    .map((h) => ({ kind: 'file', qualifiedPath: h, subtreeHash: asSubtreeHash(subtreeOfKey.get(h) ?? h) }));
}

// ── S1 — the `mine` driver: rank the frontier, attach signals, degrade thin history (GEN-6 / GEN-15) ──

/**
 * Build `mine` over the injected seams (MineApi). MECHANICAL `$0`-LLM: probes history, chooses the
 * personalization vector (mined frontier, or STRUCTURAL centrality when history is thin/empty — GEN-15b),
 * ranks it via the PPR law, and attaches the mined signals (GEN-6 — a ranking heuristic only, NEVER a
 * fact). History is a booster, never a dependency: an empty frontier still yields a structural ranking.
 */
export function createMine(deps: MineDeps): MineApi {
  const mine = (repo: string, rev: string): readonly Candidate[] => {
    const sk = canonicalizeSkeleton(deps.skeleton.skeleton(repo, rev));
    const probe = probeHistory(deps.history, repo, rev);
    let personalization = probe.thin ? structuralSeeds(sk) : deps.history.frontier(repo, rev);
    if (personalization.length === 0) personalization = structuralSeeds(sk); // GEN-15b booster-not-dependency
    const structural = probe.thin || deps.history.frontier(repo, rev).length === 0;
    const ranked = rank(sk, personalization);
    return ranked.map((c) => ({
      ...c,
      signals: structural ? ZERO_SIGNALS : deps.history.signals(c.site),
    }));
  };
  return {
    mine,
    probeHistory: (repo: string, rev: string): HistoryProbe => probeHistory(deps.history, repo, rev),
  };
}

// ── GEN-3 — cost tracks the frontier, never the file/line count ──────────────────────────────────────

/** The GEN-3 cost oracle: the budget the S0/S1 frontier hands S2 is the RANKED SITE COUNT — a function of
 *  the PPR frontier, INVARIANT to file/line count. Adding un-churned code never enters the frontier. */
export function frontierBudget(cands: readonly Candidate[]): number {
  return cands.length;
}

/** The S0/S1 per-stage cost (GEN-1 / GEN-13): both structural stages spend ZERO LLM calls — S2 is the sole
 *  LLM entry (GEN-2). No model call site is reachable from this facet. */
export function s0s1Cost(): CostReport {
  return [
    { stage: 'S0', llmCalls: 0 },
    { stage: 'S1', llmCalls: 0 },
  ];
}

// differential-vs-oracle (compile-time): the impls conform to the frozen Scan/Mine/Rank surfaces. The
// $0-LLM S0/S1 skeleton+ranking is DISTINCT from the atlas-init governance shaping (WP-8.27.TOOLS).
const _scanConforms: (s: SkeletonSource) => ScanApi = createScan;
const _mineConforms: (d: MineDeps) => MineApi = createMine;
const _rankConforms: RankApi = makeRank();
void _scanConforms;
void _mineConforms;
void _rankConforms;
