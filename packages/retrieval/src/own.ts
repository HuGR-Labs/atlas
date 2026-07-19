// @atlas/retrieval — src/own.ts  (WP-6.20.RETR · OwnPack composer facet — RETR-12 + owner-decision D1)
//
// `own_<unit>` projects a curated `OwnPack` composed by INDEX READS ALONE — 0 LLM, 0 free prose,
// byte-identical for equal input, `≤ OWN_CAP` under the pinned cap measure (RETR-12). A seat receives its
// `own` by DEFAULT (pushed at dispatch), never choosing a scope or assembling a pack. Composition is
// mechanical: rank → cap → dedup → project. The facet is a SEAM CONSUMER — every index axis (role /
// invariants / terrain / relate / gotchas / memory / finer / manifest) is SUPPLIED (the index resolved
// them); this facet only presents them. NO hashing happens here (identity stays behind the sealed
// @atlas/kernel seam); `NodeKey`s arrive already minted. Total (RETR-9): a malformed unit yields an EMPTY
// briefing, never a throw.
//
// EXECUTION NOTE (OWNER DECISION D1, wave-plan §D1): the composer GAINS an AVAILABILITY-MANIFEST facet — a
// bounded, frecency-ranked, CONTENT-FREE map of reachable surfaces (adjacent packs / memory scopes /
// knowledge). It carries pointers + one-line labels + how-to-pull (name/digest) — NEVER the content. It
// counts against the same `OWN_CAP` budget and drops by hit-rate like everything else (a "you-are-here"
// map, not a second swarm). Transcribed into concrete records at BIND per oracle-pin-map §7.
//
// SHAPE NOTE: the composed result `OwnPackPlus` EXTENDS the frozen `OwnPack` (ref/types.ts) with the
// exec-observable receipts the goldens assert on — `tokenEstimate` (cap law RETR-12f), `grounding.source`
// (level→source law RETR-12i), `manifest` (D1), `pullReachable` (the pull-reachable overflow tail). These
// are ADDITIVE fields on the return value; no frozen `OwnPack` field is re-shaped. Since `OwnPackPlus`
// is assignable to `OwnPack`, `OwnFacet.own` is a valid narrowing of the frozen `OwnApi.own`.

import type { NodeKey, Pack, PackInvariant, Tier } from '@atlas/contracts';
import type { GroundedFact } from '@atlas/knowledge';
import type { OwnLevel, OwnPack, OwnUnit, RelatedFact, RelationSet } from '../ref/types.js';
import type { OwnApi } from '../ref/own.js';

// ── frozen bounds (RETR-12f/caps.ts: own ~1.5K under the ~5K ceiling; edges/finer/manifest bounded) ──────
/** The `own` briefing budget in the pinned `cl100k_base` measure — `~1.5K` under the ceiling (RETR-12f). */
export const OWN_CAP = 1500;
/** Hard cap on the bounded `relate()` blast summary carried in `edges` (a capped subset, not the closure). */
export const EDGE_CAP = 8;
/** Hard cap on the `drill.finer` pointer list — finer detail is pull-reachable, never inlined (RETR-12g). */
export const FINER_CAP = 16;
/** Hard cap on the availability-manifest pointer count (D1: a bounded index, not a second swarm). */
export const MANIFEST_CAP = 12;

/** Criticality → ordinal (T0 first). */
const TIER_ORDINAL: Record<Tier, number> = { T0: 0, T1: 1, T2: 2 };

// ── facet-local input records (the sized index candidates the composer ranks/caps) ──────────────────────
/** One `tier≥T1` invariant candidate + its ranking keys + its pinned token cost (index-supplied). */
export interface SizedInvariant {
  readonly inv: PackInvariant;
  readonly ppr: number; // stored precomputed importance (GEN-11) — a field, not a call
  readonly hits: number; // observed hit-count (frecency)
  readonly cost: number; // tokenEstimate under the pinned cap measure
}

/** One gotcha/rationale knowledge fact + its pinned token cost. */
export interface SizedGotcha {
  readonly fact: GroundedFact;
  readonly cost: number;
}

/**
 * A CONTENT-FREE availability pointer (D1). Names a reachable surface — never carries its content.
 * `digest` is the surface's content-identity: index/kernel-SUPPLIED (this facet never hashes — sealed
 * @atlas/kernel seam). Where a digest is synthesized locally it is a FLAGGED `sim:` placeholder.
 */
export interface ManifestPointer {
  readonly kind: 'pack' | 'memory' | 'knowledge' | 'drill';
  readonly name: string; // e.g. `own_payments`, `pr-memory:billing`
  readonly digest: string; // content-identity (index-supplied; `sim:` prefix = SIMULATED, no raw hashing here)
  readonly pull: string; // how-to-pull label
  readonly hits: number; // frecency — ranks + drops the pointer
}

/** One manifest-pointer candidate + its pinned token cost. */
export interface ManifestCandidate {
  readonly pointer: ManifestPointer;
  readonly cost: number;
}

/** The bounded, frecency-ranked, content-free reachable map (D1). */
export interface AvailabilityManifest {
  readonly pointers: readonly ManifestPointer[];
  readonly truncated: boolean;
}

/** Where a unit is grounded from (RETR-12i): the tree (crate/module), a manifest (service/feature), or —
 *  for a NON-grounded epic (RETR-12j) — its project-memory `goal`. */
export type GroundingSource = 'tree' | 'manifest' | 'goal';

/** The composed OwnPack + the exec-observable receipts the goldens assert on (additive; see SHAPE NOTE). */
export interface OwnPackPlus extends OwnPack {
  readonly grounding: { readonly source: GroundingSource };
  readonly tokenEstimate: number; // pinned `cl100k_base` count — `≤ OWN_CAP` (RETR-12f)
  readonly manifest: AvailabilityManifest; // D1 content-free reachable map
  readonly pullReachable: readonly NodeKey[]; // capped-out fact keys (0 silent drops — a pull-reachable tail)
}

/** The index-read axes the composer consumes (the seam). It owns none of these — it ranks + caps + projects. */
export interface OwnSources {
  readonly role: (unit: OwnUnit) => string; // the 1-line role (from a definition fact / terrain)
  readonly invariants: (unit: OwnUnit) => readonly SizedInvariant[]; // the unit's tier≥T1 invariants
  readonly terrain: (unit: OwnUnit) => { readonly contents: readonly NodeKey[]; readonly owner: string; readonly tier: Tier };
  readonly relate: (unit: OwnUnit) => RelationSet; // bounded relate() — the blast summary source
  readonly gotchas: (unit: OwnUnit) => readonly SizedGotcha[]; // gotcha/rationale knowledge facts
  readonly memory: (unit: OwnUnit) => unknown; // upward project-memory POINTERS (never a memory type)
  readonly finer: (unit: OwnUnit) => readonly OwnUnit[]; // finer scope-units (drill.finer)
  readonly manifest: (unit: OwnUnit) => readonly ManifestCandidate[]; // D1 reachable-surface pointers
}

/** An epic scope-unit (RETR-12j/12l): NOT a grounded node — a project-memory `goal` spanning `features`. */
export interface EpicUnit {
  readonly id: string;
  readonly goal: string; // the Orientation project-memory goal (the role source)
  readonly features: readonly OwnUnit[]; // the grounded feature units whose OwnPacks compose the epic
}

/** A dedup pointer (RETR-12k): a nodeId the co-injected pack cedes to `own`, plus how-to-pull it. */
export interface DedupPointer {
  readonly nodeId: NodeKey;
  readonly pull: string;
}

/** The facet surface. `own` narrows the frozen `OwnApi.own` (OwnPackPlus is assignable to OwnPack). */
export interface OwnFacet extends OwnApi {
  own(unit: OwnUnit): OwnPackPlus;
  ownEpic(epic: EpicUnit): OwnPackPlus;
  dispatch(unit: OwnUnit): { readonly tool: string; readonly pack: OwnPackPlus };
  project(units: readonly OwnUnit[]): readonly { readonly tool: string; readonly pack: OwnPackPlus }[];
  dedup(own: OwnPackPlus, pack: Pack): { readonly pack: Pack; readonly pointers: readonly DedupPointer[] };
}

// ── pure helpers ────────────────────────────────────────────────────────────────────────────────────────
/** Byte-stable code-point key comparator (the final total-order tiebreak, matches relate's `nodeKey-asc`). */
function keyCmp(a: NodeKey, b: NodeKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A single role LINE — the first line only; never a multi-paragraph prose blob (RETR-12e). */
function oneLine(role: string): string {
  const nl = role.indexOf('\n');
  return (nl === -1 ? role : role.slice(0, nl)).trim();
}

/** The `own_<id>` tool name (RETR-12a): `own_` + the unit's leaf segment (after the last `/` or `:`). */
export function ownToolName(unit: OwnUnit): string {
  const parts = unit.id.split(/[/:]/).filter((s) => s.length > 0);
  const leaf = parts.length > 0 ? parts[parts.length - 1] : unit.id;
  return `own_${leaf}`;
}

/** Level → grounding source (RETR-12i): crate/module by the tree, service/feature by a declared manifest. */
export function groundingSource(level: OwnLevel): GroundingSource {
  return level === 'crate' || level === 'module' ? 'tree' : 'manifest';
}

/** Rank invariants `(hits-desc, ppr-desc, nodeKey-asc)` — the pack rank (goldens Fixture A), T0 first. */
function cmpInvariant(a: SizedInvariant, b: SizedInvariant): number {
  const t = TIER_ORDINAL[a.inv.tier] - TIER_ORDINAL[b.inv.tier];
  if (t !== 0) return t;
  if (a.hits !== b.hits) return b.hits - a.hits;
  if (a.ppr !== b.ppr) return b.ppr - a.ppr;
  return keyCmp(a.inv.nodeId, b.inv.nodeId);
}

/** Rank manifest pointers by frecency `(hits-desc, name-asc)` (D1 relevance/frecency order). */
function cmpPointer(a: ManifestCandidate, b: ManifestCandidate): number {
  if (a.pointer.hits !== b.pointer.hits) return b.pointer.hits - a.pointer.hits;
  return a.pointer.name < b.pointer.name ? -1 : a.pointer.name > b.pointer.name ? 1 : 0;
}

/** Rank gotchas `(tier-asc: T0 first, id-asc)` — deterministic, no LLM. */
function cmpGotcha(a: SizedGotcha, b: SizedGotcha): number {
  const t = TIER_ORDINAL[a.fact.tier] - TIER_ORDINAL[b.fact.tier];
  if (t !== 0) return t;
  return keyCmp(a.fact.id, b.fact.id);
}

/** The empty briefing (RETR-9): a malformed/failed unit yields this — never a throw. */
function emptyOwn(source: GroundingSource): OwnPackPlus {
  return {
    unit: '',
    invariants: [],
    shape: { contents: [], owner: '', tier: 'T2' },
    edges: { dependents: [], dependencies: [] },
    gotchas: [],
    memory: null,
    drill: { finer: [], refresh: { pull: '' }, complement: { pull: '' } },
    grounding: { source },
    tokenEstimate: 0,
    manifest: { pointers: [], truncated: false },
    pullReachable: [],
  };
}

/** The bounded `relate()` blast summary → capped, sorted `edges` (RETR-12: a capped subset, deterministic). */
function edgesOf(rel: RelationSet): { readonly dependents: readonly NodeKey[]; readonly dependencies: readonly NodeKey[] } {
  const keys = (facts: readonly RelatedFact[]): readonly NodeKey[] =>
    [...facts.map((f) => f.nodeId)].sort(keyCmp).slice(0, EDGE_CAP);
  return { dependents: keys(rel.dependents), dependencies: keys(rel.dependencies) };
}

// ── the composer ────────────────────────────────────────────────────────────────────────────────────────
export function createOwn(sources: OwnSources): OwnFacet {
  /** Compose the curated OwnPack for a GROUNDED unit — rank → greedy-fill under OWN_CAP → project. */
  function composeOwn(unit: OwnUnit): OwnPackPlus {
    let used = 0;
    const overflow: NodeKey[] = [];

    // invariants: T0-first then T1 by (hits-desc, ppr-desc, nodeKey-asc); greedy-fill under the cap.
    const invariants: PackInvariant[] = [];
    for (const cand of [...sources.invariants(unit)].sort(cmpInvariant)) {
      if (used + cand.cost <= OWN_CAP) {
        invariants.push(cand.inv);
        used += cand.cost;
      } else {
        overflow.push(cand.inv.nodeId); // 0 silent drops — a pull-reachable tail
      }
    }

    // gotchas: structured knowledge facts (never prose), under the remaining budget.
    const gotchas: GroundedFact[] = [];
    for (const cand of [...sources.gotchas(unit)].sort(cmpGotcha)) {
      if (used + cand.cost <= OWN_CAP) {
        gotchas.push(cand.fact);
        used += cand.cost;
      } else {
        overflow.push(cand.fact.id);
      }
    }

    // availability manifest (D1): frecency-ranked, count- + budget-capped, content-free.
    const pointers: ManifestPointer[] = [];
    let truncated = false;
    for (const cand of [...sources.manifest(unit)].sort(cmpPointer)) {
      if (pointers.length < MANIFEST_CAP && used + cand.cost <= OWN_CAP) {
        pointers.push(cand.pointer);
        used += cand.cost;
      } else {
        truncated = true;
      }
    }

    const terrain = sources.terrain(unit);
    return {
      unit: oneLine(sources.role(unit)),
      invariants,
      shape: { contents: terrain.contents, owner: terrain.owner, tier: terrain.tier },
      edges: edgesOf(sources.relate(unit)),
      gotchas,
      memory: sources.memory(unit),
      drill: {
        finer: [...sources.finer(unit)].slice(0, FINER_CAP), // pointers only — never inlined
        refresh: { pull: `poke:${ownToolName(unit)}` },
        complement: { pull: `relate:${unit.id}` },
      },
      grounding: { source: groundingSource(unit.level) },
      tokenEstimate: used,
      manifest: { pointers, truncated },
      pullReachable: overflow,
    };
  }

  function own(unit: OwnUnit): OwnPackPlus {
    try {
      return composeOwn(unit);
    } catch {
      return emptyOwn(groundingSource(unit.level)); // RETR-9: total — never propagate a throw
    }
  }

  /**
   * Compose an EPIC (RETR-12j/12l): NOT a grounded node. Role from the project-memory `goal`; content from
   * the FEATURES' OwnPacks (deduped by nodeId), whole features included until the `OWN_CAP` budget, the
   * rest ceded to a pull-reachable pointer. `grounding.source = 'goal'` — no tree path / manifest required.
   */
  function ownEpic(epic: EpicUnit): OwnPackPlus {
    try {
      let used = 0;
      const seen = new Set<string>();
      const invariants: PackInvariant[] = [];
      const gotchas: GroundedFact[] = [];
      const finer: OwnUnit[] = [];
      const pointers: ManifestPointer[] = [];
      const overflow: NodeKey[] = [];
      const depSet = new Set<NodeKey>();
      const depsSet = new Set<NodeKey>();
      let truncated = false;

      for (const feat of epic.features) {
        const fpack = own(feat);
        const fits = used + fpack.tokenEstimate <= OWN_CAP;
        pointers.push({ kind: 'pack', name: ownToolName(feat), digest: `sim:${ownToolName(feat)}`, pull: `pull:${ownToolName(feat)}`, hits: 0 });
        if (fits) {
          used += fpack.tokenEstimate;
          finer.push(feat);
          for (const iv of fpack.invariants) {
            if (seen.has(iv.nodeId)) continue; // dedup by nodeId across features
            seen.add(iv.nodeId);
            invariants.push(iv);
          }
          for (const g of fpack.gotchas) gotchas.push(g);
          for (const d of fpack.edges.dependents) depSet.add(d);
          for (const d of fpack.edges.dependencies) depsSet.add(d);
        } else {
          truncated = true;
          for (const iv of fpack.invariants) overflow.push(iv.nodeId); // pull-reachable, not silently gone
        }
      }

      return {
        unit: oneLine(epic.goal), // role sourced from the project-memory goal, NOT a grounded node's line
        invariants,
        shape: { contents: [], owner: '', tier: 'T2' }, // an epic has no grounded terrain
        edges: { dependents: [...depSet].sort(keyCmp).slice(0, EDGE_CAP), dependencies: [...depsSet].sort(keyCmp).slice(0, EDGE_CAP) },
        gotchas,
        memory: null,
        drill: { finer, refresh: { pull: `poke:own_${epic.id}` }, complement: { pull: `relate:${epic.id}` } },
        grounding: { source: 'goal' }, // RETR-12j: an epic is a project-memory goal, not grounded
        tokenEstimate: used,
        manifest: { pointers, truncated },
        pullReachable: overflow,
      };
    } catch {
      return emptyOwn('goal');
    }
  }

  function dispatch(unit: OwnUnit): { readonly tool: string; readonly pack: OwnPackPlus } {
    return { tool: ownToolName(unit), pack: own(unit) }; // pushed by default (RETR-12h) — no explicit request
  }

  function project(units: readonly OwnUnit[]): readonly { readonly tool: string; readonly pack: OwnPackPlus }[] {
    return units.map((u) => dispatch(u)); // RETR-12a: every scope-unit → its own_<id> tool
  }

  /**
   * Dedup `own` against a co-injected pack (RETR-12k): a fact carried in `own` is REMOVED from the pack and
   * replaced by a pull-reachable pointer — dedup by nodeId, `own` wins, the fact is paid for once.
   */
  function dedup(ownPack: OwnPackPlus, pack: Pack): { readonly pack: Pack; readonly pointers: readonly DedupPointer[] } {
    const ownIds = new Set<string>(ownPack.invariants.map((i) => i.nodeId));
    const kept: PackInvariant[] = [];
    const pointers: DedupPointer[] = [];
    for (const iv of pack.invariants) {
      if (ownIds.has(iv.nodeId)) pointers.push({ nodeId: iv.nodeId, pull: `own:${iv.nodeId}` });
      else kept.push(iv);
    }
    return { pack: { ...pack, invariants: kept }, pointers };
  }

  return { own, ownEpic, dispatch, project, dedup };
}
