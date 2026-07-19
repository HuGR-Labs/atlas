// @atlas/tools — test/wp-6.19-tools.test.ts   (WP-6.19.TOOLS — EPIC-19, REQ-TOOLS-6a/6b/6c)
//
// Acceptance-gap closure for WP-6.19.TOOLS (atlas-query — resolve scope → covering territories, return the
// bounded tier≥T1 pack, re-ground stale). The runtime facet was authored under the WP-7.26-b dispatch as
// ../src/query.ts and is SEALED; that dispatch transcribed SCN-TOOLS-3/4/12 but NOT 6.19.TOOLS's OWN
// acceptance goldens. This test transcribes them FAITHFULLY (teeth included) against the SEALED impl,
// imported DIRECTLY from source (../src/query.js):
//   • SCN-TOOLS-6a-1 — a file scope resolves through the index to its covering territory (not a global dump)
//   • SCN-TOOLS-6b-1 — the bounded pack contains only tier≥T1 nodes (0 below T1) within the ≤ ~2K bound
//   • SCN-TOOLS-6c-1 — a stale pack is SURFACED (stale:true), not trusted — re-ground before trust
//
// Identity, where needed, rides the SEALED @atlas/kernel `id` seam (never a hand-rolled digest). Held-out
// `-2` fixtures are NOT transcribed here — the gate runs those. This test only ADDS acceptance; it edits
// NO sealed file.

import { describe, it, expect } from 'vitest';
import type { Hash, NodeKey, PackInvariant } from '@atlas/contracts';
import { createQuery } from '../src/query.js';
import type { QueryIndex } from '../src/query.js';

// ── shared fixtures ──────────────────────────────────────────────────────────────────────────────

/** The `finance/` index double: resolves a scope through the index to its covering territory (a scope NOT
 *  covered by a real territory would fall through to a global `root/` dump — the behaviour the teeth forbid),
 *  and hands back the covering territory's RAW invariant set (T0/T1/T2 mixed — the read surface bounds it). */
const financeIndex: QueryIndex = {
  cover(scope) {
    const territory = scope.split('/').includes('finance') ? 'finance/' : 'root/';
    return {
      territory,
      axisHash: 'axis-finance-01' as Hash,
      invariants: [
        { nodeId: 'claim:acme-arr' as NodeKey, tier: 'T1', claim: 'ACME ARR 2024 = $4.2M' },
        { nodeId: 'claim:acme-ceo' as NodeKey, tier: 'T0', claim: 'ACME CEO = Jane Roe' },
        // a T2 (below-T1) node the bounded read surface MUST drop out of the pack:
        { nodeId: 'note:desk-layout' as NodeKey, tier: 'T2', claim: 'finance desk is on floor 3' },
      ],
      stale: false,
    };
  },
};

// ── REQ-TOOLS-6a — query resolves scope to covering territories ─────────────────────────────────────

describe('WP-6.19.TOOLS — atlas-query resolves scope to its covering territory', () => {
  it('SCN-TOOLS-6a-1: a file scope resolves through the index to its covering territory (not a global dump)', () => {
    // Given atlas-query(scope="src/finance/arr.rs") over the reference query surface with the index reference
    const q = createQuery(financeIndex);

    // When the scope is resolved
    const pack = q.query('src/finance/arr.rs');

    // Then it resolves through the index to the covering territory `finance/` — not a global dump.
    // teeth (breaks-on "atlas-query ignores the index and returns a global pack — the file scope is not
    // resolved to its covering territory"): the pack is keyed to `finance/`, never the global `root/` dump.
    expect(pack.territory).toBe('finance/');
    expect(pack.territory).not.toBe('root/');
    expect(pack.axisHash).toBe('axis-finance-01'); // the resolved axis snapshot, not a global one
  });
});

// ── REQ-TOOLS-6b — pack is bounded to tier≥T1 ───────────────────────────────────────────────────────

describe('WP-6.19.TOOLS — the pack is bounded to tier≥T1', () => {
  it('SCN-TOOLS-6b-1: the finance pack contains only tier≥T1 nodes (0 below T1) within the ≤ ~2K bound', () => {
    // Given atlas-query returning a Pack for the `finance/` territory
    const q = createQuery(financeIndex);
    const pack = q.query('src/finance/arr.rs');

    // When the pack contents are inspected
    const belowT1 = pack.invariants.filter((inv: PackInvariant) => inv.tier === 'T2');

    // Then every node is tier ≥ T1 (0 nodes below T1) …
    // teeth (breaks-on "the pack leaks a T2/below-T1 node — the tier ≥ T1 filter is violated").
    expect(belowT1).toHaveLength(0);
    expect(pack.invariants.every((inv: PackInvariant) => inv.tier !== 'T2')).toBe(true);
    // the below-T1 node the raw cover carried IS bounded out (the T2 `note:desk-layout` is gone):
    expect(pack.invariants.map((inv: PackInvariant) => inv.nodeId)).not.toContain('note:desk-layout');
    expect(pack.invariants.map((inv: PackInvariant) => inv.nodeId)).toEqual(['claim:acme-arr', 'claim:acme-ceo']);

    // … and the pack size is within the ≤ ~2K advisory bound (a size test, not a correctness oracle).
    expect(pack.tokenEstimate).toBeLessThanOrEqual(2000);
  });
});

// ── REQ-TOOLS-6c — stale pack must be re-grounded ───────────────────────────────────────────────────

/** A `finance/` index whose backing grounding has DRIFTED: node N2 rides the cover with `stale:true`. The
 *  read surface must SURFACE that flag on the pack — a stale pack is a signal to re-ground, not fresh truth. */
const staleIndex: QueryIndex = {
  cover(scope) {
    const territory = scope.split('/').includes('finance') ? 'finance/' : 'root/';
    return {
      territory,
      axisHash: 'axis-finance-01' as Hash,
      invariants: [
        { nodeId: 'claim:acme-arr' as NodeKey, tier: 'T1', claim: 'ACME ARR 2024 = $4.2M' },
        { nodeId: 'N2' as NodeKey, tier: 'T1', claim: 'ACME headcount 2024 = 120' },
      ],
      stale: true, // the backing grounding drifted — the whole pack is stale
    };
  },
};

describe('WP-6.19.TOOLS — a stale pack is surfaced, not trusted', () => {
  it('SCN-TOOLS-6c-1: a stale pack is surfaced (stale:true), never served as fresh truth', () => {
    // Given atlas-query returning node N2 with stale:true
    const q = createQuery(staleIndex);

    // When the pack is delivered
    const pack = q.query('src/finance/arr.rs');

    // Then stale:true is surfaced on the pack and the contract requires re-grounding before it is trusted —
    // a stale pack is never served as fresh truth.
    // teeth (breaks-on "the stale:true flag is dropped and the stale pack is served as fresh — trusted
    // without re-grounding"): the flag rides the delivered pack and is NOT silently cleared to false.
    expect(pack.stale).toBe(true);
    expect(pack.invariants.map((inv: PackInvariant) => inv.nodeId)).toContain('N2');
    // control: the fresh cover surfaces stale:false — the flag tracks the backing grounding, not a constant.
    expect(createQuery(financeIndex).query('src/finance/arr.rs').stale).toBe(false);
  });
});
