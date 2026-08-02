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
import { reasonOf } from './door-regression-support.js';
import { id } from '@atlas/kernel';
import type { CasObject } from '@atlas/kernel';
import type { GroundedFact, StoreProjection } from '@atlas/knowledge';
import { emptyStore } from '@atlas/knowledge';
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
    expect(reasonOf(out.rejected)).toBe('unauthorized'); // EQUALITY: the WRITE's own scope, never the incumbent's
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
    expect(reasonOf(out.rejected)).toBe('unauthorized'); // EQUALITY: the WRITE's own scope, never the incumbent's
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
      // The ATOMIC commit door — the seam `createGovernedEmit` actually writes through. It was MISSING from
      // this literal, and because `tsc -b` covered only `src`, the `: DiskStore` annotation above never
      // checked it. The consequence was not cosmetic: `emit` died with
      //   TypeError: deps.store.commitProjection is not a function
      // BEFORE reaching `put`, so the `EIO: disk full` this fixture exists to raise was never thrown, and
      // neither `put` nor `persistProjection` was ever called. `expect(...).toThrow()` accepts ANY throw, so
      // the test passed on the TypeError and `expect(persists).toHaveLength(0)` held vacuously. The stated
      // teeth ("reverse the order — persistProjection before put — and this flips RED") were therefore
      // FALSE: the named mutant lives inside a callback this test never entered.
      // Ordering below is copied from harness/governed-fixtures.ts: put-before-publish, and a decision with
      // no `next` writes nothing.
      commitProjection(decide) {
        const decision = decide(persists.length > 0 ? persists[persists.length - 1]! : emptyStore());
        if (decision.next === undefined) return { settled: true, out: decision.out };
        for (const obj of decision.put ?? []) this.put(obj as CasObject);
        persists.push(decision.next);
        return { settled: true, out: decision.out };
      },
      commitStaging(decide) {
        const decision = decide(emptyStore());
        return { settled: true, out: decision.out };
      },
      // ADR-0008 widened `DiskStore` with the STAGING doors — see the note in harness/governed-fixtures.ts.
      persistStaging() {},
      loadStaging() {
        return undefined;
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
});
