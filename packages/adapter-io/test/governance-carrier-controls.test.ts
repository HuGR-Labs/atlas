// @atlas/adapter-io — test/governance-carrier-controls.test.ts  (ADR-0007 carrier — the CONTROLS)
//
// The held `door-regression-reject-disclosure` case proves the DEFECT is fixed. These are the controls that
// prove the FIX did not buy that at the price of something worse. Three independent things are pinned:
//
//   A. BACK-COMPAT, against a sidecar written in the OLD SHAPE BY HAND — raw JSON with no `scope`/`tier` on
//      the row, exactly what a projection minted before this WP looks like on disk. It must LOAD (the whole
//      file, not a degraded empty), must REFUSE, must never GRANT, and must never THROW.
//   B. IDENTITY DID NOT MOVE. The carrier is a ROW field; `nodeKey` must not start folding `scope`/`tier`,
//      which would silently re-address every stored fact and split every node from its own history. Pinned
//      with LITERAL digests, because this suite is otherwise structurally blind to a hash change: every
//      other assertion recomputes both sides, so a formula change moves both and stays green.
//   C. THE ORACLE STAYS SHUT, asserted on BYTES (`Buffer.compare`), not on shape. A `toBe` on two strings is
//      already byte-exact in JS, but the property under test is "no bit differs", so it is measured as bytes.
//
// Everything runs through the REAL `createDiskStore` + the REAL door — no store double.

import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { id } from '@atlas/kernel';
import type { CasObject } from '@atlas/kernel';
import type { Hash } from '@atlas/contracts';
import { createGovernedEmit } from '../src/governed-emit.js';
import { createGovernedLink } from '../src/governed-link.js';
import { rehydrateProjection } from '../src/store.js';
import { AT, HOLDS, advisoryFact, freshWorkspace, keyOf, policyOf } from './door-regression-support.js';
import type { Workspace } from './door-regression-support.js';

const ANCHOR = 'src/core.ts::carrier';

let ws: Workspace | undefined;
afterEach(() => {
  if (ws !== undefined) ws.dispose();
  ws = undefined;
});

/** The projection sidecar path for a workspace — `<root>/projection.json`, beside the `cas/` root (D4). */
function sidecarOf(w: Workspace): string {
  return join(w.casPath, '..', 'projection.json');
}

describe('ADR-0007 carrier — controls', () => {
  it('CARRIER-1 — the row carries (scope, tier) and both survive a REAL disk round-trip', () => {
    ws = freshWorkspace();
    const alice = createGovernedEmit({
      store: ws.store, gate: HOLDS, policy: policyOf({ core: ['alice'] }), actor: 'alice', ratifyToken: 'billy',
    });
    const fact = advisoryFact({ anchor: ANCHOR, claimNorm: 'a core claim', scope: 'core', tier: 'T1' });
    expect(alice.emit(fact, AT).emitted).toBe(true);

    // Read the SIDECAR BYTES, not the in-process value — the carrier has to survive JSON, which is the whole
    // point of calling it a round-trip. `WireProjection` serializes the entire `CurrentNode`, so the two new
    // optional fields ride along exactly as `sameAs` does; this asserts that rather than assuming it.
    const wire = JSON.parse(readFileSync(sidecarOf(ws), 'utf8')) as { current: [string, Record<string, unknown>][] };
    expect(wire.current[0]![1].scope).toBe('core');
    expect(wire.current[0]![1].tier).toBe('T1');

    const row = rehydrateProjection(ws.store).current.get(keyOf(fact));
    expect(row?.scope).toBe('core');
    expect(row?.tier).toBe('T1');
  });

  it('CARRIER-2 — an OLD-SHAPE sidecar (no scope/tier on the row) LOADS and REFUSES; never grants, never throws', () => {
    ws = freshWorkspace();
    // The fixture is authored in the OLD SHAPE BY HAND — this is the point of the control. Emitting through
    // the door and deleting the fields afterwards would prove nothing about a file this code has never seen.
    const legacy = advisoryFact({ anchor: ANCHOR, claimNorm: 'a pre-carrier claim', scope: 'core' });
    const addr = ws.store.put(legacy as unknown as CasObject);
    const key = keyOf(legacy);
    writeFileSync(
      sidecarOf(ws),
      JSON.stringify({
        current: [[key, { nodeKey: key, family: 'advisory', contentHash: addr, claims: ['a pre-carrier claim'] }]],
        cas: [addr],
      }),
      'utf8',
    );

    // 1. IT LOADS — the whole file, with the row present. A new optional field must not make an old sidecar
    //    unparseable (that would route every pre-existing store into `emptyStore()` at boot).
    const loaded = rehydrateProjection(ws.store);
    expect(loaded.current.has(key)).toBe(true);
    expect(loaded.current.get(key)!.scope).toBeUndefined();
    expect(loaded.current.get(key)!.tier).toBeUndefined();

    // 2. IT REFUSES, and specifically for the actor who WOULD be authorized by the stored bytes (`core`).
    //    Absent carrier ⇒ authority UNCONFIRMABLE ⇒ fail closed. Never a grant.
    const policy = policyOf({ core: ['alice'] });
    const alice = createGovernedEmit({ store: ws.store, gate: HOLDS, policy, actor: 'alice', ratifyToken: 'billy' });
    const write = advisoryFact({ anchor: ANCHOR, claimNorm: 'an addendum', scope: 'core', gen: 2 });
    expect(keyOf(write)).toBe(key); // PREMISE — it lands on the legacy node
    let out = alice.emit(write, AT); // must not throw
    expect(out.emitted).toBe(false);
    expect(out.rejected ?? '').toContain('unauthorized for target');

    // 3. NOTHING WAS WRITTEN — the refusal is not a partial write. The row is byte-for-byte the old shape.
    const after = JSON.parse(readFileSync(sidecarOf(ws), 'utf8')) as { current: [string, Record<string, unknown>][] };
    expect(after.current[0]![1]).not.toHaveProperty('scope');
    expect(after.current[0]![1].claims).toEqual(['a pre-carrier claim']);

    // 4. AND IT IS THE SAME REFUSAL WITH THE BYTES GONE — a legacy row discloses nothing about storage
    //    either, because the authority question is already unanswerable before the bytes are consulted.
    const healthy = out.rejected;
    rmSync(join(ws.casPath, String(addr).slice(0, 2), String(addr)));
    expect(ws.store.get(addr as unknown as Hash)).toBeUndefined();
    out = alice.emit(write, AT); // must not throw
    expect(out.emitted).toBe(false);
    expect(out.rejected).toBe(healthy);
  });

  it('CARRIER-3 — nodeKey does NOT fold scope or tier: LITERAL digests, pinned', () => {
    // The suite recomputes every hash on both sides of every assertion, so it cannot see a formula change.
    // These are LITERALS, executed against the pre-change source and transcribed. If the carrier ever leaks
    // into the identity preimage these go red — which is the only way this repo can notice.
    const base = advisoryFact({ anchor: ANCHOR, claimNorm: 'identity probe', scope: 'core', tier: 'T2' });
    expect(keyOf(base)).toBe('e2ae963da90f3e44ad0f0fb4d9a0f29ccfe0eac4e28f282b4a4cf7fc64c787e6');

    // Same anchor + slot, DIFFERENT governance on both axes ⇒ the SAME node. This is the property ADR-0007
    // is built on (authority is derived from the resource precisely BECAUSE the identity cannot carry it),
    // and it is what makes the row carrier necessary rather than optional.
    const moved = advisoryFact({ anchor: ANCHOR, claimNorm: 'identity probe', scope: 'other', tier: 'T0' });
    expect(keyOf(moved)).toBe(keyOf(base));

    // The CONTENT address DOES move with governance — the bytes ARE the fact, `scope`/`tier` are fields of
    // it, and that has always been true. Pinned so the two are never confused for one another.
    expect(id(base as unknown as CasObject) as unknown as string).toBe(
      'ef20e5d059505046f23066ba827fe1af935aa0ffddbea3d68cea104bc7c16b77',
    );
    expect(id(moved as unknown as CasObject)).not.toBe(id(base as unknown as CasObject));
  });

  it('CARRIER-4 — the stranger\'s refusal is BYTE-identical across both storage states (asserted as bytes)', () => {
    ws = freshWorkspace();
    const policy = policyOf({ core: ['alice'], public: ['mallory'] });
    const alice = createGovernedEmit({ store: ws.store, gate: HOLDS, policy, actor: 'alice', ratifyToken: 'billy' });
    const mallory = createGovernedEmit({ store: ws.store, gate: HOLDS, policy, actor: 'mallory', ratifyToken: 'billy' });

    const owned = advisoryFact({ anchor: ANCHOR, claimNorm: 'a core claim', scope: 'core' });
    expect(alice.emit(owned, AT).emitted).toBe(true);
    const addr = rehydrateProjection(ws.store).current.get(keyOf(owned))!.contentHash;

    const probe = advisoryFact({ anchor: ANCHOR, claimNorm: 'probe', scope: 'public', gen: 9 });
    const healthy = Buffer.from(mallory.emit(probe, AT).rejected ?? '', 'utf8');
    rmSync(join(ws.casPath, addr.slice(0, 2), addr));
    const pruned = Buffer.from(mallory.emit(probe, AT).rejected ?? '', 'utf8');

    expect(healthy.length).toBeGreaterThan(0); // anti-vacuity: two empty buffers also compare equal
    expect(Buffer.compare(healthy, pruned)).toBe(0); // not one bit differs
  });

  it('CARRIER-5 — `atlas-link` closes the SAME oracle on its ENDPOINTS, and keeps SCN-GL-7 for the owner', () => {
    // SCN-GL-14 pinned this precedence for the CLASS walk and could not pin it for the ENDPOINTS, because
    // the endpoint authz gate physically could not run before the read-back it depended on. So the leak
    // survived at the endpoints: name two nodes you have no authority over and the reason told you whether
    // their bytes were intact. Both nodes here are minted through the REAL emit door, so their rows carry
    // the governance the link door now reads.
    ws = freshWorkspace();
    const policy = policyOf({ core: ['alice'], public: ['mallory'] });
    const alice = createGovernedEmit({ store: ws.store, gate: HOLDS, policy, actor: 'alice', ratifyToken: 'billy' });
    const one = advisoryFact({ anchor: 'src/a.ts::one', claimNorm: 'first', scope: 'core' });
    const two = advisoryFact({ anchor: 'src/b.ts::two', claimNorm: 'second', scope: 'core' });
    expect(alice.emit(one, AT).emitted).toBe(true);
    expect(alice.emit(two, AT).emitted).toBe(true);
    const [kOne, kTwo] = [keyOf(one), keyOf(two)];
    const addr = rehydrateProjection(ws.store).current.get(kOne)!.contentHash;

    const mallory = createGovernedLink({ store: ws.store, policy, actor: 'mallory', ratifyToken: 'billy' });
    const healthy = Buffer.from(mallory.link(kOne, kTwo).rejected ?? '', 'utf8');
    rmSync(join(ws.casPath, addr.slice(0, 2), addr));
    const pruned = Buffer.from(mallory.link(kOne, kTwo).rejected ?? '', 'utf8');
    expect(healthy.length).toBeGreaterThan(0);
    expect(Buffer.compare(healthy, pruned)).toBe(0); // no bit of storage health reaches a stranger

    // ANTI-VACUITY, the SCN-GL-7 distinction: the endpoints' OWN author still gets the honest, actionable
    // reason for the very same pruned store — and it is NOT the string the stranger was handed.
    const owner = createGovernedLink({ store: ws.store, policy, actor: 'alice', ratifyToken: 'billy' }).link(kOne, kTwo);
    expect(owner.linked).toBe(false);
    expect(owner.rejected ?? '').toContain('unverifiable');
    expect(Buffer.compare(Buffer.from(owner.rejected ?? '', 'utf8'), healthy)).not.toBe(0);
  });
});
