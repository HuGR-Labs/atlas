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
// FACET BOUNDARY (BIND — resolved vs the frozen RouterApi, co-located below):
//  • This WP owns the routing OVER the resolved inputs. The nodeKey/contentHash VALUES (the
//    identity hashes) are computed UPSTREAM — the `nodeKey` identity formula is WP-5.13-b.KNOW's
//    excluded facet, and the CAS/store lookup that resolves hit/miss is the OWNER-DEFINE composed
//    store (StoreApi in types.ts: "NO concrete signature frozen"). Per INV-KNOW-5's note the matcher/store
//    "fixes the VALUE of the inputs, not the routing over them — feasible now". So this module
//    takes RESOLVED opaque identity strings as inputs and does ZERO hashing (the sealed
//    @atlas/kernel identity seam is not entered here — no raw hashing).
//  • The `RouterApi.writeDecision` FRONT DOOR is now WIRED here (owner-RATIFIED un-park, reversing the
//    s05 PARK — govern writes now). It is COMPOSED, not reimplemented: it consumes a `Candidate`, mints
//    the contentHash through the SEALED kernel seam (`id` = `defaultEncoder.hash(canonicalForm(·))`,
//    atlas-knowledge:110), reuses `nodeKey` (5.13-b) for the WHICH leg, and routes through the existing
//    pure `routeWrite`. The ADJACENCY-B door-2 always-merge is REMOVED (WP-DEDUP-1) — adjacency is now a
//    derived-on-read `subsumes` relation (WP-DEDUP-2), never a write-time merge. The store is passed as DATA
//    (widened signature `writeDecision(candidate, store, cfg)`): the `StoreProjection` is held
//    caller-side / session-internal (cf. index/src/fold.ts `createDriftFold`, and the `upsert(store, req)`
//    idiom), never an invented frozen `StoreApi` field — so no OWNER-DEFINE composed store is invented.
//  • REJECT (the 2-door admission bar, KNOW-2) is emit.ts's facet — the upsert route never
//    returns REJECT.

import { asNodeKey, canonicalForm, defaultEncoder, id } from '@atlas/kernel';
import type { NodeKey } from '@atlas/contracts';
import type { Candidate, Check, PredicateSlot } from '../types.js';

// ── frozen RouterApi surface, co-located here (was ref/router.ts) ─────────────────────────────────────

/**
 * The write-decision routes. Transcribed EXACTLY from the KNOW-15 routing table (atlas-knowledge:135-142):
 * total + deterministic + mutually-exclusive (method-tags-knw:119).
 *   - `DEDUP`     — `contentHash` already in CAS; identical bytes ⇒ no-op (bump hits/freshness only).
 *   - `CREATE`    — `nodeKey` miss (new `(anchor, slot[, check])`), OR a DIFFERENT predicate `check`.
 *   - `UPDATE`    — `nodeKey` hit, advisory family; claim SET-UNION in place (git keeps prior, KNOW-4/12).
 *   - `SUPERSEDE` — `nodeKey` hit, predicate, SAME `check` re-evidenced; mint new + `supersededBy` pointer.
 *   - `REJECT`    — fails the 2-door bar (ungrounded, or obvious/useless) — KNOW-2.
 */
export type WriteDecision = 'DEDUP' | 'CREATE' | 'UPDATE' | 'SUPERSEDE' | 'REJECT';

/**
 * [OPEN DEFINE — parametric, threshold UNPINNED] The KNOW-15 move-aware near-duplicate matcher's
 * `claimNorm`-collision threshold (method-tags-knw:122; atlas-knowledge:128-132). `subtreeHash` equality
 * catches move/rename but NOT move+edit, so a similarity matcher is needed and its threshold value is NOT
 * frozen. Per the task directive the threshold MUST be a PARAMETER, never a baked-in constant — surfaced
 * here as an explicit config the matcher takes; DEFINE pins the value later. Flagged.
 */
export interface NearDupConfig {
  readonly claimNormThreshold: number;
}

/** The frozen write-decision API (KNOW-4/15) — its impl is the pure functions below (no separate
 *  anchor.ts: the identity legs live HERE per the LEAD-RATIFIED decision). */
export interface RouterApi {
  /** The pure write-decision (KNOW-4/15). Routes a candidate to exactly one `WriteDecision` from its
   *  three orthogonal hashes; the drift leg (`subtreeHash`) NEVER changes the create/update leg
   *  (atlas-knowledge:153). No LLM call enters the decision (method-tags-knw:121). Pure + total.
   *
   *  [UN-MERGED — WP-DEDUP-1] the ADJACENCY-B door-2 always-merge is REMOVED: a routed CREATE at an
   *  adjacent anchor stays a CREATE (its own node, own grounding — A2). Adjacency is now a derived-on-read
   *  `subsumes` relation (WP-DEDUP-2), never a write-time merge.
   *
   *  [PARAMETRIC — see `NearDupConfig`] the near-dup matcher threshold is an EXPLICIT parameter, not a
   *  constant (the threshold is an OPEN DEFINE, method-tags-knw:122).
   *
   *  [WIDENED — owner-RATIFIED un-park] the composed store is passed as DATA (`StoreProjection`), matching
   *  the `upsert(store, req)` idiom + the caller-side/session-internal projection documented in the facet
   *  header — NOT an invented frozen `StoreApi` field. See the `writeDecision` impl below. */
  writeDecision(candidate: Candidate, store: StoreProjection, cfg: NearDupConfig): WriteDecision;

  /** The node identity leg. `nodeKey(advisory) = hash(primaryAnchorId ‖ predicateSlot)`;
   *  `nodeKey(predicate) = hash(primaryAnchorId ‖ predicateSlot ‖ normalize(check))` — so a distinct
   *  `check` is a distinct node, never a sibling-supersede (atlas-knowledge:123-124, 144-146). Pure +
   *  total, no LLM. Routed on `Candidate` (identity needs its `slot`/`check`). */
  nodeKey(node: Candidate): NodeKey;

  /** The COMPUTED primary anchor — the tightest structural unit (smallest AST subtree) containing every
   *  symbol the claim references (atlas-knowledge:114-119). NEVER an LLM-chosen anchor. ONLY the primary
   *  anchor enters identity — secondary citations live in `grounding.entries` and feed DRIFT only, never
   *  the `nodeKey`. Move-aware (name-stripped subtree match ⇒ rename is a MOVE). Pure + total, no LLM.
   *
   *  [FLAG — return leg] the reference frames `primaryAnchorId` as an ANCHOR id fed into `nodeKey`
   *  (atlas-knowledge:123-124), not itself a `nodeKey`; transcribed to the `NodeKey` return, flagged. */
  primaryAnchorId(node: Candidate): NodeKey;
}

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
    case 'SUPERSEDE': { // ADJACENCY: anchor/slot = req ?? prior (below)
      const prior = current.get(req.nodeKey)!; // nodeKeyHit ⇒ present
      const anchor = req.primaryAnchor ?? prior.primaryAnchor; // ADJACENCY: req wins, else preserve prior
      const slot = req.slot ?? prior.slot;
      cas.add(req.contentHash); // prior.contentHash stays in `cas` (append-only) — old bytes addressable
      current.set(req.nodeKey, {
        nodeKey: req.nodeKey,
        family: req.family,
        contentHash: req.contentHash,
        claims: [req.claimNorm],
        supersededBy: prior.contentHash,
        ...(anchor !== undefined ? { primaryAnchor: anchor } : {}), // ADJACENCY: spread avoids explicit undefined
        ...(slot !== undefined ? { slot } : {}),
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

// ═════════════════════════════════════════════════════════════════════════════════════════════
// WP-5.13-b.KNOW · EPIC-13-b — THE ANCHOR-IDENTITY FACET (additive; 5.13-a's routeWrite/upsert above
// are untouched). Implements the FROZEN `RouterApi.nodeKey` / `RouterApi.primaryAnchorId` (co-located
// above, which RATIFIES these live HERE — "no separate anchor.ts") + the near-dup probe and the closed slot
// vocabulary. The write-decision's identity leg is COMPUTED, never judged: pure hash+symbol functions,
// ZERO LLM/clock/seq (KNOW-15j). All digests are minted through the SEALED @atlas/kernel encoder seam
// (`defaultEncoder` + `canonicalForm`) and branded via `asNodeKey` — NO raw hashing (SEAM).
//
// BIND (vs the frozen RouterApi + types.ts): `predicateSlot` is the required `Candidate.slot`
// (closed 12-member `PredicateSlot`, R3-surfaced on `GroundedFact` too); `check` presence discriminates
// predicate vs advisory. The move-aware RE-ANCHORING matcher (rename/move ⇒ same nodeKey) and the
// near-synonym similarity threshold are UPSTREAM + OPEN-DEFINE parametric (SCN-KNOW-15f-2 θ / 15h-2 τ,
// `residue`): they fix the VALUE of the nodeKey oracle-input the router routes over — NOT re-modeled
// here, and NO verification is invented for an unpinned threshold (method-tags-knw §Refuse-to-model).
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** The closed `predicateSlot` vocabulary (NORMATIVE — all 12 members, `PredicateSlot` in types.ts). CLOSED:
 *  adding a slot is a `cv` bump. Finiteness is what lets a `nodeKey` collide + force UPDATE/union
 *  instead of proliferating parallel nodes (atlas-knowledge:150 / SCN-KNOW-15i-1). */
export const PREDICATE_SLOTS: readonly PredicateSlot[] = [
  'invariant',
  'contract',
  'precondition',
  'postcondition',
  'sideeffect',
  'ownership',
  'perf-bound',
  'security-property',
  'gotcha',
  'rationale',
  'dependency',
  'definition',
];
const SLOT_SET: ReadonlySet<string> = new Set(PREDICATE_SLOTS);

/** Closed-vocabulary membership guard (KNOW-15i). A slot outside the 12 enumerated members is rejected —
 *  a free-text slot never collides, so `nodeKey` never forces UPDATE and the store would proliferate. */
export function isKnownSlot(slot: string): boolean {
  return SLOT_SET.has(slot);
}

/** Canonical `normalize(check)` — the predicate identity ingredient (KNOW-15c). Deterministic + total:
 *  the tagged-union kind + the NFC-normalized, trimmed body. Folded into the predicate `nodeKey` so a
 *  DISTINCT check is a DISTINCT node (never a sibling-supersede). No LLM/clock. */
export function normalizeCheck(check: Check): string {
  const body = check.kind === 'index-query' ? check.query : check.expr;
  return `${check.kind}${body.normalize('NFC').trim()}`;
}

/** Split a `qualifiedPath` on its structural-unit boundary (`::`) into ancestor segments. */
function segments(qualifiedPath: string): readonly string[] {
  return qualifiedPath.split('::');
}

/** The deepest common structural ancestor of a set of anchor paths — the smallest AST subtree that
 *  contains every one of them (segment-wise longest common prefix). This is the mechanical
 *  "tightest structural unit containing every referenced symbol" (KNOW-15d). Total + deterministic. */
function deepestCommonUnit(paths: readonly string[]): string {
  if (paths.length === 0) return '';
  let common: readonly string[] = segments(paths[0]!);
  for (const p of paths.slice(1)) {
    const segs = segments(p);
    let i = 0;
    while (i < common.length && i < segs.length && common[i] === segs[i]) i++;
    common = common.slice(0, i);
  }
  return common.join('::');
}

/**
 * The COMPUTED primary anchor (KNOW-15d) — the tightest structural unit containing every SYMBOL the
 * claim references, resolved MECHANICALLY from the grounding (never an LLM-chosen anchor, KNOW-15e).
 * ONLY the primary symbol anchors enter identity: broader (block/file/repo/project) citations are
 * SECONDARY — they live in `grounding.entries` and feed DRIFT only, never the `nodeKey` (KNOW-15g).
 * Pure + total, no LLM. (The move-aware re-anchoring across rename/move is the UPSTREAM matcher —
 * OPEN-DEFINE parametric, not computed here; see the facet header.)
 */
export function primaryAnchorId(node: Candidate): NodeKey {
  const symbolAnchors = node.grounding.entries.filter((e) => e.anchor.kind === 'symbol');
  const source = symbolAnchors.length > 0 ? symbolAnchors : node.grounding.entries.slice(0, 1);
  return asNodeKey(deepestCommonUnit(source.map((e) => e.anchor.qualifiedPath)));
}

/**
 * The node identity leg (KNOW-15b/15c) via the SEALED kernel digest seam:
 *   advisory  → `hash(primaryAnchorId ‖ predicateSlot)`                    — body-wording independent
 *   predicate → `hash(primaryAnchorId ‖ predicateSlot ‖ normalize(check))` — a distinct check ⇒ distinct node
 * `check` presence discriminates the family. Pure + total, no LLM. The `‖` concatenation is the injective
 * canonical preimage (`canonicalForm`, sorted keys / NFC / floats-forbidden), hashed through
 * `defaultEncoder` and branded `asNodeKey` — the sole sanctioned nodeKey mint (no raw hashing).
 */
export function nodeKey(node: Candidate): NodeKey {
  const anchor = primaryAnchorId(node) as string;
  const preimage = node.check
    ? { a: anchor, c: normalizeCheck(node.check), s: node.slot } // predicate: folds in normalize(check)
    : { a: anchor, s: node.slot }; // advisory: anchor ‖ slot only
  return asNodeKey(defaultEncoder.hash(canonicalForm(preimage)));
}


/**
 * THE composed write-decision FRONT DOOR (KNOW-4/15) — owner-RATIFIED un-park of the s05 PARK. COMPOSED
 * end-to-end from the pure functions above; it invents NO routing. The three orthogonal legs resolve as:
 *   1. contentHash (WHAT, atlas-knowledge:110) — `id(candidate) = defaultEncoder.hash(canonicalForm(·))`,
 *      the SEALED kernel identity seam (no raw hashing); a CAS hit DEDUPs and SHORT-CIRCUITS everything.
 *   2. nodeKey (WHICH) — the existing `nodeKey(candidate)` identity leg; its presence in the projection's
 *      current map is the create/update oracle-input.
 *   3. family/checkSame — `candidate.check ? 'predicate' : 'advisory'`, and (mirroring `upsert` at the
 *      derivation above) `checkSame = family==='predicate' && nodeKeyHit` (a predicate nodeKey folds in
 *      normalize(check), so a hit ⟺ the same check re-evidenced).
 * These feed the existing pure `routeWrite`. PRECEDENCE: DEDUP short-circuits; else `routeWrite`'s cell
 * stands and is returned directly. Pure + total + deterministic — no LLM/clock/seq enters.
 *
 * [UN-MERGED — WP-DEDUP-1] the ADJACENCY-B door-2 always-merge is REMOVED. `writeDecision` no longer runs an
 * adjacency probe over the route: a routed CREATE at an adjacent anchor stays a CREATE and mints its own node
 * (each keeps its own grounding — A2). Adjacency is now a DERIVED-ON-READ `subsumes` relation (WP-DEDUP-2,
 * `deriveSubsumes`), never a write-time merge. `cfg` is retained in the signature for the DP-2 successor.
 */
export function writeDecision(candidate: Candidate, store: StoreProjection, cfg: NearDupConfig): WriteDecision {
  const contentHashHit = store.cas.has(id(candidate) as string); // leg 1 — WHAT (sealed seam)
  if (contentHashHit) return 'DEDUP'; // dedup precedence: identical bytes short-circuit (KNOW-4b)

  const nodeKeyHit = store.current.has(nodeKey(candidate) as string); // leg 2 — WHICH
  const family: NodeFamily = candidate.check ? 'predicate' : 'advisory';
  const checkSame = family === 'predicate' && nodeKeyHit; // mirror upsert: predicate hit ⟺ same check
  return routeWrite({ contentHashHit: false, nodeKeyHit, family, checkSame });
}
