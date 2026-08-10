// @atlas/index — test/symbol-reverse.test.ts  (#99b N0)
//
// `createSymbolReverse` builds a SYMBOL-keyed reverse-caller view over the SAME SCIP occurrences `deriveEdges`
// reads (build.ts), one granularity below the doc-level `dependencyAxis`. Its classification is `deriveEdges`'s
// verbatim: a `reference` to a NON-`local` symbol WITH an in-index `definition` ⇒ a resolved caller of it; a
// `reference` to a symbol with NO in-index definition ⇒ an `unresolved` hole (its doc is a hole source, NOT a
// resolved caller); a `local ` symbol contributes nothing. Endpoints are `nodeHashOfPath(relativePath)`, sorted
// + deduped so a rebuild is byte-identical.

import { describe, it, expect } from 'vitest';
import type { ScipOutput } from '../src/types.js';
import { createSymbolReverse } from '../src/symbol-reverse.js';
import { nodeHashOfPath } from '../src/build.js';

// A global (non-`local`) SCIP symbol string: has a scheme/package/descriptor, stable across documents.
const GREET = 'scip-ts npm fixture 1.0.0 `greet`().';
const NEVER = 'scip-ts npm fixture 1.0.0 `never`().';
const UNKNOWN = 'scip-ts npm fixture 1.0.0 `ffiTarget`().'; // referenced but NEVER defined in-index ⇒ unresolved

// def.ts DEFINES greet + never (never is defined but referenced nowhere); a.ts + b.ts each REFERENCE greet;
// c.ts REFERENCES UNKNOWN (no in-index definition ⇒ an unresolved hole) and a `local 0` (document-scoped).
// d.ts REFERENCES ONLY a `local 7` — a document whose sole reference is document-scoped, so it must NOT be a
// hole source (the isolated witness that gives the `local`-contributes-nothing claim teeth: a mutant dropping
// the `isLocalSymbol` guard on the hole side would falsely add d.ts, and c.ts alone cannot catch it because
// c.ts is already a hole via UNKNOWN).
const scip: ScipOutput = {
  documents: [
    {
      relativePath: 'src/def.ts',
      occurrences: [
        { symbol: GREET, role: 'definition' },
        { symbol: NEVER, role: 'definition' },
      ],
    },
    { relativePath: 'src/a.ts', occurrences: [{ symbol: GREET, role: 'reference' }] },
    { relativePath: 'src/b.ts', occurrences: [{ symbol: GREET, role: 'reference' }] },
    {
      relativePath: 'src/c.ts',
      occurrences: [
        { symbol: UNKNOWN, role: 'reference' },
        { symbol: 'local 0', role: 'reference' },
      ],
    },
    { relativePath: 'src/d.ts', occurrences: [{ symbol: 'local 7', role: 'reference' }] },
  ],
};

const H = (p: string): string => String(nodeHashOfPath(p));
const asStrings = (hs: readonly unknown[]): string[] => hs.map(String);

describe('#99b N0 — createSymbolReverse (symbol-level reverse callers)', () => {
  it('(a) a global symbol referenced in 2 docs ⇒ BOTH docHashes as callers', () => {
    const rev = createSymbolReverse(scip);
    expect(asStrings(rev.reverseCallers(GREET)).sort()).toEqual([H('src/a.ts'), H('src/b.ts')].sort());
    // def.ts DEFINES greet but carries no `reference` to it ⇒ it is not itself a caller.
    expect(asStrings(rev.reverseCallers(GREET))).not.toContain(H('src/def.ts'));
  });

  it('(b) a `local ` symbol contributes NOTHING — empty callers AND its sole-reference doc is not a hole', () => {
    const rev = createSymbolReverse(scip);
    expect(rev.reverseCallers('local 0')).toEqual([]);
    // TEETH (lucy N0): d.ts's ONLY reference is `local 7`. A `local` reference is document-scoped and cannot
    // hide a cross-document caller, so it must NOT open scope. A mutant that drops the `isLocalSymbol` guard on
    // the hole side would falsely add d.ts to holeSources — this kills it (c.ts cannot, it is a hole via UNKNOWN).
    expect(asStrings(rev.holeSources())).not.toContain(H('src/d.ts'));
  });

  it('(c) an unresolved reference ⇒ its doc in holeSources, and empty callers for that symbol', () => {
    const rev = createSymbolReverse(scip);
    // UNKNOWN has no in-index definition ⇒ references to it are unresolved holes, never resolved callers.
    expect(rev.reverseCallers(UNKNOWN)).toEqual([]);
    // c.ts carries the unresolved reference ⇒ it is a hole source.
    expect(asStrings(rev.holeSources())).toContain(H('src/c.ts'));
    // the resolved-symbol docs are NOT hole sources.
    expect(asStrings(rev.holeSources())).not.toContain(H('src/a.ts'));
  });

  it('(d) determinism — a rebuild is byte-identical (sorted + deduped)', () => {
    const a = createSymbolReverse(scip);
    const b = createSymbolReverse(scip);
    expect(asStrings(a.reverseCallers(GREET))).toEqual(asStrings(b.reverseCallers(GREET)));
    expect(asStrings(a.holeSources())).toEqual(asStrings(b.holeSources()));
    // sorted invariant: the returned order equals its own String-sort.
    const callers = asStrings(a.reverseCallers(GREET));
    expect(callers).toEqual([...callers].sort());
    const holes = asStrings(a.holeSources());
    expect(holes).toEqual([...holes].sort());
  });

  it('(e) a defined-but-never-referenced symbol ⇒ empty callers', () => {
    const rev = createSymbolReverse(scip);
    expect(rev.reverseCallers(NEVER)).toEqual([]);
  });
});
