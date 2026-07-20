// @atlas/adapter-io — test/ast.test.ts   (WP-9.1.2.AST — EPIC-1-b, REQ-ADAPTER, ADAPT-AST-1)
//
// Acceptance suite for the AST fold `foldAstUnits` (ADAPT-AST-1; atlas-adapters:52-54). It folds sub-file
// item/block units onto the spatial rail at the granularity the index reference pins:
//   • `item`  = a top-level declaration (fn/class/const/type/interface/enum)         (atlas-index:54)
//   • `block` = a sub-item unit with its own subtreeHash (a method body / a closure)  (atlas-index:55)
// It is an ADDITIVE, TOTAL, deterministic refinement (same bytes ⇒ same units): existing spatial nodes are
// never dropped or mutated, an unparseable/non-TS file folds an honest EMPTY refinement, no unit is faked.
//
// Goldens (each with a named mutant that flips it RED):
//   • ADAPT-AST-preserve  — every original spatial node survives, file leaf gains item children   [drop-node]
//   • ADAPT-AST-items     — the file's top-level decls fold as items in canonical source order    [drop/mis-order-item]
//   • ADAPT-AST-blocks    — a class item carries exactly its method bodies as block children       [fabricate/mis-order-block]
//   • ADAPT-AST-content   — each unit's `content` is its exact source slice (nothing invented)     [wrong-slice]
//   • ADAPT-AST-parsefail — a syntactically broken .ts leaf keeps its node with an EMPTY refinement [fabricate-on-error]
//   • ADAPT-AST-nonts     — a non-TS leaf is untouched                                             [refine-non-ts]
//   • ADAPT-AST-det       — folding twice is byte-identical (no clock/nonce)                        [nondeterminism]

import { describe, it, expect } from 'vitest';
import type { FileTree } from '@atlas/index';
import { foldAstUnits } from '../src/ast.js';

const SRC = [
  "import { z } from 'zod';",
  'export function foo(a: number): number { return a + 1; }',
  "export class Bar { greet(): string { return 'hi'; } count(): number { return 2; } }",
  'const q = 3;',
  '',
].join('\n');

const BROKEN = 'export function oops(a: number): number { return a + ;'; // deliberate syntax error

/** A minimal spatial FileTree: root → src/{app.ts, broken.ts} + README.md, mirroring the fs walker shape. */
function fixtureTree(): FileTree {
  return {
    path: '.',
    children: [
      { path: 'README.md', children: [], content: '# hi\n' },
      {
        path: 'src',
        children: [
          { path: 'src/app.ts', children: [], content: SRC },
          { path: 'src/broken.ts', children: [], content: BROKEN },
        ],
      },
    ],
  };
}

/** Depth-first search for the node whose `path` equals `path`. */
function find(node: FileTree, path: string): FileTree | undefined {
  if (node.path === path) return node;
  for (const c of node.children) {
    const hit = find(c, path);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/** The trailing `:<kind>:<name>` name of a refinement path (units are keyed `file#start:kind:name`). */
const unitName = (t: FileTree): string => t.path.slice(t.path.lastIndexOf(':') + 1);
const unitKind = (t: FileTree): string => t.path.split(':').slice(-2)[0] ?? '';

describe('foldAstUnits — ADAPT-AST-1 (fold item/block units onto the spatial rail)', () => {
  it('ADAPT-AST-preserve: every original spatial node survives; file leaf gains item children [drop-node]', () => {
    const out = foldAstUnits(fixtureTree());
    // Original structure preserved: root, README.md (content intact), src dir, both file leaves still present.
    expect(find(out, '.')).toBeDefined();
    expect(find(out, 'README.md')?.content).toBe('# hi\n');
    expect(find(out, 'src')).toBeDefined();
    const app = find(out, 'src/app.ts');
    expect(app).toBeDefined();
    expect(app?.content).toBe(SRC); // the file leaf's own content is untouched (additive, not mutated)
    expect((app?.children.length ?? 0) > 0).toBe(true); // ...and it is now refined with item children
  });

  it('ADAPT-AST-items: top-level decls fold as items in canonical source order [drop/mis-order-item]', () => {
    const out = foldAstUnits(fixtureTree());
    const app = find(out, 'src/app.ts');
    const items = app?.children ?? [];
    // import is NOT a declaration → excluded (honest); foo/Bar/q in source order.
    expect(items.map(unitName)).toEqual(['foo', 'Bar', 'q']);
    expect(items.map(unitKind)).toEqual(['function_declaration', 'class_declaration', 'lexical_declaration']);
  });

  it('ADAPT-AST-blocks: a class item carries exactly its method bodies as blocks, in order [fabricate/mis-order-block]', () => {
    const out = foldAstUnits(fixtureTree());
    const bar = find(out, 'src/app.ts')?.children.find((c) => unitName(c) === 'Bar');
    expect(bar?.children.map(unitName)).toEqual(['greet', 'count']);
    expect(bar?.children.map(unitKind)).toEqual(['method_definition', 'method_definition']);
    // a plain function/const carries no block units (honest empty, not a fabricated child)
    const foo = find(out, 'src/app.ts')?.children.find((c) => unitName(c) === 'foo');
    expect(foo?.children).toEqual([]);
  });

  it('ADAPT-AST-content: each unit content is its exact source slice [wrong-slice]', () => {
    const out = foldAstUnits(fixtureTree());
    const foo = find(out, 'src/app.ts')?.children.find((c) => unitName(c) === 'foo');
    expect(foo?.content).toBe('function foo(a: number): number { return a + 1; }');
    const greet = find(out, 'src/app.ts')
      ?.children.find((c) => unitName(c) === 'Bar')
      ?.children.find((c) => unitName(c) === 'greet');
    expect(greet?.content).toBe("greet(): string { return 'hi'; }");
  });

  it('ADAPT-AST-parsefail: a broken .ts leaf keeps its node with an EMPTY refinement [fabricate-on-error]', () => {
    const out = foldAstUnits(fixtureTree());
    const broken = find(out, 'src/broken.ts');
    expect(broken).toBeDefined();
    expect(broken?.content).toBe(BROKEN); // node preserved
    expect(broken?.children).toEqual([]); // ...but no fabricated units on a parse failure
  });

  it('ADAPT-AST-nonts: a non-TS leaf is untouched [refine-non-ts]', () => {
    const out = foldAstUnits(fixtureTree());
    const readme = find(out, 'README.md');
    expect(readme?.children).toEqual([]);
    expect(readme?.content).toBe('# hi\n');
  });

  it('ADAPT-AST-det: folding twice is byte-identical [nondeterminism]', () => {
    const a = foldAstUnits(fixtureTree());
    const b = foldAstUnits(fixtureTree());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // idempotence of the source shape: the refined app.ts item set is stable run-to-run
    expect(find(a, 'src/app.ts')?.children.map(unitName)).toEqual(find(b, 'src/app.ts')?.children.map(unitName));
  });
});
