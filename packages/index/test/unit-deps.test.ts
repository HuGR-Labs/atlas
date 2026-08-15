// @atlas/index — test/unit-deps.test.ts  (#196a candidate-grounded — the RECALL source)
//
// `createUnitDeps` answers two questions dependency genesis needs over one SCIP output:
//   candidatesFor(unit) — the unit's CROSS-UNIT dep NAMES (referenced global whose DEF is in ANOTHER doc)
//   symbolsNamed(name)  — the DEFINED global symbols carrying that terminal descriptor name (gate resolution)
// The load-bearing property is the CROSS-UNIT discriminant: a symbol a unit BOTH defines and references is its
// OWN vocabulary, not a dependency, and must NOT appear in candidatesFor — the pollution a naive resolved-ref
// set carries (measured 2026-08-14).

import { describe, it, expect } from 'vitest';
import type { ScipOutput } from '../src/types.js';
import { createUnitDeps, symbolTerminalName } from '../src/unit-deps.js';

const HASH = 'scip-typescript npm @atlas/contracts 0.0.0 src/`hash.ts`/Hash#'; //           defined in contracts
const CHARGE = 'scip-typescript npm @atlas/pay 0.0.0 src/`pay.ts`/charge().'; //            defined in pay
const LOCAL_T = 'scip-typescript npm @atlas/pay 0.0.0 src/`pay.ts`/PayInput#'; //           defined+used IN pay (own vocab)
const EXTERNAL = 'scip-typescript npm node 0.0.0 fs/`fs.d.ts`/statSync().'; //              referenced, never defined here

const scip: ScipOutput = {
  documents: [
    { relativePath: 'src/contracts/hash.ts', occurrences: [{ symbol: HASH, role: 'definition' }] },
    {
      relativePath: 'src/pay/pay.ts',
      occurrences: [
        { symbol: CHARGE, role: 'definition' }, //   pay defines charge…
        { symbol: LOCAL_T, role: 'definition' }, //  …and its own PayInput type…
        { symbol: LOCAL_T, role: 'reference' }, //   …which it also references (OWN vocab — not a dep)
        { symbol: HASH, role: 'reference' }, //      …and depends on contracts' Hash (CROSS-UNIT)
        { symbol: EXTERNAL, role: 'reference' }, //  …and calls a Node builtin (no in-index def — not a dep)
        { symbol: 'local 3', role: 'reference' }, // a document-scoped local (never a dep)
      ],
    },
  ],
} as unknown as ScipOutput;

describe('#196a createUnitDeps — the candidate-grounded recall source', () => {
  const deps = createUnitDeps(scip);

  it('candidatesFor returns ONLY the cross-unit dependency names — own vocab, externals, locals excluded', () => {
    // Hash is defined in contracts and referenced in pay ⇒ a real cross-unit dep. PayInput (own vocab),
    // statSync (external/no-def), and `local 3` are all excluded. teeth: dropping the `defDoc !== self` guard
    // would leak `PayInput`; dropping the `resolved !== undefined` guard would leak `statSync`.
    expect(deps.candidatesFor('src/pay/pay.ts')).toEqual(['Hash']);
  });

  it('candidatesFor is empty for a unit with no cross-unit dep (contracts only DEFINES Hash)', () => {
    expect(deps.candidatesFor('src/contracts/hash.ts')).toEqual([]);
  });

  it('candidatesFor is empty (never throws) for an unknown path', () => {
    expect(deps.candidatesFor('src/nope.ts')).toEqual([]);
  });

  it('symbolsNamed resolves a terminal name to its DEFINED global symbol(s) — the gate leg', () => {
    expect(deps.symbolsNamed('Hash')).toEqual([HASH]);
    expect(deps.symbolsNamed('charge')).toEqual([CHARGE]);
    // a name with no in-index DEFINITION (external) resolves to nothing — the gate then abstains.
    expect(deps.symbolsNamed('statSync')).toEqual([]);
  });

  it('symbolTerminalName extracts the human name across descriptor suffixes', () => {
    expect(symbolTerminalName(HASH)).toBe('Hash'); //     type `#`
    expect(symbolTerminalName(CHARGE)).toBe('charge'); // method `().`
    expect(symbolTerminalName('scip x 0 `f.ts`/Y.')).toBe('Y'); // term `.`
  });
});
