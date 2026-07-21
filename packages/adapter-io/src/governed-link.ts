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
//   4. RATIFY       — a sameAs assertion is a governed shared-truth mutation, so it requires a NON-EMPTY
//                     ratifier (mirrors emit's full-ratify token). The token is env-sourced by the
//                     composition root (`ATLAS_RATIFY_TOKEN`) — NEVER a payload field (the spoof-guard).
// Only after all four does it `linkSameAs` the projection and `persistProjection` it durably.
//
// Pure of clock/random: no wall-clock, no nonce, no counter enters the decision. Composes OVER the frozen
// core (`@atlas/knowledge` linkSameAs, the `@atlas/tools` `LinkOut` result, the authz seam) — re-implements
// none. DAG: adapter-io depends on knowledge + tools; `LinkOut` is imported FROM tools (never the reverse).

import type { Hash } from '@atlas/contracts';
import { linkSameAs } from '@atlas/knowledge';
import type { CurrentNode, GroundedFact } from '@atlas/knowledge';
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
  'unratified: sameAs link requires a non-empty ratifier (v1; the T0→billy tier gate emit runs is deferred — sameAs is non-destructive)';
const unknownNode = (key: string): string => `unknown node: ${key} not in the current projection`;

/** What the governed link leg is composed over: the durable CAS store (fact read-back + persist), the admin
 *  policy (authz scopes), the actor identity, and the env-sourced ratify token — the SAME channels as emit. */
export interface GovernedLinkDeps {
  readonly store: DiskStore;
  readonly policy: AtlasPolicy;
  readonly actor: string;
  /** The ratify token authorizing a governed sameAs assertion. Env-sourced by the composition root
   *  (`ATLAS_RATIFY_TOKEN`), threaded EXACTLY like `actor` — NEVER read from a payload. ABSENT ⇒ `''` ⇒ the
   *  link fails closed (unratified). v1 SCOPE: this is a NON-EMPTY check only — it does NOT run emit's
   *  tier-graded KNOW-8 ratification (a T0 fact's `by === 'billy'` requirement). Deferred deliberately because
   *  `sameAs` is NON-DESTRUCTIVE (a derived read-side edge, never a fact merge — see adr-tools1-governed-write-doors.md). */
  readonly ratifyToken?: string;
}

/** Is `actor` authorized to write the SCOPE of `node`'s fact? Reads the whole fact back from CAS by its
 *  content address (the CAS bytes ARE the fact) and gates on `fact.scope` via `actorInScope` — the identical
 *  KNOW-11 seam `governed-emit.ts` uses. A missing fact / absent scope ⇒ no scope ⇒ denied (fail-closed). */
function actorAuthorizedFor(deps: GovernedLinkDeps, node: CurrentNode): boolean {
  const fact = deps.store.get(node.contentHash as unknown as Hash) as GroundedFact | undefined;
  return actorInScope(deps.policy, deps.actor, fact?.scope);
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

    // 3. AUTHZ (KNOW-11) — the actor must be in the scope of BOTH nodes' facts (read back from CAS).
    if (!actorAuthorizedFor(deps, nodeA) || !actorAuthorizedFor(deps, nodeB)) {
      return { linked: false, rejected: REJECTED_UNAUTHORIZED };
    }

    // 4. RATIFY — a governed shared-truth mutation requires a NON-EMPTY ratifier (env-sourced). v1: a
    //    non-empty check only, NOT emit's tier-graded KNOW-8 gate (T0→billy) — deferred, sameAs is non-destructive.
    if ((deps.ratifyToken ?? '').length === 0) {
      return { linked: false, rejected: REJECTED_UNRATIFIED };
    }

    // 5. APPLY + PERSIST — the pure symmetric reducer, then the durable projection sidecar.
    const next = linkSameAs(proj, a, b);
    deps.store.persistProjection(next);
    return { linked: true, a, b };
  };
  return { link };
}
