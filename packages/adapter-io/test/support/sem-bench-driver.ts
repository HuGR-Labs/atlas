// @atlas/adapter-io — test/support/sem-bench-driver.ts  (#196b WP-1 — the SUBSTRATE driver)
//
// Assembles the planted pool over atlas-self and drives the SHIPPED admission for the four arms, returning
// (row, outcome, reason) triples the SCORER grades. This module MAY import the admission engine — it is the
// thing UNDER TEST's harness, not the label-store or the scorer (those two, and ONLY those two, are forbidden
// the gate's symbols). The FALSE/TRUE label still comes from the INDEPENDENT tsc oracle (`neg-bench-lib`),
// never from `admit`: `deriveLabel` is fed a tsc witness here, and `admit`'s verdict is only ever an OUTCOME.

import { readFileSync } from 'node:fs';
import { admit } from '@atlas/genesis';
import type { Admission, PredicateProposal, RelationProposal } from '@atlas/genesis';
import type { StructRef, Tier } from '@atlas/contracts';
import type { Candidate } from '@atlas/genesis';
import { asNodeKey, asSubtreeHash } from '@atlas/kernel';
import { ground } from '@atlas/grounding';
import type { Grounding } from '@atlas/grounding';
import { readScipOrEmpty } from '../../src/scip.js';
import { buildMineAdmission } from '../../src/compose-mine-admission.js';
import { setupNegBench, type NegBench, type Target, type Verdict } from './neg-bench-lib.js';
import { deriveLabel, mutate, type Arm, type Claim, type Row } from './mutation-contract.js';

export interface DrivenRow { readonly row: Row; readonly outcome: Outcome; readonly reason: string }
// Local mirror of the scorer's Outcome — the driver never imports the scorer (one-way seam).
export type Outcome = { readonly admitted: true } | { readonly admitted: false; readonly anchorFailed: boolean };

export interface SemBench {
  readonly B: NegBench;
  readonly driven: readonly DrivenRow[]; //   count + relation + dependency + negation planted pool
  readonly arm0Reasons: readonly string[]; // Arm-0 semantic pool drop reasons (all DROP_NO_CHECK)
  readonly mutateSamples: ReadonlyArray<{ base: Row; mutant: Row }>; // real-substrate base→mutant pairs (AC-9m)
  readonly negTeeth: readonly DrivenRow[]; // AC-6 teeth: the negation pool under a permissive (refute-off) door
  readonly counts: { targets: number; scopes: number };
  readonly driveClaim: (row: Row) => { outcome: Outcome; reason: string; admission: Admission | { verdict: Verdict } };
}

const STUB_SITE: StructRef = { kind: 'directory', qualifiedPath: '.', subtreeHash: asSubtreeHash('stub') };
const STUB_CAND: Candidate = { site: STUB_SITE, signals: { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] }, ppr: 0, rank: 0 };
const TIER: Tier = 'T2';
const CAP = Number(process.env.SEM_BENCH_CAP ?? '1200'); // per (arm,label) cap — bounded, LOGGED, never silent.

const dirOf = (p: string): string => p.split('/').slice(0, -1).join('/');

/** Adapt the mechanical `Admission` to the scorer's plain Outcome + a reason string (no admission type leaks). */
function adapt(a: Admission): { outcome: Outcome; reason: string } {
  if (a.outcome === 'admitted') return { outcome: { admitted: true }, reason: 'admitted' };
  if (a.outcome === 'dropped') {
    const anchorFailed = /ungrounded|unresolvable|malformed/i.test(a.reason);
    return { outcome: { admitted: false, anchorFailed }, reason: a.reason };
  }
  return { outcome: { admitted: false, anchorFailed: false }, reason: `abstained: ${a.whyNot.reason}` };
}

/** Adapt the negation door's verdict (the governed closed-world door) to the same Outcome shape. */
function adaptJudge(v: Verdict): { outcome: Outcome; reason: string } {
  if (v === 'admit') return { outcome: { admitted: true }, reason: 'admitted' };
  if (v === 'refute') return { outcome: { admitted: false, anchorFailed: false }, reason: 'negation-refute' };
  const anchorFailed = v.includes('unresolvable') || v.includes('not-global') || v.includes('scope-empty');
  return { outcome: { admitted: false, anchorFailed }, reason: v };
}

export async function assembleSemBench(ROOT: string, SCIP: string): Promise<SemBench> {
  const B = await setupNegBench(ROOT, SCIP);
  const scip = readScipOrEmpty(SCIP);
  const { deps, reground } = buildMineAdmission(B.axes, scip);
  const gtruth = (site: string): Grounding => reground({ kind: 'directory', qualifiedPath: site, subtreeHash: asSubtreeHash('x') });
  const ground2 = (a: string, b: string): Grounding =>
    ground({ citations: [{ kind: 'file', qualifiedPath: a, path: a }, { kind: 'file', qualifiedPath: b, path: b }] }, B.axes);
  const bySym = new Map<string, Target>(B.targets.map((t) => [t.symbol, t]));

  // tsc witnesses (INDEPENDENT oracle) — the ONLY label source.
  const countCallers = (t: Target, scope: string): number => {
    let n = 0;
    for (const f of B.oracle.get(t.key)!.callFiles) if (B.underScope(f, scope)) n += 1;
    return n;
  };
  const fileCalls = (callerFile: string, calleeFile: string): boolean =>
    B.targets.some((g) => g.df === calleeFile && B.oracle.get(g.key)!.callFiles.has(callerFile));
  const tsc = (c: Claim): boolean => {
    if (c.arm === 'count') return countCallers(bySym.get(c.target)!, c.scope) >= (c.atLeast ?? 1);
    if (c.arm === 'relation') return fileCalls(c.endpoints![0], c.endpoints![1]);
    return B.calledInScope(bySym.get(c.target)!, c.scope); // dependency + negation positive ("X called in S")
  };

  // proposal builders (the SHIPPED shapes) — grounding is the re-derived receipt, never hand-built.
  const depProp = (target: string, scope: string, g: Grounding): PredicateProposal =>
    ({ kind: 'predicate', site: STUB_CAND, slot: 'dependency', target, scope, nodeKey: asNodeKey('dep'), claimNorm: `${target} calls in ${scope}`, grounding: g, tier: TIER });
  const countProp = (target: string, scope: string, atLeast: number, g: Grounding): PredicateProposal =>
    ({ kind: 'predicate', site: STUB_CAND, slot: 'count', target, scope, atLeast, nodeKey: asNodeKey('cnt'), claimNorm: `${target} ≥${atLeast} in ${scope}`, grounding: g, tier: TIER });
  const relProp = (a: string, b: string, g: Grounding): RelationProposal =>
    ({ kind: 'relation', site: STUB_CAND, relationKind: 'calls', endpointA: a, endpointB: b, grounding: g, tier: TIER });

  const driveClaim = (row: Row): { outcome: Outcome; reason: string; admission: Admission | { verdict: Verdict } } => {
    const c = row.claim;
    if (c.arm === 'dependency') { const a = admit(depProp(c.target, c.scope, gtruth(c.scope)), deps); return { ...adapt(a), admission: a }; }
    if (c.arm === 'count') { const a = admit(countProp(c.target, c.scope, c.atLeast ?? 1, gtruth(c.scope)), deps); return { ...adapt(a), admission: a }; }
    if (c.arm === 'relation') { const a = admit(relProp(c.endpoints![0], c.endpoints![1], ground2(c.endpoints![0], c.endpoints![1])), deps); return { ...adapt(a), admission: a }; }
    const v = B.judge(c.target, c.scope); return { ...adaptJudge(v), admission: { verdict: v } }; // negation via the governed door
  };

  const driven: DrivenRow[] = [];
  const mk = (arm: Arm, claim: Claim, kind: Row['kind']): Row => ({ claim, label: deriveLabel(claim, tsc), kind, arm });
  const push = (row: Row): void => { const { outcome, reason } = driveClaim(row); driven.push({ row, outcome, reason }); };
  const capd: Record<string, number> = {};
  const under = (k: string): boolean => (capd[k] = (capd[k] ?? 0) + 1) <= CAP;

  // ── DEPENDENCY + COUNT + NEGATION arms: iterate (target external to scope) ──
  for (const t of B.targets) {
    for (const scope of B.scopes) {
      if (B.underScope(t.df, scope)) continue;
      const called = B.calledInScope(t, scope);
      // dependency: TRUE=called (base), FALSE=not-called (assert-absent)
      if (called ? under('dep-T') : under('dep-F')) push(mk('dependency', { arm: 'dependency', target: t.symbol, scope }, called ? 'base' : 'dependency-assert-absent'));
      // negation: TRUE=not-called (base), FALSE=called (negation-flip)
      if (!called ? under('neg-T') : under('neg-F')) push(mk('negation', { arm: 'negation', target: t.symbol, scope }, !called ? 'base' : 'negation-flip'));
      // count: TRUE=(atLeast 1, called), FALSE=(boundary flip: atLeast = witnessed+1)
      if (called && under('cnt-T')) push(mk('count', { arm: 'count', target: t.symbol, scope, atLeast: 1 }, 'base'));
      if (called && under('cnt-F')) push(mk('count', { arm: 'count', target: t.symbol, scope, atLeast: countCallers(t, scope) + 1 }, 'count-boundary-flip'));
    }
  }

  // ── RELATION arm: (caller file A) calls (callee file B); reversal is FALSE where B does not call A ──
  const mutateSamples: Array<{ base: Row; mutant: Row }> = [];
  for (const t of B.targets) {
    for (const f of B.oracle.get(t.key)!.callFiles) {
      if (f === t.df) continue;
      const A = f, Bf = t.df;
      // direction-STABLE target (the unordered pair) so the reversal edits ONLY `endpoints` ⇒ edit-distance-1.
      const relId = [A, Bf].slice().sort().join('|');
      const base = mk('relation', { arm: 'relation', target: relId, scope: dirOf(A), endpoints: [A, Bf] }, 'base');
      if (base.label !== 'TRUE') continue; // a base must be a genuine TRUE call before it can be mutated
      const mutant = mutate(base, 'relation-direction-reversal', {}); // the CONTRACT flips endpoints only
      if (base.label === 'TRUE' && under('rel-T')) push(base);
      // plant the reversal ONLY when tsc genuinely labels it FALSE (B does not call A) — never a mislabeled row.
      if (deriveLabel(mutant.claim, tsc) === 'FALSE' && under('rel-F')) { push(mutant); if (mutateSamples.length < 40) mutateSamples.push({ base, mutant }); }
    }
  }

  // ── Arm-0 semantic pool: predicate proposals on a slot tsc cannot witness — the unwired DROP_NO_CHECK floor ──
  const arm0Reasons: string[] = [];
  const semScopes = B.scopes.slice(0, 60);
  for (const scope of semScopes) {
    const p: PredicateProposal = { kind: 'predicate', site: STUB_CAND, slot: 'invariant', nodeKey: asNodeKey('sem'), claimNorm: `an invariant about ${scope}`, grounding: gtruth(scope), tier: TIER };
    const a = admit(p, deps);
    arm0Reasons.push(a.outcome === 'dropped' ? a.reason : a.outcome === 'abstained' ? `abstained:${a.whyNot.reason}` : 'admitted');
  }

  // ── AC-6 negation TEETH: the SAME pool under a permissive door (closed-world refutation DISABLED ⇒ refute→admit) ──
  const negTeeth: DrivenRow[] = driven
    .filter((d) => d.row.arm === 'negation')
    .map((d) => (d.reason === 'negation-refute' ? { row: d.row, outcome: { admitted: true } as Outcome, reason: 'TEETH:refute-disabled→admit' } : d));

  // add a handful of dependency/count base→mutant pairs for AC-9m (edit-distance-1 over the real substrate)
  for (const t of B.targets) {
    let tScope: string | undefined, fScope: string | undefined;
    for (const scope of B.scopes) {
      if (B.underScope(t.df, scope)) continue;
      if (B.calledInScope(t, scope)) tScope ??= scope; else fScope ??= scope;
    }
    if (tScope && fScope && mutateSamples.length < 80) {
      const base = mk('dependency', { arm: 'dependency', target: t.symbol, scope: tScope }, 'base');
      const mutant: Row = { claim: { ...base.claim, scope: fScope }, label: 'FALSE', kind: 'dependency-assert-absent', arm: 'dependency' };
      mutateSamples.push({ base, mutant });
    }
    if (mutateSamples.length >= 80) break;
  }

  const which = Object.entries(capd).filter(([, v]) => v > CAP).map(([k]) => k);
  if (which.length) console.log(`[sem-bench] pools capped at ${CAP}: ${which.join(', ')} (larger — bounded, not silent)`); // eslint-disable-line no-console

  return { B, driven, arm0Reasons, mutateSamples, negTeeth, counts: { targets: B.targets.length, scopes: B.scopes.length }, driveClaim };
}
