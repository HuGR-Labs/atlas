// @atlas/adapter-io — src/governed-link.ts  (WP-SAMEAS: the governed sameAs write door)
//
// The runtime composition-root's SECOND governed write door (mirrors `governed-emit.ts`). `atlas-link`
// asserts a human `sameAs` equivalence between two current nodes — a symmetric, non-destructive edge — only
// THROUGH four fail-closed gates, in order, before a single byte is written:
//   1. DISTINCT     — a node never names itself; `a === b` is refused (no self-equivalence).
//   2. BOTH KNOWN   — both `a` and `b` MUST be current nodes in the rehydrated projection; an absent
//                     endpoint is refused (no dangling assertion).
//   3. AUTHZ        — the KNOW-11 owner-scoped write gate on BOTH endpoints: each node's fact is read back
//                     from CAS (`store.get(node.contentHash)`), its `scope` taken, and `actorInScope` is
//                     required for BOTH (reused verbatim from `governed-emit.ts` — the same authz seam). An
//                     empty/unset actor, or an actor outside EITHER node's scope, is denied (fail-closed v1).
//   4. RATIFY       — a sameAs assertion is a governed shared-truth mutation, so it runs the SAME KNOW-8
//                     gate emit runs, over the JOIN of both endpoints' tiers: a non-empty ratifier always,
//                     and `billy` specifically when EITHER endpoint is `T0` (task #84 — a link spanning a
//                     `T0` node is a `T0` act, else the weaker endpoint is a side door onto the stronger).
//                     The token is env-sourced by the composition root (`ATLAS_RATIFY_TOKEN`) — NEVER a
//                     payload field (the spoof-guard).
// Only after all four does it `linkSameAs` the projection and `persistProjection` it durably.
//
// Pure of clock/random: no wall-clock, no nonce, no counter enters the decision. Composes OVER the frozen
// core (`@atlas/knowledge` linkSameAs, the `@atlas/tools` `LinkOut` result, the authz seam) — re-implements
// none. DAG: adapter-io depends on knowledge + tools; `LinkOut` is imported FROM tools (never the reverse).

import type { Hash } from '@atlas/contracts';
import { linkSameAs, ratify, stage, strictestTier } from '@atlas/knowledge';
import type { Candidate, CurrentNode, GroundedFact } from '@atlas/knowledge';
import type { LinkOut } from '@atlas/tools';
import { actorInScope } from './policy.js';
import type { AtlasPolicy } from './policy.js';
import { rehydrateProjection } from './store.js';
import type { DiskStore } from './store.js';

/** The structured fail-closed reasons — a non-distinct, unknown-endpoint, unauthorized, OR unratified link
 *  never lands. */
const REJECTED_SAME = 'sameAs requires two distinct nodes';
const REJECTED_UNAUTHORIZED = 'unauthorized: actor not in scope of both nodes (KNOW-11)';
const REJECTED_UNRATIFIED =
  'unratified: a sameAs link requires a ratifier, and the billy token when either endpoint is T0 (KNOW-8)';
const REJECTED_UNVERIFIABLE =
  'unverifiable endpoint: a linked node\'s stored fact is not readable from CAS, so its governance class ' +
  'cannot be confirmed — refused fail-closed';
const unknownNode = (key: string): string => `unknown node: ${key} not in the current projection`;

/** What the governed link leg is composed over: the durable CAS store (fact read-back + persist), the admin
 *  policy (authz scopes), the actor identity, and the env-sourced ratify token — the SAME channels as emit. */
export interface GovernedLinkDeps {
  readonly store: DiskStore;
  readonly policy: AtlasPolicy;
  readonly actor: string;
  /** The ratify token authorizing a governed sameAs assertion. Env-sourced by the composition root
   *  (`ATLAS_RATIFY_TOKEN`), threaded EXACTLY like `actor` — NEVER read from a payload. ABSENT ⇒ `''` ⇒ the
   *  link fails closed (unratified). It runs the SAME KNOW-8 `ratify` law emit runs, over the JOIN of the two
   *  endpoints' tiers — so a link touching a `T0` node requires `billy` exactly as a `T0` emit does. */
  readonly ratifyToken?: string;
}

/** The stored fact behind a current node — read back from CAS by content address (the CAS bytes ARE the
 *  fact). `undefined` when the bytes are absent (pruned CAS / partial restore), which every caller treats
 *  as fail-closed: an endpoint whose governance class cannot be READ is never linked on trust. */
function storedFact(deps: GovernedLinkDeps, node: CurrentNode): GroundedFact | undefined {
  return deps.store.get(node.contentHash as unknown as Hash) as GroundedFact | undefined;
}

/**
 * Build the GOVERNED sameAs link leg. The returned `link(a, b)` runs the four fail-closed gates (distinct →
 * both-known → authz-on-both → ratifier), then applies the pure `linkSameAs` reducer and persists the
 * projection. On any gate failure it returns `{linked:false, rejected}` and persists NOTHING. Pure of
 * clock/random given a pure store/policy.
 */
export function createGovernedLink(deps: GovernedLinkDeps): { readonly link: (a: string, b: string) => LinkOut } {
  const link = (a: string, b: string): LinkOut => {
    // 1. DISTINCT — a node never names itself.
    if (a === b) return { linked: false, rejected: REJECTED_SAME };

    // 2. BOTH KNOWN — resolve both endpoints against the rehydrated projection; an absent one is refused.
    const proj = rehydrateProjection(deps.store);
    const nodeA = proj.current.get(a);
    if (nodeA === undefined) return { linked: false, rejected: unknownNode(a) };
    const nodeB = proj.current.get(b);
    if (nodeB === undefined) return { linked: false, rejected: unknownNode(b) };

    // 2.5 CLASS READ-BACK — both endpoints' stored facts, the source of BOTH remaining gates. An endpoint
    //     whose bytes are gone has an unknowable scope AND an unknowable tier, so it is refused outright
    //     rather than defaulted (the same fail-closed stance `governed-emit.ts`'s incumbent guard takes).
    const factA = storedFact(deps, nodeA);
    const factB = storedFact(deps, nodeB);
    if (factA === undefined || factB === undefined) {
      return { linked: false, rejected: REJECTED_UNVERIFIABLE };
    }

    // 3. AUTHZ (KNOW-11) — the actor must be in the scope of BOTH endpoints' facts.
    if (!actorInScope(deps.policy, deps.actor, factA.scope) || !actorInScope(deps.policy, deps.actor, factB.scope)) {
      return { linked: false, rejected: REJECTED_UNAUTHORIZED };
    }

    // 4. RATIFY (KNOW-8) — the SAME law emit runs, over the JOIN of the two endpoints' tiers. Composed, not
    //    re-implemented: `ratify` refuses an empty token and refuses a non-`billy` ratifier on a `T0` class.
    //    The join is what closes the side door — linking a T2 node to a T0 node is a T0 act, so it cannot be
    //    signed by a ratifier who could not have written the T0 node directly.
    const linkClass = strictestTier(factA.tier, factB.tier);
    const staged = stage({ tier: linkClass } as unknown as Candidate);
    if (!ratify(staged, { by: deps.ratifyToken ?? '' }).committed) {
      return { linked: false, rejected: REJECTED_UNRATIFIED };
    }

    // 5. APPLY + PERSIST — the pure symmetric reducer, then the durable projection sidecar.
    const next = linkSameAs(proj, a, b);
    deps.store.persistProjection(next);
    return { linked: true, a, b };
  };
  return { link };
}
