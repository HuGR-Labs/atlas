// @atlas/knowledge — src/hits.ts  (WP-6.18.KNOW · served-fact hits ledger + door-2 calibration + decay/re-entry)
//
// KNOW-17 (atlas-knowledge:67, 224-227; method-tags-knw:131-136): usefulness is a-posteriori. A served
// fact accrues a logged `hit` each time it governs a decision; a served fact with ZERO hits across the
// decay window DECAYS out of the served/pack set (archived to CAS, never deleted — KNOW-12) and MAY
// re-enter on a later hit; and the Door-2 admission threshold is a FUNCTION of observed hits, never the
// proposer's self-assessment. This module implements the FROZEN `HitsApi` (co-located below) and owns the
// door-2 calibration OVER the ledger — the KNOW-17 seam consumed by RETR (RETR-8) and GEN (GEN-16).
//
// SEAM (sealed lower layers; build-ahead injection — the same discipline `bindReconcile`/`bindFreshness`/
// `produce` use; no raw hashing, no clock, no IO here):
//   • the served/pack SNAPSHOT is upstream-owned (produce/router) — INJECTED as `servedSet`, consumed
//     read-only; the decay pass iterates it, never recomputes it.
//   • the CAS archive is KERNEL-owned (KNOW-12, archive.ts) — INJECTED as `archive`, a sink that only
//     RECEIVES; decay archives and NEVER deletes. Re-entry re-spawns from it on a later hit.
//   • the door-2 threshold `f(hits)` is the SECOND OPEN-DEFINE constant (DecayConfig.threshold, co-located)
//     — it MUST be PARAMETRIC, so it is INJECTED as `calibrate`, never a baked-in constant. This module
//     applies it to OBSERVED hits (the ledger), never to a proposer self-score.
// The `window` is the oracle-pinned logical LEDGER event-count (a monotone `number`, KNOW-17 ↔ MEM-7),
// never wall-clock. The decay FLOOR is the spec-pinned ZERO-hit boundary (KNOW-17/A-16) — NOT the
// unpinned door-2 admission threshold, which stays parametric and flows only through `door2Threshold`.
//
// SCOPE (card exclusions): does NOT own the RETR per-kind hitRate ledger (RETR-8) nor the RETR off-atlas
// ledger (RETR-13); does NOT define the pack cap/drop order. GEN/RETR CONSUME this contract downstream.

import type { NodeKey } from '@atlas/contracts';

// ── frozen HitsApi surface, co-located here (was ref/hits.ts) ─────────────────────────────────────────

/**
 * [OPEN DEFINE — parametric, threshold UNPINNED] The KNOW-17 decay window + the door-2 admission
 * threshold as a FUNCTION of observed hits (`threshold==f(hits)`, method-tags-knw:135). PARAMETRIC — a
 * config the decay pass takes, never a baked-in constant; the threshold value is NOT frozen (calibrates
 * on observed downstream hits). The decay-window unit is a logical LEDGER event-count (`number`).
 */
export interface DecayConfig {
  /** logical ledger position (monotone event-count), never wall-clock. */
  readonly window: number; // PINNED → number (ledger event-count)
  readonly threshold: number; // [OPEN DEFINE] door-2 threshold == f(hits) — parametric, value unpinned
}

/**
 * The minimal honest per-node hit-ledger record (KNOW-17). [PINNED — oracle-pin-map §hits] the minimal
 * `{nodeKey, hits, window}`: the node cited, its observed hit-count, and the ledger `window` position.
 */
export interface LedgerEntry {
  readonly nodeKey: NodeKey;
  readonly hits: number;
  readonly window: number; // logical ledger position (monotone event-count), never wall-clock
}

export interface HitsApi {
  /** Log a `hit` citing a served fact's node-id (a fact governed a decision — KNOW-17). Append-only
   *  ledger event. Returns the minimal honest per-node ledger record `{nodeKey, hits, window}`. */
  logHit(nodeId: NodeKey): LedgerEntry;

  /** Decay pass (parametric — `cfg`): a fact with 0 hits in the window is archived to CAS (never
   *  deleted — KNOW-12) and may re-enter on a later hit. The door-2 threshold is `f(hits)`, never a
   *  self-score (method-tags-knw:135). Pure + total. The result is the decayed/retained node-id sets. */
  decay(cfg: DecayConfig): { readonly decayed: readonly NodeKey[]; readonly retained: readonly NodeKey[] };
}

/**
 * The DEFINE-supplied Door-2 admission threshold as a FUNCTION of observed hits (`threshold==f(hits)`,
 * method-tags-knw:135; DecayConfig.threshold, co-located). PARAMETRIC — injected, never a baked-in
 * constant; the VALUE is not frozen (it calibrates on observed downstream hits, not the proposer's
 * score). This module applies it to the ledger's OBSERVED hit-count, never to a self-assessment.
 */
export type Calibrate = (observedHits: number) => number;

/**
 * The injected lower-layer seams (build-ahead). None is recomputed here.
 *   - `servedSet`  — the current served/pack snapshot (produce/router-owned); the decay pass iterates it.
 *   - `archive`    — the CAS archive sink (KNOW-12); decay hands a decayed node-id here. Never deletes.
 *   - `calibrate`  — the parametric door-2 `f(hits)` (OPEN-DEFINE); applied to observed hits.
 */
export interface HitsDeps {
  readonly servedSet: () => Iterable<NodeKey>;
  readonly archive: (nodeKey: NodeKey) => void;
  readonly calibrate: Calibrate;
}

/**
 * The bound KNOW-17 surface: the frozen `HitsApi` (ledger accrual + decay/re-entry) plus the door-2
 * calibration `door2Threshold` OVER the ledger. `door2Threshold` realizes the `threshold==f(hits)`
 * relationship the frozen `DecayConfig.threshold` documents, computed from OBSERVED hits.
 */
export interface BoundHits extends HitsApi {
  /** The Door-2 admission threshold for `nodeId` = `calibrate(observed hits)` (KNOW-17b). A pure
   *  function of the ledger's observed hit-count — NEVER the proposer's self-assessment. */
  door2Threshold(nodeId: NodeKey): number;
}

/**
 * Bind the KNOW-17 hits ledger to the injected lower-layer seams.
 *
 * The returned surface owns an append-only per-node hit ledger (`hits`), a monotone ledger event-count
 * (`window`), and the set of decayed (archived, re-spawnable) node-ids:
 *   - `logHit(nodeId)`     — accrues one hit; if the node was decayed it RE-ENTERS (re-spawn from CAS,
 *                            KNOW-17d); returns the minimal `{nodeKey, hits, window}` record.
 *   - `decay(cfg)`         — over the served/pack snapshot, a fact with ZERO hits (the spec-pinned floor)
 *                            is archived to CAS (never deleted — KNOW-17c/KNOW-12) and dropped; the rest
 *                            are retained. Returns the decayed/retained node-id sets.
 *   - `door2Threshold(id)` — `calibrate(observed hits)`, the door-2 `f(hits)` (KNOW-17b).
 *
 * Deterministic: the `window` is a logical event-count (no clock); no IO, no hashing here.
 */
export function bindHits(deps: HitsDeps): BoundHits {
  const ledger = new Map<NodeKey, number>(); // nodeKey → observed hits in the current window
  const decayed = new Set<NodeKey>();         // decayed node-ids, archived in CAS, re-spawnable
  let window = 0;                             // logical ledger event-count (monotone), never wall-clock

  const observedHits = (nodeId: NodeKey): number => ledger.get(nodeId) ?? 0;

  const logHit = (nodeId: NodeKey): LedgerEntry => {
    if (typeof nodeId !== 'string' || nodeId.length === 0) {
      throw new TypeError('hits.logHit: malformed node-id'); // fail-closed on malformed input
    }
    window += 1; // append-only ledger event advances the window position
    // KNOW-17d re-entry: a decayed (archived) fact re-enters the served set on a later hit.
    decayed.delete(nodeId);
    const hits = observedHits(nodeId) + 1;
    ledger.set(nodeId, hits);
    return { nodeKey: nodeId, hits, window };
  };

  const decay = (cfg: DecayConfig): { readonly decayed: readonly NodeKey[]; readonly retained: readonly NodeKey[] } => {
    if (!Number.isFinite(cfg.window) || cfg.window < 0) {
      throw new TypeError('hits.decay: malformed decay window'); // fail-closed on malformed config
    }
    const out: NodeKey[] = [];
    const kept: NodeKey[] = [];
    for (const nodeId of deps.servedSet()) {
      if (observedHits(nodeId) === 0) {
        // KNOW-17c: 0 hits in window ⇒ archived to CAS (never deleted), dropped from the served set.
        deps.archive(nodeId);
        decayed.add(nodeId);
        out.push(nodeId);
      } else {
        kept.push(nodeId);
      }
    }
    return { decayed: out, retained: kept };
  };

  const door2Threshold = (nodeId: NodeKey): number => deps.calibrate(observedHits(nodeId));

  return { logHit, decay, door2Threshold };
}
