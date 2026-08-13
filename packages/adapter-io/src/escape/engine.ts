// @atlas/adapter-io — src/escape/engine.ts (#99 sound-negation escape analysis)
//
// The language-BLIND escape engine. A target symbol ESCAPES iff ANY of its references
// sits in a non-safe position (per the per-language `EscapeClassifier`). A symbol whose
// every reference is safe does NOT escape ⇒ the static import-closure is SOUND for it ⇒
// the negation gate can ground "X unused in scope S" from the index alone. The engine
// never names a language; swapping `classifier` + grammar re-targets it (proven on
// TypeScript and Python).
//
// CALLER CONTRACT — canonical symbols (PROVEN REQUIREMENT, #189 resurfacing): every
// `EscapeRef.symbol` MUST already be canonicalized (a cross-package ref resolves through
// the built `dist/*.d.ts` symbol; map it to source form with @atlas/index
// `canonicalizeSymbol` BEFORE calling). An un-canonicalized cross-package ref never
// unifies with its source definition, so a real escape in another package becomes
// invisible — a false "non-escaping" ⇒ a false-admit in the negation gate.
import type Parser from 'web-tree-sitter';
import type { EscapeClassifier } from './classifier.js';

type SyntaxNode = Parser.SyntaxNode;

/** One reference occurrence, joined to the parsed root of the document it sits in. */
export interface EscapeRef {
  readonly symbol: string;             // canonical (see caller contract)
  readonly docRoot: SyntaxNode;        // parsed root node of the reference's document
  readonly range: readonly [number, number]; // [startLine, startChar] of the occurrence
}

/** The set of canonical symbols that ESCAPE. A symbol absent from the return that
 *  appears in `refs` is sound-groundable (import-closure holds for it). */
export function computeEscaping(refs: Iterable<EscapeRef>, classifier: EscapeClassifier): Set<string> {
  const escaped = new Set<string>();
  for (const ref of refs) {
    const node = ref.docRoot.descendantForPosition({ row: ref.range[0], column: ref.range[1] });
    if (node !== null && !classifier.isSafe(node)) escaped.add(ref.symbol);
  }
  return escaped;
}
