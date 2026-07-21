// @atlas/e2e-blackbox — test/author.ts  (the fact-AUTHORING helper — NOT the black-box execution harness)
//
// THE CRUX (grounded-fact authoring). `atlas emit` runs a TRUTH gate: a fact is accepted only if its
// grounding RE-DERIVES FRESH against the built index at emit time (governed-emit.ts → driftDetect). The
// fixture's SCIP is empty, and — see the FINDING below — the index build produces ONLY file/directory
// nodes (no sub-file `::` symbol granularity), so the ONLY groundable units are real file/dir paths. To
// author a genuinely GROUNDED fact this helper does exactly what the crux's option 2 sanctions: it
// COMPUTES the grounding "the same way the index does" — it builds the REAL `Axes` from the fixture repo
// (the identical `build(walkFileTree(repo), …)` the runtime composes) and reads the fixture file's ACTUAL
// `subtreeHash`, so the authored anchor re-derives FRESH. Identity (`nodeKey`) is the REAL product formula.
//
// This is the stand-in for the authoring tool a real user would reach for: `atlas mine` (the CLI mining
// door) abstains with no model wired and writes ZERO grounded candidates (a usability FINDING), so a story
// that needs a durable grounded fact MUST construct it. Product LIBS are imported ONLY to construct the
// input fact here; every EXECUTION and every ASSERTION in the stories stays pure black-box (subprocess /
// stdio). No product code touches the assertions.

import { build } from '@atlas/index';
import type { Axes, IndexNode } from '@atlas/index';
import { foldAstUnits, initAst, walkFileTree } from '@atlas/adapter-io';
import { nodeKey } from '@atlas/knowledge';
import type { Candidate, GroundedFact, PredicateSlot } from '@atlas/knowledge';
import type { SubtreeHash, Tier } from '@atlas/contracts';

// WARM UP the opt-in AST grammar at MODULE LOAD (top-level await) so this in-process authoring helper folds
// the SAME `::` sub-file units the runtime does (F1). `composeRuntime` (driven by the spawned `atlas` bin,
// which awaits `initAst()`) now folds AST units into the index BEFORE `build`, which changes every parseable
// file node from a content-hash LEAF into a children-hash BRANCH. To author a fact whose grounding still
// re-derives FRESH against that folded index, `axesOf` below MUST fold identically — hence the warmup here.
// Because ESM finishes a module's top-level await before its importers evaluate, every story that imports
// this helper gets warm grammars before its `beforeAll` runs, with NO change to the story files themselves.
await initAst();

/** Build the SAME folded `Axes` the runtime composes over a repo (the fixture's SCIP is empty documents):
 *  `foldAstUnits(walkFileTree(repo))` → `build`, so a file node is a BRANCH over its `::` item/block units
 *  and a symbol path resolves. This is the identical transform `composeRuntime`/`assembleHandler` apply. */
function axesOf(repoPath: string): Axes {
  return build(foldAstUnits(walkFileTree(repoPath)), { documents: [] });
}

/** Brand a raw digest string as the drift-oracle `SubtreeHash` (runtime no-op — the brand is erased in
 *  JSON; the value written to the fact file is a plain string the emit gate re-derives against). */
const asSubtree = (h: string): SubtreeHash => h as unknown as SubtreeHash;

/** Walk an axis hierarchy for the node whose `key` is `qualifiedPath`; return its `subtreeHash` (string). */
function findByKey(node: IndexNode, key: string): string | undefined {
  if (node.key === key) return String(node.subtreeHash);
  for (const child of node.children) {
    const hit = findByKey(child, key);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/** The REAL `subtreeHash` the emit truth-gate will re-derive for `qualifiedPath` — computed by building the
 *  SAME `Axes` the runtime composes over the fixture repo. Throws if the path is not a real index unit
 *  (a genuine ceiling: only file/dir paths resolve — the index has no `::` symbol nodes). */
export function subtreeHashOf(repoPath: string, qualifiedPath: string): string {
  const axes = axesOf(repoPath);
  for (const root of [axes.spatial, axes.territory, axes.dependency]) {
    const hit = findByKey(root, qualifiedPath);
    if (hit !== undefined) return hit;
  }
  throw new Error(`author: no index unit for '${qualifiedPath}' — cannot ground (index has no such node)`);
}

/** The recipe for one grounded advisory fact. `filePath` is a REAL fixture file (the grounding anchor). */
export interface FactSpec {
  readonly repoPath: string;
  readonly filePath: string; // a real fixture file path — the grounding qualifiedPath (a spatial node)
  readonly slot: PredicateSlot;
  readonly claim: string;
  readonly tier?: Tier; // default 'T1' — query bounds OUT 'T2' (TOOLS-6), so a served fact must be ≥T1
  readonly scope?: string; // default 'src' — the KNOW-11 authz scope the fact is written under
}

/** A serializable advisory `GroundedFact` whose grounding RE-DERIVES FRESH (subtreeHash from the real index)
 *  and whose identity is the REAL `nodeKey(anchor‖slot)` — so byte-identical re-emit DEDUPs, a reworded
 *  claim at the same (anchor,slot) UPDATEs (same nodeKey), and a different file CREATEs a distinct node. */
export function groundedAdvisoryFact(spec: FactSpec): GroundedFact {
  const tier: Tier = spec.tier ?? 'T1';
  const subtreeHash = asSubtree(subtreeHashOf(spec.repoPath, spec.filePath));
  const grounding: GroundedFact['grounding'] = {
    entries: [{ anchor: { kind: 'file', qualifiedPath: spec.filePath, subtreeHash }, path: spec.filePath }],
  };
  const candidate: Candidate = {
    claimText: spec.claim,
    claimNorm: spec.claim,
    slot: spec.slot,
    grounding,
    provenance: { source: 'e2e-blackbox', trusted: true },
    tier,
  };
  return {
    kind: 'advisory',
    id: nodeKey(candidate),
    tier,
    claimNorm: spec.claim,
    grounding,
    freshness: 'FRESH',
    claims: [],
    authoring: 'ADVISORY',
    scope: spec.scope ?? 'src',
    predicateSlot: spec.slot,
  };
}

/** DFS for the `IndexNode` whose `key` equals `key` (a file path OR a `::` sub-file unit key). */
function findNode(node: IndexNode, key: string): IndexNode | undefined {
  if (node.key === key) return node;
  for (const child of node.children) {
    const hit = findNode(child, key);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/** The declared NAME of a folded unit key — the trailing `:`-field of its last `::` segment
 *  (`file::<start>:<kind>:<name>` ⇒ `<name>`, cf. adapter-io/src/ast.ts `unitPath`). */
function unitLeafName(key: string): string {
  const seg = key.split('::').at(-1) ?? '';
  return seg.slice(seg.lastIndexOf(':') + 1);
}

/** The recipe for one grounded advisory fact anchored at a SUB-FILE symbol inside `filePath`. */
export interface SymbolFactSpec {
  readonly repoPath: string;
  readonly filePath: string; // the file the symbol lives in (a real fixture file)
  readonly symbolName: string; // the declared name of a top-level item in that file (e.g. `foo`)
  readonly slot: PredicateSlot;
  readonly claim: string;
  readonly tier?: Tier; // default 'T1'
  readonly scope?: string; // default 'src'
}

/**
 * A serializable advisory `GroundedFact` grounded at a `::` SUB-FILE SYMBOL anchor (`kind: 'symbol'`). Its
 * computed `primaryAnchor` is the folded `::` unit path — a PROPER structural DESCENDANT of the file node —
 * so paired with a FILE-anchored fact sharing the same slot + exact claim, `deriveSubsumes` fires
 * `file ⊃ symbol` on read (F1). The cited `subtreeHash` is the REAL folded-index hash of the symbol unit,
 * so the emit truth-gate re-derives it FRESH. Throws if the named symbol is not a real folded index unit.
 */
export function groundedSymbolFact(spec: SymbolFactSpec): GroundedFact {
  const tier: Tier = spec.tier ?? 'T1';
  const axes = axesOf(spec.repoPath);
  const fileNode = findNode(axes.spatial, spec.filePath);
  if (fileNode === undefined) throw new Error(`author: no file node '${spec.filePath}'`);
  const unit = fileNode.children.find((c) => unitLeafName(c.key) === spec.symbolName);
  if (unit === undefined) {
    throw new Error(`author: no symbol unit '${spec.symbolName}' under '${spec.filePath}' (index has no such AST node)`);
  }
  const grounding: GroundedFact['grounding'] = {
    entries: [
      {
        anchor: { kind: 'symbol', qualifiedPath: unit.key, subtreeHash: asSubtree(String(unit.subtreeHash)) },
        path: spec.filePath,
      },
    ],
  };
  const candidate: Candidate = {
    claimText: spec.claim,
    claimNorm: spec.claim,
    slot: spec.slot,
    grounding,
    provenance: { source: 'e2e-blackbox', trusted: true },
    tier,
  };
  return {
    kind: 'advisory',
    id: nodeKey(candidate),
    tier,
    claimNorm: spec.claim,
    grounding,
    freshness: 'FRESH',
    claims: [],
    authoring: 'ADVISORY',
    scope: spec.scope ?? 'src',
    predicateSlot: spec.slot,
  };
}

/** An UNGROUNDED fact: same shape, but the anchor cites a `subtreeHash` NO index unit carries, so the truth
 *  gate re-derivation FAILS (DRIFTED → NA → rejected). Used by S2 to prove grounded-or-rejected. */
export function ungroundedFact(claim: string, scope = 'src'): GroundedFact {
  const grounding: GroundedFact['grounding'] = {
    entries: [
      {
        anchor: { kind: 'file', qualifiedPath: 'src/foo.ts', subtreeHash: asSubtree('deadbeefnotarealsubtreehash') },
        path: 'src/foo.ts',
      },
    ],
  };
  return {
    kind: 'advisory',
    id: 'ungrounded-e2e-node' as unknown as GroundedFact['id'],
    tier: 'T1',
    claimNorm: claim,
    grounding,
    freshness: 'FRESH',
    claims: [],
    authoring: 'ADVISORY',
    scope,
    predicateSlot: 'invariant',
  };
}
