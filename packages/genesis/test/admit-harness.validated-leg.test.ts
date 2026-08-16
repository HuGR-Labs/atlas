// @atlas/genesis — test/admit-harness.validated-leg.test.ts   (ADR-0017 #196b — the VALIDATED last-resort leg)
//
// NEW independent-ensemble VALIDATED arm of `admitPredicate`, reached ONLY when the sound oracle did not
// discharge the slot AND `predicate.synthesize` produced no mechanical check. The branch (in order):
//   DROP_NO_CHECK             — `verifyValidated` is undefined (UNWIRED → pre-#196b behavior)
//   DROP_VALIDATED_MALFORMED  — slot/nodeKey empty (no address to mint)
//   DROP_UNGROUNDED           — doors.grounded === false (truth door BEFORE the ensemble is paid)
//   abstained                 — verifyValidated !== "validated" (honest third outcome, never a drop)
//   else ADMIT via `buildValidated` with seal:"validated" and NO label.
//
// MECHANICAL PRECEDENCE (AC-V4): a slot whose synthesized check verifies+bites mints a PREDICATE node
// (seal undefined) and the ensemble is NEVER consulted — never stamp `validated` on what a check proves.
//
// Fixture shape mirrors `admit-harness.dependency-leg.test.ts` / `admit-harness.count-leg.test.ts`.

import { describe, it, expect } from 'vitest';
import { asNodeKey, asSubtreeHash } from '@atlas/kernel';
import type { StructRef, Status } from '@atlas/contracts';
import type { IndexNode } from '@atlas/index';
import type { Candidate } from '@atlas/genesis';
import { admit } from '../src/admit-harness.js';
import type { AdmitDeps, PredicateProposal, TypeOracle } from '../src/admit-harness.js';

// The two strings under test — asserted verbatim (they must match the source consts EXACTLY).
const DROP_NO_CHECK = 'no admissible synthesized check for a checkable candidate (GEN-12)';
const DROP_VALIDATED_MALFORMED = 'validated candidate missing slot or nodeKey — no address to mint (ADR-0017 #196b)';
const DROP_UNGROUNDED = 'advisory fails the truth door — the citation does not ground (GEN-12e)';
const WHYNOT_VALIDATED_ABSTAIN =
  'the independent ensemble did not reach agreement on the proposed slot — abstained, not a fabricated fact (ADR-0017 #196b, validated leg)';

// ---- fixtures ------------------------------------------------------------------------------------------

const anchor: StructRef = { kind: 'block', qualifiedPath: 'src/pay.ts#charge', subtreeHash: asSubtreeHash('st-a10') };

function site(): Candidate {
  return {
    site: anchor,
    signals: { hotspot: 3, szzBugCommits: 2, coChanged: [], owners: [], messages: [] },
    ppr: 0.42,
    rank: 1,
  };
}

const grounding = { entries: [{ anchor, path: 'src/pay.ts' }] } as PredicateProposal['grounding'];

const indexState: IndexNode = {
  axis: 'spatial',
  level: 'block',
  key: 'src/pay.ts#charge',
  subtreeHash: asSubtreeHash('idx-a10'),
  children: [],
  objects: [],
};

/** A SEMANTIC predicate proposal (slot 'invariant' — not dependency/count, not type-expressible here), so
 *  the sound arms fall through and `synthesize` (null below) routes to `admitValidated`. */
const validatedProposal = (over: Partial<PredicateProposal> = {}): PredicateProposal => ({
  kind: 'predicate',
  site: site(),
  slot: 'invariant',
  nodeKey: asNodeKey('nk:inv-charge-nonneg'),
  claimNorm: 'charge() never posts a negative amount to the ledger',
  grounding,
  tier: 'T1',
  ...over,
});

const typeOracle: TypeOracle = { expressible: () => false, diagnose: () => 'NA' };

/** deps whose sound arms are inert and whose `synthesize` yields no check — so a semantic slot always
 *  reaches `admitValidated`. Override `predicate`/`verifyValidated`/`doors` per case. */
function makeDeps(over: Partial<AdmitDeps>): AdmitDeps {
  return {
    predicate: {
      synthesize: () => null,
      verify: (): Status => 'NA',
      teeth: () => false,
    },
    doors: { grounded: () => true, nonObvious: () => true },
    typeOracle,
    refine: () => null,
    indexState,
    K: 1,
    ...over,
  };
}

describe('ADR-0017 #196b — the VALIDATED last-resort leg — admit(deps)', () => {
  it('AC-V1: grounded + verifyValidated "validated" ⇒ admitted, seal "validated", no label, spy called once', () => {
    const calls: PredicateProposal[] = [];
    const p = validatedProposal();
    const a = admit(
      p,
      makeDeps({
        verifyValidated: (prop) => {
          calls.push(prop);
          return 'validated';
        },
      }),
    );

    expect(a.outcome).toBe('admitted');
    if (a.outcome !== 'admitted') throw new Error('unreachable');
    expect(a.fact.seal).toBe('validated');
    expect((a.fact as { predicateSlot?: string }).predicateSlot).toBe('invariant');
    expect(a.label).toBeUndefined(); // validated is NOT oracle-proven — never labelled
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(p); // consulted with the proposal itself
  });

  it('AC-V2: grounded + verifyValidated "abstain" ⇒ abstained (NOT dropped), the honest why-not reason', () => {
    const a = admit(validatedProposal(), makeDeps({ verifyValidated: () => 'abstain' }));
    expect(a.outcome).toBe('abstained');
    expect(a.outcome).not.toBe('dropped');
    if (a.outcome !== 'abstained') throw new Error('unreachable');
    expect(a.whyNot.reason).toBe(WHYNOT_VALIDATED_ABSTAIN);
    expect(a.whyNot.site).toEqual(anchor);
  });

  it('AC-V3: verifyValidated wired but doors.grounded false ⇒ dropped (ungrounded), ensemble NOT consulted', () => {
    let consulted = false;
    const a = admit(
      validatedProposal(),
      makeDeps({
        verifyValidated: () => {
          consulted = true;
          return 'validated';
        },
        doors: { grounded: () => false, nonObvious: () => true },
      }),
    );

    expect(a.outcome).toBe('dropped');
    if (a.outcome !== 'dropped') throw new Error('unreachable');
    expect(a.reason).toBe(DROP_UNGROUNDED);
    expect(consulted).toBe(false); // the truth door runs BEFORE the ensemble is paid
    expect('fact' in a).toBe(false);
  });

  it('AC-V4 (headline): a slot whose synthesized check HOLDS + bites ⇒ mechanical predicate, ensemble NEVER consulted', () => {
    let consulted = false;
    const check = { kind: 'assertion', expr: 'child-count|src/pay.ts#charge|1' } as const;
    const a = admit(
      validatedProposal(),
      makeDeps({
        predicate: {
          synthesize: () => check,
          verify: (): Status => 'HOLDS',
          teeth: () => true, // flips on a mutant ⇒ not vacuous
        },
        verifyValidated: () => {
          consulted = true;
          return 'validated';
        },
      }),
    );

    expect(a.outcome).toBe('admitted');
    if (a.outcome !== 'admitted') throw new Error('unreachable');
    expect(a.fact.kind).toBe('predicate'); // buildPredicate, not buildValidated
    expect((a.fact as { status?: string }).status).toBe('HOLDS');
    expect(a.fact.seal).toBeUndefined(); // a mechanical predicate carries no seal
    expect(consulted).toBe(false); // MECHANICAL PRECEDENCE — the ensemble is the LAST resort
  });

  it('AC-V5: empty slot OR empty nodeKey + wired ensemble ⇒ dropped (malformed), ensemble NOT consulted', () => {
    // the type forbids an empty slot/nodeKey, so force the malformed seed via `unknown` (mirrors the
    // sibling count-leg test's malformed-seed construction) — the RUNTIME gate is what is under test.
    for (const bad of [{ slot: '' }, { nodeKey: '' }] as unknown as Array<Partial<PredicateProposal>>) {
      let consulted = false;
      const a = admit(
        validatedProposal(bad),
        makeDeps({
          verifyValidated: () => {
            consulted = true;
            return 'validated';
          },
        }),
      );
      expect(a.outcome).toBe('dropped');
      if (a.outcome !== 'dropped') throw new Error('unreachable');
      expect(a.reason).toBe(DROP_VALIDATED_MALFORMED);
      expect(consulted).toBe(false); // no address to mint — the ensemble is never blind-ridden
    }
  });

  it('AC-V6: verifyValidated undefined (UNWIRED) + semantic slot ⇒ dropped (DROP_NO_CHECK), no throw', () => {
    // The base `makeDeps` supplies NO `verifyValidated`, so an empty override IS the unwired case
    // (passing `verifyValidated: undefined` explicitly violates exactOptionalPropertyTypes).
    let a: ReturnType<typeof admit> | undefined;
    expect(() => {
      a = admit(validatedProposal(), makeDeps({}));
    }).not.toThrow();
    expect(a!.outcome).toBe('dropped');
    if (a!.outcome !== 'dropped') throw new Error('unreachable');
    expect(a!.reason).toBe(DROP_NO_CHECK); // pre-#196b behavior EXACTLY
  });

  it('AC-V7: never-mix at MINT — validated fact seals "validated"/no label; a proven fact seals "proven"', () => {
    // a validated fact (AC-V1 shape)
    const validated = admit(validatedProposal(), makeDeps({ verifyValidated: () => 'validated' }));
    expect(validated.outcome).toBe('admitted');
    if (validated.outcome !== 'admitted') throw new Error('unreachable');
    expect(validated.fact.seal).toBe('validated');
    expect(validated.label).toBeUndefined(); // a validated fact NEVER carries an oracle label

    // a PROVEN fact via the sound dependency arm (mirror the dependency-leg admit) — seals "proven".
    const proven = admit(
      validatedProposal({ slot: 'dependency', target: 'src/pay.ts#charge', scope: 'src' }),
      makeDeps({ verifyDependency: () => 'proven' }),
    );
    expect(proven.outcome).toBe('admitted');
    if (proven.outcome !== 'admitted') throw new Error('unreachable');
    expect(proven.fact.seal).toBe('proven');
  });

  it('AC-V8: identity ignores seal — an admitted validated fact.id equals p.nodeKey', () => {
    const p = validatedProposal();
    const a = admit(p, makeDeps({ verifyValidated: () => 'validated' }));
    expect(a.outcome).toBe('admitted');
    if (a.outcome !== 'admitted') throw new Error('unreachable');
    expect(a.fact.seal).toBe('validated');
    expect((a.fact as { id: string }).id).toBe(p.nodeKey); // identity is minted from nodeKey, not the seal
  });
});
