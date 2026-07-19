// @atlas/knowledge — ref/hits.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Usefulness is a-posteriori — the hit-ledger + decay (KNOW-17, spec A-10/A-16). A served fact accrues a
// logged `hit` each time it governs a decision (a seat/cold-reviewer cites its node-id as "fact
// applied"). A served fact with 0 hits across the decay window DECAYS out of the served/pack set
// (archived to CAS, never deleted — KNOW-12) and MAY re-enter on a later hit. Door-2's admission
// threshold is a function of OBSERVED hits, never the proposer's self-score. Spans the KNOW-17 ↔ MEM-7
// substrate seam (DP-9). Transcribed from atlas-knowledge:67, 224-227 and method-tags-knw:131-136.
//
// [PINNED — oracle-pin-map §4/§hits] method-tags-knw:135 freezes no concrete ledger signature; the
// oracle-pin ratifies the minimal honest records: `window` = a ledger event-count (`number`), `logHit`
// returns a `LedgerEntry`, `decay` returns the decayed/retained `NodeKey` sets. `threshold==f(hits)`
// stays an OPEN-DEFINE parametric value (not a shape).

import type { NodeKey } from '@atlas/contracts';

/**
 * [OPEN DEFINE — parametric, threshold UNPINNED] The KNOW-17 decay window + the door-2 admission
 * threshold as a FUNCTION of observed hits (`threshold==f(hits)`, method-tags-knw:135; atlas-knowledge:
 * 158). This is the SECOND OPEN-DEFINE constant: per the task directive it MUST be PARAMETRIC — a config
 * the decay pass takes, never a baked-in constant. The value is NOT frozen (calibrates on observed
 * downstream hits, not the proposer's score). Flagged for DEFINE to pin.
 *
 * [PINNED — oracle-pin-map §4] The decay-window unit is a logical LEDGER event-count (KNOW-17 ↔ MEM-7,
 * ledger-driven not wall-clock) → `number`.
 */
export interface DecayConfig {
  /** logical ledger position (monotone event-count), never wall-clock. */
  readonly window: number; // PINNED → number (ledger event-count)
  readonly threshold: number; // [OPEN DEFINE] door-2 threshold == f(hits) — parametric, value unpinned
}

/**
 * The minimal honest per-node hit-ledger record (KNOW-17). [PINNED — oracle-pin-map §hits] no reference
 * shape frozen → the minimal `{nodeKey, hits, window}`: the node cited, its observed hit-count, and the
 * ledger `window` position (event-count) the count is measured over.
 */
export interface LedgerEntry {
  readonly nodeKey: NodeKey;
  readonly hits: number;
  readonly window: number; // logical ledger position (monotone event-count), never wall-clock
}

export interface HitsApi {
  /** Log a `hit` citing a served fact's node-id (a fact governed a decision — KNOW-17). Append-only
   *  ledger event. [PINNED — oracle-pin-map §hits] returns the minimal honest per-node ledger record
   *  (no reference shape → the minimal `{nodeKey, hits, window}`). */
  logHit(nodeId: NodeKey): LedgerEntry;

  /** Decay pass (parametric — `cfg`): a fact with 0 hits in the window is archived to CAS (never
   *  deleted — KNOW-12) and may re-enter on a later hit. `0-hit ⇒ archived ∧ re-spawnable`; the door-2
   *  threshold is `f(hits)`, never a self-score (method-tags-knw:135). Pure + total.
   *  [PINNED — oracle-pin-map §hits] the decay result is the decayed/retained node-id sets. */
  decay(cfg: DecayConfig): { readonly decayed: readonly NodeKey[]; readonly retained: readonly NodeKey[] };
}
