// HELD-OUT GATE (reviewer-authored) — SCN-GROUND-3a-2 (goldens-grd.md:576-583, held_out:true) +
// synthesized GROUND-3 adversarial legs. Disjoint fixture universe: U_tax = pricing.ts#computeVat @sh-tax-01.
import { describe, it, expect } from 'vitest';
import { asSubtreeHash } from '@atlas/kernel';
import type { Axes, IndexNode } from '@atlas/index';
import { driftDetect, isGrounded } from '../src/drift.js';
import { ground } from '../src/ground.js';
import type { Citation, GroundableUnit } from '../src/ground.js';

const node = (key: string, sh: string, children: IndexNode[] = []): IndexNode => ({
  axis: 'spatial', level: 'item', key, subtreeHash: asSubtreeHash(sh), children, objects: [],
});
const axesWith = (leaves: IndexNode[]): Axes => ({
  spatial: node('repo', 'root', leaves), territory: node('repo', 'empty'),
  dependency: node('repo', 'empty'), edges: [],
});
const cite = (qp: string, dl?: string): Citation => {
  const path = qp.split('#')[0] ?? qp;
  const base = { kind: 'symbol' as const, qualifiedPath: qp, path };
  return dl === undefined ? base : { ...base, displayLines: dl };
};
const unit = (...citations: Citation[]): GroundableUnit => ({ citations });

const QP_TAX = 'pricing.ts#computeVat';
const src = axesWith([node(QP_TAX, 'sh-tax-01')]); // E_tax resolves; E_gone2 absent

describe('HELD-OUT WP-4.10-c.GROUND', () => {
  it('SCN-GROUND-3a-2: ground() drops E_gone2, only E_tax survives (re-derived @sh-tax-01)', () => {
    const f = unit(cite(QP_TAX, '88-96'), cite('purged.ts#gone2', '5-9'));
    const g = ground(f, src);
    expect(g.entries).toHaveLength(1);
    expect(g.entries[0]?.anchor.qualifiedPath).toBe(QP_TAX);
    expect(g.entries[0]?.anchor.subtreeHash).toBe(asSubtreeHash('sh-tax-01'));
    expect(g.entries[0]?.displayLines).toBe('88-96');
    expect(isGrounded(g)).toBe(true);
    expect(driftDetect(g, src)).toBe('FRESH');
  });

  it('synthesized: a 0-citation unit yields an empty Grounding, isGrounded false, no throw', () => {
    let g!: ReturnType<typeof ground>;
    expect(() => (g = ground(unit(), src))).not.toThrow();
    expect(g.entries).toHaveLength(0);
    expect(isGrounded(g)).toBe(false);
    expect(driftDetect(g, src)).toBe('DRIFTED');
  });

  it('synthesized: every-citation-gone unit collapses to empty, DRIFTED, never FRESH', () => {
    const f = unit(cite('gone-a.ts#x'), cite('gone-b.ts#y', '1-2'), cite('nested/deep.ts#a.b.c'));
    const g = ground(f, src);
    expect(g.entries).toHaveLength(0);
    expect(isGrounded(g)).toBe(false);
    expect(driftDetect(g, src)).toBe('DRIFTED');
  });
});
