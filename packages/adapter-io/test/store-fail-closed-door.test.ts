// @atlas/adapter-io — test/store-fail-closed-door.test.ts
//
// The companion to `store-fail-closed-cas.test.ts`. That suite drives the CAS half of the shipped store
// (`DiskStore.put`, which reaches the sealed `id` and fails closed on all eight shapes). THIS one drives the
// half the CLI actually writes knowledge through — the SIDECAR — from both ends:
//
//   (A) THE PRODUCT PATH — the REAL `createGovernedEmit` over a REAL `createDiskStore`. This is the door
//       `atlas emit` opens. Measured, not argued: every one of the eight shapes is refused with NOTHING
//       durable — no CAS object, no new projection generation, and a pre-existing row untouched.
//
//   (B) THE RAW STORE SEAM — `commitProjection` / `persistProjection` called DIRECTLY with a hand-forged
//       row. This is where the shipped store and the `@atlas/tools` reference model genuinely DIVERGE, and
//       the divergence is recorded here rather than left for the next person to re-derive: `publish` in
//       `sidecar-commit.ts` serializes with `JSON.stringify`, which NEVER consults `id`. So the sidecar has
//       no canonical-form leg of its own — it inherits its safety entirely from the fact that both doors
//       compute `id(node)` BEFORE they hand anything to the commit.
//
// WHY (B) IS PINNED EVEN THOUGH NO PRODUCT CALLER REACHES IT. "Nothing calls it today" has been wrong three
// times on this branch. The reachability claim is therefore EXECUTED in (A) — for every shape, in every
// row-bearing position a caller can put it — instead of being asserted in a comment. If a future door ever
// stops computing `id` first, (A) goes red; (B) then says exactly what the store would have written.

import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { id } from '@atlas/kernel';
import type { CurrentNode, StoreProjection } from '@atlas/knowledge';
import { createGovernedEmit } from '../src/governed-emit.js';
import { UnaddressableCasObjectError } from '../src/sidecar-commit.js';
import { AT, HOLDS, advisoryFact, freshWorkspace, keyOf, policyOf, reasonOf } from './door-regression-support.js';
import type { Workspace } from './door-regression-support.js';
import { NFC_KEY, NFD_KEY, SHAPES, assertPremise } from './uncanonicalizable-shapes.js';

const ACTOR = 'alice';
const SCOPE = 'core';
const ANCHOR = 'src/a.ts::f';

let ws: Workspace | undefined;
afterEach(() => {
  ws?.dispose();
  ws = undefined;
});

/** A live workspace plus the REAL governed emit door over it (admin policy authorizes ACTOR in SCOPE). */
function doorOver(w: Workspace): ReturnType<typeof createGovernedEmit> {
  return createGovernedEmit({
    store: w.store,
    gate: HOLDS,
    policy: policyOf({ [SCOPE]: [ACTOR] }),
    actor: ACTOR,
    ratifyToken: 'billy',
  });
}

/** Every durable artefact of a write, read off the FILESYSTEM: the CAS value files and the published
 *  sidecar generations. Nothing here trusts a return value. */
function durableState(w: Workspace): { cas: number; generations: string[] } {
  const casDir = w.casPath;
  const sidecarDir = dirname(casDir);
  const cas = existsSync(casDir)
    ? readdirSync(casDir, { recursive: true, encoding: 'utf8' }).filter((f) => f.includes('/')).length
    : 0;
  const generations = existsSync(sidecarDir)
    ? readdirSync(sidecarDir).filter((f) => /^projection\.\d+\.json$/.test(f)).sort()
    : [];
  return { cas, generations };
}

/** THE DISCRIMINANT of however the door refused — the reason NAME, compared for EQUALITY (never a
 *  substring: refusal prose in this repo quotes other refusal constants by name). A `RangeError` is named by
 *  its CLASS, because a stack exhaustion carries no discriminant of its own and is a materially different
 *  answer from a decided refusal — `@atlas/tools` `fault.ts` files it as `internal-fault`, not `refused`. */
function refusalNameOf(e: unknown): string {
  if (e instanceof RangeError) return 'RangeError';
  return e instanceof Error ? reasonOf(e.message) : `non-Error(${typeof e})`;
}

/** What each shape's refusal is NAMED at the door. Seven reach the canonicalizer's own guard; `cyclic`
 *  exhausts the stack first, so it can only ever be a `RangeError`. */
const EXPECTED_REFUSAL: Readonly<Record<string, string>> = {
  float: 'canonical-form violation',
  'non-finite': 'canonical-form violation',
  NaN: 'canonical-form violation',
  bigint: 'canonical-form violation',
  symbol: 'canonical-form violation',
  function: 'canonical-form violation',
  cyclic: 'RangeError',
  'nfc-key-collision': 'canonical-form violation',
};

describe('(A) the PRODUCT write path — createGovernedEmit over a real createDiskStore', () => {
  it('PREMISE: all eight shapes are ones the sealed `id` genuinely refuses', () => {
    assertPremise();
  });

  it('CONTROL: a clean fact IS admitted — one CAS object, one generation, and the row reads back', () => {
    ws = freshWorkspace();
    const door = doorOver(ws);
    const fact = advisoryFact({ anchor: ANCHOR, scope: SCOPE, claimNorm: 'a clean claim' });
    expect(door.emit(fact, AT)).toStrictEqual({ emitted: true, id: expect.any(String) as unknown as string });
    const state = durableState(ws);
    expect(state.cas).toBe(1);
    expect(state.generations).toStrictEqual(['projection.1.json']);
    expect(ws.store.loadProjection()?.current.get(keyOf(fact))?.claims).toStrictEqual(['a clean claim']);
  });

  for (const shape of SHAPES) {
    it(`refuses '${shape.name}' with NOTHING durable, and leaves an existing row intact`, () => {
      ws = freshWorkspace();
      const door = doorOver(ws);
      // seed one legitimate row first, so "nothing landed" is distinguishable from "the store is inert"
      const seed = advisoryFact({ anchor: ANCHOR, scope: SCOPE, claimNorm: 'the incumbent' });
      expect(door.emit(seed, AT).emitted).toBe(true);
      const before = durableState(ws);
      const beforeRows = [...(ws.store.loadProjection()?.current.keys() ?? [])].sort();

      const poisoned = shape.inject(
        advisoryFact({ anchor: ANCHOR, scope: SCOPE, claimNorm: 'the poisoned write', gen: 2 }) as unknown as Record<string, unknown>,
      ) as unknown as Parameters<typeof door.emit>[0];

      let thrown: unknown;
      let out: unknown;
      try {
        out = door.emit(poisoned, AT);
      } catch (e) {
        thrown = e;
      }
      // Q1 — REFUSED. Whichever way it answers, it must NOT report a write.
      expect(out === undefined || (out as { emitted?: unknown }).emitted === false).toBe(true);
      // Q2 — LEGIBLE. Compared on the discriminant, by EQUALITY.
      expect(thrown, `'${shape.name}' neither threw nor returned a refusal`).toBeDefined();
      expect(refusalNameOf(thrown)).toBe(EXPECTED_REFUSAL[shape.name]);
      // Q3 — NOT ADMITTED: nothing new is durable and the incumbent is byte-identical.
      expect(durableState(ws)).toStrictEqual(before);
      expect([...(ws.store.loadProjection()?.current.keys() ?? [])].sort()).toStrictEqual(beforeRows);
      expect(ws.store.loadProjection()?.current.get(keyOf(seed))?.claims).toStrictEqual(['the incumbent']);
    });
  }

  // THE REACHABILITY CLAIM, EXECUTED. (B) below shows the sidecar itself has no canonical-form leg; the only
  // reason that is not a live defect is that the door computes `id(node)` before the commit can publish. So
  // the violation is driven through EVERY field a caller can populate that ends up on the stored ROW.
  const ROW_BEARING_FIELDS = ['claimNorm', 'scope', 'tier', 'predicateSlot', 'id'] as const;
  for (const field of ROW_BEARING_FIELDS) {
    it(`a float planted in the row-bearing field '${field}' never reaches the sidecar`, () => {
      ws = freshWorkspace();
      const door = doorOver(ws);
      const base = advisoryFact({ anchor: ANCHOR, scope: SCOPE, claimNorm: 'c' }) as unknown as Record<string, unknown>;
      const poisoned = { ...base, [field]: 1.5 } as unknown as Parameters<typeof door.emit>[0];
      let out: { emitted: boolean } | undefined;
      try {
        out = door.emit(poisoned, AT);
      } catch {
        out = undefined; // a throw is also a refusal — what matters is that nothing landed
      }
      expect(out?.emitted ?? false).toBe(false);
      expect(durableState(ws)).toStrictEqual({ cas: 0, generations: [] });
      expect(ws.store.loadProjection()).toBeUndefined();
    });
  }
});

/** A hand-forged, representation-valid projection carrying `extra` on its single row. `nodeKey === key`, so
 *  `isKeyedEntry` accepts it on read-back — the row is well-formed in every way EXCEPT its value. */
function forgedProjection(extra: Record<string, unknown>): StoreProjection {
  const row = {
    nodeKey: 'K',
    contentHash: 'h',
    family: 'advisory',
    claims: ['c'],
    primaryAnchor: ANCHOR,
    scope: SCOPE,
    tier: 'T2',
    ...extra,
  } as unknown as CurrentNode;
  return { current: new Map([['K', row]]), cas: new Set<string>() };
}

describe('(B) the RAW sidecar seam — where the shipped store and the reference model diverge', () => {
  // MEASURED, so the divergence is a recorded fact and not an impression. `publish` uses `JSON.stringify`,
  // which has NO canonical-form leg: it silently COERCES (Infinity/NaN -> null), silently DROPS (symbol /
  // function values), keeps a float verbatim, and throws a bare engine `TypeError` on a bigint or a cycle.
  // NONE of these is `id`'s answer, and the NFC pair is the sharpest: the canonicalizer REFUSES it precisely
  // because "any tie-break would SILENTLY DISCARD one field" (kernel/canonical.ts), and the sidecar performs
  // exactly that discard — it writes a DUPLICATE-KEY JSON document and reads back only the last one.
  it('persistProjection has NO canonical-form leg: a float row lands verbatim and reads back', () => {
    ws = freshWorkspace();
    ws.store.persistProjection(forgedProjection({ payload: 1.5 }));
    expect((ws.store.loadProjection()?.current.get('K') as unknown as { payload?: unknown })?.payload).toBe(1.5);
  });

  it('an NFC key COLLISION is ADMITTED and round-trips BOTH keys — a row no address can ever name', () => {
    assertPremise();
    ws = freshWorkspace();
    ws.store.persistProjection(forgedProjection({ [NFC_KEY]: 1, [NFD_KEY]: 2 }));
    const row = ws.store.loadProjection()?.current.get('K') as unknown as Record<string, unknown>;
    // CORRECTED AGAINST A MEASUREMENT, and the correction is the finding. The first version of this test
    // asserted a field was LOST, reasoning from `canonical.ts`'s own words ("any tie-break would SILENTLY
    // DISCARD one field"). It is not: the two keys are DISTINCT byte sequences, so `JSON.stringify` emits
    // both and `JSON.parse` keeps both. Nothing is dropped — which makes the divergence a different and
    // narrower one than it looked: the sidecar durably holds a row whose canonical preimage would be
    // ORDER-DEPENDENT, i.e. a row that `id` refuses to address at all. It cannot be lost; it can never be
    // named. That is why (A) above executes the reachability instead of arguing it.
    expect(Object.keys(row).filter((k) => k.normalize('NFC') === NFC_KEY)).toHaveLength(2);
    expect(row[NFC_KEY]).toBe(1);
    expect(row[NFD_KEY]).toBe(2);
  });

  it('the NON-JSON shapes throw a bare engine TypeError rather than a named refusal', () => {
    ws = freshWorkspace();
    const cyc: Record<string, unknown> = {};
    cyc['self'] = cyc;
    for (const extra of [{ payload: BigInt(10) }, { payload: cyc }]) {
      let thrown: unknown;
      try {
        ws.store.persistProjection(forgedProjection(extra));
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(TypeError); // an ENGINE fault — `fault.ts` files it as `internal-fault`
      expect(durableState(ws)).toStrictEqual({ cas: 0, generations: [] }); // still fail-closed on durability
    }
  });

  // THE ONE LEG WORTH HARDENING RATHER THAN MERELY RECORDING. `sidecar-commit.ts` states, as an invariant,
  // that "the sidecar can NEVER reference a contentHash whose bytes are absent from CAS", and rests it on
  // "a failing `put` throws BEFORE any sidecar byte". That is true of a disk-full `put` and FALSE of an
  // uncanonicalizable one: `store.put` answers the EMPTY sentinel and does NOT throw, the loop ignores the
  // return, and the generation is published anyway — a durable row pointing at bytes that were never written.
  it('a `decision.put` object the CAS cannot address is REFUSED, not silently skipped', () => {
    ws = freshWorkspace();
    const cyc: Record<string, unknown> = {};
    cyc['self'] = cyc;
    for (const shape of SHAPES) {
      let thrown: unknown;
      try {
        ws.store.commitProjection(() => ({ out: 'x', next: forgedProjection({}), put: [shape.build()] }));
      } catch (e) {
        thrown = e;
      }
      expect(thrown, `'${shape.name}' in decision.put was silently skipped`).toBeDefined();
      // a NAMED refusal, asserted on its DISCRIMINANT by EQUALITY — never a substring, and never the bare
      // engine `TypeError` that `fault.ts` would file as `internal-fault`.
      expect(thrown).toBeInstanceOf(UnaddressableCasObjectError);
      expect(refusalNameOf(thrown)).toBe('unaddressable-cas-object');
      expect(durableState(ws)).toStrictEqual({ cas: 0, generations: [] });
    }
  });
});

// ── (C) THE KERNEL-8 SIDE-INDEX HOLE — the leg that made `put`'s own contract false ──────────────────────
//
// `store.ts` documents `put` as: "malformed input (float / bigint / symbol / cyclic) -> honest empty, write
// nothing, NEVER THROW". It throws. `canonical.ts` EXCLUDES the mutable side-indexes `grounding`, `status`
// and `freshness` from the preimage at every level (KERNEL-8), so a violation hiding in one of them never
// reaches the canonicalizer: `id(obj)` SUCCEEDS, the `try/catch` that mints the EMPTY sentinel never fires,
// and control falls through to `writeFileSync(path, JSON.stringify(obj))` — which is OUTSIDE that try and
// which throws a bare engine `TypeError` on a bigint or a cycle.
//
// It is not an obscure corner. `grounding` is on EVERY `GroundedFact`, and `governed-emit.ts` puts the WHOLE
// fact into CAS, so the throw comes straight back out of `atlas-emit`. `@atlas/tools` `fault.ts` files a
// `TypeError` as `internal-fault` — "a defect in Atlas, not in your arguments" — for input that is entirely
// the caller's, which is the exact misattribution that module exists to remove, running backwards.
//
// REACHABILITY, stated honestly rather than dramatised: `bigint` and a cycle cannot cross the CLI or MCP
// wire (both are `JSON.parse`). They are reachable from an IN-PROCESS EMBEDDER, which is squarely in this
// door's stated threat model — `governed-emit.ts` gate 0 says so in as many words: "`createGovernedEmit` is
// an EXPORTED library entry point, so an in-process embedder can hand it any object at all."
describe('(C) a canonical-form violation hidden in a KERNEL-8 side-index field', () => {
  const SIDE_INDEXES = ['grounding', 'status', 'freshness'] as const;

  it('PREMISE: the side-index fields really are excluded, so `id` accepts what it would otherwise refuse', () => {
    const cyc: Record<string, unknown> = {};
    cyc['self'] = cyc;
    for (const field of SIDE_INDEXES) {
      // the SAME value `assertPremise` proves `id` refuses, now parked in an excluded field
      expect(() => id({ kind: 'advisory', [field]: { v: BigInt(10) } })).not.toThrow();
      expect(() => id({ kind: 'advisory', [field]: cyc })).not.toThrow();
    }
  });

  for (const field of SIDE_INDEXES) {
    it(`put() honours its own "never throw" contract when the violation hides in '${field}'`, () => {
      ws = freshWorkspace();
      const cyc: Record<string, unknown> = {};
      cyc['self'] = cyc;
      for (const bad of [{ v: BigInt(10) }, cyc]) {
        const obj = { kind: 'advisory', claimNorm: 'c', [field]: bad };
        let handle: unknown;
        expect(() => {
          handle = ws!.store.put(obj);
        }, `put threw for a violation in the excluded field '${field}'`).not.toThrow();
        expect(handle).toBe(''); // the EMPTY sentinel, by EQUALITY — the same answer every other refusal gives
        expect(durableState(ws)).toStrictEqual({ cas: 0, generations: [] });
      }
    });
  }

  // THE OTHER HALF OF THE SAME GAP, and it is the one that does NOT throw its way to safety. `JSON.stringify`
  // has a SILENT failure mode as well as a throwing one: it ANSWERS `undefined` for a top-level `undefined`,
  // function or symbol. Meanwhile `canonicalForm` maps `undefined` to `'null'`, so `id(undefined)` SUCCEEDS
  // and returns a perfectly good address. Without a guard the store then called `writeFileSync(path,
  // undefined)` — MEASURED: a `TypeError`, i.e. the same broken "never throw" contract reached by a second,
  // unrelated route. (The function and symbol cases were already safe: `id` refuses those outright.)
  it('put() refuses a top-level value whose JSON serialization does not exist, without throwing', () => {
    ws = freshWorkspace();
    expect(() => id(undefined)).not.toThrow(); // PREMISE: the canonicalizer ACCEPTS it, so the first catch cannot fire
    expect(JSON.stringify(undefined)).toBeUndefined(); // PREMISE: and the serializer answers nothing, silently
    let handle: unknown;
    expect(() => {
      handle = ws!.store.put(undefined);
    }).not.toThrow();
    expect(handle).toBe('');
    expect(durableState(ws)).toStrictEqual({ cas: 0, generations: [] });
  });

  it('the whole product door stays fail-closed AND legible for a fact whose grounding cannot serialize', () => {
    ws = freshWorkspace();
    const door = doorOver(ws);
    const fact = advisoryFact({ anchor: ANCHOR, scope: SCOPE, claimNorm: 'c' }) as unknown as Record<string, unknown>;
    const grounding = { ...(fact['grounding'] as Record<string, unknown>), probe: BigInt(10) };
    let thrown: unknown;
    try {
      door.emit({ ...fact, grounding } as unknown as Parameters<typeof door.emit>[0], AT);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeDefined();
    // A NAMED refusal, never a bare engine `TypeError`: `fault.ts` `classifyThrown` files an engine fault as
    // `internal-fault` ("a defect in Atlas, not in your arguments"), which for caller-supplied bytes is the
    // blame-shift that module was written to delete. Asserted on the CLASS, not on prose.
    expect(thrown).not.toBeInstanceOf(TypeError);
    expect(thrown).toBeInstanceOf(Error);
    expect(durableState(ws)).toStrictEqual({ cas: 0, generations: [] });
  });
});
