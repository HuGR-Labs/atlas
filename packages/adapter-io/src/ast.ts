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
import { escapeKeyComponent } from '@atlas/index';
import type { FileTree } from '@atlas/index';
import type { UnitPrior } from '@atlas/genesis';
import { isSymlinkLeaf } from './fs.js';

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

/**
 * A top-level declaration PLUS the one fact about its wrapper (#182).
 *
 * `unwrapExport` used to return the bare inner node, so `export function f` and a private `function f`
 * were indistinguishable from the moment it returned — the package's SURFACE erased at the first type
 * boundary it crossed. The wrapper is the only place that fact exists in the tree, and it costs one
 * boolean to keep, so it is kept: it is the strongest available PRIOR for which unit inside a file is
 * worth a model call (`genesis/src/seeds.ts` `unitPrior`). It is a prior and nothing more — it is not
 * grounding, it is not a measured importance, and it never enters a subtreeHash.
 */
interface Declaration {
  readonly node: SyntaxNode;
  readonly exported: boolean;
  // The ORIGINAL top-level node (the `export`/`export default` wrapper if any, else the decl itself). The
  // bound leading doc-comment (ADR-0014) is a sibling of THIS node, not of the unwrapped `node`, so the
  // comment scan must start here — a comment above `export function f` is a sibling of the export_statement.
  readonly outer: SyntaxNode;
}

/** Unwrap an `export` / `export default` wrapper to the declaration it carries (else the node itself),
 *  KEEPING whether there was a wrapper AND the outer node (for the ADR-0014 leading-comment scan). */
function unwrapExport(node: SyntaxNode): Declaration {
  if (node.type !== 'export_statement') return { node, exported: false, outer: node };
  const decl = node.childForFieldName('declaration');
  if (decl !== null) return { node: decl, exported: true, outer: node };
  for (const c of node.namedChildren) if (ITEM_KINDS.has(c.type)) return { node: c, exported: true, outer: node };
  return { node, exported: true, outer: node }; // `export { a }` / `export * from` — filtered by ITEM_KINDS below
}

/**
 * ADR-0014 — the byte start of a unit's BOUND leading doc-comment, or `undefined` when there is none.
 *
 * The bound run is the maximal set of `comment` nodes immediately preceding `outer`, each on the line
 * DIRECTLY above the next bound token (no blank line between a comment and what follows it). A blank line,
 * or any non-comment sibling, breaks the run. Consequences, all deliberate (ADR-0014, ratified 2026-08-09):
 *   - a header/comment separated from the declaration by ≥1 blank line is NOT bound → editing it stays FRESH;
 *   - a comment CONTIGUOUS with the declaration (incl. a file-top comment directly above the first decl) IS
 *     bound → editing it DRIFTS the unit (it is the declaration's documentation). There is no file-position
 *     exception: FRESH-ness is decided by contiguity, not by being at file top.
 * The scan starts from `outer`, so a comment above `export`/`export default` is found; when a comment IS
 * bound the slice necessarily includes the `export` keyword that sits between it and the inner decl — an
 * incidental consequence, not a goal, and it never affects the export PRIOR (computed separately from
 * `decl.exported`, seeds.ts) nor the `::` subsumes key (positional). A unit with no bound comment is sliced
 * exactly as before — byte-identical, so it does not drift.
 */
function boundCommentStart(outer: SyntaxNode): number | undefined {
  let start: number | undefined;
  let nextRow = outer.startPosition.row;
  for (let s = outer.previousNamedSibling; s !== null && s.type === 'comment'; s = s.previousNamedSibling) {
    if (nextRow - s.endPosition.row > 1) break; // a blank line separates this comment from the bound token
    start = s.startIndex;
    nextRow = s.startPosition.row;
  }
  return start;
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

/**
 * A stable, unique refinement path: the PARENT unit's path + `::` + `kind:ordinal[:name]`. The `::` join
 * makes the refinement path the sanctioned structural ancestry chain (`file::item::block`,
 * dedup-identity.md DP-2): a segment-wise prefix on `::` is real containment, so the index node key
 * `build` mints resolves to a groundable `::` anchor and `deriveSubsumes` can fire (module ⊃ function).
 *
 * WHAT IS NOT IN IT, AND WHY. This used to lead with the unit's BYTE START INDEX. That made the key
 * collision-free without a counter, but it also made it a function of everything ABOVE the unit in the
 * file: adding one `import` line re-keyed every symbol beneath it, so every anchor in the file became
 * unresolvable and every fact grounded there read DRIFTED. That is precisely the false alarm the drift
 * oracle exists to suppress — and it is what the golden SCN-GROUND-5b ("import added above stays FRESH")
 * promises does not happen. The disambiguator is now an ORDINAL among the siblings that share this unit's
 * (kind, name): it is still collision-free within one parent, and it is invariant under any edit that does
 * not add or remove a SAME-NAMED, SAME-KIND sibling before it.
 *
 * WHAT IS ESCAPED, AND WHY. `name` is attacker-shaped — a declarator name is arbitrary source text
 * (`const { "a::b": v } = o` yields the name `{ "a::b": v }`), so an unescaped name can inject the `::`
 * delimiter and fabricate ancestry. Every free-form component goes through `escapeKeyComponent`, the
 * index's OWN escape (imported, never restated), so the `::` join stays injective. An EMPTY name (an
 * anonymous closure) is OMITTED rather than rendered as a trailing `:` — `kind:ordinal:` followed by a
 * `::` join would read back as a boundary in the wrong place.
 */
function unitPath(parentPath: string, node: SyntaxNode, name: string, ordinal: number): string {
  const local = `${escapeKeyComponent(node.type)}:${ordinal}`;
  const named = name === '' ? local : `${local}:${escapeKeyComponent(name)}`;
  return `${parentPath}::${named}`;
}

/** The 0-based ORDINAL of each unit among the siblings sharing its (kind, name), in source order. Pure and
 *  positional-free: it depends only on the sibling SEQUENCE, never on byte offsets, so an edit anywhere
 *  above (or inside) the units leaves every ordinal unchanged. */
function ordinalsOf(nodes: readonly SyntaxNode[], names: readonly string[]): number[] {
  const seen = new Map<string, number>();
  return nodes.map((n, i) => {
    const bucket = `${n.type}\u0000${names[i] ?? ''}`;
    const next = seen.get(bucket) ?? 0;
    seen.set(bucket, next + 1);
    return next;
  });
}

/** Build the FileTree node for one `block` unit — a leaf carrying its exact source slice as `content`,
 *  nested under its `item`'s path so the `::` chain is `file::item::block`. */
function blockNode(parentPath: string, src: string, node: SyntaxNode, name: string, ordinal: number): FileTree {
  return {
    path: unitPath(parentPath, node, name, ordinal),
    children: [],
    // ADR-0014: extend upward over the block's bound leading doc-comment (a method/arrow's own JSDoc), so a
    // comment-only edit that invalidates a block-anchored fact drifts. No bound comment ⇒ unchanged slice.
    content: src.slice(boundCommentStart(node) ?? node.startIndex, node.endIndex),
  };
}

/** Build the FileTree node for one `item` unit — its source slice as `content`, its blocks as children
 *  (canonical source order), each block nested under THIS item's path (`file::item::block`). */
function itemNode(filePath: string, src: string, decl: Declaration, ordinal: number): FileTree {
  const blocks: SyntaxNode[] = [];
  collectBlocks(decl.node, blocks);
  blocks.sort((a, b) => a.startIndex - b.startIndex);
  const names = blocks.map(nameOf);
  const ordinals = ordinalsOf(blocks, names);
  const itemPath = unitPath(filePath, decl.node, nameOf(decl.node), ordinal);
  return {
    path: itemPath,
    children: blocks.map((b, i) => blockNode(itemPath, src, b, names[i] ?? '', ordinals[i] ?? 0)),
    // ADR-0014: extend upward over the item's bound leading doc-comment (scanned from `decl.outer`, so a
    // comment above `export`/`export default` is found). No bound comment ⇒ byte-identical to before.
    content: src.slice(boundCommentStart(decl.outer) ?? decl.node.startIndex, decl.node.endIndex),
  };
}

/** Parse one TS/TSX file `content` into its ordered item child nodes. A parse that yields an error tree
 *  (or throws) returns `[]` — an honest EMPTY refinement, never a fabricated unit. */
function itemsOf(filePath: string, src: string, grammar: TsLanguage, priors: Map<string, UnitPrior>): FileTree[] {
  try {
    const parser = new Parser();
    parser.setLanguage(grammar);
    const tree = parser.parse(src);
    const root = tree.rootNode;
    if (root.hasError) return [];
    const items = root.namedChildren.map(unwrapExport).filter((d) => ITEM_KINDS.has(d.node.type));
    items.sort((a, b) => a.node.startIndex - b.node.startIndex);
    const nodes = items.map((d) => d.node);
    const ordinals = ordinalsOf(nodes, nodes.map(nameOf));
    return items.map((decl, i) => {
      const built = itemNode(filePath, src, decl, ordinals[i] ?? 0);
      recordPriors(priors, built, decl.exported);
      return built;
    });
  } catch {
    return [];
  }
}

/** Record the ORDERING PRIOR of one item and of every block under it (#182). Walked from the BUILT nodes
 *  rather than from the syntax nodes so the key is exactly the unit `path` the fold published — the same
 *  string `structuralFrontier` reconstructs from the index key and the same one the unit reader looks up.
 *  A block is never itself an `export` statement, so only the item carries `exported`. */
function recordPriors(priors: Map<string, UnitPrior>, item: FileTree, exported: boolean): void {
  priors.set(item.path, { exported, bytes: byteLengthOf(item.content) });
  for (const b of item.children) priors.set(b.path, { exported: false, bytes: byteLengthOf(b.content) });
}

/** The ONE size measure — UTF-8 bytes, the unit the evidence span is also measured in. */
const SIZER = new TextEncoder();
const byteLengthOf = (content: string | undefined): number =>
  content === undefined ? 0 : SIZER.encode(content).length;

/** Refine one FileTree node (recursively). Directory nodes recurse into children; a TS/TSX file leaf gains
 *  its parsed item children. Every existing node is preserved (path + content untouched); only children
 *  are additively refined. */
function refine(node: FileTree, priors: Map<string, UnitPrior>): FileTree {
  // A mode-120000 leaf is NOT source and is never parsed. Its `content` is a link target path — text the
  // author of the link chose freely — so parsing it would mint sub-file unit keys out of something that is
  // not a program: `ln -s 'const x = 1' src/leak.ts` yields `src/leak.ts::lexical_declaration:0:x`, and a
  // node key is what retrieval hands out. Returned UNCHANGED (marker included): an honest empty refinement,
  // the same answer the fold already gives a file with no grammar.
  if (isSymlinkLeaf(node)) return node;
  // A file leaf = has `content` and no existing children. Parse-refine it; everything else recurses.
  if (node.content !== undefined && node.children.length === 0) {
    const grammar = grammarFor(node.path);
    if (grammar === undefined) return node;
    const items = itemsOf(node.path, node.content, grammar, priors);
    if (items.length === 0) return node;
    return { path: node.path, children: items, content: node.content };
  }
  const children = node.children.map((c) => refine(c, priors));
  return node.content === undefined
    ? { path: node.path, children }
    : { path: node.path, children, content: node.content };
}

/** Fold sub-file item/block AST units into the spatial `FileTree` (additive refinement, ADAPT-AST-1). */
export function foldAstUnits(tree: FileTree): FileTree {
  return refine(tree, new Map());
}

/**
 * The fold PLUS the per-unit ORDERING PRIORS the sub-file frontier ranks by (#182) — from ONE parse.
 *
 * WHY THIS EXISTS AS A SECOND RETURN RATHER THAN AS FIELDS ON `FileTree`. `FileTree`/`IndexNode` are the
 * frozen index data model and `packages/index/src/**` is out of scope for this card, so `exported` and the
 * unit's byte size cannot ride on the tree. They also cannot be RECOVERED downstream: `IndexNode` carries
 * no `content`, so by the time `genesis`'s `structuralFrontier` sees the spatial axis both signals are
 * gone — `unwrapExport` had already discarded export-ness, and only a hash of the bytes survives. Handing
 * them back beside the tree is the one carrier that costs no second parse.
 *
 * The map is keyed by the unit's fold PATH (`file::item[::block]`) — the same string the frontier
 * reconstructs from the index key and the same one the unit-granular reader looks up, so the three cannot
 * drift apart. A key the map does not hold means "prior unknown", never "prior zero as a fact".
 */
export function foldAstUnitsWithPriors(tree: FileTree): {
  readonly tree: FileTree;
  readonly priors: ReadonlyMap<string, UnitPrior>;
} {
  const priors = new Map<string, UnitPrior>();
  return { tree: refine(tree, priors), priors };
}
