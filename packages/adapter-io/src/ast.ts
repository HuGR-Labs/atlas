// @atlas/adapter-io — src/ast.ts  (ADAPT-AST-1: fold item/block AST units into the spatial tree)
//
// The raw ast adapter: an ADDITIVE refinement over a `FileTree` that folds sub-file item/block units onto
// the spatial rail repo→crate→module→file→item→block (atlas-index:52-57). For each parseable TS/TSX file
// leaf it parses the leaf `content` with web-tree-sitter + the prebuilt grammar, then hangs the file's
// top-level declarations (`item`, atlas-index:54) as child leaves, each carrying its own sub-item units
// (`block`, atlas-index:55) as grandchildren. Deterministic (same bytes ⇒ same units, ADAPT-AST-1) and
// TOTAL: an unparseable / non-TS / error-bearing file keeps its existing spatial node, folding an honest
// EMPTY refinement — no node is dropped or mutated, and no unit is ever fabricated.
//
// Fork-2 (sync/async) resolution: `Parser.parse` and the whole tree walk are SYNCHRONOUS; only the one-time
// WASM runtime `init()` + grammar `load()` are async. Rather than a module-level top-level await (which would
// force EVERY consumer of the `@atlas/adapter-io` barrel to eager-load ~1.4MB of TS/TSX grammar at import,
// even when they never touch AST), the async warmup is OPT-IN via `initAst()`. The grammars live in
// module-level singletons (initially null); `foldAstUnits` reads them synchronously and — if warmup has not
// completed — returns the tree UNCHANGED (a valid additive no-op: AST refinement is opt-in, so no refinement
// is a correct additive result). This keeps the frozen SYNC `foldAstUnits` signature intact.

import { createRequire } from 'node:module';
import Parser from 'web-tree-sitter';
import type { FileTree } from '@atlas/index';

const require = createRequire(import.meta.url);

// ---- opt-in, deterministic module init (the ONLY async work; parse/walk below are sync) ----------------
type TsLanguage = NonNullable<Parameters<Parser['setLanguage']>[0]>;

// Module-level singletons: null until `initAst()` completes. `foldAstUnits` treats null as "no grammar
// loaded yet" and folds an honest empty (unchanged) refinement — never throwing, never blocking.
let TS_LANG: TsLanguage | null = null;
let TSX_LANG: TsLanguage | null = null;
// Cache the warmup promise so concurrent/repeat `initAst()` calls share one load and never re-load.
let initPromise: Promise<void> | null = null;

/** Idempotent async warmup: run `Parser.init()` + load the TS/TSX grammars into the module singletons. Safe
 *  to call any number of times (the in-flight/resolved promise is cached; the grammars are loaded once). This
 *  is the ONLY async surface — importing the barrel triggers ZERO grammar/WASM load until this is awaited. */
export function initAst(): Promise<void> {
  if (initPromise !== null) return initPromise;
  initPromise = (async () => {
    await Parser.init();
    // `Parser.Language` is populated by `init()` (emscripten runtime), so it MUST be read after the await.
    const LanguageLoader = (Parser as unknown as { Language: { load(path: string): Promise<TsLanguage> } }).Language;
    TS_LANG = await LanguageLoader.load(
      require.resolve('tree-sitter-typescript/tree-sitter-typescript.wasm'),
    );
    TSX_LANG = await LanguageLoader.load(
      require.resolve('tree-sitter-typescript/tree-sitter-tsx.wasm'),
    );
  })();
  return initPromise;
}

// ---- the transcribed granularity (atlas-index:54-55) --------------------------------------------------
// `item` = a top-level declaration (fn / struct / trait / class / const / type) — atlas-index:54. Mapped to
// the tree-sitter TS declaration node kinds; an `export`/`export default` wrapper is unwrapped to its inner
// declaration so the item is the decl itself, not the export keyword.
const ITEM_KINDS: ReadonlySet<string> = new Set([
  'function_declaration',
  'generator_function_declaration',
  'class_declaration',
  'abstract_class_declaration',
  'interface_declaration',
  'type_alias_declaration',
  'enum_declaration',
  'lexical_declaration',
  'variable_declaration',
  'internal_module',
  'module',
]);

// `block` = a sub-item unit with its own subtreeHash — "a method body, a match arm, a closure"
// (atlas-index:55). TS has no match arms; its analogues are class method bodies and closures. Collected as
// the OUTERMOST non-overlapping such units within an item (the single `block` leaf level does not nest).
const BLOCK_KINDS: ReadonlySet<string> = new Set([
  'method_definition',
  'arrow_function',
  'function_expression',
  'generator_function',
]);

type SyntaxNode = Parser.SyntaxNode;

/** Pick the grammar for a file path, or `undefined` for a language this adapter does not parse — OR when
 *  `initAst()` has not yet loaded the grammars (singletons still null), so an uninitialized fold is a total
 *  no-op that refines nothing. */
function grammarFor(path: string): TsLanguage | undefined {
  if (path.endsWith('.tsx')) return TSX_LANG ?? undefined;
  if (path.endsWith('.ts') || path.endsWith('.mts') || path.endsWith('.cts')) return TS_LANG ?? undefined;
  return undefined;
}

/** Unwrap an `export` / `export default` wrapper to the declaration it carries (else the node itself). */
function unwrapExport(node: SyntaxNode): SyntaxNode {
  if (node.type !== 'export_statement') return node;
  const decl = node.childForFieldName('declaration');
  if (decl !== null) return decl;
  for (const c of node.namedChildren) if (ITEM_KINDS.has(c.type)) return c;
  return node;
}

/** The declared name of a unit (empty for an anonymous closure). A `lexical`/`var` declaration joins its
 *  declarator names so `const a = 1, b = 2` keeps both bindings — deterministic, never guessed. */
function nameOf(node: SyntaxNode): string {
  if (node.type === 'lexical_declaration' || node.type === 'variable_declaration') {
    const names = node.namedChildren
      .filter((d) => d.type === 'variable_declarator')
      .map((d) => d.childForFieldName('name')?.text ?? '')
      .filter((n) => n.length > 0);
    return names.join(',');
  }
  return node.childForFieldName('name')?.text ?? '';
}

/** Collect the outermost non-overlapping block-kind units under `node` (never recursing into a found
 *  block, so blocks tile the item without nesting). Order is source order (preorder over ordered children). */
function collectBlocks(node: SyntaxNode, out: SyntaxNode[]): void {
  for (const child of node.namedChildren) {
    if (BLOCK_KINDS.has(child.type)) out.push(child);
    else collectBlocks(child, out);
  }
}

/** A stable, unique refinement path: the file path + the unit's byte start (unique among all units of one
 *  file) + kind + name. Deterministic and collision-free without any counter. */
function unitPath(filePath: string, node: SyntaxNode, name: string): string {
  return `${filePath}#${node.startIndex}:${node.type}:${name}`;
}

/** Build the FileTree node for one `block` unit — a leaf carrying its exact source slice as `content`. */
function blockNode(filePath: string, src: string, node: SyntaxNode): FileTree {
  return {
    path: unitPath(filePath, node, nameOf(node)),
    children: [],
    content: src.slice(node.startIndex, node.endIndex),
  };
}

/** Build the FileTree node for one `item` unit — its source slice as `content`, its blocks as children
 *  (canonical source order). */
function itemNode(filePath: string, src: string, decl: SyntaxNode): FileTree {
  const blocks: SyntaxNode[] = [];
  collectBlocks(decl, blocks);
  blocks.sort((a, b) => a.startIndex - b.startIndex);
  return {
    path: unitPath(filePath, decl, nameOf(decl)),
    children: blocks.map((b) => blockNode(filePath, src, b)),
    content: src.slice(decl.startIndex, decl.endIndex),
  };
}

/** Parse one TS/TSX file `content` into its ordered item child nodes. A parse that yields an error tree
 *  (or throws) returns `[]` — an honest EMPTY refinement, never a fabricated unit. */
function itemsOf(filePath: string, src: string, grammar: TsLanguage): FileTree[] {
  try {
    const parser = new Parser();
    parser.setLanguage(grammar);
    const tree = parser.parse(src);
    const root = tree.rootNode;
    if (root.hasError) return [];
    const items = root.namedChildren.map(unwrapExport).filter((n) => ITEM_KINDS.has(n.type));
    items.sort((a, b) => a.startIndex - b.startIndex);
    return items.map((decl) => itemNode(filePath, src, decl));
  } catch {
    return [];
  }
}

/** Refine one FileTree node (recursively). Directory nodes recurse into children; a TS/TSX file leaf gains
 *  its parsed item children. Every existing node is preserved (path + content untouched); only children
 *  are additively refined. */
function refine(node: FileTree): FileTree {
  // A file leaf = has `content` and no existing children. Parse-refine it; everything else recurses.
  if (node.content !== undefined && node.children.length === 0) {
    const grammar = grammarFor(node.path);
    if (grammar === undefined) return node;
    const items = itemsOf(node.path, node.content, grammar);
    if (items.length === 0) return node;
    return { path: node.path, children: items, content: node.content };
  }
  const children = node.children.map(refine);
  return node.content === undefined
    ? { path: node.path, children }
    : { path: node.path, children, content: node.content };
}

/** Fold sub-file item/block AST units into the spatial `FileTree` (additive refinement, ADAPT-AST-1). */
export function foldAstUnits(tree: FileTree): FileTree {
  return refine(tree);
}
