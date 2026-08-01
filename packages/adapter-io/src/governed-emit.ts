// @atlas/adapter-io — src/governed-emit.ts  (COMPOSE-A: the governed durable emit leg)
//
// The runtime composition-root's governed write door. `atlas-emit` persists DURABLY only THROUGH the
// governed path — EIGHT fail-closed refusals across five stages, in order, before a single byte is written.
// The count is stated because it drifted: this header said "three" and listed four items while the body had
// seven refusal points, and a header that under-counts the gates is how a gate gets deleted unnoticed.
//   0. WELL-FORMED  — `tier` must be one of the three real governance classes; `Tier` is type-only, so an
//                     off-lattice payload value is refused HERE or nowhere (`malformed tier`).
//   1. TRUTH DOOR   — the GROUND truth-gate: a node whose grounding does not re-derive FRESH is rejected
//                     (`emitted:false`), nothing persisted (TOOLS-7b / GROUND-6) (`ungrounded`).
//   2. AUTHZ        — the KNOW-11 owner-scoped write gate (`actorInScope`): an actor not in the fact's
//                     scope is rejected, nothing persisted. An empty/unset actor is in NO scope ⇒ every
//                     write is denied (fail-closed v1 — correct behavior) (`unauthorized`).
//   2.25 INCUMBENT  — FOUR gates derived from the node the write TARGETS, never from the write itself:
//                     the target's stored fact must be READABLE (`unverifiable target`), the actor must
//                     hold authority in the scope that fact declares (`unauthorized for target`), the
//                     write must not RELOCATE the node to another scope (`governance-relocation`), and it
//                     must not declare a WEAKER class than the node carries (`governance-downgrade`).
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
// GATE PRECEDENCE IS AN INVARIANT, NOT AN ACCIDENT OF LAYOUT. No pair of these gates changes `emitted`
// when swapped — every one of them refuses — so the whole suite stays green under a reordering. What the
// order decides is WHICH `rejected` string comes back, and that string is the door's user-visible contract
// AND a disclosure channel about a node the caller may have no authority over. The rule, in one line:
//
//   a refusal may never tell the caller more about the incumbent than the gates it has already CLEARED
//   entitle it to; so the gates run in order of increasing disclosure.
//
// Concretely inside 2.25: `unauthorized for target` runs BEFORE `governance-relocation` and BEFORE
// `governance-downgrade`, because the latter two answer questions ABOUT THE STORED FACT (its scope differs
// from yours / its class is stricter than yours) and only an actor with authority in the incumbent's scope
// has earned those answers. Swap `unauthorizedForTarget` below the tier check and the door starts leaking a
// stranger's governance class on every refusal — with the entire suite still green. That is why SCN-GE-I11
// pins the order with a DOUBLY-violating input instead of trusting the line order to stay put.
//
// Pure of clock/random: no wall-clock, no nonce, no counter enters the decision. This composes OVER the
// frozen core (`@atlas/tools` emit, `@atlas/knowledge` upsert, the GROUND gate) — it re-implements none.

import { id } from '@atlas/kernel';
import type { CasObject } from '@atlas/kernel';
import type { Hash } from '@atlas/contracts';
import { upsert, normalizeCheck, primaryAnchorId, nodeKey, route, stage, ratify, isWeakerTier, isTier } from '@atlas/knowledge';
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
  'governance-downgrade: this write declares a weaker tier than the node it targets — re-classification is ' +
  'a separate governed act, never a side effect of emitting a fact (KNOW-8: a T0 class is human-ratified)';
const REJECTED_UNAUTHORIZED_TARGET =
  'unauthorized for target: the actor is not in the scope the node it targets already lives in (KNOW-11) — ' +
  'being authorized for the scope this write DECLARES is not authority over the node it lands on';
const REJECTED_MALFORMED_TIER =
  'malformed tier: a fact must declare one of the three governance classes (T0 | T1 | T2). `Tier` is a ' +
  'type-only union with no runtime validator upstream, so an off-lattice value is refused HERE or nowhere';
const REJECTED_UNVERIFIABLE =
  'unverifiable target: the stored fact of the node this write targets is not readable from CAS, so its ' +
  'governance class cannot be confirmed — refused fail-closed rather than gated on the write\'s own claim';
const REJECTED_RELOCATION =
  'governance-relocation: this write declares a DIFFERENT scope than the node it targets — moving a node ' +
  'between scopes is a re-classification, an explicit out-of-band signed act, never a side effect of ' +
  'emitting a claim (ADR-0009). That act has NO DOOR YET (task #88), so a node cannot be migrated at all ' +
  'today; a renamed scope is recovered by the admin declaring both names in the policy';

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
  const emit = (raw: GroundedFact, at: Hash): EmitOut => {
    // 0. WELL-FORMED CLASS — the `tier` must be one of the three real governance classes.
    //
    //    `Tier` is a TYPE-ONLY union: it does not exist at runtime, and nothing upstream validates it —
    //    `atlas emit` is `JSON.parse` + a cast, and the MCP `node` schema declares a bare `object`. So this
    //    is the FIRST place an arbitrary payload value can be refused, and it must be, for two separate
    //    reasons that a lattice-level guard alone does not cover:
    //      · on an UPDATE, an off-lattice class made the downgrade comparison meaningless (`0 < undefined`
    //        is `false`), which is the reproduced T0→T3→T2 erasure;
    //      · on a CREATE there is no incumbent at all, so no lattice guard ever runs — yet the read side
    //        bounds a pack with `inv.tier !== 'T2'` (TOOLS-6), so a node minted at `'T3'` would be served
    //        as though it were ratified `T1`-or-stricter. Garbage in the class field is not a lesser
    //        problem than a downgrade; it is the same problem one step earlier.
    //    Read ONCE and carry the snapshot. Re-reading `raw.tier` at each gate would let a property whose
    //    value changes between reads clear gate 0 as `T2` and route as something else — a TOCTOU. That is
    //    unreachable over the CLI and MCP wires (both are `JSON.parse`, which cannot produce an accessor),
    //    but `createGovernedEmit` is an EXPORTED library entry point, so an in-process embedder can hand it
    //    any object at all. Gating a snapshot and then persisting that same snapshot means what was checked
    //    is exactly what is stored.
    const tier = raw.tier;
    if (!isTier(tier)) {
      return { emitted: false, rejected: REJECTED_MALFORMED_TIER };
    }
    const node: GroundedFact = { ...raw, tier };

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
    //   read as effectively as deleting it. The node's SCOPE is monotone in the same way and for the same
    //   reason (see the relocation gate below): the pair `(scope, tier)` is what a reader trusts, and neither
    //   half moves as a side effect of a claim. ADR-0009 makes both conditional on a signed re-classification
    //   — which is task #88 and IS NOT BUILT, so today the monotonicity here is unconditional.
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
      const weakerTier = isWeakerTier(tier, stored.tier);
      // AUTHORITY OVER THE TARGET, not equality of names. Gate 2 above asked "is the actor in the scope this
      // write DECLARES" — the attacker picks that. The question that actually protects the node is "is the
      // actor in the scope the NODE ALREADY LIVES IN", so it is asked here, against the incumbent's own
      // stored fact, with the identical KNOW-11 seam.
      //
      // This SUPERSEDED — did not simply delete — a `node.scope !== stored.scope` equality test that was
      // wrong in both directions AS THE ONLY SCOPE GATE. (The equality itself is still here, below, doing
      // the one job it is right for; what changed is that it no longer stands in for an authority check.)
      // Too loose: it carved out `stored.scope === undefined`, and `mine` writes this projection without
      // passing this door, so every mined row was unowned — ANY actor in ANY scope could adopt one with no
      // ratify token and then promote it to `T1`, which is INSIDE the pack bound. Too tight: an admin
      // RENAMING a scope in `policy.json` made every existing node permanently unwritable by anyone, billy
      // included — the same unrecoverable shape this branch elsewhere treats as critical, reachable by a
      // routine admin edit; and a second, legitimately-authorized owner of the same symbol was refused
      // because `nodeKey` carries no scope. Both reproduced by a cold review.
      //
      // Membership answers all of it: bob is refused unless the admin actually granted him the incumbent's
      // scope; a rename degrades to an ordinary `unauthorized` that the admin fixes by declaring the scope,
      // not to a brick; and an unowned node stays fail-closed, because `actorInScope` denies an absent scope
      // (KNOW-11a) — while an admin who deliberately grants `atlas:mined` can appoint a curator to adopt
      // mined candidates. No special cases — but, as the gate directly below records, membership is only
      // HALF the rule, and the first version of this fix shipped it as the whole one.
      const unauthorizedForTarget = !actorInScope(deps.policy, deps.actor, stored.scope);
      if (unauthorizedForTarget) {
        return { emitted: false, rejected: REJECTED_UNAUTHORIZED_TARGET };
      }

      // SCOPE MONOTONICITY — authority over the target is NOT the whole rule, and the membership fix above
      // silently dropped the other half. Both gates now ask "is the actor in SOME scope"; NEITHER asks
      // whether the scope this write DECLARES is a legitimate destination for this node. So an actor who
      // belongs to TWO scopes clears gate 2 on the scope it declares, clears the gate above on the scope
      // the node lives in, and the node MOVES — permanently evicting every co-owner who is not also in the
      // destination. Reproduced: policy `{shared:[alice,bob], bob-priv:[bob]}`, alice creates a T1 in
      // `shared`, bob re-emits the same anchor declaring `bob-priv`, and alice's next write to her own
      // served invariant comes back `unauthorized for target`. No token beyond a non-empty ratifier was
      // needed, and T1 is INSIDE the pack bound — a served invariant, captured by its co-owner.
      //
      // The judgement, and it is not a new one: RELOCATING A NODE BETWEEN SCOPES IS THE SAME CLASS OF ACT
      // AS LOWERING ITS TIER. Both re-classify the node — they change which governance boundary holds it,
      // not what it claims — and ADR-0009 settles that re-classification is an EXPLICIT, out-of-band,
      // SIGNED act (authority in BOTH the old and the new scope), never a side effect of emitting a claim.
      // So the declared scope must RE-STATE the incumbent's; anything else is refused, and the two gates
      // are a conjunction: authority over the target AND no silent relocation.
      //
      // MIGRATION CURRENTLY HAS NO DOOR. ADR-0009 is Accepted but its implementation is task #88 and is not
      // built, so today a node's scope cannot be changed by ANY path through this door — that is a stated
      // gap, not an oversight. It is not, however, the brick the old `node.scope !== stored.scope` EQUALITY
      // test was: that test ran INSTEAD of an authority check, so an admin renaming a scope in policy.json
      // made every existing node unwritable by everyone including billy. Here the equality runs AFTER
      // membership, so a rename degrades to an ordinary recoverable failure the admin fixes by declaring
      // both names, and the node keeps taking writes at its stored scope meanwhile.
      if (node.scope !== stored.scope) {
        return { emitted: false, rejected: REJECTED_RELOCATION };
      }

      if (weakerTier) {
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
