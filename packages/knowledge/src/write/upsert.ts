// @atlas/knowledge — src/write/upsert.ts  (WP-5.13-a.KNOW · EPIC-13-a — the store-projection REDUCER)
//
// SPLIT OUT OF `router.ts` (which was at the 400-LOC godfile ceiling) along the section boundary that file
// already drew for itself — the banner below is verbatim where it stood. The seam is real, not a line-count
// convenience: everything here is a REDUCER over a store projection (a data structure and the fold that
// advances it), while `router.ts` keeps the pure DECISION (`routeWrite`) and the IDENTITY legs. The identity
// legs deliberately did NOT move — the RouterApi header records a LEAD-RATIFIED decision that they live in
// `router.ts` ("no separate anchor.ts"), and a LOC ceiling is not a licence to reverse a ratified placement.
//
// NOTHING here changed in the move: `upsert`, `routeWrite`'s consumers, the projection types and their
// carry-forward semantics are byte-identical to their pre-split form. `router.ts` re-exports this module, so
// the package surface (and every `../src/write/router.js` import in the existing tests) is unchanged.

import type { Tier } from '@atlas/contracts';
import type { PredicateSlot } from '../types.js';
// ADR-0015 D3 / #99b — the honest-abstention record (NOT a GroundedFact; it asserts nothing). Type-only,
// same package. Carried on the projection as a sibling to `current` (see StoreProjection.abstained below).
import type { AbstainedRecord } from '../negation-types.js';
import type { NearDupConfig, NodeFamily, RouteInputs, WriteDecision } from './router.js';
import { isKnownSlot, routeWrite } from './router.js';
// The KNOW-10/KNOW-15i closed-slot REFUSAL (#152) — extracted at the LOC ceiling. Read that file's header
// before changing the gate below: it carries the measurement, the harm, and the ABSENT-slot decision.
import { ClosedSlotError } from './closed-slot.js';
import { isWeakerTier } from '../ratify/tier.js';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The upsert reducer — applies a routed write to a store PROJECTION, so "every write is an upsert"
// (one current node per key) is a STRUCTURAL consequence, not merely asserted. The projection is a
// minimal current-node carrier (nodeKey → the ONE current node) + the append-only CAS retention
// set; it is session-internal state (cf. index/src/fold.ts), NOT the OWNER-DEFINE composed store.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** One write, its identity VALUES supplied by the upstream identity facet (5.13-b) + the emitter. */
export interface WriteRequest {
  readonly nodeKey: string; // WHICH — opaque identity (value computed upstream)
  readonly contentHash: string; // WHAT  — opaque CAS id (value computed upstream)
  readonly family: NodeFamily;
  readonly claimNorm: string; // the advisory claim body — the set-union element (KNOW-4c)
  // ── ADJACENCY carrier (ADDITIVE, OPTIONAL) — anchor+slot for WP-B's sibling-adjacency scan; NOT routed.
  readonly primaryAnchor?: string; // the computed primaryAnchorId VALUE (qualifiedPath-prefix), string form
  readonly slot?: PredicateSlot; //  the closed-vocabulary predicate slot the node lives at (R3-optional)
  // ── GOVERNANCE carrier (ADDITIVE, OPTIONAL — ADR-0007) — the `(scope, tier)` pair this write DECLARES,
  //    forwarded so `upsert` can stamp it onto the ROW. NOT ROUTED: neither field enters `RouteInputs`, and
  //    a governance value never changes which cell of the KNOW-4 table a write lands in. Supplied by a
  //    GOVERNED door only, and only AFTER that door has validated both halves (`isTier`/`isScope`) and
  //    refused any relocation or downgrade — so what is stamped here is already monotone.
  readonly scope?: string;
  readonly tier?: Tier;
  // ── RELATION carrier (ADDITIVE, OPTIONAL — ADR-0015 D2 / #99a) — the two endpoint unitKeys + the kind of a
  //    2-ended fact, forwarded so `upsert` stamps them on the ROW and the read-side `relationsOf` fold can
  //    index a relation by BOTH endpoints without an O(repo) scan. NOT ROUTED: none enters `RouteInputs`; a
  //    relation's identity is `relationKey` (router.ts), computed upstream into `nodeKey` here. Present only on
  //    a `family:'relation'` write; absent for advisory/predicate. Direction is preserved (A=subject, B=object).
  readonly endpointA?: string;
  readonly endpointB?: string;
  readonly relationKind?: string; // the closed-vocabulary RelationKind VALUE (string form at this seam)
}

/** A current node in the territory projection. Exactly one lives per `nodeKey` (KNOW-4g). */
export interface CurrentNode {
  readonly nodeKey: string;
  readonly family: NodeFamily;
  readonly contentHash: string;
  readonly claims: readonly string[]; // claimNorms — the advisory set-union set (dedup by claimNorm)
  readonly supersededBy?: string; // predicate lineage pointer into CAS (KNOW-4e); absent for advisory
  // ── ADJACENCY carrier (ADDITIVE, OPTIONAL) — carried from the req for WP-B; store.ts WireProjection round-trips them free. NOT read here.
  readonly primaryAnchor?: string; // the primaryAnchorId VALUE (qualifiedPath-prefix), string form
  readonly slot?: PredicateSlot; //  the closed-vocabulary predicate slot the node lives at (R3-optional)
  // ── sameAs carrier (ADDITIVE, OPTIONAL — WP-SAMEAS) — the SORTED, de-duped nodeKeys a HUMAN asserted name
  //    the SAME fact at an unrelated code site (H1). Stored SYMMETRICALLY on both endpoints, so the read-side
  //    union-find fold (`deriveSameAs`) is local from either end; absent ⇒ no asserted equivalence. It round-
  //    trips inside the CurrentNode entry (store.ts WireProjection serializes the whole node — no change there).
  //    ADDITIVE/OPTIONAL, back-compat: a node minted before this WP simply has no `sameAs` and is a singleton.
  readonly sameAs?: readonly string[];
  // ── sameAs RETRACTION carrier (ADDITIVE, OPTIONAL — A-D3, task #83) — the SORTED, de-duped peers whose
  //    asserted equivalence with this node has since been RETRACTED through `atlas-link --retract`, the
  //    retraction MODE of the existing governed link door (no sixth tool, no new medium: INV-TOOLS-1's
  //    `WRITE_PATHS` stays `{emit, link}` and INV-TOOLS-15's store-row medium is untouched).
  //
  //    A RETRACTION IS AN APPEND, NEVER A DELETE, and that is the whole representation decision. The peer
  //    STAYS in `sameAs`; it additionally appears here. So both halves of the history survive on the row —
  //    that the equivalence was once asserted, AND that it was later retracted — and a reader can tell the
  //    difference between "these were never linked" (peer in neither list) and "these were linked and the
  //    link was withdrawn" (peer in both). Dropping the peer from `sameAs` would have made those two states
  //    byte-identical, i.e. the store would lie about its own history, which is precisely the failure A-D3
  //    was opened about one direction over.
  //
  //    Stored SYMMETRICALLY on both endpoints, exactly as `sameAs` is; the read fold (`deriveSameAs`) skips
  //    an edge whose retraction is recorded on EITHER endpoint, so a half-written retraction still splits
  //    (splitting is the safe direction — see that fold's header). ADDITIVE/OPTIONAL, back-compat: a row
  //    minted before this field simply has none, which reads as "nothing retracted".
  readonly sameAsRetracted?: readonly string[];
  // ── GOVERNANCE carrier (ADDITIVE, OPTIONAL — ADR-0007) — the `(scope, tier)` the node ITSELF lives under.
  //
  //    THIS IS THE HALF ADR-0007 SHIPPED WITHOUT. That ADR decided authority is derived from the RESOURCE,
  //    never asserted by the request — but the resource's governance class was reachable only by reading the
  //    incumbent's CAS bytes, because the row did not carry it. A read that can FAIL made the refusal depend
  //    on storage health, so a caller with no authority over the node could tell a healthy node from a pruned
  //    one at an identity anyone can pre-compute. Merging both into one refusal closed the oracle but sent the
  //    node's OWN author an authorization error for a storage fault. Carried HERE, target authority is decided
  //    off the projection — the same answer in both byte-states — and the honest storage answer is reserved
  //    for the caller who has already been shown to hold authority.
  //
  //    ADDITIVE/OPTIONAL, back-compat, exactly the `builtAt`/`sameAs` discipline: a row minted before this WP
  //    simply has neither field, old sidecars round-trip unrewritten, and ABSENT means authority is
  //    UNCONFIRMABLE ⇒ the door fails closed. Absent is never "authority granted" and never a crash — the
  //    consuming door applies `isScope`/the tier lattice, both of which are TOTAL over `unknown`.
  //
  //    NEITHER FIELD ENTERS `nodeKey`. Identity stays `hash(primaryAnchorId ‖ slot[‖ check])`; folding a
  //    governance value into it would silently re-address every stored fact and split a node from its own
  //    history the first time its class was raised.
  readonly scope?: string;
  readonly tier?: Tier;
  // ── FRESHNESS WATERMARK carrier (ADDITIVE, OPTIONAL — N11, per-ROW) — the git HEAD sha at which THIS row's
  //    stored per-fact freshness was last produced.
  //
  //    IT IS THE HALF N11 SHIPPED WITHOUT, and the failure is the same shape ADR-0007's was: the property is
  //    per-ROW and it was recorded per-PROJECTION. `StoreProjection.builtAt` is stamped with live HEAD by
  //    every publication, but a publication rewrites the WHOLE projection and carries almost every row
  //    forward untouched — so one unrelated `atlas emit` re-dated every other fact in the store and a read
  //    that had honestly said `stale: true` went back to `stale: false` while `atlas doctor why` still
  //    printed the drift. Measured end to end through the built CLI (e2e story S26).
  //
  //    WHO SETS IT: nobody in this package. It is stamped at PUBLICATION, by the one place a sidecar's bytes
  //    are ever produced (`adapter-io/src/freshness-watermark.ts`, called from `sidecar-commit.ts`), keyed on
  //    whether the row's `contentHash` changed in that generation — because a row's stored freshness lives in
  //    its CAS bytes, so unchanged bytes carry an unchanged, older verification date. `upsert` neither reads
  //    nor writes it, and carries it forward with the rest of the row.
  //
  //    ADDITIVE/OPTIONAL, back-compat, exactly the `builtAt`/`sameAs`/`scope` discipline: a row minted before
  //    this WP simply has none, old sidecars round-trip UNREWRITTEN (the wire serializes the whole
  //    `CurrentNode`, so no format edit), and ABSENT falls back to the projection-level `builtAt` — absent
  //    BOTH means the watermark is UNKNOWN, which the reader treats conservatively and never as a flag.
  //
  //    IT DOES NOT ENTER `nodeKey`, for the same reason `scope`/`tier` do not: a date is not an identity, and
  //    folding one in would re-address a fact every time it was re-verified.
  readonly derivedAt?: string;
  // ── RELATION carrier (ADDITIVE, OPTIONAL — ADR-0015 D2 / #99a) — the two endpoint unitKeys + kind of a
  //    2-ended fact, stamped on the row so the read-side `relationsOf` fold indexes a relation by BOTH
  //    endpoints (direction preserved: A=subject, B=object) without an O(repo) scan. Present only on a
  //    `family:'relation'` row; absent for advisory/predicate. NONE enters `nodeKey` (identity is `relationKey`,
  //    already the row's `nodeKey`). ADDITIVE/OPTIONAL, back-compat, the `sameAs`/`scope` discipline: a row
  //    minted before this WP simply has none, old sidecars round-trip unrewritten (the wire serializes the
  //    whole CurrentNode). Carried forward by `upsert` with the rest of the row.
  readonly endpointA?: string;
  readonly endpointB?: string;
  readonly relationKind?: string;
}

/** The territory store projection: the one-current-node map + the append-only CAS retention set. */
export interface StoreProjection {
  readonly current: ReadonlyMap<string, CurrentNode>; // nodeKey → the ONE current node
  readonly cas: ReadonlySet<string>; // retained contentHashes — prior versions stay addressable
  // ── ABSTENTION ledger (ADDITIVE, OPTIONAL — ADR-0015 D3 / #99b) — the durable honest-abstention records,
  //    keyed by `negationKey` (the SAME address the negation WOULD take, §2). This is the N2↔N3 SEAM, frozen
  //    here (lead, 2026-08-10) so the door (N2, writer) and the read fold (N3, reader) build against ONE shape:
  //    · A grounded NEGATION is a GroundedFact ⇒ it lands in `current` via `upsert` like any fact (family
  //      'negation'), read back by `negationsOf` folding `current.values()`. NOTHING new is needed for it.
  //    · An ABSTENTION is NOT a fact (it asserts nothing about the world) ⇒ it MUST NOT enter `current`.
  //      It lives HERE. The N2 door writes an `AbstainedRecord` into this map through `commitProjection`
  //      (NOT through `upsert` — the reducer is for facts); when a later negation at the same `negationKey`
  //      is admitted, the door DELETES that key here as it puts the fact into `current` (the §2 supersede:
  //      "couldn't decide" → "decided false"). N3's `abstentionsOf` folds `abstained.values()`.
  //    WIRE ROUND-TRIP is the writer's obligation (adapter-io store.ts must serialize/rehydrate this map, the
  //    same additive way it round-trips `current`/`builtAt`) — else abstentions do not survive restart and
  //    #202's "abstention is observable" fails. ADDITIVE/OPTIONAL, back-compat: absent ⇒ no abstentions; a
  //    projection minted before this field round-trips unchanged. NEVER enters any nodeKey (it is not a fact).
  readonly abstained?: ReadonlyMap<string, AbstainedRecord>;
  // ── freshness watermark (ADDITIVE, OPTIONAL — N11) — the git HEAD sha this projection's stored per-fact
  //    freshness was last computed against (stamped at persist). A query cheaply compares it to current HEAD:
  //    if they differ, the read is BEHIND HEAD ⇒ its freshness is unverified ⇒ honestly `stale` (never a
  //    silent "fresh"). Absent (old projections / never-persisted) ⇒ "unknown", treated conservatively by the
  //    reader (it only asserts behind-HEAD when it can PROVE it: both this AND live HEAD are known and differ).
  readonly builtAt?: string;
}

/** An empty store projection. */
export function emptyStore(): StoreProjection {
  return { current: new Map(), cas: new Set() };
}

/** The outcome of one upsert: the route taken + the next store projection (pure — inputs untouched). */
export interface UpsertResult {
  readonly decision: WriteDecision;
  readonly store: StoreProjection;
}


// ─────────────────────────────────────────────────────────────────────────────────────────────
// ARCH-10 — THE INCUMBENT'S AUTHORITY, ENFORCED WHERE THE DISPLACEMENT PHYSICALLY HAPPENS (ADR-0010)
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// ADR-0007 established the rule — authority is derived from the RESOURCE, never asserted by the request —
// and implemented it in ONE caller: `adapter-io/governed-emit.ts` §2.25, which resolves the incumbent and
// refuses a downgrade or a relocation BEFORE calling this reducer. That is a correct door. It is not a
// correct invariant, because nothing in `upsert` knew the rule existed: the UPDATE branch replaced
// `contentHash` in place, with no `supersededBy`, for any caller at all. So the safety of a billy-ratified
// `T0` node was a property of one caller's GATE ORDER — of a check happening to run before this line —
// rather than a property of the write. Reproduced against the built packages at `572d391`: a `T2` advisory
// at the (anchor, slot) of a ratified `T0` fact routed UPDATE and the node came back pointing at the `T2`
// bytes with `supersededBy: undefined`. Since `atlas-query` bounds `T2` OUT of reads (TOOLS-6), that node
// then stops appearing for its scope with no refusal on any transport — silent disappearance, which for a
// knowledge product is the worst failure mode there is.
//
// The rule therefore lives HERE TOO, and the duplication is deliberate: the door refuses EARLIER and with
// more context (it can read the CAS bytes, so it also covers a row that carries no class), while this gate
// refuses UNCONDITIONALLY, for every present and future caller of the reducer. Neither is redundant — one is
// a policy check, the other is an invariant of the data structure. `mine` and `genesis` reach knowledge by
// other paths today; the next caller that reaches THIS one inherits the rule for free instead of having to
// rediscover ADR-0007.
//
// WHY A THROW AND NOT A `REJECT` ROUTE. `WriteDecision` already enumerates `REJECT`, and returning it with an
// unchanged projection was the tidier-looking option. It is unsafe here: `governed-emit.ts` calls
// `upsert(projection, req).store` and DISCARDS the decision, so a returned refusal would have persisted
// nothing while the door reported `emitted: true` — a caller told its write succeeded when it did not, which
// is the same silent-failure class this guard exists to prevent, moved one layer up. A throw cannot be
// ignored by an existing caller. It also follows the precedent this package already set for a write-door
// refusal: `DegenerateAnchorError` (router.ts), a NAMED class the composed doors convert into a structured
// fail-closed verdict, never a bare `Error` and never a raw `TypeError`.

/** The two ways a write can try to take authority it does not hold. A DISCRIMINANT — the refusal is asserted
 *  on this value, never on a substring of the message. That is not stylistic: the refusal prose in this repo
 *  quotes other refusal constants BY NAME, so a `toContain('governance-downgrade')` assertion is also
 *  satisfied by a message that merely mentions the downgrade rule, and cannot say WHICH gate refused. */
export type GovernanceAuthorityReason = 'governance-downgrade' | 'governance-relocation';

const AUTHORITY_REASON_TEXT: Readonly<Record<GovernanceAuthorityReason, string>> = {
  'governance-downgrade':
    'governance-downgrade: this write declares a WEAKER governance class than the node it lands on. The ' +
    'routing identity (hash of primary anchor and slot) carries no class, so the node this write displaces ' +
    'may have been admitted under a stricter gate than the one this write would face. Lowering a class is a ' +
    're-classification (ADR-0009) — an explicit, separately authorized act — never a side effect of emitting ' +
    'a fact. Re-state the class the node already carries, or raise it',
  'governance-relocation':
    'governance-relocation: this write declares a scope other than the one the node it lands on already ' +
    'lives in. A node moving between scopes evicts every co-owner who is not in the destination, and the ' +
    'routing identity carries no scope, so nothing else would have caught it. Relocation is the same class ' +
    'of act as lowering a class and is settled the same way (ADR-0009): explicit and separately authorized',
};

/** The refusal, as a THROWN value carrying a machine-readable {@link GovernanceAuthorityReason}. */
export class GovernanceAuthorityError extends Error {
  readonly reason: GovernanceAuthorityReason;
  constructor(reason: GovernanceAuthorityReason) {
    super(AUTHORITY_REASON_TEXT[reason]);
    this.name = 'GovernanceAuthorityError';
    this.reason = reason;
  }
}

/**
 * Does `req` try to take authority the incumbent does not grant it? Returns the reason, or `undefined`.
 *
 * AUTHORITY COMES FROM THE INCUMBENT, AND ONLY AS FAR AS THE INCUMBENT DECLARES IT. Each half gates only
 * when the ROW carries that half: a row minted before the ADR-0007 carrier existed declares nothing, so
 * there is nothing here to derive authority from and this gate stands aside rather than bricking every
 * pre-carrier node (the door's CAS-bytes fallback is what covers that shape, and `SCN-AUTH-5` pins the
 * limit as a stated property instead of leaving it to be mistaken for coverage).
 *
 * Where the row DOES declare a half, the write must match it: `isWeakerTier` is total over `unknown` and
 * treats an off-lattice or ABSENT declared class as weaker, so a write cannot dodge the class comparison by
 * omitting the field or by sending `'T3'`. Scope is EQUALITY against the stored value for the same reason
 * the door uses equality there — the question is not "is this scope legitimate" but "is it the one this
 * node already lives in".
 */
function authorityRefusal(incumbent: CurrentNode, req: WriteRequest): GovernanceAuthorityReason | undefined {
  if (incumbent.scope !== undefined && req.scope !== incumbent.scope) return 'governance-relocation';
  if (incumbent.tier !== undefined && isWeakerTier(req.tier, incumbent.tier)) return 'governance-downgrade';
  return undefined;
}

/** The ADDITIVE governance carrier a write contributes to the row it lands on (ADR-0007). A conditional
 *  spread, so an omitted half stays ABSENT rather than becoming an explicit `undefined` — the same shape
 *  `primaryAnchor`/`slot` use, and what keeps `exactOptionalPropertyTypes` and the JSON round-trip honest. */
function governanceOf(req: WriteRequest): { scope?: string; tier?: Tier } {
  return { ...(req.scope !== undefined ? { scope: req.scope } : {}), ...(req.tier !== undefined ? { tier: req.tier } : {}) };
}

/** The ADDITIVE relation carrier a write contributes to the row (ADR-0015 D2). Conditional spread, same
 *  discipline as {@link governanceOf}: an omitted leg stays ABSENT, never an explicit `undefined`, keeping
 *  `exactOptionalPropertyTypes` and the JSON round-trip honest. Present only on a `family:'relation'` write. */
function relationOf(req: WriteRequest): { endpointA?: string; endpointB?: string; relationKind?: string } {
  return {
    ...(req.endpointA !== undefined ? { endpointA: req.endpointA } : {}),
    ...(req.endpointB !== undefined ? { endpointB: req.endpointB } : {}),
    ...(req.relationKind !== undefined ? { relationKind: req.relationKind } : {}),
  };
}

/**
 * Apply one write as an upsert: resolve the routing inputs against the current projection, route
 * with {@link routeWrite}, then reduce the projection per the route. DEDUP is a no-op; CREATE mints
 * a node; UPDATE set-unions the advisory claim in place (same node, no lineage pointer — git holds
 * the prior); SUPERSEDE mints a new predicate node at the SAME key with a `supersededBy` pointer
 * while the prior bytes remain in CAS.
 *
 * ADJACENCY (WP-DEDUP-1 un-merge): the ADJACENCY-B door-2 always-merge is REMOVED. A routed CREATE at an
 * adjacent anchor now mints its OWN node (each keeps its own grounding — A2), never folding into a neighbor.
 * Adjacency is no longer a merge; it is a derived-on-read `subsumes` relation (WP-DEDUP-2, `deriveSubsumes`),
 * so the destructive fold is gone. The `primaryAnchor`/`slot` carriers on `CurrentNode` STAY — DP-2 reads
 * them off the projection. `cfg` remains in the signature (default τ=1) for callers + the forthcoming DP-2 use.
 *
 * CARRY-FORWARD IS THE DEFAULT (ADR-0009): UPDATE and SUPERSEDE both SPREAD the prior node and re-mint only the
 * fields named inline, so a field added to `CurrentNode` later is carried with no edit here and DROPPING one has
 * to be spelled out (only `claims`, at SUPERSEDE). `sameAs` is why — a SIGNED act established it (`atlas-link`'s
 * authz + ratifier over the whole class), and a class that SHRINKS under-charges every gate `sameAsClassOf` prices. *
 * GOVERNANCE (ADR-0007 carrier): the req's `(scope, tier)` is stamped onto the row and, on UPDATE/SUPERSEDE,
 * WINS over the prior's — safe in exactly one direction and only because the governed door already decided it.
 * That door refuses a relocation, so a surviving write's `scope` RE-STATES the incumbent's; and it refuses a
 * downgrade, so its `tier` re-states or RAISES. A write that OMITS the pair leaves the prior row's intact
 * (`...prior`) rather than erasing it: this reducer is also reachable from ungoverned callers, and a carrier
 * that could be CLEARED by omission would be a way to demote a node to "unconfirmable" and brick it.
 */
export function upsert(
  store: StoreProjection,
  req: WriteRequest,
  cfg: NearDupConfig = { claimNormThreshold: 1 },
): UpsertResult {
  // KNOW-10 / KNOW-15i — THE CLOSED-SLOT GATE (#152). FIRST, before the route is even computed: the slot is
  // an ingredient of the identity this reducer routes on, so a value outside the closed 12 has already
  // corrupted the question by the time `routeWrite` answers it. ABSENT stands aside — a deliberate
  // NARROWING, measured and argued in `./closed-slot.ts`; PRESENT-and-unrecognised fails closed. Until this
  // line existed, the shipped `atlas emit` ACCEPTED an out-of-vocabulary slot and minted a new address for
  // it, and BOTH membership guards in this package (`isKnownSlot`, `isClosedSlot`) had zero callers.
  if (req.slot !== undefined && !isKnownSlot(req.slot)) throw new ClosedSlotError(req.slot);

  const nodeKeyHit = store.current.has(req.nodeKey);
  const inputs: RouteInputs = {
    contentHashHit: store.cas.has(req.contentHash),
    nodeKeyHit,
    family: req.family,
    checkSame: req.family === 'predicate' && nodeKeyHit, // predicate nodeKey encodes check ⇒ hit ⟺ same check
  };
  const decision = routeWrite(inputs);

  // ARCH-10 (ADR-0010) — a write that DISPLACES a current node must first clear the gate that node's own
  // stored governance requires. Checked BEFORE any projection is copied, so a refusal cannot leave a
  // half-applied store behind; DEDUP and CREATE never reach it (nothing is displaced).
  if (decision === 'UPDATE' || decision === 'SUPERSEDE') {
    const refusal = authorityRefusal(store.current.get(req.nodeKey)!, req);
    if (refusal !== undefined) throw new GovernanceAuthorityError(refusal);
  }

  const cas = new Set(store.cas);
  const current = new Map(store.current);

  switch (decision) {
    case 'DEDUP':
      break; // idempotent no-op — no node minted, no new CAS object (KNOW-4b)
    case 'CREATE':
      cas.add(req.contentHash);
      current.set(req.nodeKey, {
        nodeKey: req.nodeKey,
        family: req.family,
        contentHash: req.contentHash,
        claims: [req.claimNorm],
        // ADJACENCY carrier (additive) — spread keeps the field ABSENT when omitted (never explicit undefined).
        ...(req.primaryAnchor !== undefined ? { primaryAnchor: req.primaryAnchor } : {}),
        ...(req.slot !== undefined ? { slot: req.slot } : {}),
        ...governanceOf(req), // GOVERNANCE carrier (ADR-0007) — absent when the caller declares neither half
        ...relationOf(req), // RELATION carrier (ADR-0015 D2) — the endpoint pair + kind on a family:'relation' write
      });
      break;
    case 'UPDATE': {
      const prior = current.get(req.nodeKey)!; // nodeKeyHit ⇒ present
      const claims = prior.claims.includes(req.claimNorm)
        ? prior.claims // set-union: dedup by claimNorm (idempotent)
        : [...prior.claims, req.claimNorm];
      cas.add(req.contentHash);
      current.set(req.nodeKey, {
        ...prior, // ADJACENCY: `...prior` carries prior anchor/slot; the req's WIN below when present
        contentHash: req.contentHash,
        claims, // in place, no supersededBy
        ...(req.primaryAnchor !== undefined ? { primaryAnchor: req.primaryAnchor } : {}),
        ...(req.slot !== undefined ? { slot: req.slot } : {}),
        ...governanceOf(req), // re-states scope / re-states-or-RAISES tier; omitted ⇒ `...prior` stands
        ...relationOf(req), // RELATION carrier (ADR-0015 D2) — re-evidencing a relation re-states its endpoints
      });
      break;
    }
    case 'SUPERSEDE': {
      const prior = current.get(req.nodeKey)!; // nodeKeyHit ⇒ present
      cas.add(req.contentHash); // prior.contentHash stays in `cas` (append-only) — old bytes addressable
      current.set(req.nodeKey, {
        ...prior, // CARRY-FORWARD (ADR-0009, see above): `sameAs` + every future field survive; only ↓ is re-minted
        nodeKey: req.nodeKey,
        family: req.family,
        contentHash: req.contentHash,
        claims: [req.claimNorm], // the ONE deliberate drop: a predicate version REPLACES its body (prior in CAS)
        supersededBy: prior.contentHash,
        ...(req.primaryAnchor !== undefined ? { primaryAnchor: req.primaryAnchor } : {}), // req wins, else `...prior`
        ...(req.slot !== undefined ? { slot: req.slot } : {}),
        ...governanceOf(req), // a new VERSION of a node keeps the node's governance — never a re-classification
      });
      break;
    }
    // REJECT is unreachable — admission (KNOW-2) is emit.ts, not the upsert route.
  }
  return { decision, store: { current, cas } };
}

/** A territory query: the current nodes — exactly one per `nodeKey` by construction (KNOW-4g). */
export function currentNodes(store: StoreProjection): readonly CurrentNode[] {
  return [...store.current.values()];
}
