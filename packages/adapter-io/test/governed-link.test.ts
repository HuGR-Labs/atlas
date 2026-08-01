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
 *  real content address — so the door's CAS read-back resolves exactly the fact under test. */
function fixture(facts: readonly GroundedFact[]): LinkFixture {
  const cas = new Map<string, CasObject>();
  const current = new Map<string, CurrentNode>();
  facts.forEach((f, i) => {
    const h = id(f as CasObject) as unknown as string;
    cas.set(h, f as CasObject);
    current.set(`n${i}`, { nodeKey: `n${i}`, family: 'advisory', contentHash: h, claims: [f.claimNorm] });
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
});
