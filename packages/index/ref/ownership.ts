// @atlas/index — ref/ownership.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Generated + reconciled ownership (INDEX-15, anti-CODEOWNERS-rot). Territory `owner` is GENERATED from
// the structural graph + git-blame authorship the index already holds; an explicit manifest override
// BEATS the generated owner; reconciliation is deterministic and `$0`-LLM; `tier` stays human-ratified
// (never generated), passed through untouched. (atlas-index:83-91, 197-201; method-tags-idx:118-123)

import type { Territory } from '@atlas/contracts';
import type { DepEdge, Manifest } from './types.js';

/**
 * The reconciled ownership map — the deterministic partition (after overlap resolution): each territory
 * → its reconciled `owner` (seat). Transcribed from the reference `reconcile(...)` return
 * (method-tags-idx:122), keyed by the frozen `Territory` (atlas-index:76-78, §territory manifest);
 * `owner` is the nominal seat id carried as `string` (see @atlas/contracts `Territory` owner FLAG).
 *
 * [FLAG — key granularity] atlas-index:80-82 says the partition is ultimately per structural unit
 * (unit → one territory); this minimal map keys by `Territory` (the manifest's atomic governance unit),
 * NOT per-`StructRef`. Left for the WP to widen to unit-granularity if the build needs it.
 */
export type OwnerMap = ReadonlyMap<Territory, string>;

/**
 * A git-blame authorship signal for one path — the minimal transcription of atlas-index:87 ("git-blame
 * authorship"), fed as a black-box signal to the reconciler (refuse-to-model, method-tags-idx:148-149;
 * blame is NOT modeled as ownership ground truth). A local build input, NOT a contracts type.
 */
export interface BlameEntry {
  readonly path: string;
  readonly authors: readonly string[];
}

export interface OwnershipApi {
  /** Deterministic owner-generator over the structural depends-on graph + git-blame, then the manifest
   *  override as a precedence layer (override beats generated); `tier` passed through untouched,
   *  `$0`-LLM (INDEX-15). (method-tags-idx:122)
   *
   *  `graph` = the frozen depends-on graph (`DepEdge[]`, the structural signal — atlas-index:87, 105);
   *  `blame` = the git-blame authorship signal (`BlameEntry[]`, a black-box signal — see `BlameEntry`);
   *  `manifest` = the hashed `Manifest` override layer. */
  reconcile(graph: readonly DepEdge[], blame: readonly BlameEntry[], manifest: Manifest): OwnerMap;
}
