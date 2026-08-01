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
import type { NearDupConfig, NodeFamily, RouteInputs, WriteDecision } from './router.js';
import { routeWrite } from './router.js';

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
}

/** The territory store projection: the one-current-node map + the append-only CAS retention set. */
export interface StoreProjection {
  readonly current: ReadonlyMap<string, CurrentNode>; // nodeKey → the ONE current node
  readonly cas: ReadonlySet<string>; // retained contentHashes — prior versions stay addressable
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

/** The ADDITIVE governance carrier a write contributes to the row it lands on (ADR-0007). A conditional
 *  spread, so an omitted half stays ABSENT rather than becoming an explicit `undefined` — the same shape
 *  `primaryAnchor`/`slot` use, and what keeps `exactOptionalPropertyTypes` and the JSON round-trip honest. */
function governanceOf(req: WriteRequest): { scope?: string; tier?: Tier } {
  return { ...(req.scope !== undefined ? { scope: req.scope } : {}), ...(req.tier !== undefined ? { tier: req.tier } : {}) };
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
  const nodeKeyHit = store.current.has(req.nodeKey);
  const inputs: RouteInputs = {
    contentHashHit: store.cas.has(req.contentHash),
    nodeKeyHit,
    family: req.family,
    checkSame: req.family === 'predicate' && nodeKeyHit, // predicate nodeKey encodes check ⇒ hit ⟺ same check
  };
  const decision = routeWrite(inputs);
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
