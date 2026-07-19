// @atlas/knowledge — src/router.ts  (WP-5.13-a.KNOW · EPIC-13-a)
//
// THE write-decision routing rules — "every write is an upsert" (KNOW-4). The route is
// COMPUTED, never judged (no LLM / clock / seq in the path): a pure, total, deterministic,
// mutually-exclusive function over the enumerated routing product the interface_contract pins
// (method-tags-knw INV-KNOW-4 down-model):
//     {contentHash∈(hit,miss) × family∈(advisory,predicate) × nodeKey∈(hit,miss) × check∈(same,diff)}
// The drift leg (`subtreeHash`, WHERE-current) NEVER enters the create/update decision
// (atlas-knowledge:153), so it is absent from the inputs by construction.
//
// FACET BOUNDARY (BIND — resolved vs FROZEN oracle ref/router.ts):
//  • This WP owns the routing OVER the resolved inputs. The nodeKey/contentHash VALUES (the
//    identity hashes) are computed UPSTREAM — the `nodeKey` identity formula is WP-5.13-b.KNOW's
//    excluded facet, and the CAS/store lookup that resolves hit/miss is the OWNER-DEFINE composed
//    store (ref/store.ts: "NO concrete signature frozen"). Per INV-KNOW-5's note the matcher/store
//    "fixes the VALUE of the inputs, not the routing over them — feasible now". So this module
//    takes RESOLVED opaque identity strings as inputs and does ZERO hashing (the sealed
//    @atlas/kernel identity seam is not entered here — no raw hashing).
//  • The frozen `RouterApi.writeDecision(candidate, cfg)` FRONT DOOR (which consumes a `Candidate`
//    and composes the store lookup + the near-dup `claimNorm` probe) is therefore NOT wired here:
//    it needs the OWNER-DEFINE composed store + 5.13-b's nodeKey. That composition is DEFERRED,
//    not invented. The `StoreProjection` below is held caller-side / session-internal
//    (cf. index/src/fold.ts `createDriftFold`), never an invented frozen `StoreApi` field.
//  • REJECT (the 2-door admission bar, KNOW-2) is ref/emit.ts's facet — the upsert route never
//    returns REJECT.

import type { WriteDecision } from '../ref/router.js';

/** The two content kinds of the Atlas (atlas-knowledge:19): advisory ⇒ UPDATE/union · predicate ⇒ SUPERSEDE. */
export type NodeFamily = 'advisory' | 'predicate';

/**
 * The enumerated routing product — the four orthogonal, already-RESOLVED oracle inputs the
 * write-decision routes over (INV-KNOW-4 down-model). `contentHashHit`/`nodeKeyHit` are resolved
 * upstream (the hash VALUES + the store lookup); `checkSame` matters only for the predicate family
 * (a predicate `nodeKey` encodes `normalize(check)`, so a hit ⟺ the same check re-evidenced).
 */
export interface RouteInputs {
  readonly contentHashHit: boolean; // WHAT  — dedup leg (contentHash already in CAS)
  readonly nodeKeyHit: boolean; // WHICH — create/update leg (nodeKey present in the territory)
  readonly family: NodeFamily; // advisory ⇒ set-union · predicate ⇒ supersede-with-lineage
  readonly checkSame: boolean; // predicate: same `check` re-evidenced (else it is a different nodeKey)
}

/**
 * The pure write-decision (KNOW-4). Total + deterministic + mutually-exclusive over the finite
 * routing product; no LLM/clock/seq enters. Precedence: identical bytes (DEDUP) short-circuit
 * regardless of nodeKey (idempotent no-op, 4b); a nodeKey miss is a CREATE (4f — a different check
 * is a different nodeKey); a nodeKey hit routes by family — advisory edits in place / set-union
 * (UPDATE, 4c/4d), predicate same-check re-evidence supersedes with lineage (SUPERSEDE, 4e).
 */
export function routeWrite(inputs: RouteInputs): WriteDecision {
  if (inputs.contentHashHit) return 'DEDUP'; // 4b — byte-identical fact, idempotent no-op
  if (!inputs.nodeKeyHit) return 'CREATE'; // 4f — new (anchor, slot[, check]) OR a different check
  if (inputs.family === 'advisory') return 'UPDATE'; // 4c/4d — claim set-union, edited in place
  return inputs.checkSame ? 'SUPERSEDE' : 'CREATE'; // 4e — same-check re-evidence supersedes
}

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
}

/** A current node in the territory projection. Exactly one lives per `nodeKey` (KNOW-4g). */
export interface CurrentNode {
  readonly nodeKey: string;
  readonly family: NodeFamily;
  readonly contentHash: string;
  readonly claims: readonly string[]; // claimNorms — the advisory set-union set (dedup by claimNorm)
  readonly supersededBy?: string; // predicate lineage pointer into CAS (KNOW-4e); absent for advisory
}

/** The territory store projection: the one-current-node map + the append-only CAS retention set. */
export interface StoreProjection {
  readonly current: ReadonlyMap<string, CurrentNode>; // nodeKey → the ONE current node
  readonly cas: ReadonlySet<string>; // retained contentHashes — prior versions stay addressable
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
 */
export function upsert(store: StoreProjection, req: WriteRequest): UpsertResult {
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
      });
      break;
    case 'UPDATE': {
      const prior = current.get(req.nodeKey)!; // nodeKeyHit ⇒ present
      const claims = prior.claims.includes(req.claimNorm)
        ? prior.claims // set-union: dedup by claimNorm (idempotent)
        : [...prior.claims, req.claimNorm];
      cas.add(req.contentHash);
      current.set(req.nodeKey, { ...prior, contentHash: req.contentHash, claims }); // in place, no supersededBy
      break;
    }
    case 'SUPERSEDE': {
      const prior = current.get(req.nodeKey)!; // nodeKeyHit ⇒ present
      cas.add(req.contentHash); // prior.contentHash stays in `cas` (append-only) — old bytes addressable
      current.set(req.nodeKey, {
        nodeKey: req.nodeKey,
        family: req.family,
        contentHash: req.contentHash,
        claims: [req.claimNorm],
        supersededBy: prior.contentHash,
      });
      break;
    }
    // REJECT is unreachable — admission (KNOW-2) is ref/emit.ts, not the upsert route.
  }
  return { decision, store: { current, cas } };
}

/** A territory query: the current nodes — exactly one per `nodeKey` by construction (KNOW-4g). */
export function currentNodes(store: StoreProjection): readonly CurrentNode[] {
  return [...store.current.values()];
}
