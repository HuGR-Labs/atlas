// @atlas/index — ref/types.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The index's shared data model: the axes, the per-node index record, the dual-Merkle rollup, and the
// change Delta. Transcribed EXACTLY from `docs/reference/atlas-index.md` §The axes (lines 36-47) +
// §territory manifest (lines 76-78). Shared identity types (`Hash`, `SubtreeHash`, `Territory`) are
// imported from @atlas/contracts — NEVER redefined here.

import type { Hash, SubtreeHash, Territory } from '@atlas/contracts';

/** The multiple hierarchies over the one CAS — each a Merkle rollup, each its own job (drift +
 *  discovery). `functional`/flows is the NEXT axis, NOT built here (atlas-index:127). (atlas-index:36) */
export type Axis = 'spatial' | 'territory' | 'dependency';

/** The three (and only three) deterministic relevance paths — no embeddings, no free-text `search()`
 *  (INDEX-6). (atlas-index:47) */
export type RetrievalMode = 'scope' | 'dependency' | 'trigger';

/**
 * One node in an axis hierarchy. Transcribed EXACTLY from atlas-index:38:
 *   `IndexNode = { axis, level, key, subtreeHash, children: IndexNode[], objects: Hash[] }`.
 *   - `axis`        — which hierarchy this node belongs to.
 *   - `level`       — the granularity level NAME. Two vocabularies exist (spatial:
 *     `repo→crate→module→file→item→block`, atlas-index:54; territory: `project→territory→region`,
 *     atlas-index:70). The reference gives `level` NO enum type across axes → transcribed as `string`.
 *   - `key`         — the node's key within its level (reference gives no concrete type → `string`).
 *   - `subtreeHash` — THE drift oracle: BLAKE3 over sorted child hashes (branded, from contracts).
 *   - `children`    — child nodes (recursive).
 *   - `objects`     — the CAS objects hanging off this node, referenced by hash (stored once, INDEX-10).
 *
 * [FLAG — not transcribed] `ppr` (personalized-PageRank rank, structure.md DP-2 / RETR-11) is a
 * lead-ratified stored numeric FIELD, but NEITHER atlas-index nor method-tags-idx places it on
 * `IndexNode` or `Rollup` — so it is NOT added here (never invent). Add `ppr?: number` only if a
 * reference that scopes it to this record is supplied.
 */
export interface IndexNode {
  readonly axis: Axis;
  readonly level: string;
  readonly key: string;
  readonly subtreeHash: SubtreeHash;
  readonly children: readonly IndexNode[];
  readonly objects: readonly Hash[];
}

/**
 * The dual Merkle rollup of one axis node (INDEX-12). Transcribed EXACTLY from atlas-index:40-44:
 *   - `axis`   — which axis.
 *   - `bucket` — which node (the roll-up bucket).
 *   - `rId`    — BLAKE3 Merkle root over sorted child hashes — STRUCTURE.
 *   - `rState` — BLAKE3 root over (hash ‖ status ‖ freshness) — STATE.
 *
 * [FLAG — reference types both roots as `string`] `rId`/`rState` are BLAKE3 roots but the reference
 * (atlas-index:42-43) types them as bare `string`, NOT branded `Hash`/`SubtreeHash` — transcribed
 * verbatim as `string` (do not brand what the reference left unbranded).
 *
 * [FLAG — INDEX-16 tension, not added] INDEX-16 (atlas-index:202-205; method-tags-idx:128-130) says
 * the `unresolved/total` ratio is a "published health metric on every rollup", implying a `ratio`
 * field here. The canonical Rollup shape (atlas-index:40-44) does NOT list it, so it is NOT added —
 * the ratio surface is transcribed on `CoverageApi` (ref/coverage.ts) instead. Flagged for the two
 * references to reconcile whether `ratio` is a stored Rollup field.
 */
export interface Rollup {
  readonly axis: Axis;
  readonly bucket: string;
  readonly rId: string;
  readonly rState: string;
}

/**
 * What a rebuild/edit changed, so a re-check is bounded to the changed buckets, never `N` (INDEX-12).
 * Transcribed EXACTLY from atlas-index:45:
 *   `Delta = { idChanged: boolean, stateChanged: boolean, changedBuckets: string[] }`.
 */
export interface Delta {
  readonly idChanged: boolean;
  readonly stateChanged: boolean;
  readonly changedBuckets: readonly string[];
}

/**
 * The territories manifest (normative schema). Transcribed EXACTLY from atlas-index:77:
 *   `Manifest = { territories: Territory[] }`  — declaration order is significant (overlap tiebreak).
 * `Territory` is the CANONICAL contracts type (`@atlas/contracts`), imported — NOT redefined.
 */
export interface Manifest {
  readonly territories: readonly Territory[];
}

/**
 * The set of built axis-views the index exposes (≥3, INDEX-10) — the return of `build` (method-tags-
 * idx:38, `build(tree, scipOutput)=axes`).
 *
 * [SIG-TBD — underspecified] No cited source gives `Axes` a concrete shape; atlas-index/method-tags
 * describe it only as "≥3 axis-views over one CAS, each with its own rollup" (method-tags-idx:87).
 * Transcribed as the honest minimal mapping `Axis → root IndexNode` (one rooted hierarchy per axis),
 * NOT invented with extra fields. Flagged for the owning WP to pin.
 */
export type Axes = { readonly [K in Axis]: IndexNode };

/**
 * [SIG-TBD — opaque build input] The real file tree fed to `build` (atlas-index:57, "the file tree").
 * The reference gives it no concrete shape → transcribed as `unknown`; do not invent a tree schema.
 */
export type FileTree = unknown;

/**
 * [SIG-TBD — opaque build input] Recorded output of a per-language SCIP indexer — a BLACK-BOX,
 * version-pinned external input (method-tags-idx:38-39, 140-143), fed as fixtures. No concrete shape
 * is (or should be) modeled → transcribed as `unknown`.
 */
export type ScipOutput = unknown;
