// @atlas/cli — test/mine-decide-noop-skip.test.ts  (PERF waste-audit 2026-08-23 — the abstention no-op skip)
//
// `decideStaging` used to publish `next` on EVERY site, so an abstaining site (the majority on a real repo)
// re-serialized the whole staging Map and fsync'd byte-identical bytes under a fresh generation. The fix: a
// TRUE no-op (nothing minted ⇒ `projection` is still the input `staged` by reference) returns `next` OMITTED,
// which `commitLoop` settles WITHOUT a write (sidecar-commit.ts). These tests pin BOTH directions and are
// mutation-verified: revert the guard (always return `next: projection`) and the first test goes RED.
//
// The SCN-CLI-4d mutant-catch is PRESERVED and re-asserted here: a mutant that reseeds from a fresh store
// binds `projection` to a NEW object, so `projection !== staged`, so it still publishes and is still caught —
// only the reference-identical "nothing was written" case is skipped. The minted-path test is the guard on that.

import { describe, it, expect } from 'vitest';
import { emptyStore } from '@atlas/knowledge';
import { decideStaging } from '../src/mine-decide.js';
import { A, ZERO_SIGNALS, factFor } from './mine-fixtures.js';
import type { Candidate, Fact } from '@atlas/genesis';

const cand: Candidate = { site: A, signals: ZERO_SIGNALS, ppr: 1, rank: 0 };
const minedFact = (claim: string): Fact => factFor(cand, claim) as unknown as Fact;

describe('decideStaging — the abstention no-op skips the publish (PERF)', () => {
  it('an ABSTENTION (empty incoming) returns `next` OMITTED — commitLoop settles with NO write', () => {
    const dec = decideStaging(emptyStore(), [], new Map());
    expect(dec.next).toBeUndefined(); // the whole point: nothing changed ⇒ no generation is written
    expect([...dec.out.keys()]).toHaveLength(0);
  });

  it('a MINTED fact still publishes — `next` is DEFINED (the write cadence for real writes is unchanged)', () => {
    const dec = decideStaging(emptyStore(), [minedFact('greet greets')], new Map());
    expect(dec.next).toBeDefined(); // a real write reassigns `projection` ⇒ publishes exactly as before
    expect([...dec.out.keys()]).toHaveLength(1);
  });
});
