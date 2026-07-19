// @atlas/grounding — test/wp-4.10-a-grd.test.ts   (WP-4.10-a.GROUND · CARVED slice)
//
// RED→GREEN transcription of the VISIBLE goldens for the PINNED verbs of the local drift-oracle:
//   subtreeHash(unit)  ·  isGrounded(g)  ·  driftDetect(grounding, src: Axes)
// The ground() verb (`ground(node)`) is DEFINE-parked (its groundable-unit `node` type is OWNER-DEFINE,
// unpinned) and is CARVED to a successor WP — so the ground()-dependent goldens SCN-GROUND-3a-1 (entry
// dropped) and SCN-GROUND-3c-1 (fuzz over ground()) are NOT transcribed here (node is never invented).
//
// Transcribed (pinned-verb goldens):
//   - SCN-GROUND-1a-1 (happy)  — drift keys off `subtreeHash` alone (reformat ⇒ FRESH, real edit ⇒ DRIFTED).
//   - SCN-GROUND-1b-1 (guard)  — a pure `displayLines` line-shift does not participate in drift.
//   - SCN-GROUND-1c-1 (guard)  — a line-range-only (no-subtreeHash) anchor is not real grounding
//                                 (structural realization via `isGrounded`/`driftDetect`; the ground-time
//                                 "no entry built" half is ground()-owned → parked, noted in the card).
//   - SCN-GROUND-2a-1 (happy)  — `isGrounded` = ≥1 entry ∧ EVERY entry non-empty (AND, never OR).
//   - SCN-GROUND-2b-1 (guard)  — an ungrounded / partial grounding never surfaces FRESH.
//   - SCN-GROUND-3b-1 (guard)  — a gone/unresolvable unit reads DRIFTED, fail-closed, never throws.
//   - SCN-GROUND-5a-1 (happy)  — a real change to the cited unit drifts it.
//   - SCN-GROUND-5b-1 (guard)  — reformat + import-above + unrelated-rename all stay FRESH (0 false drift).
//   - SCN-GROUND-10a-1 (happy) — every `subtreeHash` follows the swapped @atlas/kernel Encoder seam.
//   - SCN-GROUND-10b-1 (guard) — no off-seam digest call site exists in this WP's source (static + differential).
//
// SEAM: `subtreeHash` routes through the sealed @atlas/kernel `Encoder` (no raw hashing). The runtime is
// imported DIRECTLY from ../src/*.js (the barrel is wired by the lead at SEAL). Held-out `-2` fixtures are
// NOT read. GROUND-11 forward-closure fold (WP-4.10-b) and GROUND-13 advisory→STALE routing (WP-4.12-a)
// are OUT of this slice — driftDetect returns the raw LOCAL structural Freshness (FRESH | DRIFTED).

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { asHash, asSubtreeHash, canonicalForm, defaultEncoder } from '@atlas/kernel';
import type { CasObject, Encoder } from '@atlas/kernel';
import type { Axes, IndexNode } from '@atlas/index';
import type { Grounding, GroundingEntry } from '../ref/types.js';
import { bindSubtree } from '../src/subtree.js';
import { driftDetect, isGrounded } from '../src/drift.js';

// ── fixture builders ─────────────────────────────────────────────────────────────────────────────────
const node = (key: string, sh: string, children: IndexNode[] = []): IndexNode => ({
  axis: 'spatial',
  level: 'item',
  key,
  subtreeHash: asSubtreeHash(sh),
  children,
  objects: [],
});
/** A built-index snapshot whose spatial rail carries `leaves` (each a resolvable structural unit). */
const axesWith = (leaves: IndexNode[]): Axes => ({
  spatial: node('repo', 'root', leaves),
  territory: node('repo', 'empty'),
  dependency: node('repo', 'empty'),
  edges: [],
});
const entry = (qp: string, sh: string, displayLines?: string): GroundingEntry => {
  const anchor = { kind: 'symbol' as const, qualifiedPath: qp, subtreeHash: asSubtreeHash(sh) };
  const path = qp.split('#')[0] ?? qp;
  return displayLines === undefined ? { anchor, path } : { anchor, path, displayLines };
};
const grounding = (...entries: GroundingEntry[]): Grounding => ({ entries });

// The cited unit `U_arr = billing.ts › computeArr()` — subtreeHash `sh-arr-01`; a real edit 42→43 ⇒ `sh-arr-02`.
const QP_ARR = 'billing.ts#computeArr';
const g_arr = grounding(entry(QP_ARR, 'sh-arr-01', '40-52'));
const src_same = axesWith([node(QP_ARR, 'sh-arr-01')]); // reformat / import-above / rename: subtree unchanged
const src_edit = axesWith([node(QP_ARR, 'sh-arr-02')]); // real change 42→43: subtree recomputed

describe('WP-4.10-a.GROUND — local drift oracle: subtreeHash · isGrounded · driftDetect (visible goldens)', () => {
  it('SCN-GROUND-1a-1: drift keys off subtreeHash alone (reformat ⇒ FRESH, real edit ⇒ DRIFTED)', () => {
    // run A — whitespace reformat: source bytes changed but normalize(subtree) = sh-arr-01 is unchanged.
    expect(driftDetect(g_arr, src_same)).toBe('FRESH');
    // run B — real edit 42→43: normalized subtree recomputed to sh-arr-02.
    // teeth (breaks-on "oracle mutated to the raw byte-hash — run A flips to DRIFTED, a false alarm"):
    expect(driftDetect(g_arr, src_edit)).toBe('DRIFTED');
  });

  it('SCN-GROUND-1b-1: a pure displayLines line-shift does not drift', () => {
    // import-above shifts displayLines [40-52]→[44-56] while the subtreeHash stays sh-arr-01.
    const shifted = grounding(entry(QP_ARR, 'sh-arr-01', '44-56'));
    // teeth (breaks-on "displayLines folded into the oracle — the line-shift flips it to DRIFTED"):
    expect(driftDetect(shifted, src_same)).toBe('FRESH');
    // the verdict is invariant across the displayLines edit (both legs FRESH).
    expect(driftDetect(g_arr, src_same)).toBe(driftDetect(shifted, src_same));
  });

  it('SCN-GROUND-1c-1: a line-range-only (no-subtreeHash) anchor is not real grounding', () => {
    // E_lronly — a StructRef carrying only a line-range and NO subtreeHash (modelled as an empty oracle).
    const lineRangeOnly = grounding(entry(QP_ARR, '', '40-52'));
    // teeth (breaks-on "a line-range-only anchor is accepted — a fact anchored by lines survives"):
    expect(isGrounded(lineRangeOnly)).toBe(false);
    expect(driftDetect(lineRangeOnly, src_same)).toBe('DRIFTED'); // never FRESH (fail-closed)
  });

  it('SCN-GROUND-2a-1: isGrounded = ≥1 entry AND every entry non-empty (AND, never OR)', () => {
    const g_full = grounding(entry(QP_ARR, 'sh-arr-01'), entry('billing.ts#tax', 'sh-arr-01b'));
    const g_partial = grounding(entry(QP_ARR, 'sh-arr-01'), entry('billing.ts#tax', '')); // one empty
    expect(isGrounded(g_full)).toBe(true);
    // teeth (breaks-on "the `every` conjunct is weakened to `some` (AND→OR) — g_partial wrongly counts as real"):
    expect(isGrounded(g_partial)).toBe(false);
  });

  it('SCN-GROUND-2b-1: an ungrounded / partial grounding never surfaces FRESH', () => {
    const g_empty = grounding(); // 0 entries
    const g_partial = grounding(entry(QP_ARR, 'sh-arr-01'), entry('billing.ts#tax', ''));
    // g_partial's non-empty leg RESOLVES-and-matches in src_same — proving it is the empty leg
    // (via isGrounded), not resolution, that forces DRIFTED.
    const src_partial = axesWith([node(QP_ARR, 'sh-arr-01'), node('billing.ts#tax', 'sh-tax')]);
    // teeth (breaks-on "driftDetect returns FRESH when isGrounded is false — an ungrounded fact passes the gate"):
    expect(driftDetect(g_empty, src_same)).toBe('DRIFTED');
    expect(driftDetect(g_partial, src_partial)).toBe('DRIFTED');
  });

  it('SCN-GROUND-3b-1: a gone/unresolvable unit reads DRIFTED, fail-closed, never throws', () => {
    const g_gone = grounding(entry('deleted.ts#gone', 'sh-gone-01'));
    // the deleted unit is absent from the built index src_same ⇒ unresolvable.
    // teeth (breaks-on "driftDetect returns FRESH for a gone unit — a deleted citation reads still-anchored"):
    expect(() => driftDetect(g_gone, src_same)).not.toThrow();
    expect(driftDetect(g_gone, src_same)).toBe('DRIFTED');
  });

  it('SCN-GROUND-5a-1: a real change to the cited unit drifts it', () => {
    // teeth (breaks-on "the normalizer over-normalizes and erases 42→43 — a changed unit stays FRESH"):
    expect(driftDetect(g_arr, src_edit)).toBe('DRIFTED');
  });

  it('SCN-GROUND-5b-1: reformat + import-above + unrelated-rename all stay FRESH (0 false drift)', () => {
    // three semantically-irrelevant edits, each leaving normalize(subtree) = sh-arr-01 byte-invariant.
    const reformat = axesWith([node(QP_ARR, 'sh-arr-01')]);
    const importAbove = axesWith([node(QP_ARR, 'sh-arr-01'), node('other.ts#import', 'sh-other')]);
    const unrelatedRename = axesWith([node(QP_ARR, 'sh-arr-01'), node('other.ts#renamed', 'sh-other-2')]);
    // teeth (breaks-on "the normalizer leaks formatting/rename noise — a reformat drifts a still-true fact"):
    for (const src of [reformat, importAbove, unrelatedRename]) {
      expect(driftDetect(g_arr, src)).toBe('FRESH');
    }
  });

  it('SCN-GROUND-10a-1: every subtreeHash follows the swapped @atlas/kernel Encoder seam', () => {
    // a stub digest distinct from BLAKE3 — deterministic + injective over the preimage bytes.
    const stub: Encoder = { hash: (b) => asHash(`stub:${Array.from(b).join('.')}`) };
    const blakeApi = bindSubtree(defaultEncoder);
    const stubApi = bindSubtree(stub);
    const units: CasObject[] = [
      { kind: 'item', name: 'computeArr', body: 'return 42' },
      { kind: 'item', name: 'computeArr', body: 'return 43' }, // a real change
      { kind: 'block', name: 'idempotency', text: 'all handlers idempotent' },
    ];
    for (const u of units) {
      // every produced subtreeHash FOLLOWS the seam (0 off-seam divergence).
      expect(stubApi.subtreeHash(u)).toBe(asSubtreeHash(stub.hash(canonicalForm(u))));
      expect(blakeApi.subtreeHash(u)).toBe(asSubtreeHash(defaultEncoder.hash(canonicalForm(u))));
      // teeth (breaks-on "an anchor path inlines its own blake3 — the value does NOT follow the swapped stub"):
      expect(blakeApi.subtreeHash(u)).not.toBe(stubApi.subtreeHash(u)); // the swap moved every value
    }
    // a real change to the cited unit changes the subtreeHash; a re-hash of the same unit is byte-stable.
    expect(blakeApi.subtreeHash(units[0]!)).not.toBe(blakeApi.subtreeHash(units[1]!));
    expect(blakeApi.subtreeHash(units[0]!)).toBe(blakeApi.subtreeHash({ kind: 'item', name: 'computeArr', body: 'return 42' }));
  });

  it('SCN-GROUND-10b-1: no off-seam digest call site exists in this WP source', () => {
    // static grep of Acceptance §8 — this WP's own source carries no raw hash IMPORT or CALL site
    // (a digest CALL `blake3(` / `createHash(` or an off-seam digest IMPORT; prose mentions are exempt).
    const OFF_SEAM_CALL = /\b(blake3|sha256|sha512|md5|crc32|createHash)\s*\(/;
    const OFF_SEAM_IMPORT = /import[^;]*?\b(blake3|sha256|sha512|md5|crc32|createHash|node:crypto|@noble)\b/;
    for (const rel of ['../src/subtree.ts', '../src/drift.ts']) {
      const source = readFileSync(new URL(rel, import.meta.url), 'utf8');
      // teeth (breaks-on "an anchor builder imports blake3 directly and hashes off-seam"):
      expect(OFF_SEAM_CALL.test(source)).toBe(false);
      expect(OFF_SEAM_IMPORT.test(source)).toBe(false);
    }
    // differential: swapping the seam moves the value ⇒ nothing is computed off-seam (folded from 10a).
    const stubA: Encoder = { hash: (b) => asHash(`a:${b.length}`) };
    const stubB: Encoder = { hash: (b) => asHash(`b:${b.length}`) };
    const u: CasObject = { kind: 'item', name: 'x', body: 'return 1' };
    expect(bindSubtree(stubA).subtreeHash(u)).not.toBe(bindSubtree(stubB).subtreeHash(u));
  });
});
