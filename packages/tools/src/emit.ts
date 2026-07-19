// @atlas/tools — src/emit.ts   (WP-4.11-a.TOOLS — TOOLS-7a / TOOLS-7b, GROUND-6)
//
// `atlas-emit`'s re-derive-at-`source@sha` + fail-closed reject path — the emit-surface consumer of
// GROUND's truth-gate. `emit(node, at)` RE-DERIVES the node's citation at `source@sha` (it does NOT trust
// the caller's citation): iff the grounding re-derives FRESH (`gateHolds ⇒ HOLDS`, GROUND-4/6) the node is
// persisted through the SEALED @atlas/kernel content-addressed `id` seam and `{emitted:true, id}` returned;
// otherwise it fails CLOSED — `{emitted:false, rejected}`, and NOTHING is persisted (the store is left
// byte-identical). Transcribed against the frozen oracle `../ref/emit.ts` (`EmitApi.emit`) + `../ref/types.ts`
// (`EmitOut`); goldens SCN-TOOLS-7a-1 / SCN-TOOLS-7b-1.
//
// SCOPE (this facet): re-derivation + the fail-closed reject only. EXCLUDED by the card — templated/upsert
// write semantics (TOOLS-7c/7d, EPIC-13), `absorb(ResultCard)` (TOOLS-9, upward-owned), and DEFINING the
// gate (`gateHolds`, owned by WP-4.11-a.GROUND). The persist on success is a MINIMAL content-addressed write.

import type { Hash, Status } from '@atlas/contracts';
import type { GroundedFact } from '@atlas/knowledge';
import type { Cas, CasObject } from '@atlas/kernel';
import { id } from '@atlas/kernel';
import type { EmitApi } from '../ref/emit.js';
import type { EmitOut } from '../ref/types.js';

/**
 * The GROUND truth-gate seam consumed by the emit surface (WP-4.11-a.GROUND, build-ahead via FROZEN ref +
 * fixtures). `gateHolds(node, at)` re-derives the node's citation at `source@sha` and returns the gate
 * verdict; `HOLDS` iff the grounding re-derives FRESH (GROUND-4/6). Tools CONSUMES this port; GROUND owns
 * its concrete implementation (`atlas-grounding` `GateApi.gateHolds`) — it is NOT defined here.
 */
export interface TruthGate {
  gateHolds(node: GroundedFact, at: Hash): Status;
}

/** The structured fail-closed reason (TOOLS-7b, GROUND-6): an ungrounded fact never enters at emit. */
const REJECTED = 'ungrounded: citation does not re-derive at source@sha (TOOLS-7b / GROUND-6)';

/**
 * Build `atlas-emit` over an injected content-addressed store + the GROUND truth-gate seam. The returned
 * `emit` conforms EXACTLY to the frozen `EmitApi.emit(node, at)` signature. Pure + total given the store
 * and gate: no clock, no IO, no throw — a non-re-deriving node fails closed to a structured verdict.
 */
export function createEmit(store: Cas, gate: TruthGate): { readonly emit: EmitApi['emit'] } {
  const emit = (node: GroundedFact, at: Hash): EmitOut => {
    // Re-derive the citation at source@sha — the caller's citation is NOT trusted (TOOLS-7a).
    if (gate.gateHolds(node, at) !== 'HOLDS') {
      // Fail closed: reject the node, persist NOTHING — the store is left byte-identical (TOOLS-7b).
      return { emitted: false, rejected: REJECTED };
    }
    // Re-derives ⇒ persist through the sealed content-addressed seam (no raw hashing). Minimal write:
    // upsert/template semantics are TOOLS-7c/7d, out of this facet.
    const obj = node as CasObject;
    const key = id(obj);
    store.set(key, obj);
    return { emitted: true, id: key };
  };
  return { emit };
}

// differential-vs-oracle (compile-time): the impl's `emit` conforms to the frozen `EmitApi.emit`
// signature (../ref/emit.ts). `absorb` (TOOLS-9) is a DISTINCT req, out of this facet — not asserted here.
const _emitConforms: EmitApi['emit'] = createEmit(new Map(), { gateHolds: () => 'NA' }).emit;
void _emitConforms;
