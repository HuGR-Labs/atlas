// @atlas/adapter-io — test/governed-emit.test.ts  (COMPOSE-A — the governed durable emit leg)
//
// The governed write door persists DURABLY only through three fail-closed gates, in order: the GROUND
// truth-gate, the KNOW-11 owner-scoped authz gate, then the KNOW-15 upsert + durable persist (projection
// sidecar + the whole fact into CAS). These cases pin each gate with a FAKE DiskStore + FAKE gate + a
// literal policy, and the teeth are wired so removing any one governed step flips a golden RED:
//   - drop the authz check      → the unauthorized golden RED (a denied write would persist).
//   - drop `store.put(node)`    → the read-back golden RED (the CAS bytes ARE the fact — invariant 6).
//   - drop `persistProjection`  → the durability golden RED (no projection persisted).

import { describe, it, expect } from 'vitest';
import { id, asNodeKey, asSubtreeHash, asHash } from '@atlas/kernel';
import type { CasObject } from '@atlas/kernel';
import type { GroundedFact, StoreProjection } from '@atlas/knowledge';
import type { TruthGate } from '@atlas/tools';
import { createGovernedEmit } from '../src/governed-emit.js';
import type { DiskStore } from '../src/store.js';
import type { AtlasPolicy } from '../src/policy.js';

// ── fakes ────────────────────────────────────────────────────────────────────────────────────────────

/** A fake DiskStore over an in-memory CAS that RECORDS every `put`/`persistProjection` so the teeth can
 *  assert exactly what the governed path persisted (or, on a denied write, that NOTHING was persisted). */
interface StoreSpy {
  readonly store: DiskStore;
  readonly puts: () => readonly CasObject[];
  readonly persists: () => readonly StoreProjection[];
}
function makeStoreSpy(): StoreSpy {
  const cas = new Map<string, CasObject>();
  const puts: CasObject[] = [];
  const persists: StoreProjection[] = [];
  const store: DiskStore = {
    put(obj) {
      puts.push(obj);
      const h = id(obj);
      cas.set(h as unknown as string, obj);
      return h;
    },
    get(h) {
      return cas.get(h as unknown as string);
    },
    persistProjection(p) {
      persists.push(p);
    },
    loadProjection() {
      return persists.length > 0 ? persists[persists.length - 1] : undefined;
    },
  };
  return { store, puts: () => puts, persists: () => persists };
}

const HOLDS_GATE: TruthGate = { gateHolds: () => 'HOLDS' };
const NA_GATE: TruthGate = { gateHolds: () => 'NA' };

/** A policy granting actor `alice` write access to scope `core` — everyone else / every other scope denies. */
const POLICY: AtlasPolicy = {
  nearDup: { claimNormThreshold: 1 },
  t0Heuristic: { keywords: [] },
  authz: { scopes: { core: ['alice'] } },
};

/** A grounded advisory fact; `scope` present only when supplied (exactOptionalPropertyTypes-safe). */
function advisory(scope?: string): GroundedFact {
  const base = {
    kind: 'advisory' as const,
    id: asNodeKey('nk-governed-1'),
    tier: 'T2' as const,
    claimNorm: 'a governed claim body',
    grounding: {
      entries: [
        { anchor: { kind: 'symbol' as const, qualifiedPath: 'src/util.ts::greet', subtreeHash: asSubtreeHash('sh-greet') }, path: 'src/util.ts' },
      ],
    },
    freshness: 'FRESH' as const,
    claims: [],
    authoring: 'ADVISORY' as const,
  };
  return scope === undefined ? base : { ...base, scope };
}

const AT = asHash('deadbeef');

// ── cases ──────────────────────────────────────────────────────────────────────────────────────────

describe('COMPOSE-A — createGovernedEmit (truth-door · authz · upsert · durable persist)', () => {
  it('SCN-GE-1 — gate NOT HOLDS ⇒ emitted:false, NOTHING persisted (truth door)', () => {
    const spy = makeStoreSpy();
    const { emit } = createGovernedEmit({ store: spy.store, gate: NA_GATE, policy: POLICY, actor: 'alice' });
    const out = emit(advisory('core'), AT);
    expect(out.emitted).toBe(false);
    expect(out.rejected ?? '').toContain('ungrounded');
    // teeth: the truth door short-circuits BEFORE any write — nothing put, nothing persisted.
    expect(spy.puts()).toHaveLength(0);
    expect(spy.persists()).toHaveLength(0);
  });

  it('SCN-GE-2 — gate HOLDS but actor NOT in fact scope ⇒ unauthorized, NOTHING persisted (authz)', () => {
    const spy = makeStoreSpy();
    // alice is granted `core`, but the fact is scoped to `secret` — the authz gate must deny.
    const { emit } = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: 'alice' });
    const out = emit(advisory('secret'), AT);
    expect(out.emitted).toBe(false);
    expect(out.rejected ?? '').toContain('unauthorized');
    // TEETH — drop the authz check and this write would persist: assert NOTHING did.
    expect(spy.puts()).toHaveLength(0);
    expect(spy.persists()).toHaveLength(0);
  });

  it('SCN-GE-3 — HOLDS + authorized ⇒ emitted:true, projection persisted + node in CAS + re-readable (invariant 6)', () => {
    const spy = makeStoreSpy();
    const { emit } = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: 'alice' });
    const node = advisory('core');
    const out = emit(node, AT);

    expect(out.emitted).toBe(true);
    expect(out.id).toBeDefined();
    const contentHash = out.id!;
    // it is the content id of the persisted fact (the sealed kernel seam).
    expect(contentHash).toBe(id(node as CasObject));

    // TEETH — durability golden: drop `persistProjection` and this flips (no projection persisted).
    expect(spy.persists()).toHaveLength(1);
    // TEETH — read-back golden (invariant 6): drop `store.put(node)` and this flips (get ⇒ undefined).
    expect(spy.puts()).toHaveLength(1);
    expect(spy.store.get(contentHash)).toEqual(node);
  });

  it('SCN-GE-4 — empty ATLAS_ACTOR ⇒ denied fail-closed (no actor is in any scope)', () => {
    const spy = makeStoreSpy();
    const { emit } = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: '' });
    const out = emit(advisory('core'), AT);
    expect(out.emitted).toBe(false);
    expect(out.rejected ?? '').toContain('unauthorized');
    expect(spy.puts()).toHaveLength(0);
    expect(spy.persists()).toHaveLength(0);
  });
});
