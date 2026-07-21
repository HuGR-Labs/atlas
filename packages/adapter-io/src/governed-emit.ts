// @atlas/adapter-io — src/governed-emit.ts  (COMPOSE-A: the governed durable emit leg)
//
// The runtime composition-root's governed write door. `atlas-emit` persists DURABLY only THROUGH the
// governed path — three fail-closed gates, in order, before a single byte is written:
//   1. TRUTH DOOR   — the GROUND truth-gate: a node whose grounding does not re-derive FRESH is rejected
//                     (`emitted:false`), nothing persisted (TOOLS-7b / GROUND-6).
//   2. AUTHZ        — the KNOW-11 owner-scoped write gate (`actorInScope`): an actor not in the fact's
//                     scope is rejected, nothing persisted. An empty/unset actor is in NO scope ⇒ every
//                     write is denied (fail-closed v1 — correct behavior).
//   3. UPSERT+PUT   — route the write through the proven KNOW-15 `upsert(WriteRequest)` decision (mirrors
//                     the CLI `mine.ts` durable-write path), persist the projection sidecar durably, AND
//                     `store.put(node)` the WHOLE GroundedFact into CAS so the content-addressed bytes ARE
//                     the fact (driftFacts / doctor read them back — the INVARIANT).
//
// Pure of clock/random: no wall-clock, no nonce, no counter enters the decision. This composes OVER the
// frozen core (`@atlas/tools` emit, `@atlas/knowledge` upsert, the GROUND gate) — it re-implements none.

import { id } from '@atlas/kernel';
import type { CasObject } from '@atlas/kernel';
import type { Hash } from '@atlas/contracts';
import { upsert, normalizeCheck, primaryAnchorId, nodeKey } from '@atlas/knowledge';
import type { Candidate, GroundedFact, WriteRequest } from '@atlas/knowledge';
import type { EmitOut, TruthGate } from '@atlas/tools';
import { actorInScope } from './policy.js';
import type { AtlasPolicy } from './policy.js';
import { rehydrateProjection } from './store.js';
import type { DiskStore } from './store.js';

/** The structured fail-closed reasons (TOOLS-7b / KNOW-11) — an ungrounded OR unauthorized write never lands. */
const REJECTED_UNGROUNDED = 'ungrounded: citation does not re-derive FRESH at source (TOOLS-7b / GROUND-6)';
const REJECTED_UNAUTHORIZED = 'unauthorized: actor not in fact scope (KNOW-11)';

/** What the governed emit leg is composed over: the durable CAS store, the truth-gate seam, the admin
 *  policy (authz scopes), and the actor identity resolved from the environment. */
export interface GovernedEmitDeps {
  readonly store: DiskStore;
  readonly gate: TruthGate;
  readonly policy: AtlasPolicy;
  readonly actor: string;
}

/** The advisory claim body a write carries (the KNOW-4c set-union element); a predicate carries its
 *  normalized check. Mirrors the CLI `mine.ts` `claimNormOf` durable-write parity. */
function claimNormOf(node: GroundedFact): string {
  return node.kind === 'advisory' ? node.claimNorm : normalizeCheck(node.check);
}

/**
 * Build the GOVERNED durable emit leg. The returned `emit(node, at)` conforms EXACTLY to the frozen
 * `EmitApi.emit(node, at)` signature. Fail-closed at every gate; on success it routes through the KNOW-15
 * write-decision, persists the projection, and puts the whole fact into CAS (the driftFacts/doctor read-
 * back invariant). Pure of clock/random given a pure store/gate/policy.
 */
export function createGovernedEmit(deps: GovernedEmitDeps): { readonly emit: (node: GroundedFact, at: Hash) => EmitOut } {
  const emit = (node: GroundedFact, at: Hash): EmitOut => {
    // 1. TRUTH DOOR — re-derive the citation; a non-HOLDS verdict fails closed, nothing persisted.
    if (deps.gate.gateHolds(node, at) !== 'HOLDS') {
      return { emitted: false, rejected: REJECTED_UNGROUNDED };
    }

    // 2. AUTHZ — the KNOW-11 owner-scoped write gate; an actor not in the fact's scope is denied. An
    //    empty/unset actor is in NO scope ⇒ every write is denied (fail-closed v1).
    if (!actorInScope(deps.policy, deps.actor, node.scope)) {
      return { emitted: false, rejected: REJECTED_UNAUTHORIZED };
    }

    // 3. ROUTE + UPSERT — the KNOW-15 write-decision over the rehydrated projection (mine.ts parity).
    //    IDENTITY IS MINTED, NEVER TRUSTED — the routing/dedup `nodeKey` is RECOMPUTED from the content
    //    via the frozen `nodeKey(node)` formula (KNOW-15b: hash(primaryAnchorId ‖ slot[‖ check])), the same
    //    seam that mints `contentHash`/`primaryAnchor` below. The author-supplied payload `node.id` is NEVER
    //    used for routing — trusting it would let an author spoof/collide/dodge another node's identity.
    const contentHash = id(node as CasObject);
    // A GroundedFact carries its slot as `predicateSlot`; the `Candidate` identity fns (`nodeKey`/
    // `primaryAnchorId`) read `.slot`. Map it onto a candidate VIEW before minting — else the cast is
    // LOSSY (`.slot` undefined) and the nodeKey is computed slot-free, diverging from the true
    // `hash(primaryAnchorId ‖ predicateSlot)` identity (the E2E emit→query readback exposed this).
    const candidateView = { ...node, slot: node.predicateSlot } as unknown as Candidate;
    const req: WriteRequest = {
      nodeKey: nodeKey(candidateView) as unknown as string,
      contentHash: contentHash as unknown as string,
      family: node.kind,
      claimNorm: claimNormOf(node),
      // ── ADJACENCY carrier (ADDITIVE) — carry the computed primary anchor + the R3-optional slot onto
      //    the node so a later sibling-adjacency scan reads them off the projection (WP-B); NOT read here.
      //    `predicateSlot` is R3-optional; conditional spread keeps `slot` ABSENT (exactOptionalPropertyTypes).
      primaryAnchor: primaryAnchorId(candidateView) as unknown as string,
      ...(node.predicateSlot !== undefined ? { slot: node.predicateSlot } : {}),
    };
    const projection = upsert(rehydrateProjection(deps.store), req).store;

    // 4. DURABLE PERSIST — write the content-addressed bytes FIRST, then the projection sidecar that
    //    references them (INVARIANT: the CAS bytes ARE the fact, so driftFacts/doctor can read them back).
    //    Order matters for crash-safety: if `put` fails (disk-full/permission) the projection is never
    //    written, so the sidecar can NEVER reference a contentHash whose bytes are absent from CAS. The
    //    reverse order would leave a dangling reference on a mid-write failure.
    deps.store.put(node as CasObject);
    deps.store.persistProjection(projection);

    return { emitted: true, id: contentHash };
  };
  return { emit };
}
