// @atlas/adapter-io — src/compose-mine-admission.ts  (REQ-CLI-4d: the `mine` admission supply)
//
// Split out of `compose.ts` at the 400-LOC ceiling, and cohesive on its own — a REAL seam, not a shelf.
// `compose.ts` composes the RUNTIME: one repo path in, and out comes the governed durable `WiredHandler`
// plus every leg that rides beside it (doctor, promote, own), all of them built over one policy, one actor,
// one durable store. This file composes the EXPLORER's admission, which shares none of that: it takes
// `Axes` and nothing else, reads no policy, resolves no actor, touches no store, and its consumer
// (`atlas mine`) never calls `composeRuntime` at all. Two compositions with disjoint inputs and disjoint
// consumers are two files. `compose.ts` re-exports this so the composition root's SURFACE is unchanged.
//
// WHY IT IS AT THE COMPOSITION ROOT AND NOT IN THE DRIVER. `REQ-CLI-4c` is normative that "the `mine` driver
// wires the parts and invents no admission of its own", and NO requirement obliged anyone to SUPPLY it —
// so `mine.ts` fell back to an unwired default that abstained at EVERY site and every run that admitted zero
// satisfied REQ-CLI-4a/4b/4c. MEASURED before this seam existed: `atlas mine .` on Atlas itself, with a real
// SCIP index, visited 200 sites, made 200 model calls and staged 0 candidates — the gate was reached 200
// times and answered `no admission seam wired (mine default)` every time. Supplying the gate is WIRING, the
// same kind as the store / drift source / history source already built next door, so it lands here.

import type { StructRef } from '@atlas/contracts';
import type { Axes, ScipOutput } from '@atlas/index';
import { createUnitDeps } from '@atlas/index';
import { driftDetect, ground } from '@atlas/grounding';
import type { Grounding } from '@atlas/grounding';
import type { AdmitDeps } from '@atlas/genesis';
import { createVerifyFactLeg } from "./verify-fact-source.js";

/** Re-derive a mined site's grounding receipt against the built index — the FROZEN GROUND-3 anchor builder
 *  (`ground`), never a hand-built receipt. Supplied to the driver so the anchor a staged row RECORDS is the
 *  content-committing spatial hash, which is the only anchor the freshness oracle can ever re-verify. */
export type Reground = (site: StructRef) => Grounding;

/** What the composition root hands `atlas mine`: the frozen `admit` seams, plus the GROUND-3 re-grounding
 *  the proposal's receipt is built from. Both halves are needed — `admit` casts the verdict, but it casts it
 *  over the receipt the caller supplies, and a receipt built from the raw seed cannot pass the truth door
 *  (see `reground` below for the measurement). */
export interface MineAdmission {
  readonly deps: AdmitDeps;
  readonly reground: Reground;
}

/**
 * Build the `mine` admission supply over the axes the pass is ALREADY mining (never a second index build —
 * the caller passes the skeleton's own `Axes`, so the gate and the sites can never disagree about what the
 * repository contains).
 *
 * `doors.grounded` IS THE REAL GROUND-4 TRUTH DOOR — `driftDetect(...) === 'FRESH'`, the identical verdict
 * `buildGate` (compose.ts) serves to `atlas emit`. It is deliberately NOT the weaker GROUND-2 `isGrounded`: GEN-4
 * is "a seed whose citation does not re-derive at `source@sha` ⇒ rejected", and a staging door that admitted
 * on a bar below the promotion door's would stage rows that can only ever be refused later.
 *
 * IT IGNORES ITS `indexState` ARGUMENT, and that is a real seam mismatch, stated rather than hidden: the
 * frozen `TwoDoorBar.grounded` is typed `(grounding, indexState: IndexNode)` while `driftDetect` needs the
 * whole `Axes` (it resolves across spatial AND territory). The composed `axes` are closed over instead —
 * `deps.indexState` is still populated with the spatial
 * root so nothing downstream reads an invented node. (`buildGate`'s `_at` is the same shape, in compose.ts.)
 *
 * `doors.nonObvious` IS PINNED `false`, i.e. every mined claim is SCORED `obvious`. ADR-0012 makes the score
 * a stored ranking signal and never a veto, so this rejects nothing; and `nonObvious` has no mechanical
 * oracle (method-tags-grd:142 refuses to model it, ADR-0012 §"What this ADR does NOT close" restates it).
 * Given no oracle, the fail-closed direction for a RANKING prior is the one that grants no credit. This is a
 * PLACEHOLDER WITH A VERDICT, not a measurement: it makes the stored score carry no information yet, and
 * inventing a keyword heuristic here would be inventing the oracle three documents refuse to invent.
 *
 * THE PREDICATE LEGS ARE STRUCTURALLY UNREACHABLE FROM THIS GATE and are supplied fail-closed anyway: the
 * `mine` gate proposes ADVISORIES only (`makeAdmitGate`, cli/src/mine-gate.ts), so `admit` never enters
 * `admitPredicate` and `predicate` / `typeOracle` / `refine` / `K` are never read. They are not omitted
 * (`AdmitDeps` is total) and not faked into something permissive — synthesize yields no check, the oracle
 * expresses nothing, the teeth never flip, `K` is 0. A predicate path wired later must supply real ones.
 */
export function buildMineAdmission(axes: Axes, scipOutput: ScipOutput): MineAdmission {
  const verifyDep = createVerifyFactLeg(scipOutput);
  const deps: AdmitDeps = {
    doors: {
      grounded: (grounding) => driftDetect(grounding, axes) === 'FRESH',
      nonObvious: () => false,
    },
    predicate: { synthesize: () => null, verify: () => 'NA', teeth: () => false },
    typeOracle: { expressible: () => false, diagnose: () => 'NA' },
    // [#196a candidate-grounded] `target` is ALREADY the unit's own cross-unit dependency SYMBOL — the parser
    // resolved the picked name to it PER-UNIT (`makeDependencyClaimParser` over `UnitDepsApi.resolveDepFor`),
    // so the fact is bound to the unit's specific dependency (lucy BLOCKER: an index-wide name lookup here let an
    // off-list name ride an unrelated file's same-named symbol). The gate re-PROVES that exact symbol against the
    // scope via the sound oracle: `proven` iff it has a witnessed caller in `scope`, else `abstain`. A
    // `dependency` verdict is `proven`/`abstain` only (never `refuted`, the negation-only closed-world verdict).
    verifyDependency: (target, scope) =>
      verifyDep({ kind: 'dependency', claim: { sourceScope: scope, target, worldScope: scope } }).verdict === 'proven'
        ? 'proven'
        : 'abstain',
    refine: () => null,
    indexState: axes.spatial,
    K: 0,
  };
  // GROUND-3, fact-level fail-closed: a site whose path does not resolve on a content-committing axis
  // yields `{ entries: [] }`, which `isGrounded` rejects and `driftDetect` reads DRIFTED ⇒ the truth door
  // drops it. Nothing is guessed.
  //
  // WHY RE-DERIVING IS NOT OPTIONAL, MEASURED. A structural seed carries `subtreeHash =
  // asSubtreeHash(nodeHashOfPath(path))` — the DEPENDENCY-axis node IDENTITY (genesis/src/seeds.ts:139-145,
  // `subtreeOfKey` returns the dep key for a dep-axis node), a constant of the address that commits to no
  // content. `driftDetect` deliberately refuses that class of anchor (grounding/src/drift.ts `resolveCurrent`
  // scans spatial+territory ONLY, "an anchor the oracle cannot invalidate is a hole straight through the
  // truth door"). Measured on Atlas at 1f8c117 with a real 489-document SCIP index: 200/200 seed receipts
  // built from the raw seed read DRIFTED, so a gate over them admits 0 — the same 0 as no gate at all, for a
  // different reason. Re-derived through `ground`, the receipt carries the SPATIAL content fold and the pass
  // admits. The seed's own `qualifiedPath` is the resolution key either way; only the oracle leg changes.
  const reground: Reground = (site) =>
    ground({ citations: [{ kind: site.kind, qualifiedPath: site.qualifiedPath, path: site.qualifiedPath }] }, axes);
  return { deps, reground };
}
