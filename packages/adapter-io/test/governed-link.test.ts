// @atlas/adapter-io — test/governed-link.test.ts  (WP-SAMEAS — the governed sameAs write door)
//
// The SECOND governed write door had NO unit test: it was covered only end-to-end (s16-sameas.blackbox),
// which exercises the happy path through a real CLI and cannot plant a gate-level mutant. A governed write
// door with no gate-level teeth is a door nobody can prove is shut, so these cases pin all five gates with a
// fake DiskStore + a literal policy, each with the mutant it kills named.
//
// The tier gate (task #84) is the one that was DEFERRED here while emit ran it: a `sameAs` was signed by any
// non-empty ratifier even when an endpoint was a billy-ratified `T0` node. `sameAs` being non-destructive was
// the reason given, but "non-destructive" is not "ungoverned" — the edge is symmetric and read-side folds
// walk it, so a link is a way to reach a T0 node. The door now runs the SAME KNOW-8 law emit runs, over the
// JOIN of the two endpoints' tiers.

import { describe, it, expect } from 'vitest';
import { id, asNodeKey, asSubtreeHash } from '@atlas/kernel';
import type { CasObject } from '@atlas/kernel';
import type { GroundedFact, StoreProjection, CurrentNode } from '@atlas/knowledge';
import { createGovernedLink } from '../src/governed-link.js';
import type { DiskStore } from '../src/store.js';
import type { AtlasPolicy } from '../src/policy.js';

// ── fixture ──────────────────────────────────────────────────────────────────────────────────────────

/** A grounded advisory fact at a given scope/tier — the CAS bytes a projection node points at. */
function fact(opts: { claim: string; scope: string; tier: GroundedFact['tier'] }): GroundedFact {
  return {
    kind: 'advisory',
    id: asNodeKey(`nk-${opts.claim}`),
    tier: opts.tier,
    claimNorm: opts.claim,
    grounding: {
      entries: [{ anchor: { kind: 'symbol', qualifiedPath: `src/${opts.claim}.ts::f`, subtreeHash: asSubtreeHash('sh') }, path: 'src' }],
    },
    freshness: 'FRESH',
    claims: [],
    authoring: 'ADVISORY',
    scope: opts.scope,
  };
}

interface LinkFixture {
  readonly store: DiskStore;
  readonly persists: () => readonly StoreProjection[];
}

/** A store whose projection holds one current node per supplied fact, keyed `n0`, `n1`, … with the fact's
 *  real content address — so the door's CAS read-back resolves exactly the fact under test.
 *
 *  `edges` seeds STORED `sameAs` peers on those nodes (`{ n0: ['nRETIRED'] }`). A peer that is not itself a
 *  current node is not a malformed fixture: `linkSameAs` writes the edge onto BOTH endpoints, and a node
 *  superseded afterwards leaves its peer's stored edge pointing at a key the projection no longer carries.
 *  That is the shape the class-join below has to survive, and no earlier case here produced it. */
function fixture(facts: readonly GroundedFact[], edges: Readonly<Record<string, readonly string[]>> = {}): LinkFixture {
  const cas = new Map<string, CasObject>();
  const current = new Map<string, CurrentNode>();
  facts.forEach((f, i) => {
    const h = id(f as CasObject) as unknown as string;
    cas.set(h, f as CasObject);
    const key = `n${i}`;
    const sameAs = edges[key];
    current.set(key, { nodeKey: key, family: 'advisory', contentHash: h, claims: [f.claimNorm], ...(sameAs ? { sameAs } : {}) });
  });
  const persists: StoreProjection[] = [];
  const projection: StoreProjection = { current, cas: new Set(cas.keys()) };
  return {
    store: {
      put(obj) {
        const h = id(obj);
        cas.set(h as unknown as string, obj);
        return h;
      },
      get: (h) => cas.get(h as unknown as string),
      persistProjection: (p) => void persists.push(p),
      loadProjection: () => (persists.length > 0 ? persists[persists.length - 1] : projection),
    },
    persists: () => persists,
  };
}

/** alice owns `core`; mallory owns `other`. */
const POLICY: AtlasPolicy = {
  nearDup: { claimNormThreshold: 1 },
  t0Heuristic: { keywords: [] },
  authz: { scopes: { core: ['alice'], other: ['mallory'] } },
};

const T2_A = fact({ claim: 'alpha', scope: 'core', tier: 'T2' });
const T2_B = fact({ claim: 'beta', scope: 'core', tier: 'T2' });
const T0_C = fact({ claim: 'gamma', scope: 'core', tier: 'T0' });

// ── cases ────────────────────────────────────────────────────────────────────────────────────────────

describe('WP-SAMEAS — createGovernedLink (distinct · both-known · class read-back · authz · KNOW-8 ratify)', () => {
  it('SCN-GL-1 — a node never names itself', () => {
    const fx = fixture([T2_A, T2_B]);
    const { link } = createGovernedLink({ store: fx.store, policy: POLICY, actor: 'alice', ratifyToken: 'lead' });
    const out = link('n0', 'n0');
    expect(out.linked).toBe(false);
    expect(out.rejected ?? '').toContain('distinct');
    expect(fx.persists()).toHaveLength(0);
  });

  it('SCN-GL-2 — an endpoint absent from the projection is refused (no dangling assertion)', () => {
    const fx = fixture([T2_A, T2_B]);
    const { link } = createGovernedLink({ store: fx.store, policy: POLICY, actor: 'alice', ratifyToken: 'lead' });
    const out = link('n0', 'n-nope');
    expect(out.linked).toBe(false);
    expect(out.rejected ?? '').toContain('unknown node');
    expect(fx.persists()).toHaveLength(0);
  });

  it('SCN-GL-3 — an actor outside EITHER endpoint\'s scope is denied (KNOW-11, both endpoints)', () => {
    const fx = fixture([T2_A, T2_B]);
    // mallory owns `other`; both endpoints live in `core`.
    const { link } = createGovernedLink({ store: fx.store, policy: POLICY, actor: 'mallory', ratifyToken: 'lead' });
    const out = link('n0', 'n1');
    expect(out.linked).toBe(false);
    expect(out.rejected ?? '').toContain('unauthorized');
    // TEETH: drop EITHER half of the both-endpoints authz check and a one-sided actor links across scopes.
    expect(fx.persists()).toHaveLength(0);
  });

  it('SCN-GL-4 — no ratifier token ⇒ refused, nothing persisted', () => {
    const fx = fixture([T2_A, T2_B]);
    const { link } = createGovernedLink({ store: fx.store, policy: POLICY, actor: 'alice' });
    const out = link('n0', 'n1');
    expect(out.linked).toBe(false);
    expect(out.rejected ?? '').toContain('unratified');
    expect(fx.persists()).toHaveLength(0);
  });

  it('SCN-GL-5 — two T2 endpoints + any ratifier ⇒ linked SYMMETRICALLY and persisted', () => {
    const fx = fixture([T2_A, T2_B]);
    const { link } = createGovernedLink({ store: fx.store, policy: POLICY, actor: 'alice', ratifyToken: 'lead' });
    const out = link('n0', 'n1');
    expect(out.linked).toBe(true);
    expect(fx.persists()).toHaveLength(1);
    const next = fx.persists()[0]!;
    // symmetric: the edge is readable from EITHER end (the union-find read fold is local from either side).
    expect(next.current.get('n0')!.sameAs).toContain('n1');
    expect(next.current.get('n1')!.sameAs).toContain('n0');
  });

  // ── THE TIER GATE (task #84) — the deferral this door carried while emit ran the same law ──────────────
  // MUTANT: replace the `ratify(stage({tier: strictestTier(...)}))` call with the old non-empty-token check
  // and SCN-GL-6 goes RED — a 'lead' token links a billy-ratified T0 node.

  it('SCN-GL-6 — a link touching a T0 endpoint requires BILLY, not merely a ratifier', () => {
    const fx = fixture([T2_A, T0_C]);
    // A generic ratifier is enough for a T2↔T2 link (SCN-GL-5) but NOT once an endpoint is T0: the join of
    // the two classes is T0, and a T0 act is billy's. Otherwise the T2 endpoint is a side door onto the T0 one.
    const lead = createGovernedLink({ store: fx.store, policy: POLICY, actor: 'alice', ratifyToken: 'lead' });
    const refused = lead.link('n0', 'n1');
    expect(refused.linked).toBe(false);
    expect(refused.rejected ?? '').toContain('unratified');
    expect(fx.persists()).toHaveLength(0);

    const billy = createGovernedLink({ store: fx.store, policy: POLICY, actor: 'alice', ratifyToken: 'billy' });
    expect(billy.link('n0', 'n1').linked).toBe(true);
    expect(fx.persists()).toHaveLength(1);
  });

  // ── THE TRANSITIVE CLASS (billy F3) — gating the EDGE is not gating the BOUNDARY ──────────────────────
  //
  // `deriveSameAs` folds the relation with a union-find, so it is TRANSITIVE. Joining only the two endpoints'
  // tiers gated one edge of a graph whose reachability the link was extending: billy legitimately equates a
  // T0 node with a T2 node, and afterwards ANY in-scope actor with ANY non-empty ratifier links that T2 node
  // to their own — landing inside the T0 node's equivalence class with no billy signature. Reproduced.
  //
  // MUTANT: revert the join to `strictestTier(factA.tier, factB.tier)` over the two endpoints and this
  // goes RED while every other case here stays green.

  it('SCN-GL-8 — the T0 class cannot be joined via a TWO-HOP link through a T2 node', () => {
    const fx = fixture([T2_A, T0_C, T2_B]); // n0 = T2, n1 = T0, n2 = the attacker's own T2 node
    // 1) billy legitimately equates the T2 node n0 with the T0 node n1. This link is correct and allowed.
    const billy = createGovernedLink({ store: fx.store, policy: POLICY, actor: 'alice', ratifyToken: 'billy' });
    expect(billy.link('n0', 'n1').linked).toBe(true);

    // 2) the attack: link n2 to n0. Both ENDPOINTS are T2, so an endpoint-only join reads this as a T2 act —
    //    but n0 is now in n1's class, so the link puts n2 inside the T0 class.
    const lead = createGovernedLink({ store: fx.store, policy: POLICY, actor: 'alice', ratifyToken: 'lead' });
    const out = lead.link('n2', 'n0');
    expect(out.linked).toBe(false);
    expect(out.rejected ?? '').toContain('unratified');

    // …and billy CAN sign it, because the act is honestly a T0 act, not because it is forbidden.
    expect(billy.link('n2', 'n0').linked).toBe(true);
  });

  it('SCN-GL-9 — an OFF-LATTICE tier on an endpoint cannot DILUTE the join (fails closed to T0)', () => {
    // billy F1 reaches this door too: `strictestTier` returning the *other* argument on garbage would let a
    // node declassified with `tier:'T3'` be linked by anyone. An unreadable-or-bogus class must read T0.
    const bogus = { ...fact({ claim: 'delta', scope: 'core', tier: 'T2' }), tier: 'T3' } as unknown as GroundedFact;
    const fx = fixture([T2_A, bogus]);
    const lead = createGovernedLink({ store: fx.store, policy: POLICY, actor: 'alice', ratifyToken: 'lead' });
    expect(lead.link('n0', 'n1').linked).toBe(false);
    expect(createGovernedLink({ store: fx.store, policy: POLICY, actor: 'alice', ratifyToken: 'billy' }).link('n0', 'n1').linked).toBe(true);
  });

  it('SCN-GL-7 — an endpoint whose stored fact is unreadable fails closed (class never assumed)', () => {
    const fx = fixture([T2_A, T2_B]);
    const blind: DiskStore = { ...fx.store, get: () => undefined };
    const { link } = createGovernedLink({ store: blind, policy: POLICY, actor: 'alice', ratifyToken: 'billy' });
    const out = link('n0', 'n1');
    expect(out.linked).toBe(false);
    // TEETH: previously an unreadable fact degraded to `undefined` scope and was reported merely
    // "unauthorized" — which reads as a policy problem an admin would try to fix by GRANTING a scope.
    expect(out.rejected ?? '').toContain('unverifiable');
    expect(fx.persists()).toHaveLength(0);
  });

  // ── ONE-SIDED BLINDNESS — the read-back gate is a DISJUNCTION, and only its `&&` collapse was tested ───
  //
  // SCN-GL-7 blinds the WHOLE store (`get: () => undefined`), so BOTH endpoints are unreadable at once —
  // the one input on which `factA === undefined || factB === undefined` and `factA === undefined &&
  // factB === undefined` agree. Flipping that `||` to `&&` therefore left the suite green, while the
  // realistic failure is exactly the asymmetric one: CAS is content-addressed, so a prune, a partial
  // restore or a half-fetched pack drops SOME objects, never all of them. Under the `&&` the door then
  // walks past the gate holding an `undefined` fact and dereferences it at the authz gate.
  //
  // MUTANT: `factA === undefined && factB === undefined` and BOTH cases below go RED.

  it('SCN-GL-10 — endpoint A readable, endpoint B blind ⇒ still unverifiable, and the door never throws', () => {
    const fx = fixture([T2_A, T2_B]);
    const hB = id(T2_B as CasObject) as unknown as string; // the ONE object the store has lost
    const halfBlind: DiskStore = { ...fx.store, get: (h) => ((h as unknown as string) === hB ? undefined : fx.store.get(h)) };
    const { link } = createGovernedLink({ store: halfBlind, policy: POLICY, actor: 'alice', ratifyToken: 'billy' });

    // TOTALITY FIRST: a write door reports a rejection, it does not throw. Under the `&&` mutant the
    // unreadable fact survives the gate and `factB.scope` is a TypeError at the authz line below it.
    expect(() => link('n0', 'n1')).not.toThrow();
    const out = link('n0', 'n1');
    expect(out.linked).toBe(false);
    expect(out.rejected ?? '').toContain('unverifiable');
    expect(fx.persists()).toHaveLength(0);
  });

  it('SCN-GL-11 — endpoint A blind, endpoint B readable ⇒ identically refused (the gate is symmetric)', () => {
    const fx = fixture([T2_A, T2_B]);
    const hA = id(T2_A as CasObject) as unknown as string;
    const halfBlind: DiskStore = { ...fx.store, get: (h) => ((h as unknown as string) === hA ? undefined : fx.store.get(h)) };
    const { link } = createGovernedLink({ store: halfBlind, policy: POLICY, actor: 'alice', ratifyToken: 'billy' });

    expect(() => link('n0', 'n1')).not.toThrow();
    const out = link('n0', 'n1');
    expect(out.linked).toBe(false);
    expect(out.rejected ?? '').toContain('unverifiable');
    expect(fx.persists()).toHaveLength(0);
  });

  // ── THE CLASS JOIN OVER A NON-CURRENT MEMBER — over-blocking is a failure mode too ────────────────────
  //
  // `sameAsClassOf` is DELIBERATELY wider than the read fold: it keeps dangling peers, because a retired
  // key is how two live nodes can belong to one governed class (SCN-SA-4 in wp-sameas.test.ts). So the
  // join below iterates keys that are NOT current nodes, and it must skip them: everything reachable
  // THROUGH a retired peer is itself in `merged` and priced on its own stored class, while the retired key
  // has no readable class, is served by no read fold, and is nobody's governance weight.
  //
  // MUTANT: `if (member === undefined) return 'T0';` and this goes RED — every link involving a node that
  // ever had a peer retired would demand billy forever. That is not "fail-closed", it is a gate that says
  // no to the legitimate case, which is how a governance gate gets routed around.

  it('SCN-GL-9b — a RETIRED peer in the class contributes NO class of its own (the join does not over-block)', () => {
    const fx = fixture([T2_A, T2_B], { n0: ['nRETIRED'] }); // n0 keeps a stored edge to a superseded node
    const lead = createGovernedLink({ store: fx.store, policy: POLICY, actor: 'alice', ratifyToken: 'lead' });
    const out = lead.link('n0', 'n1');
    expect(out.linked).toBe(true); // T2 ∨ T2 ∨ (nothing) = T2 ⇒ any ratifier signs it
    expect(fx.persists()).toHaveLength(1);
  });

  it('SCN-GL-9c — …while a LIVE T0 member reached THROUGH that retired peer still forces billy', () => {
    // The control that keeps SCN-GL-9b from being a licence to under-price: the retired key BRIDGES n0 to
    // the T0 node n2, so n2 is in the merged class, is a current node, and is priced off its OWN stored
    // fact. Skipping the unreadable member costs nothing precisely because the members that matter are
    // still there. MUTANT: revert the join to the two endpoints and this goes RED (n0/n1 are both T2).
    const fx = fixture([T2_A, T2_B, T0_C], { n0: ['nRETIRED'], n2: ['nRETIRED'] });
    const lead = createGovernedLink({ store: fx.store, policy: POLICY, actor: 'alice', ratifyToken: 'lead' });
    expect(lead.link('n0', 'n1').linked).toBe(false);
    expect(fx.persists()).toHaveLength(0);
    const billy = createGovernedLink({ store: fx.store, policy: POLICY, actor: 'alice', ratifyToken: 'billy' });
    expect(billy.link('n0', 'n1').linked).toBe(true);
  });
});
