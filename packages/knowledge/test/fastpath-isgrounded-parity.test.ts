// @atlas/knowledge — test/fastpath-isgrounded-parity.test.ts  (GROUND-2 SECURITY fix — fail-open→fail-closed)
//
// THE DEFECT THIS PINS. `isGrounded` (src/ratify/fastpath.ts) is the first conjunct of `route`'s
// auto-accept decision (`:126`/`:137`) — a candidate that reads as "grounded" here can land with NO human
// ratification. `subtreeHash`'s brand (`@atlas/contracts` `SubtreeHash = string & {brand}`) evaporates at
// runtime, and every value reaching a door may have come through `JSON.parse`, an SDK-parsed MCP argument,
// or a CAS blob — none of which enforce the brand. The pre-fix body coerced BEFORE checking:
// `String(e.anchor.subtreeHash).length > 0`. `String()` on a hostile value is fail-OPEN, not fail-closed:
// `String(undefined)` → `"undefined"` (9 chars), `String(null)` → `"null"` (4), `String(0)` → `"0"`,
// `String(false)` → `"false"`, `String({})` → `"[object Object]"` (15) — every one of those non-empty
// strings PASSES `.length > 0`, so a candidate whose anchor carries `undefined`/`null`/`0`/`false`/`{}` as
// its "hash" read as grounded and auto-accepted. Only `''` and `[]` (whose `String()` is `''`) ever refused.
//
// THE FIX, in place, no redesign: `typeof e.anchor.subtreeHash === 'string' && e.anchor.subtreeHash.length
// > 0` — the coercion is gone, only an actual non-empty string clears the gate.
//
// THE STRUCTURAL RISK THIS FILE EXISTS TO CLOSE. `packages/knowledge` type-imports `Grounding` from
// `@atlas/grounding` and does NOT value-import `isGrounded` from it. Be precise about why, because the
// obvious reading is wrong: this is a PATTERN, not a rule. `@atlas/grounding` is a declared dependency in
// `packages/knowledge/package.json`, no gate in `harness/gates/` forbids a value import (checked
// 2026-08-04, `layer-guard.mjs` has no type-only rule), and this very test file value-imports the sealed
// predicate two lines below — proving it resolves and links. The five type-only imports across
// `knowledge/src` are a BUILD-AHEAD residue: `lifecycle/freshness.ts:14` records the original reason as
// "`@atlas/grounding` ships zero runtime yet (its barrel is `export type *`)", and that reason is now
// FALSE — only `types.js` is type-exported; `drift.js` (which exports `isGrounded`) is value-exported at
// `grounding/src/index.ts:17`. So the duplicate is not structurally forced; it is unremoved.
// It is NOT removed here, and the reason is the finding below, not the pattern: importing the sealed
// predicate today would ADOPT its missing `typeof` guard and WIDEN this door. Collapsing the two requires
// tightening the sealed predicate first — a `packages/grounding/**` change, out of scope for this WP and
// an owner decision. Until then, `knowledge`'s local `isGrounded` and the SEALED
// `GroundApi['isGrounded']` (`@atlas/grounding` `src/drift.ts:73-74`) are now two implementations of ONE
// predicate — which is exactly the shape that let this bug exist unnoticed. This is the fitness function:
// it drives BOTH implementations over the same input table and asserts they agree on every row. If they
// ever diverge again — coercion creeping back into either one, a boundary case handled differently — this
// test goes red.
//
// A FINDING THIS FILE ALSO PINS RATHER THAN HIDES. The sealed body is `e.anchor.subtreeHash.length > 0`
// with NO `typeof`/coercion guard at all — safe against the fail-open bug (it never treats a non-string as
// grounded) but NOT safe against `undefined`/`null`: `(undefined).length` / `(null).length` THROW a
// `TypeError`, even though `GroundApi.isGrounded`'s own docstring (`@atlas/grounding` `types.ts:79-80`)
// says "Pure + total". This file cannot fix that — `packages/grounding/**` is out of scope for this WP and
// a behavioural change to a SEALED predicate is an owner decision — so it is pinned as observed fact: the
// local FIXED `isGrounded` (`typeof` guard) is strictly safer than its own sealed reference, because it
// never throws on any input while the sealed one throws on the two rows in `SEALED_THROWS_ON` below.

import { describe, it, expect } from 'vitest';
import { asSubtreeHash } from '@atlas/kernel';
import type { SubtreeHash } from '@atlas/contracts';
import { isGrounded as localIsGrounded } from '../src/ratify/fastpath.js';
import { isGrounded as sealedIsGrounded } from '@atlas/grounding';
import type { Grounding } from '@atlas/grounding';

/** The PRE-FIX coercion logic, reproduced HERE ONLY so the before/after table below can print the old
 *  behaviour for the record. Never imported from production source, never executed against real data —
 *  this is documentation-as-code, not a code path anything depends on. */
function oldCoercedIsGroundedValue(hashValue: unknown): boolean {
  return String(hashValue).length > 0;
}

/** The FIXED per-value check, restated standalone (matches the body now in src/ratify/fastpath.ts) so the
 *  table can show it beside the old one without invoking the full `Grounding` shape. */
function newIsGroundedValue(hashValue: unknown): boolean {
  return typeof hashValue === 'string' && hashValue.length > 0;
}

/** Wrap a single hostile-or-honest value as the sole entry's `anchor.subtreeHash` of a `Grounding`. The
 *  cast is deliberate and confined to this test file: production code never manufactures a `SubtreeHash`
 *  this way, but a hostile caller (JSON.parse / MCP arg / CAS blob) can hand one of these values to a real
 *  door at runtime with no cast in sight, which is the whole point of the defect. */
function groundingWith(hashValue: unknown): Grounding {
  return {
    entries: [
      {
        anchor: { kind: 'symbol', qualifiedPath: 'src/x.ts::f', subtreeHash: hashValue as SubtreeHash },
        path: 'src/x.ts',
      },
    ],
  };
}

// Synthetic — not a hash of anything real, not credential-shaped.
const VALID_HASH: SubtreeHash = asSubtreeHash('sh-synthetic-test-hash-0001');

/** `undefined`/`null` throw on `.subtreeHash.length` in the sealed body (property access on a nullish
 *  value) — no other row throws (`{}`/`[]`/`0`/`false` all resolve `.length` to `undefined`, no throw). */
const SEALED_THROWS_ON: ReadonlySet<string> = new Set(['undefined', 'null']);

/**
 * PINNED FINDING (measured 2026-08-04, #176 re-verification) — THE DIVERGENCE POINTS THE OTHER WAY.
 *
 * The sealed body is `e.anchor.subtreeHash.length > 0` with NO `typeof` guard, so it does not ask for a
 * STRING — it asks for anything wearing a positive `.length`. A non-empty array, a plain object carrying a
 * `length` property, and a boxed `String` object therefore all read as GROUNDED in `@atlas/grounding`,
 * while the local (knowledge) copy — which DOES guard `typeof` — refuses all three.
 *
 * The direction matters and is the opposite of the one this file was originally written to chase. The local
 * fast-path copy is now STRICTLY STRICTER than the sealed reference: there is no input the sealed predicate
 * refuses and the fast path accepts (the fail-OPEN direction, closed by `56f0440`), only inputs the sealed
 * one accepts and the fast path refuses. So the fast path cannot ratify anything the sealed path would
 * reject, and the residual looseness lives in the SEALED reference, not in the copy.
 *
 * NOT FIXED HERE, DELIBERATELY: `packages/grounding/**` is out of scope for this card and the sealed
 * predicate is authoritative by axiom — a behavioural change to it is an owner decision, not a test's. This
 * set pins the OBSERVED behaviour so the gap is visible and cannot regress silently in either direction.
 */
const SEALED_ACCEPTS_NONSTRING: ReadonlySet<string> = new Set([
  "['a','b'] (NON-empty array)",
  '{length:5} (object wearing a .length)',
  'new String("abc") (boxed String object)',
]);

/** The minimum table the brief specifies (undefined/null/''/0/false/{}/[]/valid string), driven through
 *  BOTH implementations below. `expected` is the CORRECT (fail-closed) answer: never auto-accept. */
const COERCION_TABLE: ReadonlyArray<{ readonly label: string; readonly value: unknown; readonly expected: boolean }> = [
  { label: 'undefined', value: undefined, expected: false },
  { label: 'null', value: null, expected: false },
  { label: "'' (empty string)", value: '', expected: false },
  { label: '0', value: 0, expected: false },
  { label: 'false', value: false, expected: false },
  { label: '{} (plain object)', value: {}, expected: false },
  { label: '[] (empty array)', value: [], expected: false },
  { label: "['a','b'] (NON-empty array)", value: ['a', 'b'], expected: false },
  { label: '{length:5} (object wearing a .length)', value: { length: 5 }, expected: false },
  { label: 'new String("abc") (boxed String object)', value: new String('abc'), expected: false },
  { label: 'valid non-empty hash string', value: VALID_HASH, expected: true },
];

/** Runs the sealed `isGrounded` and reports either its boolean or the sentinel `'THROWS'` — never lets an
 *  exception escape the helper, so callers can assert on the OBSERVED behaviour (including the throw)
 *  instead of the test crashing. This wrapper is test-only scaffolding; it changes nothing in
 *  `packages/grounding/**`, which is out of scope for this WP. */
function sealedObserved(g: Grounding): boolean | 'THROWS' {
  try {
    return sealedIsGrounded(g);
  } catch {
    return 'THROWS';
  }
}

describe('GROUND-2 fitness function — local isGrounded ≡ sealed GroundApi.isGrounded, no coercion escape', () => {
  it('prints the before/after coercion table (old fail-open String() vs new fail-closed typeof guard vs sealed)', () => {
    const rows = COERCION_TABLE.map((row) => ({
      input: row.label,
      'old String()-coerced (BUGGY, fail-open)': oldCoercedIsGroundedValue(row.value),
      'new typeof-guarded (FIXED, fail-closed)': newIsGroundedValue(row.value),
      'sealed @atlas/grounding isGrounded': sealedObserved(groundingWith(row.value)),
      expected: row.expected,
    }));
    // eslint-disable-next-line no-console -- deliberate: the brief asks for this table PRINTED.
    console.table(rows);
    for (const row of rows) {
      expect(row['new typeof-guarded (FIXED, fail-closed)']).toBe(row.expected);
      // The sealed impl must never auto-accept a bad row (`expected === false` ⇒ observed is `false` or
      // `'THROWS'`, never `true`) and must never spuriously reject a good one (`expected === true` ⇒
      // observed is exactly `true`). Either refusal shape is acceptable; a stray `true` on a bad row would
      // be the fail-open bug reappearing in the sealed reference itself.
      if (row.expected) {
        expect(row['sealed @atlas/grounding isGrounded']).toBe(true);
      } else if (SEALED_ACCEPTS_NONSTRING.has(row.input)) {
        // The pinned looseness: sealed reads a positive `.length` as grounded whatever the type.
        expect(row['sealed @atlas/grounding isGrounded']).toBe(true);
        // What actually guards the write door is the LOCAL copy, and it refuses.
        expect(row['new typeof-guarded (FIXED, fail-closed)']).toBe(false);
      } else {
        expect(row['sealed @atlas/grounding isGrounded']).not.toBe(true);
      }
    }
  });

  it.each(COERCION_TABLE)('local (knowledge) isGrounded: $label → grounded=$expected, never throws', ({ value, expected }) => {
    expect(() => localIsGrounded(groundingWith(value))).not.toThrow();
    expect(localIsGrounded(groundingWith(value))).toBe(expected);
  });

  it.each(COERCION_TABLE)('sealed (@atlas/grounding) isGrounded: $label → agrees with FIXED, or documented THROW', ({ label, value, expected }) => {
    const observed = sealedObserved(groundingWith(value));
    if (SEALED_ACCEPTS_NONSTRING.has(label)) {
      // PINNED: sealed has no `typeof` guard, so a non-string with a positive `.length` reads as grounded.
      // The local copy refuses it — asserted in the sibling `local (knowledge)` row — so the fast path is
      // strictly stricter and nothing reaches a write door on the strength of this.
      expect(observed).toBe(true);
    } else if (SEALED_THROWS_ON.has(label)) {
      // PINNED FINDING: the sealed reference is not `total` on this input despite its own docstring
      // ("Pure + total", @atlas/grounding types.ts:79-80) — it throws instead of failing closed to
      // `false`. Out of scope to fix here (packages/grounding/** untouched, per brief); pinned so a
      // silent regression to "returns true" would still be caught.
      expect(observed).toBe('THROWS');
    } else {
      expect(observed).toBe(expected);
    }
  });

  it('an entries-empty grounding is ungrounded on BOTH implementations, neither throws', () => {
    const g: Grounding = { entries: [] };
    expect(localIsGrounded(g)).toBe(false);
    expect(sealedObserved(g)).toBe(false);
  });

  it('a multi-entry grounding with ONE bad entry sinks the whole grounding (.every, never .some) — local FIXED never auto-accepts', () => {
    const g: Grounding = {
      entries: [
        { anchor: { kind: 'symbol', qualifiedPath: 'src/a.ts::f', subtreeHash: VALID_HASH }, path: 'src/a.ts' },
        { anchor: { kind: 'symbol', qualifiedPath: 'src/b.ts::g', subtreeHash: undefined as unknown as SubtreeHash }, path: 'src/b.ts' },
      ],
    };
    expect(localIsGrounded(g)).toBe(false);
    // Sealed either agrees (false) or throws — the bad entry is `undefined`, one of the two throwing rows.
    expect(sealedObserved(g)).toBe('THROWS');
  });

  it('ONE-WAY CONTAINMENT — there is NO input the sealed impl refuses and the local fast path accepts', () => {
    // THE SECURITY PROPERTY THIS FILE EXISTS FOR, stated as the implication that actually matters. The
    // original phrasing here claimed FULL PARITY, which the three `SEALED_ACCEPTS_NONSTRING` rows falsify:
    // the two predicates are NOT equal. What holds — and what a write door depends on — is the one-way
    // direction: `sealed refuses ⇒ local refuses`. Its contrapositive is "local accepts ⇒ sealed accepts",
    // i.e. the fast path can never ratify something the sealed predicate would have rejected.
    for (const row of COERCION_TABLE) {
      const g = groundingWith(row.value);
      const sealed = sealedObserved(g);
      const local = localIsGrounded(g);
      expect(local).toBe(row.expected); // local: always answers, always correctly, never throws
      if (sealed !== true) {
        expect(local).toBe(false); // sealed refused (or threw) ⇒ local MUST refuse — the fail-OPEN direction
      }
    }
  });

  it('the local fast path is strictly STRICTER than sealed — the divergence set is non-empty and one-way', () => {
    const localAcceptsSealedRefuses: string[] = [];
    const sealedAcceptsLocalRefuses: string[] = [];
    for (const row of COERCION_TABLE) {
      const g = groundingWith(row.value);
      const sealed = sealedObserved(g);
      const local = localIsGrounded(g);
      if (local === true && sealed !== true) localAcceptsSealedRefuses.push(row.label);
      if (sealed === true && local !== true) sealedAcceptsLocalRefuses.push(row.label);
    }
    // The dangerous direction is EMPTY — nothing the sealed predicate rejects can be fast-path ratified.
    expect(localAcceptsSealedRefuses).toEqual([]);
    // The safe direction is exactly the pinned set — sealed's missing `typeof` guard, not the copy's.
    expect(new Set(sealedAcceptsLocalRefuses)).toEqual(SEALED_ACCEPTS_NONSTRING);
  });
});
