// @atlas/adapter-io — src/governed-emit.ts  (COMPOSE-A: the governed durable emit leg)
//
// The runtime composition-root's governed write door. `atlas-emit` persists DURABLY only THROUGH the
// governed path — three fail-closed gates, in order, before a single byte is written:
//   1. TRUTH DOOR   — the GROUND truth-gate: a node whose grounding does not re-derive FRESH is rejected
//                     (`emitted:false`), nothing persisted (TOOLS-7b / GROUND-6).
//   2. AUTHZ        — the KNOW-11 owner-scoped write gate (`actorInScope`): an actor not in the fact's
//                     scope is rejected, nothing persisted. An empty/unset actor is in NO scope ⇒ every
//                     write is denied (fail-closed v1 — correct behavior).
//   2.5 RATIFY      — the KNOW-8/KNOW-18 tier-ratification gate, composed BETWEEN authz and upsert. The
//                     KNOW-18 fast-path `route(candidate, ctx)` decides: a grounded ∧ lowRisk ∧ T2 ∧
//                     advisory ∧ ¬contested fact AUTO-ACCEPTS (the common case — no human); a T0 / predicate
//                     / contested fact routes to FULL ratification and commits ONLY with a valid KNOW-8
//                     ratify token (a T0 fact requires the billy token). The token is env-sourced by the
//                     composition root (`ATLAS_RATIFY_TOKEN`, threaded like the actor) — NEVER read off the
//                     fact payload. Absent/invalid ⇒ REJECTED fail-closed, nothing persisted (KNOW-8).
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
import { upsert, normalizeCheck, primaryAnchorId, nodeKey, route, stage, ratify, isWeakerTier } from '@atlas/knowledge';
import type { Candidate, CurrentNode, GroundedFact, WriteRequest, RatifyContext, RatifyToken } from '@atlas/knowledge';
import type { EmitOut, TruthGate } from '@atlas/tools';
import { actorInScope } from './policy.js';
import type { AtlasPolicy } from './policy.js';
import { rehydrateProjection } from './store.js';
import type { DiskStore } from './store.js';

/** The structured fail-closed reasons (TOOLS-7b / KNOW-11 / KNOW-8) — an ungrounded, unauthorized, OR
 *  unratified write never lands. */
const REJECTED_UNGROUNDED = 'ungrounded: citation does not re-derive FRESH at source (TOOLS-7b / GROUND-6)';
const REJECTED_UNAUTHORIZED = 'unauthorized: actor not in fact scope (KNOW-11)';
const REJECTED_UNRATIFIED = 'unratified: T0/contested fact requires human+billy ratification (KNOW-8)';
const REJECTED_DOWNGRADE =
  'governance-downgrade: this write declares a weaker class (tier/scope) than the node it targets — ' +
  're-classification is a separate governed act, never a side effect of emitting a fact (KNOW-7 / KNOW-11)';
const REJECTED_UNVERIFIABLE =
  'unverifiable target: the stored fact of the node this write targets is not readable from CAS, so its ' +
  'governance class cannot be confirmed — refused fail-closed rather than gated on the write\'s own claim';

/** The KNOW-18 fast-path CONTEXT the door hands to `route`. `lowRisk` (the KNOW-17 door-2 threshold verdict)
 *  and `contested` (the KNOW-18b store-veto) are BOTH store/threshold-derived UPSTREAM and are NOT wired
 *  into this write door in v1 — defaulted CONSERVATIVELY to preserve the common T2-advisory auto-accept:
 *  `contested:false` (no reviewer veto asserted at the door) and `lowRisk:true` (a grounded fact that already
 *  passed the truth-door is treated as low-risk). This matches s05's intended `route(clean,{lowRisk:true,
 *  contested:false}) === 'auto-accept'`; wiring the real hits-ledger/veto verdicts here is a later WP. The
 *  T0/predicate governance teeth do NOT depend on these defaults — they route to full-ratify by their
 *  candidate-intrinsic tier/check, independent of `lowRisk`/`contested`. */
const DOOR_RATIFY_CTX: RatifyContext = { contested: false, lowRisk: true };

/** What the governed emit leg is composed over: the durable CAS store, the truth-gate seam, the admin
 *  policy (authz scopes), and the actor identity resolved from the environment. */
export interface GovernedEmitDeps {
  readonly store: DiskStore;
  readonly gate: TruthGate;
  readonly policy: AtlasPolicy;
  readonly actor: string;
  /** The KNOW-8 ratify token (`by`) authorizing a full-ratify (T0/predicate/contested) commit. Env-sourced
   *  by the composition root (`ATLAS_RATIFY_TOKEN`), threaded EXACTLY like `actor` — NEVER read from the fact
   *  payload (the spoof-guard). ABSENT ⇒ `''` ⇒ a full-ratify fact fails closed; a T0 fact commits ONLY with
   *  the `billy` token. A fast-pathed (auto-accept) fact ignores it entirely. */
  readonly ratifyToken?: string;
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

    // A GroundedFact carries its slot as `predicateSlot`; the `Candidate` identity/route fns
    // (`nodeKey`/`primaryAnchorId`/`route`/`stage`) read `.slot`/`.tier`/`.check`/`.grounding`. Map the slot
    // onto a candidate VIEW ONCE — else a later `nodeKey` cast is LOSSY (`.slot` undefined) and the nodeKey is
    // computed slot-free, diverging from the true `hash(primaryAnchorId ‖ predicateSlot)` identity (the E2E
    // emit→query readback exposed this). The route reads the fact's REAL `tier`/`check`/`grounding` — no guess.
    const candidateView = { ...node, slot: node.predicateSlot } as unknown as Candidate;

    // 2.25 INCUMBENT GUARD — the write's TARGET decides which gate it must clear, never the write itself.
    //
    //   The routing identity is `nodeKey = hash(primaryAnchorId ‖ slot[‖ check])`. It contains NEITHER `tier`
    //   NOR `scope`. So WHICH node a write lands on and WHICH gate that write must clear were, until this
    //   block, decided by two different things — and the author controlled the second. Declaring `tier:'T2'`
    //   + advisory made `route` fast-path (no token consulted) while the minted nodeKey still collided with a
    //   billy-ratified `T0` node, and `upsert` set-unioned the claim straight into it. Declaring a `scope` the
    //   actor happens to own passed authz while the node lived in someone else's scope. Both are the same
    //   defect: a CONFUSED DEPUTY — capability gating ("which gate applies") is not authorization ("may THIS
    //   write touch THAT node"). The remedy is the object-capability one: derive the required authority from
    //   the RESOURCE, never from the request.
    //
    //   So: resolve the target node FIRST, read its governance class off its OWN stored fact (the CAS bytes
    //   ARE the fact — the same read-back `governed-link.ts` already does for its authz gate), and refuse any
    //   write that declares a WEAKER class than the node it targets. Strictness therefore only ever ratchets
    //   UP: re-stating or RAISING a class is ordinary (and a raise still faces the KNOW-8 gate below), while
    //   LOWERING one is a re-classification — a separate governed act, never a side effect of emitting a fact.
    //   Refusing the downgrade outright (rather than merely gating it on the stricter class) is what keeps the
    //   stored `tier` monotone, so no later reader has to distrust it: a ratified `T0` node can never be
    //   quietly re-served as `T2` — which, since a pack bounds `T2` OUT (TOOLS-6), would erase it from every
    //   read as effectively as deleting it.
    //
    //   The projection is rehydrated ONCE here and reused by the upsert below (it was read twice before).
    const projection = rehydrateProjection(deps.store);
    const targetKey = nodeKey(candidateView) as unknown as string;
    const incumbent: CurrentNode | undefined = projection.current.get(targetKey);
    if (incumbent !== undefined) {
      const stored = deps.store.get(incumbent.contentHash as unknown as Hash) as GroundedFact | undefined;
      if (stored === undefined) {
        // The node is named but its bytes are gone (pruned CAS / partial restore). The class it requires is
        // UNKNOWABLE — fall back to the write's own claim and the guard is exactly the hole it closes.
        return { emitted: false, rejected: REJECTED_UNVERIFIABLE };
      }
      const weakerTier = isWeakerTier(node.tier, stored.tier);
      // A scope REWRITE is the same downgrade in the authz dimension: it moves a node out from under the
      // actors who own it. An incumbent with no stored scope predates the KNOW-11 gate and constrains
      // nothing — the declared-scope authz check below still applies to it.
      const reScoped = stored.scope !== undefined && node.scope !== stored.scope;
      if (weakerTier || reScoped) {
        return { emitted: false, rejected: REJECTED_DOWNGRADE };
      }
    }

    // 2.5 RATIFY — the KNOW-8/KNOW-18 tier-ratification gate, BETWEEN authz and upsert. The fast-path
    //    `route` auto-accepts a grounded ∧ lowRisk ∧ T2 ∧ advisory ∧ ¬contested fact (the common case —
    //    straight to upsert, unchanged behavior). A T0 / predicate / contested fact routes to FULL
    //    ratification: it commits ONLY with a valid KNOW-8 token, and a T0 fact requires the `billy` token.
    //    The token is env-sourced by the composition root (never the payload). Absent/invalid ⇒ REJECTED
    //    fail-closed, nothing persisted — this is the door that was previously bypassing the human+billy gate.
    if (route(candidateView, DOOR_RATIFY_CTX) === 'full-ratify') {
      const token: RatifyToken = { by: deps.ratifyToken ?? '' };
      if (!ratify(stage(candidateView), token).committed) {
        return { emitted: false, rejected: REJECTED_UNRATIFIED };
      }
    }

    // 3. ROUTE + UPSERT — the KNOW-15 write-decision over the rehydrated projection (mine.ts parity).
    //    IDENTITY IS MINTED, NEVER TRUSTED — the routing/dedup `nodeKey` is RECOMPUTED from the content
    //    via the frozen `nodeKey(node)` formula (KNOW-15b: hash(primaryAnchorId ‖ slot[‖ check])), the same
    //    seam that mints `contentHash`/`primaryAnchor` below. The author-supplied payload `node.id` is NEVER
    //    used for routing — trusting it would let an author spoof/collide/dodge another node's identity.
    const contentHash = id(node as CasObject);
    const req: WriteRequest = {
      nodeKey: targetKey, // the SAME minted key the incumbent guard above resolved — one identity, one read
      contentHash: contentHash as unknown as string,
      family: node.kind,
      claimNorm: claimNormOf(node),
      // ── ADJACENCY carrier (ADDITIVE) — carry the computed primary anchor + the R3-optional slot onto
      //    the node so a later sibling-adjacency scan reads them off the projection (WP-B); NOT read here.
      //    `predicateSlot` is R3-optional; conditional spread keeps `slot` ABSENT (exactOptionalPropertyTypes).
      primaryAnchor: primaryAnchorId(candidateView) as unknown as string,
      ...(node.predicateSlot !== undefined ? { slot: node.predicateSlot } : {}),
    };
    const next = upsert(projection, req).store;

    // 4. DURABLE PERSIST — write the content-addressed bytes FIRST, then the projection sidecar that
    //    references them (INVARIANT: the CAS bytes ARE the fact, so driftFacts/doctor can read them back).
    //    Order matters for crash-safety: if `put` fails (disk-full/permission) the projection is never
    //    written, so the sidecar can NEVER reference a contentHash whose bytes are absent from CAS. The
    //    reverse order would leave a dangling reference on a mid-write failure.
    deps.store.put(node as CasObject);
    deps.store.persistProjection(next);

    return { emitted: true, id: contentHash };
  };
  return { emit };
}
