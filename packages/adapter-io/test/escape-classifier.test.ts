// @atlas/adapter-io — test/escape-classifier.test.ts (#99 sound-negation escape analysis)
//
// Acceptance suite for the tsEscapeClassifier + computeEscaping engine, transcribed FROZEN
// against a repo-wide tsc escape oracle (1135/1135 atlas-export targets, 0 unsound). Pins
// each proven SAFE/ESCAPE verdict individually, plus the aggregation rule (any non-safe ref
// wins). Grammar loaded the same way `ast-parser-lifecycle.test.ts` does: directly via
// web-tree-sitter + `tree-sitter-typescript.wasm`, no eager module-level load.

import { createRequire } from 'node:module';
import Parser from 'web-tree-sitter';
import { describe, it, expect, beforeAll } from 'vitest';
import { computeEscaping, type EscapeRef } from '../src/escape/engine.js';
import { tsEscapeClassifier } from '../src/escape/classifier.js';

const require = createRequire(import.meta.url);

type SyntaxNode = Parser.SyntaxNode;

const SRC = [
  "import { importedName } from './mod';",
  'fooCallee(1);',
  'new WidgetCtor();',
  'const y: TypeOnlyName = 1 as any;',
  'type T1 = typeof valueInTypeof;',
  'type T2 = ReturnType<typeof valueInTypeof2>;',
  'register(argName);',
  'const z = asOperand as unknown as Foo;',
  'const el = subscriptBase[0];',
  'sharedName(1);',
  'call(sharedName);',
].join('\n');

/** Depth-first collection of every `identifier`/`type_identifier` node whose text is `name`,
 *  in source order — so a test can pick the Nth occurrence rather than hand-count columns. */
function findIdentifiers(root: SyntaxNode, name: string): SyntaxNode[] {
  const hits: SyntaxNode[] = [];
  const walk = (n: SyntaxNode): void => {
    if ((n.type === 'identifier' || n.type === 'type_identifier') && n.text === name) hits.push(n);
    for (let i = 0; i < n.childCount; i++) {
      const c = n.child(i);
      if (c !== null) walk(c);
    }
  };
  walk(root);
  return hits;
}

function refFor(symbol: string, node: SyntaxNode): EscapeRef {
  return { symbol, docRoot: node.tree.rootNode, range: [node.startPosition.row, node.startPosition.column] };
}

/** Nth (0-based) occurrence of `name`, asserting it exists — keeps call sites destructure-free
 *  and type-clean (findIdentifiers returns an array, not a fixed-length tuple). */
function nthIdentifier(root: SyntaxNode, name: string, n = 0): SyntaxNode {
  const hits = findIdentifiers(root, name);
  const node = hits[n];
  if (node === undefined) throw new Error(`fixture missing occurrence #${n} of "${name}"`);
  return node;
}

describe('#99 tsEscapeClassifier + computeEscaping — proven SAFE/ESCAPE verdicts', () => {
  let root: SyntaxNode;

  beforeAll(async () => {
    await Parser.init();
    const LanguageLoader = (Parser as unknown as { Language: { load(p: string): Promise<unknown> } }).Language;
    const TS = await LanguageLoader.load(require.resolve('tree-sitter-typescript/tree-sitter-typescript.wasm'));
    const parser = new Parser();
    parser.setLanguage(TS as Parameters<Parser['setLanguage']>[0]);
    const tree = parser.parse(SRC);
    if (tree === null) throw new Error('fixture failed to parse');
    root = tree.rootNode;
  });

  it('callee of a call ⇒ NON-escaping [teeth: drop the call_expression rule ⇒ RED]', () => {
    const node = nthIdentifier(root, 'fooCallee');
    const escaped = computeEscaping([refFor('fooCallee', node)], tsEscapeClassifier);
    expect(escaped.has('fooCallee')).toBe(false);
  });

  it('constructor of `new` ⇒ NON-escaping [teeth: drop the new_expression rule ⇒ RED]', () => {
    const node = nthIdentifier(root, 'WidgetCtor');
    const escaped = computeEscaping([refFor('WidgetCtor', node)], tsEscapeClassifier);
    expect(escaped.has('WidgetCtor')).toBe(false);
  });

  it('type annotation position (type_identifier) ⇒ NON-escaping [teeth: drop rule (1) ⇒ RED]', () => {
    const node = nthIdentifier(root, 'TypeOnlyName');
    const escaped = computeEscaping([refFor('TypeOnlyName', node)], tsEscapeClassifier);
    expect(escaped.has('TypeOnlyName')).toBe(false);
  });

  it('typeof value in a type position ⇒ NON-escaping [teeth: drop type_query from TS_TYPE_CTX ⇒ RED]', () => {
    const node = nthIdentifier(root, 'valueInTypeof');
    const escaped = computeEscaping([refFor('valueInTypeof', node)], tsEscapeClassifier);
    expect(escaped.has('valueInTypeof')).toBe(false);
  });

  it('ReturnType<typeof X> value in a type position ⇒ NON-escaping', () => {
    const node = nthIdentifier(root, 'valueInTypeof2');
    const escaped = computeEscaping([refFor('valueInTypeof2', node)], tsEscapeClassifier);
    expect(escaped.has('valueInTypeof2')).toBe(false);
  });

  it('import binding ⇒ NON-escaping [teeth: drop import_specifier from TS_LINKAGE ⇒ RED]', () => {
    const node = nthIdentifier(root, 'importedName');
    const escaped = computeEscaping([refFor('importedName', node)], tsEscapeClassifier);
    expect(escaped.has('importedName')).toBe(false);
  });

  it('call argument ⇒ ESCAPE [teeth: mark call_expression args safe ⇒ RED]', () => {
    const node = nthIdentifier(root, 'argName');
    const escaped = computeEscaping([refFor('argName', node)], tsEscapeClassifier);
    expect(escaped.has('argName')).toBe(true);
  });

  it('operand of `X as T` ⇒ ESCAPE — the critical regression case (TS_TYPE_CTX must NOT contain '
    + 'as_expression/satisfies_expression) [teeth: add as_expression to TS_TYPE_CTX ⇒ RED]', () => {
    const node = nthIdentifier(root, 'asOperand');
    const escaped = computeEscaping([refFor('asOperand', node)], tsEscapeClassifier);
    expect(escaped.has('asOperand')).toBe(true);
  });

  it('subscript/element-access base ⇒ ESCAPE [teeth: mark subscript_expression object safe ⇒ RED]', () => {
    const node = nthIdentifier(root, 'subscriptBase');
    const escaped = computeEscaping([refFor('subscriptBase', node)], tsEscapeClassifier);
    expect(escaped.has('subscriptBase')).toBe(true);
  });

  it('aggregation: a safe callee ref + an escaping argument ref for the SAME symbol ⇒ ESCAPE '
    + '(any non-safe ref wins) [teeth: short-circuit on first ref ⇒ RED]', () => {
    const calleeNode = nthIdentifier(root, 'sharedName', 0);
    const argNode = nthIdentifier(root, 'sharedName', 1);
    const refs: EscapeRef[] = [refFor('sharedName', calleeNode), refFor('sharedName', argNode)];
    const escaped = computeEscaping(refs, tsEscapeClassifier);
    expect(escaped.has('sharedName')).toBe(true);
  });
});
