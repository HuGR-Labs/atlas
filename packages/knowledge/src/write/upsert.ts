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
 * authz + ratifier over the whole class), and a class that SHRINKS under-charges every gate `sameAsClassOf` prices.
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
