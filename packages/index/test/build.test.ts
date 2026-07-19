// @atlas/index — test/build.test.ts
//
// RED→GREEN transcription of the VISIBLE build-facet goldens SCN-INDEX-3a-1..3e-1 (REQ-INDEX-3a..3e) plus
// the governing ∀-law PROP-INDEX-3 (mechanical zero-LLM build). Golden subtreeHashes (`sp-rp`, `bk-11`, …)
// are SYMBOLIC, so every assertion is RELATIONAL / order-independent — the rollup is order-independent, a
// rebuild is byte-identical, an unresolvable edge is RECORDED (`unresolved`, `to: null`) never invented.
// Held-out `-2` fixtures are NOT transcribed (GATE runs those).

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { canonicalForm, id } from '@atlas/kernel';
import type { FileTree, ScipOutput, DepEdge, Axes } from '@atlas/index';
import { build } from '../src/build.js';

const decode = (b: Uint8Array): string => new TextDecoder().decode(b);
const canon = (a: Axes): string => decode(canonicalForm(a));

// The block-IDX §fixtures spatial tree: repo:atlas → crate:core → module:cas → {cas.ts→b1,b2; store.ts→b3}.
const tree: FileTree = {
  path: 'repo:atlas',
  children: [
    {
      path: 'crate:core',
      children: [
        {
          path: 'module:cas',
          children: [
            {
              path: 'file:cas.ts',
              children: [
                { path: 'block:b1', children: [], content: 'put' },
                { path: 'block:b2', children: [], content: 'get' },
              ],
            },
            { path: 'file:store.ts', children: [{ path: 'block:b3', children: [], content: 'write' }] },
          ],
        },
      ],
    },
  ],
};

// SCIP fixture: store.ts references cas/put (defined in cas.ts → resolved) and rust/native# (a TS→Rust FFI
// boundary unseeable by scip-typescript → no in-index definition → unresolved).
const scip: ScipOutput = {
  documents: [
    { relativePath: 'file:cas.ts', occurrences: [{ symbol: 'cas/put', role: 'definition' }] },
    {
      relativePath: 'file:store.ts',
      occurrences: [
        { symbol: 'cas/put', role: 'reference' },
        { symbol: 'rust/native#', role: 'reference' },
      ],
    },
  ],
};

const buildSrc = (): string =>
  readFileSync(fileURLToPath(new URL('../src/build.ts', import.meta.url)), 'utf8') +
  readFileSync(fileURLToPath(new URL('../src/depgraph.ts', import.meta.url)), 'utf8');

describe('INDEX-3 — mechanical SCIP-derived build (visible goldens)', () => {
  it('SCN-INDEX-3a-1: every axis derived mechanically via SCIP, 0 model calls', () => {
    const axes = build(tree, scip);
    // all three axes produced, each tagged with its own hierarchy
    expect(axes.spatial.axis).toBe('spatial');
    expect(axes.territory.axis).toBe('territory');
    expect(axes.dependency.axis).toBe('dependency');
    // model-call-count == 0 operationalized: every edge is grounded in the SCIP input — the count of
    // resolved/unresolved edges equals the count of defined/undefined references, none inferred.
    const defined = new Set(
      scip.documents.flatMap((d) => d.occurrences.filter((o) => o.role === 'definition').map((o) => o.symbol)),
    );
    const refs = scip.documents.flatMap((d) => d.occurrences.filter((o) => o.role === 'reference'));
    const expResolved = refs.filter((r) => defined.has(r.symbol)).length;
    const expUnresolved = refs.filter((r) => !defined.has(r.symbol)).length;
    expect(axes.edges.filter((e) => e.kind === 'resolved').length).toBe(expResolved);
    expect(axes.edges.filter((e) => e.kind === 'unresolved').length).toBe(expUnresolved);
    // teeth: an LLM-inferred edge would add a `resolved` edge with no backing definition (count > expResolved).
    for (const e of axes.edges.filter((x) => x.kind === 'resolved')) expect(e.to).not.toBeNull();
  });

  it('SCN-INDEX-3b-1: the build path has zero model dependency (static import audit)', () => {
    const src = buildSrc().toLowerCase();
    for (const bad of ['openai', 'anthropic', 'langchain', 'embedding', 'llm']) {
      expect(src.includes(`'${bad}`) || src.includes(`"${bad}`) || src.includes(`/${bad}`)).toBe(false);
    }
    // build is a pure function of (tree, scip): re-running with the same inputs yields the same result.
    expect(canon(build(tree, scip))).toBe(canon(build(tree, scip)));
  });

  it('SCN-INDEX-3c-1: backend is SCIP, never stack-graphs or LSIF', () => {
    const src = buildSrc().toLowerCase();
    expect(src.includes('lsif')).toBe(false);
    expect(src.includes('stack-graph')).toBe(false);
    // the dependency edges are a function of the SCIP output alone: empty SCIP ⇒ no edges.
    expect(build(tree, { documents: [] }).edges).toEqual([]);
    expect(build(tree, scip).edges.length).toBeGreaterThan(0);
  });

  it('SCN-INDEX-3d-1: rebuilding twice with the same SCIP indexer yields identical graphs', () => {
    // byte-identical: the canonical preimages of two independent builds match exactly.
    expect(canon(build(tree, scip))).toBe(canon(build(tree, scip)));
    // teeth: folding wall-clock / iteration-order state would make the second preimage differ.
  });

  it('SCN-INDEX-3e-1: an unresolvable / cross-language edge is declared unresolved, not guessed', () => {
    const edges = build(tree, scip).edges;
    const unresolved = edges.filter((e) => e.kind === 'unresolved');
    expect(unresolved.length).toBeGreaterThan(0);
    // no target invented for the cross-language edge — `to` is null, never a fabricated resolved target.
    for (const e of unresolved) expect(e.to).toBeNull();
    expect(edges.some((e) => e.kind === 'resolved' && e.to === null)).toBe(false);
  });

  it('rollup order-independence: reordering children leaves the parent subtreeHash unchanged', () => {
    const reord: FileTree = {
      ...tree,
      children: tree.children.map((c) => ({
        ...c,
        children: c.children.map((m) => ({ ...m, children: [...m.children].reverse() })),
      })),
    };
    // the spatial rollup is over SORTED child hashes ⇒ invariant to input child order.
    expect(build(reord, scip).spatial.subtreeHash).toBe(build(tree, scip).spatial.subtreeHash);
  });
});

// ── PROP-INDEX-3 — mechanical zero-LLM build (the frozen ∀-law over generated inputs) ─────────────────
const nameArb = fc.stringOf(fc.constantFrom(...'abcdef'.split('')), { minLength: 1, maxLength: 4 });
const symArb = fc.stringOf(fc.constantFrom(...'xyz#/'.split('')), { minLength: 1, maxLength: 5 });

function leafTreeArb(depth: number): fc.Arbitrary<FileTree> {
  const leaf = fc.record({ path: nameArb, content: fc.string({ maxLength: 6 }) }).map(
    (r): FileTree => ({ path: r.path, children: [], content: r.content }),
  );
  if (depth <= 0) return leaf;
  return fc.oneof(
    leaf,
    fc.record({ path: nameArb, children: fc.array(leafTreeArb(depth - 1), { maxLength: 3 }) }).map(
      (r): FileTree => ({ path: r.path, children: r.children }),
    ),
  );
}

const scipArb: fc.Arbitrary<ScipOutput> = fc
  .array(
    fc.record({
      relativePath: nameArb,
      occurrences: fc.array(
        fc.record({ symbol: symArb, role: fc.constantFrom('definition' as const, 'reference' as const) }),
        { maxLength: 4 },
      ),
    }),
    { maxLength: 4 },
  )
  .map((documents) => ({ documents }));

describe('PROP-INDEX-3 — ∀ (tree, scipOutput): mechanical, idempotent, honest unresolved edges', () => {
  it('idempotent byte-identical rebuild ∧ every edge grounded in SCIP (no invented target)', () => {
    fc.assert(
      fc.property(leafTreeArb(3), scipArb, (t, s) => {
        const a = build(t, s);
        // idempotent: two builds are byte-identical.
        expect(canon(a)).toBe(canon(build(t, s)));
        const defined = new Set(
          s.documents.flatMap((d) => d.occurrences.filter((o) => o.role === 'definition').map((o) => o.symbol)),
        );
        // the set of documents that define at least one symbol (their canonical node hashes).
        const definedDocs = new Set(
          s.documents
            .filter((d) => d.occurrences.some((o) => o.role === 'definition'))
            .map((d) => String(id({ file: d.relativePath }))),
        );
        for (const e of a.edges as readonly DepEdge[]) {
          if (e.kind === 'resolved') {
            expect(e.to).not.toBeNull();
            // no invented target: a resolved edge points ONLY at a document that really defines a symbol.
            expect(definedDocs.has(String(e.to))).toBe(true);
          } else {
            expect(e.to).toBeNull(); // unresolvable ⇒ declared, target null, never guessed
          }
        }
        // honest under-approximation: an `unresolved` edge exists IFF some reference has no in-index
        // definition (dedup-safe existence, not a per-reference count).
        const refs = s.documents.flatMap((d) => d.occurrences.filter((o) => o.role === 'reference'));
        const hasUnresolvableRef = refs.some((r) => !defined.has(r.symbol));
        expect(a.edges.some((e) => e.kind === 'unresolved')).toBe(hasUnresolvableRef);
      }),
      { numRuns: 200 },
    );
  });
});
