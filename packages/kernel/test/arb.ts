// @atlas/kernel — test/arb.ts  (NOT a *.test.ts — shared fast-check arbitraries, never run as a suite)
//
// Bounded JSON generators for the KERNEL-1/2/8 ∀-laws. Keys are drawn from a small ASCII pool so no two
// generated keys ever NFC-collide (which would make key-order invariance genuinely ambiguous) and never
// spell a side-index name (grounding/status/freshness) — keeping the generators faithful to the frozen law,
// not overfit to a fixture.

import fc from 'fast-check';

const keyArb = fc.stringOf(fc.constantFrom(...'abcdefghij'.split('')), { minLength: 1, maxLength: 5 });
const leafArb = fc.oneof(fc.constant(null), fc.boolean(), fc.integer(), fc.string());
const d1 = fc.oneof(leafArb, fc.array(leafArb, { maxLength: 4 }), fc.dictionary(keyArb, leafArb, { maxKeys: 4 }));
const d2 = fc.oneof(leafArb, fc.array(d1, { maxLength: 4 }), fc.dictionary(keyArb, d1, { maxKeys: 4 }));

/** An arbitrary JSON *object* (integers only — floats are a canonical-form violation), up to depth 3. */
export const jsonObjArb = fc.dictionary(keyArb, d2, { maxKeys: 6 });

/** Re-present a JSON value with every object's keys in reverse order (recursively). Same content, a
 *  different key-order presentation — the canonical form must be invariant to it. */
export function reorder(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(reorder);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o).reverse()) out[k] = reorder(o[k]);
    return out;
  }
  return v;
}
