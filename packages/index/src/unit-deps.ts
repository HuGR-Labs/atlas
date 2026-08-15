// @atlas/index — src/unit-deps.ts  (#196a candidate-grounded — the RECALL source for dependency genesis)
//
// The measured crux of dependency mining (#95 bench, 2026-08-14): a free-form LLM proposer names a HUMAN
// symbol (`execFileSync`, `id`) but the sound oracle (`verifyDependency`, @atlas/genesis) keys on the SCIP
// GLOBAL SYMBOL STRING — so a bare name never resolves and recall is 0. The fix is candidate-grounded
// SELECTION: the INDEX supplies the mechanical candidate set (a unit's real cross-unit dependencies), the LLM
// only SELECTS the non-obvious one, and the gate re-proves. Index = recall, LLM = salience, gate = precision.
// Measured live: recall 0 → 4/4 tried→proven, still sound (the pick must be in this index-derived set).
//
// A "cross-unit dependency" of a unit U = a GLOBAL symbol U REFERENCES whose DEFINITION lives in a DIFFERENT
// document. This is the SAME occurrence classification `deriveEdges` / `createSymbolReverse` use (non-`local`
// `reference` → a symbol with an in-index `definition`), with ONE added discriminant — the def's document ≠
// U's — which EXCLUDES the pollution a naive "resolved-global reference" set carries: a unit's OWN types and
// params (defined AND referenced in U) are not dependencies. Node/npm builtins have no in-index definition, so
// they are absent by construction (the oracle is internal-only, sound in any world). Pure, $0-LLM, no I/O, no
// clock, deterministic — a rebuild is byte-identical.

import { canonicalizeSymbol, isLocalSymbol, nodeHashOfPath } from './build.js';
import type { ScipOutput } from './types.js';

/** The two lookups dependency genesis needs over one SCIP output. Both pure + total (never throw). */
export interface UnitDepsApi {
  /** The cross-unit dependency NAMES a unit references — the CANDIDATE set shown to the model (prompt side).
   *  Empty for an unknown path or a unit with no cross-unit dep. Deterministic, sorted, deduped by name. */
  candidatesFor(unitPath: string): readonly string[];
  /** The DEFINED global symbols whose terminal descriptor name is `name` — the gate's name→symbol resolution.
   *  A model picks a NAME from `candidatesFor`; the gate resolves it to the real SCIP symbol(s) to hand the
   *  sound oracle (which then confirms a caller exists in scope). Empty when no defined global carries the
   *  name. Deterministic, sorted, deduped. */
  symbolsNamed(name: string): readonly string[];
}

/** The terminal identifier of a SCIP descriptor chain — the human name a reader (and the model) sees:
 *  `…/Hash#` → `Hash`, `…/charge().` → `charge`, `…/X.` → `X`, `…/ns/` → `ns`. Empty when the tail is not an
 *  identifier (e.g. a meta `:` descriptor). Matches the extractor validated against the live index. */
export function symbolTerminalName(symbol: string): string {
  const m = symbol.match(/([A-Za-z0-9_$]+)\s*(?:#|\(\)\.|\.|\/)?$/);
  return m ? m[1]! : '';
}

/**
 * Build the unit-dependency view over one SCIP output. Two indexes, assembled once:
 *   - `defDoc: Map<globalSymbol, defDocHash>` — first-definition-wins over non-`local` `definition`
 *     occurrences, mirroring `deriveEdges`'s `defs` but RETAINING the defining document (the cross-unit
 *     discriminant `deriveEdges` projects away).
 *   - `symbolsByName: Map<terminalName, Set<globalSymbol>>` — every DEFINED global symbol, bucketed by its
 *     terminal descriptor name (the gate's resolution index).
 * `candidatesFor` then walks a unit's `reference` occurrences and keeps the non-`local` ones whose resolved
 * symbol (direct, or `canonicalizeSymbol` for a `dist/…d.ts` cross-package ref, #189) is DEFINED IN ANOTHER
 * document — exactly the sound cross-unit dependency set.
 */
export function createUnitDeps(scip: ScipOutput): UnitDepsApi {
  const defDoc = new Map<string, string>();
  const symbolsByName = new Map<string, Set<string>>();
  for (const doc of scip.documents) {
    const h = String(nodeHashOfPath(doc.relativePath));
    for (const occ of doc.occurrences) {
      if (occ.role !== 'definition' || isLocalSymbol(occ.symbol)) continue;
      if (!defDoc.has(occ.symbol)) defDoc.set(occ.symbol, h);
      const n = symbolTerminalName(occ.symbol);
      if (n === '') continue;
      const bucket = symbolsByName.get(n) ?? new Set<string>();
      bucket.add(occ.symbol);
      symbolsByName.set(n, bucket);
    }
  }

  // The SRC-form symbol a reference resolves to, or undefined if it resolves to no in-index definition
  // (an external/builtin/unresolved ref — a hole, never a cross-unit dep). Mirrors `createSymbolReverse`.
  const resolvedDef = (symbol: string): string | undefined =>
    defDoc.has(symbol) ? symbol : defDoc.has(canonicalizeSymbol(symbol)) ? canonicalizeSymbol(symbol) : undefined;

  const docByPath = new Map(scip.documents.map((d) => [d.relativePath, d]));

  return {
    candidatesFor(unitPath: string): readonly string[] {
      const doc = docByPath.get(unitPath);
      if (doc === undefined) return [];
      const self = String(nodeHashOfPath(unitPath));
      const names = new Set<string>();
      for (const occ of doc.occurrences) {
        if (occ.role !== 'reference' || isLocalSymbol(occ.symbol)) continue;
        const resolved = resolvedDef(occ.symbol);
        if (resolved === undefined) continue; //          external/builtin/unresolved — not a cross-unit dep
        if (defDoc.get(resolved) === self) continue; //   defined IN this unit — its own vocabulary, not a dep
        const n = symbolTerminalName(resolved);
        if (n !== '') names.add(n);
      }
      return [...names].sort();
    },
    symbolsNamed(name: string): readonly string[] {
      return [...(symbolsByName.get(name) ?? [])].sort();
    },
  };
}
