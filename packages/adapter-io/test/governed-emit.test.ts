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
import { id } from '@atlas/kernel';
import type { CasObject } from '@atlas/kernel';
import type { GroundedFact, StoreProjection } from '@atlas/knowledge';
import { createGovernedEmit } from '../src/governed-emit.js';
import type { DiskStore } from '../src/store.js';
import { makeStoreSpy, HOLDS_GATE, NA_GATE, POLICY, advisory, mkAdvisory, predicate, realKey, AT } from './harness/governed-fixtures.js';

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

  it('SCN-GE-5 — put-before-persist crash-safety: a failing `put` NEVER persists the projection (no dangling ref)', () => {
    const persists: StoreProjection[] = [];
    const throwingStore: DiskStore = {
      put() {
        throw new Error('EIO: disk full'); // CAS write fails mid-emit (authorized + grounded fact)
      },
      get() {
        return undefined;
      },
      persistProjection(p) {
        persists.push(p);
      },
      loadProjection() {
        return persists.length > 0 ? persists[persists.length - 1] : undefined;
      },
    };
    const { emit } = createGovernedEmit({ store: throwingStore, gate: HOLDS_GATE, policy: POLICY, actor: 'alice' });
    // `put` runs BEFORE `persistProjection`, so a CAS-write failure throws before the sidecar is written.
    expect(() => emit(advisory('core'), AT)).toThrow();
    // TEETH — reverse the order (persistProjection before put) and this flips RED: the sidecar would be
    // persisted referencing a contentHash whose bytes never landed in CAS (a dangling reference).
    expect(persists).toHaveLength(0);
  });

  // ── INTEGRITY: the write door MINTS routing identity, it NEVER trusts the author payload `node.id` ──────
  // The dedup/routing `nodeKey` is recomputed from CONTENT (frozen `nodeKey(node)` = anchor+slot[+check]).
  // Both teeth kill the SAME mutant — `nodeKey: node.id` (trusting the author-supplied payload id for
  // routing): with that mutant, two payloads with different `id`s can never collide (SCN-GE-6 goes RED), and
  // a spoofed `id` hijacks an unrelated node (SCN-GE-7 goes RED).

  it('SCN-GE-6 — DIFFERENT payload `id`, SAME real identity ⇒ ONE node, claims set-union (minted, not trusted)', () => {
    const spy = makeStoreSpy();
    const { emit } = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: 'alice' });
    // Same anchor (⇒ same real advisory nodeKey), DIFFERENT author-declared payload `id`, different claim body.
    const f1 = mkAdvisory({ id: 'author-picked-AAAA', anchor: 'src/util.ts::greet', claimNorm: 'claim one', scope: 'core' });
    const f2 = mkAdvisory({ id: 'author-picked-BBBB', anchor: 'src/util.ts::greet', claimNorm: 'claim two', scope: 'core' });
    // PREMISE: distinct payload ids, but the REAL minted identity collides.
    expect(f1.id).not.toBe(f2.id);
    expect(realKey(f1)).toBe(realKey(f2));

    expect(emit(f1, AT).emitted).toBe(true);
    expect(emit(f2, AT).emitted).toBe(true);

    const projection = spy.persists()[spy.persists().length - 1]!; // the final durable projection
    // TEETH (kills `nodeKey: node.id`): identity is minted ⇒ f2 UPDATES f1's ONE node, not a second node.
    expect(projection.current.size).toBe(1);
    const node = projection.current.get(realKey(f1))!;
    expect(node.claims).toContain('claim one');
    expect(node.claims).toContain('claim two'); // set-union in place ⇒ a real collision, not a DEDUP no-op
  });

  it('SCN-GE-7 — payload `id` spoofing an unrelated node does NOT hijack it (identity minted from content)', () => {
    const spy = makeStoreSpy();
    const { emit } = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: 'alice' });
    // 1) An honest node X lands at its real identity.
    const nodeX = mkAdvisory({ id: 'x-declared', anchor: 'src/util.ts::greet', claimNorm: 'honest X claim', scope: 'core' });
    expect(emit(nodeX, AT).emitted).toBe(true);
    const keyX = realKey(nodeX);

    // 2) An attacker fact at a DIFFERENT anchor sets its payload `id` = X's real nodeKey to try to hijack X.
    const attacker = mkAdvisory({ id: keyX, anchor: 'src/evil.ts::pwn', claimNorm: 'HIJACKED', scope: 'core' });
    expect(attacker.id as unknown as string).toBe(keyX); // the spoof is armed
    expect(realKey(attacker)).not.toBe(keyX); // but its MINTED identity is its own, not X's
    expect(emit(attacker, AT).emitted).toBe(true);

    const projection = spy.persists()[spy.persists().length - 1]!;
    // TEETH (kills `nodeKey: node.id`): routing on the minted key ⇒ the attacker gets its OWN node; X untouched.
    expect(projection.current.size).toBe(2);
    expect(projection.current.get(keyX)!.claims).toEqual(['honest X claim']); // X NOT hijacked
    expect(projection.current.get(keyX)!.claims).not.toContain('HIJACKED');
  });

  // ── RATIFY GATE (KNOW-8 / KNOW-18): the tier-ratification machinery composed BETWEEN authz and upsert ─────
  // MUTANT (N7 — the finding): the door was truth-gate → authz → upsert ONLY; the `route`/`ratify` block was
  // NEVER composed, so a T0 fact bypassed the human+billy gate at the write door. DELETE the `route(...)===
  // 'full-ratify' ⇒ ratify(...)` block (restore the pre-N7 door) and SCN-GE-R2/R4/R5 all go RED: a T0 (or a
  // non-billy-ratified) fact would PERSIST. SCN-GE-R1/R3 pin that the fix does NOT over-block the common path.

  it('SCN-GE-R1 — a grounded T2 ADVISORY fast-paths (auto-accept): emits with NO ratify token (common path unbroken)', () => {
    const spy = makeStoreSpy();
    // No `ratifyToken` supplied at all — the fast-path (grounded ∧ lowRisk ∧ T2 ∧ advisory ∧ ¬contested)
    // never consults it. This is the existing common case; wiring ratify MUST NOT break it.
    const { emit } = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: 'alice' });
    const out = emit(advisory('core'), AT); // tier defaults T2
    expect(out.emitted).toBe(true);
    expect(spy.puts()).toHaveLength(1);
    expect(spy.persists()).toHaveLength(1);
  });

  it('SCN-GE-R2 — a T0 fact with NO ratify token ⇒ REJECTED fail-closed, NOTHING persisted (KNOW-8)', () => {
    const spy = makeStoreSpy();
    // Grounded + authorized, but T0 ⇒ route=full-ratify; absent token ⇒ ratify refuses. Kills the missing-
    // ratify-composition mutant: pre-N7 this T0 fact would have persisted through the authz→upsert door.
    const { emit } = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: 'alice' });
    const out = emit(advisory('core', 'T0'), AT);
    expect(out.emitted).toBe(false);
    expect(out.rejected ?? '').toContain('unratified');
    expect(spy.puts()).toHaveLength(0);
    expect(spy.persists()).toHaveLength(0);
  });

  it('SCN-GE-R3 — a T0 fact WITH the billy token ⇒ emits (the human/security gate signs)', () => {
    const spy = makeStoreSpy();
    const { emit } = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: 'alice', ratifyToken: 'billy' });
    const node = advisory('core', 'T0');
    const out = emit(node, AT);
    expect(out.emitted).toBe(true);
    expect(spy.persists()).toHaveLength(1);
    expect(spy.puts()).toHaveLength(1);
    expect(spy.store.get(out.id!)).toEqual(node); // read-back invariant holds through the ratified path
  });

  it('SCN-GE-R4 — a T0 fact with a NON-billy token ⇒ REJECTED (T0 requires billy, KNOW-8), NOTHING persisted', () => {
    const spy = makeStoreSpy();
    // A generic ratifier ('lead') commits a NON-T0 full-ratify fact, but a T0 fact needs billy specifically.
    const { emit } = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: 'alice', ratifyToken: 'lead' });
    const out = emit(advisory('core', 'T0'), AT);
    expect(out.emitted).toBe(false);
    expect(out.rejected ?? '').toContain('unratified');
    expect(spy.puts()).toHaveLength(0);
    expect(spy.persists()).toHaveLength(0);
  });

  it('SCN-GE-R5 — a PREDICATE fact routes to full-ratify: rejected with NO token, emits WITH any ratifier', () => {
    // route sends ANY predicate (even T2) to full-ratify. No token ⇒ rejected; a generic 'lead' token (not
    // T0) ⇒ commits. Extra teeth on the same missing-composition mutant across the predicate family.
    const denySpy = makeStoreSpy();
    const denied = createGovernedEmit({ store: denySpy.store, gate: HOLDS_GATE, policy: POLICY, actor: 'alice' });
    const noTok = denied.emit(predicate('core'), AT);
    expect(noTok.emitted).toBe(false);
    expect(noTok.rejected ?? '').toContain('unratified');
    expect(denySpy.persists()).toHaveLength(0);

    const okSpy = makeStoreSpy();
    const allowed = createGovernedEmit({ store: okSpy.store, gate: HOLDS_GATE, policy: POLICY, actor: 'alice', ratifyToken: 'lead' });
    expect(allowed.emit(predicate('core'), AT).emitted).toBe(true);
    expect(okSpy.persists()).toHaveLength(1);
  });

  // ── INCUMBENT GUARD (task #84) — the CONFUSED DEPUTY the ratify gate alone does NOT close ────────────
  //
  // THE HOLE (reproduced on master before this guard existed): the gate a write must clear was chosen from
  // the write's OWN self-declared `tier`/`scope`, while WHICH NODE it lands on is the recomputed
  // `nodeKey = hash(primaryAnchorId ‖ slot[‖ check])` — which contains NEITHER. So the two disagree, and the
  // author picks the side that suits them: declare `T2`+advisory ⇒ `route` says auto-accept ⇒ NO token is
  // consulted ⇒ `upsert` set-unions the claim straight into a billy-ratified T0 node. Capability gating
  // ("which gate applies") is not authorization ("may THIS write touch THAT node") — the literature name is
  // a confused deputy; the fix is to derive the required gate from the RESOURCE, never from the request.
  //
  // MUTANT: delete the incumbent-guard block in governed-emit.ts and SCN-GE-I1/I2/I5 all go RED (a tokenless
  // T2 write mutates a T0 node / an out-of-scope actor writes another scope's node / a node whose stored
  // fact is unreadable is written blind). SCN-GE-I3/I4 pin that the guard does NOT over-block: re-emitting
  // at the SAME class still works, and RAISING strictness is always allowed.

  it('SCN-GE-I1 — a tokenless T2 write CANNOT touch a billy-ratified T0 node at the same identity', () => {
    const spy = makeStoreSpy();
    const ANCHOR = 'src/auth.ts::verify';

    // 1) billy ratifies a T0 fact — the node now carries the strictest governance class.
    const ratified = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: 'alice', ratifyToken: 'billy' });
    const t0 = mkAdvisory({ id: 'nk-t0', anchor: ANCHOR, claimNorm: 'billy-ratified T0 claim', scope: 'core', tier: 'T0' });
    expect(ratified.emit(t0, AT).emitted).toBe(true);

    // 2) the attack: SAME anchor ⇒ SAME minted nodeKey, but the payload DECLARES T2 so `route` fast-paths
    //    and never consults a token. No ratify token is supplied at all.
    const attacker = mkAdvisory({ id: 'nk-t2', anchor: ANCHOR, claimNorm: 'UNRATIFIED injected claim', scope: 'core', tier: 'T2' });
    expect(realKey(attacker)).toBe(realKey(t0)); // PREMISE: the identity collides — tier is not in the nodeKey
    const noToken = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: 'alice' });
    const out = noToken.emit(attacker, AT);

    // TEETH: the write must be refused because the NODE IT TARGETS requires billy — not because of anything
    // the payload says about itself.
    expect(out.emitted).toBe(false);
    expect(out.rejected ?? '').toContain('governance-downgrade');
    expect(spy.puts()).toHaveLength(1); // only the ratified T0 fact ever landed
    expect(spy.persists()).toHaveLength(1);
    const node = spy.persists()[0]!.current.get(realKey(t0))!;
    expect(node.claims).toEqual(['billy-ratified T0 claim']);
    expect(node.claims).not.toContain('UNRATIFIED injected claim');
  });

  it('SCN-GE-I2 — an actor authorized in its OWN scope cannot re-scope and write ANOTHER scope\'s node', () => {
    const spy = makeStoreSpy();
    const ANCHOR = 'src/auth.ts::secret';
    // alice owns `core`; mallory owns `public`. Neither is in the other's scope.
    const TWO_SCOPE: AtlasPolicy = { ...POLICY, authz: { scopes: { core: ['alice'], public: ['mallory'] } } };

    const alice = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: TWO_SCOPE, actor: 'alice' });
    const owned = mkAdvisory({ id: 'nk-core', anchor: ANCHOR, claimNorm: 'core-scoped claim', scope: 'core' });
    expect(alice.emit(owned, AT).emitted).toBe(true);

    // The attack: mallory declares the scope SHE is authorized for. Authz on the DECLARED scope passes —
    // but the node the write lands on lives in `core`, which mallory may not write.
    const mallory = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: TWO_SCOPE, actor: 'mallory' });
    const reScoped = mkAdvisory({ id: 'nk-pub', anchor: ANCHOR, claimNorm: 'INJECTED by mallory', scope: 'public' });
    expect(realKey(reScoped)).toBe(realKey(owned)); // PREMISE: scope is not in the nodeKey either
    const out = mallory.emit(reScoped, AT);

    expect(out.emitted).toBe(false);
    expect(out.rejected ?? '').toContain('governance-downgrade');
    expect(spy.puts()).toHaveLength(1);
    expect(spy.persists()[0]!.current.get(realKey(owned))!.claims).toEqual(['core-scoped claim']);
  });

  it('SCN-GE-I3 — re-emitting at the SAME class still set-unions (the guard does NOT over-block)', () => {
    const spy = makeStoreSpy();
    const ANCHOR = 'src/util.ts::greet';
    const { emit } = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: 'alice' });
    expect(emit(mkAdvisory({ id: 'a', anchor: ANCHOR, claimNorm: 'claim one', scope: 'core' }), AT).emitted).toBe(true);
    expect(emit(mkAdvisory({ id: 'b', anchor: ANCHOR, claimNorm: 'claim two', scope: 'core' }), AT).emitted).toBe(true);
    const node = spy.persists()[spy.persists().length - 1]!.current.get(realKey(mkAdvisory({ id: 'a', anchor: ANCHOR, claimNorm: 'x', scope: 'core' })))!;
    expect(node.claims).toEqual(['claim one', 'claim two']);
  });

  it('SCN-GE-I4 — RAISING strictness (T2 node ← a T0 write) is allowed, and still requires billy', () => {
    const spy = makeStoreSpy();
    const ANCHOR = 'src/util.ts::greet';
    const open = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: 'alice' });
    expect(open.emit(mkAdvisory({ id: 'a', anchor: ANCHOR, claimNorm: 'the T2 claim', scope: 'core' }), AT).emitted).toBe(true);

    const escalate = mkAdvisory({ id: 'b', anchor: ANCHOR, claimNorm: 'now security-critical', scope: 'core', tier: 'T0' });
    // no token ⇒ the T0 write is refused by the EXISTING ratify gate (not the downgrade guard)…
    const refused = open.emit(escalate, AT);
    expect(refused.emitted).toBe(false);
    expect(refused.rejected ?? '').toContain('unratified');
    // …and with billy it lands: strictness only ever ratchets UP.
    const signed = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: 'alice', ratifyToken: 'billy' });
    expect(signed.emit(escalate, AT).emitted).toBe(true);
  });

  // ── THE OFF-LATTICE CLASS (billy F1) — the guard above, defeated by one character ──────────────────────
  //
  // `Tier` is a TYPE-ONLY union. Nothing validates it at runtime: `atlas emit` is JSON.parse + a cast, and the
  // MCP `node` schema is a bare `object`. So `TIER_STRICTNESS['T3']` is `undefined`, `0 < undefined` is
  // `false`, and the downgrade guard read "not a downgrade" — the SCN-GE-I1 attack, re-armed by typing one
  // extra character. A cold review reproduced the full erasure end-to-end through the real CLI with no billy
  // token: T0 → T3 (guard passes) → T2 (guard passes), and T2 is bounded OUT of every pack, so the ratified
  // invariant vanished from every read as surely as if it had been deleted.
  //
  // MUTANT: type `isWeakerTier(declared: Tier, incumbent: Tier)` again, or drop the gate-0 `isTier` check,
  // and these go RED.

  it('SCN-GE-I6 — an OFF-LATTICE tier cannot walk past the downgrade guard onto a T0 node', () => {
    const ANCHOR = 'src/auth.ts::verify';
    // Every shape a payload can carry that is not one of the three real classes. `'t0'`/`' T0'` are the
    // near-misses; `'toString'`/`'__proto__'` probe the prototype chain; `null`/`0`/absent probe the
    // JSON-shaped holes. NONE of them may be treated as "not weaker than T0".
    const OFF_LATTICE = ['T3', 't0', ' T0', 'toString', '__proto__', 'valueOf', null, 0, undefined, ''];
    for (const bogus of OFF_LATTICE) {
      const spy = makeStoreSpy();
      const billy = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: 'alice', ratifyToken: 'billy' });
      const t0 = mkAdvisory({ id: 'nk-t0', anchor: ANCHOR, claimNorm: 'billy-ratified T0 claim', scope: 'core', tier: 'T0' });
      expect(billy.emit(t0, AT).emitted).toBe(true);

      const attacker = { ...mkAdvisory({ id: 'nk-x', anchor: ANCHOR, claimNorm: 'EVIL', scope: 'core' }), tier: bogus } as unknown as GroundedFact;
      const out = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: 'alice', ratifyToken: 'lead' }).emit(attacker, AT);

      expect(out.emitted, `tier=${JSON.stringify(bogus)} must not be emittable`).toBe(false);
      expect(spy.persists()[spy.persists().length - 1]!.current.get(realKey(t0))!.claims).toEqual(['billy-ratified T0 claim']);
    }
  });

  it('SCN-GE-I7 — an OFF-LATTICE tier cannot be MINTED either (no incumbent ⇒ no lattice guard runs)', () => {
    // The CREATE leg is the other half of the same hole and it is NOT covered by the downgrade comparison:
    // with no incumbent there is nothing to compare against, yet the read side bounds a pack with
    // `inv.tier !== 'T2'` — so a node minted at `'T3'` would be SERVED as though it were ratified T1-or-
    // stricter. Garbage in the class field is the same defect one step earlier.
    const spy = makeStoreSpy();
    const { emit } = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: 'alice', ratifyToken: 'billy' });
    const bogus = { ...mkAdvisory({ id: 'nk-new', anchor: 'src/fresh.ts::f', claimNorm: 'minted', scope: 'core' }), tier: 'T3' } as unknown as GroundedFact;
    const out = emit(bogus, AT);
    expect(out.emitted).toBe(false);
    expect(out.rejected ?? '').toContain('malformed tier');
    expect(spy.puts()).toHaveLength(0);
    expect(spy.persists()).toHaveLength(0);
  });

  it('SCN-GE-I5 — an incumbent whose stored fact is NOT readable from CAS fails closed (never written blind)', () => {
    const spy = makeStoreSpy();
    const ANCHOR = 'src/util.ts::greet';
    const { emit } = createGovernedEmit({ store: spy.store, gate: HOLDS_GATE, policy: POLICY, actor: 'alice' });
    const first = mkAdvisory({ id: 'a', anchor: ANCHOR, claimNorm: 'the original claim', scope: 'core' });
    expect(emit(first, AT).emitted).toBe(true);

    // The projection still names the node, but its content-addressed bytes are gone (pruned CAS / partial
    // restore). The door cannot READ the class it must clear ⇒ it must refuse, not assume the write's own.
    const blindStore: DiskStore = { ...spy.store, get: () => undefined };
    const blind = createGovernedEmit({ store: blindStore, gate: HOLDS_GATE, policy: POLICY, actor: 'alice' });
    const out = blind.emit(mkAdvisory({ id: 'b', anchor: ANCHOR, claimNorm: 'written blind', scope: 'core' }), AT);
    expect(out.emitted).toBe(false);
    expect(out.rejected ?? '').toContain('unverifiable');
  });
});
