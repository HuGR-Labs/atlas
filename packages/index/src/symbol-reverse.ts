// @atlas/index — src/symbol-reverse.ts  (#99b N0 — symbol-level reverse callers, the negation completeness feed)
//
// A SYMBOL-keyed reverse-caller view over the SAME SCIP occurrences `deriveEdges` reads (build.ts), one
// granularity BELOW the doc-level `dependencyAxis` / `createDepgraph`. `deriveEdges` PROJECTS symbol identity
// onto `docHash`; N0 RETAINS the global symbol so "symbol X is never called" is answerable at all. It ADDS a
// sibling view — it does NOT touch `deriveEdges` or the doc-level `dependencyAxis`. Pure, $0-LLM, no I/O, no
// clock, deterministic (sorted + deduped ⇒ a rebuild is byte-identical, exactly as `deriveEdges` sorts).

import type { Hash } from '@atlas/contracts';
import { isLocalSymbol, nodeHashOfPath } from './build.js';
import type { ScipOutput } from './types.js';

/** The reverse-caller query for a GLOBAL symbol, one granularity below the doc-level `depgraph`. Pure + total. */
export interface SymbolReverseApi {
  /** The units (docHash) that carry a `reference` occurrence of the GLOBAL symbol `symbol` — i.e. the files
   *  that reference/call it. A `local ` symbol (SCIP document-scoped) or a symbol with no reference ⇒ `[]`.
   *  Deterministic, sorted, deduped. TOTAL: never throws. */
  reverseCallers(symbol: string): readonly Hash[];
  /** The units (docHash) carrying ANY `unresolved`/`dynamic` reference — the honest holes whose target the
   *  index cannot see (an FFI/reflective/cross-language ref that COULD reach any symbol). Symbol-INDEPENDENT;
   *  returned so a caller can intersect it with a declared scope S to decide `underApprox` for a negation over
   *  that scope. Deterministic, sorted, deduped. Mirrors `createDepgraph`'s `unresolvedSources`, one level down. */
  holeSources(): readonly Hash[];
}

/** Deterministic, deduped, `String`-sorted `Hash[]` — the exact discipline `deriveEdges`/`dependencyAxis` use
 *  so a rebuild is byte-identical. `Hash` is a same-string brand (contracts/hash.ts), so a `String`-keyed set is
 *  its own dedup and a lexical sort on `String(hash)` is total. */
const sortedDeduped = (hashes: Iterable<Hash>): readonly Hash[] => {
  const seen = new Set<string>();
  for (const h of hashes) seen.add(String(h));
  return [...seen].sort() as unknown as readonly Hash[];
};

/**
 * Build the symbol-reverse view over one SCIP output. Reads the SAME occurrences `deriveEdges` reads and reuses
 * its EXACT classification (single edge model, no second one invented):
 *   - `defs: Map<globalSymbol, docHash>` from `role==='definition'` occurrences of NON-`local` symbols,
 *     first-definition-wins — byte-for-byte `deriveEdges`'s `defs`.
 *   - a `reference` occurrence of a NON-`local` symbol whose symbol HAS an in-index definition is a RESOLVED
 *     caller of that symbol (its document is a caller of that symbol) — `deriveEdges`'s resolved branch.
 *   - a `reference` occurrence of a NON-`local` symbol with NO in-index definition is the `unresolved` hole —
 *     `deriveEdges`'s `else` branch — so its document is a hole source (and it is NOT a resolved caller of that
 *     unseeable target: `reverseCallers` of a symbol with no in-index definition is `[]`).
 *  `local ` symbols contribute nothing on either side (SCIP document-scoping, #189) — the same exclusion
 *  `deriveEdges` applies in BOTH loops. `dynamic` is an `EdgeKind` the frozen `ScipOccurrence` projection cannot
 *  express (it carries `role` only, never a dynamic role), so — exactly as in `deriveEdges` — the only hole this
 *  data can witness is the `unresolved` case; the interface names both because a richer projection (or N-level
 *  extractor) would fold `dynamic` into the identical `else` branch. Deterministic, no I/O, no clock.
 */
export function createSymbolReverse(scip: ScipOutput): SymbolReverseApi {
  // defs: the SAME map `deriveEdges` builds — non-local `definition` occurrences, first-definition-wins.
  const defs = new Set<string>();
  for (const doc of scip.documents) {
    for (const occ of doc.occurrences) {
      if (occ.role === 'definition' && !isLocalSymbol(occ.symbol)) defs.add(occ.symbol);
    }
  }

  // callersBySymbol: for each RESOLVED (in-index-defined) global symbol, the docHashes carrying a `reference`
  // to it. holeSourceSet: docHashes carrying a `reference` to a non-local symbol with NO in-index definition
  // (the `unresolved` branch). Both walk the SAME reference occurrences `deriveEdges`'s reference loop walks.
  const callersBySymbol = new Map<string, Hash[]>();
  const holeSourceSet = new Set<string>();
  for (const doc of scip.documents) {
    const from = nodeHashOfPath(doc.relativePath);
    for (const occ of doc.occurrences) {
      if (occ.role !== 'reference' || isLocalSymbol(occ.symbol)) continue;
      if (defs.has(occ.symbol)) {
        const bucket = callersBySymbol.get(occ.symbol) ?? [];
        bucket.push(from);
        callersBySymbol.set(occ.symbol, bucket);
      } else {
        holeSourceSet.add(String(from)); // `unresolved` (or, in a richer projection, `dynamic`) — a hole source
      }
    }
  }

  const holes = sortedDeduped([...holeSourceSet] as unknown as Hash[]);

  return {
    reverseCallers(symbol: string): readonly Hash[] {
      // A `local ` symbol is document-scoped (its callers are intra-doc, out of #99b v1 scope) and a symbol
      // with no in-index definition has only unresolved references (holes, not resolved callers) ⇒ `[]`.
      if (isLocalSymbol(symbol) || !defs.has(symbol)) return [];
      return sortedDeduped(callersBySymbol.get(symbol) ?? []);
    },
    holeSources(): readonly Hash[] {
      return holes;
    },
  };
}
