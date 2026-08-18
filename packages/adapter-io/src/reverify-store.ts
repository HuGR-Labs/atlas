// @atlas/adapter-io — src/reverify-store.ts  (REVERIFY-GATE: re-prove every `proven` seal against the LIVE index)
//
// The versioned-store chapter's premise is that knowledge travels WITH the repo, not that it is trusted
// because it sits in `.atlas/`. A committed durable store authenticates INTEGRITY (content-addressing) and
// says nothing about PROVENANCE — which is why `store-provenance.ts` turns Atlas off when `.atlas/` is
// tracked by git (untouched here, and this module does NOT narrow that tripwire). The way out is not to
// trust the committed fact but to RE-PROVE it: a fact whose own recorded derivation (`witness`,
// `@atlas/knowledge` `PredicateWitness`, #195 SEAL-CARRIES-ITS-WITNESS) replays PROVEN against the CURRENT
// index is true regardless of who committed it or when. This module is that re-prover.
//
// ── THE THREE-BUCKET CLASSIFICATION IS THE WHOLE POINT ──────────────────────────────────────────────────
//   `re-proven`    — the witness replayed through the REAL oracle (the SAME `VerifyFactLeg` `atlas
//                    verify-fact` drives — no second oracle, no duplicated index build) and came back `proven`.
//   `broken`       — replayed and did NOT come back `proven` (abstain/refuted/anything else). The fact no
//                    longer holds against this index — drift, a deleted caller, a moved symbol.
//   `unverifiable` — `seal:'proven'` with NO witness, or an INCOMPLETE one (missing slot/target/scope, or a
//                    slot the witness family does not cover). There is nothing to replay. THIS MUST NEVER BE
//                    COUNTED AS A PASS: a witness-less `proven` seal is precisely the trust-me-it-was-proved
//                    shape the versioned-store chapter exists to eliminate. Cold review of #195 established
//                    this arm is UNREACHABLE in shipped code today (`compose-mine-admission.ts` wires
//                    `typeOracle.expressible: () => false`) — it is checked anyway, and its count is
//                    reported rather than assumed empty.
//
// A fact that carries NO `seal` at all (an ordinary advisory/predicate/relation/negation) is not sealed
// `proven` and is simply not in scope for this pass — it is neither re-proven nor broken nor unverifiable,
// it is UNSEALED, and this module never counts it.
//
// ── WHY THIS TAKES `driftFacts`-SHAPED INPUT, NOT A STORE PATH ───────────────────────────────────────────
// `compose.ts` already builds `driftFacts` — the FULL hydrated `GroundedFact[]` read back off the durable
// CAS via `currentNodes(rehydrateProjection(store)).map(n => store.get(n.contentHash))` — for the reconcile
// seams. This module reuses exactly that list rather than re-reading the store a second time: ONE store
// read, ONE index build, shared by reconcile AND reverify (the sizing note's binding constraint — ~800ms to
// build the index once — is paid ONCE per `composeRuntime` call regardless of how many read doors ride it).
//
// PURE + TOTAL: no IO, no clock. `leg` is the ONLY effectful thing touched, and it is INJECTED — never a
// second oracle constructed here (a duplicated oracle that drifts from the shipped one is a known failure
// class in this repo, see `verify-fact-source.ts`'s header).

import type { GroundedFact, PredicateSlot } from '@atlas/knowledge';
import type { VerifyFactLeg, VerifyReq } from './verify-fact-source.js';

/** The three re-verification outcomes — see the module header. Closed vocabulary. */
export type ReverifyOutcome = 're-proven' | 'broken' | 'unverifiable';

/** One sealed fact's re-verification row. `reason` carries the oracle's abstain/refute reason for `broken`,
 *  or a fixed diagnostic for `unverifiable` — always present so a reader never has to re-derive WHY. */
export interface ReverifyRow {
  readonly nodeKey: string;
  readonly outcome: ReverifyOutcome;
  readonly reason: string;
}

/** The whole pass's report. `sealedProven` is the denominator (every fact this pass even considered) —
 *  the three counts below always sum to it, and an EMPTY store (or one with no `proven` seals at all) is
 *  `sealedProven: 0`, distinguishable from a store this pass could not read (that is a separate FAILURE,
 *  not a `ReverifyReport` — see `reverifyStore`'s caller in `compose.ts`, which fails closed on an unreadable
 *  store rather than reporting an empty one). */
export interface ReverifyReport {
  readonly sealedProven: number;
  readonly reProven: number;
  readonly broken: number;
  readonly unverifiable: number;
  readonly rows: readonly ReverifyRow[];
}

/** The two witness slots the oracle family actually witnesses today (#195 `witnessOf`: a witness exists
 *  only when `p.target`/`p.scope` are both strings, which the admit path only sets for these two slots). A
 *  witness naming any OTHER slot is, BY CONSTRUCTION of the shipped mint path, unreachable — but this module
 *  does not trust that absence: an out-of-family slot fails closed to `unverifiable`, not a throw and not a
 *  silent `broken`. */
const WITNESSED_SLOTS: ReadonlySet<PredicateSlot> = new Set(['dependency', 'count']);

/** Build the typed `VerifyReq` a witness replays as — the SAME shape `verifyFactVerdict` builds off CLI argv
 *  (`--scope` = `witness.scope`, `--world` defaults to `--scope`), so a re-verified claim is decided by
 *  EXACTLY the invocation `atlas verify-fact` would run if handed the witness back (as `s33-seal-witness`
 *  already demonstrates one row of, by hand, over the CLI). */
function reqOf(slot: 'dependency' | 'count', target: string, scope: string, atLeast: number | undefined): VerifyReq {
  if (slot === 'dependency') {
    return { kind: 'dependency', claim: { sourceScope: scope, target, worldScope: scope } };
  }
  // slot === 'count' — `atLeast` is REQUIRED by the witness contract (#195 `witnessOf`, present only for the
  // count slot); absent here means the stored witness itself is malformed, not something this fold invents —
  // callers reach this branch only after `atLeast` has been checked present (see `reverifyFact`).
  return { kind: 'count', claim: { sourceScope: scope, target, worldScope: scope, atLeast: atLeast ?? 0, exact: false } };
}

/** Re-verify ONE sealed fact against the live oracle. `undefined` iff the fact is not `seal:'proven'` at all
 *  (out of scope for this pass — see the module header). */
export function reverifyFact(fact: GroundedFact, leg: VerifyFactLeg): ReverifyRow | undefined {
  if (fact.seal !== 'proven') return undefined;
  const nodeKey = String(fact.id);
  // `witness` is carried ONLY on `AdvisoryNode` (#195 `buildSound` mints the sound-oracle arm as an
  // advisory, never a predicate/relation/negation — see `admit-harness.ts`), so a `proven`-sealed
  // predicate/relation/negation is STRUCTURALLY witness-less: `unverifiable`, not a type-narrowing dodge.
  const w = fact.kind === 'advisory' ? fact.witness : undefined;
  if (w === undefined) {
    return { nodeKey, outcome: 'unverifiable', reason: 'seal:proven but no witness was recorded — nothing to replay' };
  }
  if (typeof w.target !== 'string' || w.target.length === 0 || typeof w.scope !== 'string' || w.scope.length === 0) {
    return { nodeKey, outcome: 'unverifiable', reason: 'witness is incomplete (missing target/scope) — nothing to replay' };
  }
  if (!WITNESSED_SLOTS.has(w.slot)) {
    return { nodeKey, outcome: 'unverifiable', reason: `witness names slot '${w.slot}', outside the witnessed family (dependency|count) — nothing to replay` };
  }
  if (w.slot === 'count' && typeof w.atLeast !== 'number') {
    return { nodeKey, outcome: 'unverifiable', reason: "witness slot 'count' carries no atLeast bound — nothing to replay" };
  }
  const verdict = leg(reqOf(w.slot as 'dependency' | 'count', w.target, w.scope, w.atLeast));
  if (verdict.verdict === 'proven') {
    return { nodeKey, outcome: 're-proven', reason: `replayed PROVEN over (${w.slot}, ${w.target}, ${w.scope})` };
  }
  return {
    nodeKey,
    outcome: 'broken',
    reason: `replay did NOT re-prove — oracle returned '${verdict.verdict}'${verdict.reason !== undefined ? ` (${verdict.reason})` : ''}`,
  };
}

/**
 * Re-verify EVERY `proven`-sealed fact in `facts` against `leg` — build the index ONCE (the caller's job,
 * `compose.ts`), loop, count three buckets. Anti-overengineering by construction: no cache, no worker pool, no
 * config. `facts` is the FULL durable-store readback (`driftFacts`-shaped) — reading the STORE, never a
 * command's own summary, per the chapter's honesty requirement.
 */
export function reverifyStore(facts: readonly GroundedFact[], leg: VerifyFactLeg): ReverifyReport {
  const rows: ReverifyRow[] = [];
  for (const fact of facts) {
    const row = reverifyFact(fact, leg);
    if (row !== undefined) rows.push(row);
  }
  return {
    sealedProven: rows.length,
    reProven: rows.filter((r) => r.outcome === 're-proven').length,
    broken: rows.filter((r) => r.outcome === 'broken').length,
    unverifiable: rows.filter((r) => r.outcome === 'unverifiable').length,
    rows,
  };
}
