// @atlas/knowledge — ref/router.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// THE write-decision — infallible by construction (KNOW-4 + KNOW-15). "New node or update an existing
// one?" is COMPUTED, never judged: a pure function of three orthogonal hashes — `contentHash` (WHAT,
// dedup leg), `nodeKey` (WHICH, create/update leg), `subtreeHash` (WHERE-current, drift leg). No step
// consults an LLM. `primaryAnchorId` is COMPUTED mechanically as the tightest structural unit containing
// every referenced symbol — never an LLM-chosen anchor — and lives HERE (per the LEAD-RATIFIED decision:
// no separate `ref/anchor.ts`). Transcribed from atlas-knowledge:104-159, 123-124 and method-tags-knw:
// 39-44, 116-122.

import type { NodeKey } from '@atlas/contracts';
import type { Candidate } from './types.js';

/**
 * The write-decision routes. Transcribed EXACTLY from the KNOW-15 routing table (atlas-knowledge:135-142):
 * total + deterministic + mutually-exclusive (method-tags-knw:119).
 *   - `DEDUP`     — `contentHash` already in CAS; identical bytes ⇒ no-op (bump hits/freshness only).
 *   - `CREATE`    — `nodeKey` miss (new `(anchor, slot[, check])`), OR a DIFFERENT predicate `check`.
 *   - `UPDATE`    — `nodeKey` hit, advisory family; claim SET-UNION in place (git keeps prior, KNOW-4/12).
 *   - `SUPERSEDE` — `nodeKey` hit, predicate, SAME `check` re-evidenced; mint new + `supersededBy` pointer.
 *   - `REJECT`    — fails the 2-door bar (ungrounded, or obvious/useless) — KNOW-2.
 */
export type WriteDecision = 'DEDUP' | 'CREATE' | 'UPDATE' | 'SUPERSEDE' | 'REJECT';

/**
 * [OPEN DEFINE — parametric, threshold UNPINNED] The KNOW-15 move-aware near-duplicate matcher's
 * `claimNorm`-collision threshold (method-tags-knw:122; atlas-knowledge:128-132). The reference's own
 * S0 carry-forward reconciliation flags this as an OPEN DEFINE: `subtreeHash` equality catches move/
 * rename but NOT move+edit, so a similarity matcher is needed and its threshold value is NOT frozen.
 *
 * Per the task directive the threshold MUST be a PARAMETER, never a baked-in constant — so it is surfaced
 * here as an explicit config the matcher takes. This keeps the finite-hash-state route enumeration
 * feasible NOW (the matcher fixes the VALUE of the `nodeKey`/collision inputs; the routing OVER those
 * inputs is unchanged), while DEFINE pins the value later. Verifying the matcher's PRECISION is a
 * separate reference-model/PBT obligation that cannot be tagged until DEFINE pins the threshold
 * (method-tags-knw:122, 151). Flagged.
 */
export interface NearDupConfig {
  readonly claimNormThreshold: number;
}

export interface RouterApi {
  /** The pure write-decision (KNOW-4/15). Routes a candidate to exactly one `WriteDecision` from its
   *  three orthogonal hashes; the drift leg (`subtreeHash`) NEVER changes the create/update leg
   *  (atlas-knowledge:153). Before any CREATE a deterministic near-duplicate probe runs — a `claimNorm`
   *  collision at adjacent granularity forces UPDATE/MERGE (atlas-knowledge:128-132). No LLM call enters
   *  the decision (method-tags-knw:121). Pure + total.
   *
   *  [PARAMETRIC — see `NearDupConfig`] The frozen task inventory pins `writeDecision(candidate)`; the
   *  KNOW-15 directive requires the near-dup matcher threshold be an EXPLICIT parameter, not a constant.
   *  It is surfaced as the second parameter `cfg` — flagged as the divergence from the 1-arg inventory
   *  signature (the threshold is an OPEN DEFINE, method-tags-knw:122). */
  writeDecision(candidate: Candidate, cfg: NearDupConfig): WriteDecision;

  /** The node identity leg. `nodeKey(advisory) = hash(primaryAnchorId ‖ predicateSlot)`;
   *  `nodeKey(predicate) = hash(primaryAnchorId ‖ predicateSlot ‖ normalize(check))` — so a distinct
   *  `check` is a distinct node, never a sibling-supersede (atlas-knowledge:123-124, 144-146). Pure +
   *  total, no LLM.
   *
   *  [PINNED — oracle-pin-map §10] Routed on `Candidate`: identity needs `primaryAnchorId ‖ predicateSlot
   *  [‖ normalize(check)]`, and only `Candidate` carries the `slot`/`check` (the ratified `GroundedFact`
   *  has no stored `slot`) — so the compute-able input is `Candidate`. */
  nodeKey(node: Candidate): NodeKey;

  /** The COMPUTED primary anchor — the tightest structural unit (smallest AST subtree) containing every
   *  symbol the claim references (atlas-knowledge:114-119). NEVER an LLM-chosen anchor (the one landfill
   *  leak). ONLY the primary anchor enters identity — secondary citations live in `grounding.entries`
   *  and feed DRIFT only, never the `nodeKey`. It is the index's MOVE-AWARE id (name-stripped subtree
   *  match ⇒ rename is a MOVE, not delete+create). Pure + total, no LLM.
   *
   *  [FLAG — return leg] The task inventory pins `primaryAnchorId(node): NodeKey`. The reference frames
   *  `primaryAnchorId` as an ANCHOR id that is a COMPONENT fed into `nodeKey` (atlas-knowledge:123-124),
   *  not itself a `nodeKey`. Transcribed to the task's `NodeKey` return; flagged for the two sources to
   *  reconcile whether the anchor id is its own brand or a `NodeKey`.
   *
   *  [PINNED — oracle-pin-map §10] `node` input routed on `Candidate` (see `nodeKey`). */
  primaryAnchorId(node: Candidate): NodeKey;
}
