// @atlas/cli — src/mine-gate.ts  (REQ-CLI-4d: where the `mine` driver's admission gate comes from)
//
// Split out of `mine.ts` at the 400-LOC ceiling, and cohesive on its own: everything here answers ONE
// question — where does ADMISSION come from, and what happens when it does not come at all. It is the exact
// sibling of `mine-proposer.ts` ("where does the model come from"): `mine.ts` keeps the run composition,
// these two keep the resolution of the two seams a pass cannot invent for itself.
//
// ── THE DEFECT THIS FILE CLOSES ───────────────────────────────────────────────────────────────────────────
// `mine.ts` used to fall back to `defaultGate()` — an honest fail-closed abstention at EVERY site — and
// NOTHING in production ever injected a gate, so `atlas mine` on a real repository staged ZERO candidates,
// always. `makeAdmitGate`, the gate that forwards the frozen `admit`, had ZERO production callers.
//
// The driver was not the defect. `REQ-CLI-4c` is normative: "the `mine` driver wires the parts and invents
// no admission of its own" — injecting nothing obeys that literally. The defect was that NO requirement
// obliged anyone to SUPPLY the gate, so every run that admitted zero satisfied REQ-CLI-4a/4b/4c and a green
// suite, a closed work package and a shipped binary all agreed while the product mined nothing. REQ-CLI-4d
// is that missing obligation, and `composedGate` below is where it is discharged: the gate is BUILT by the
// composition root (`buildMineAdmission`, adapter-io/src/compose.ts) and merely WIRED here.
//
// MEASURED on Atlas itself at master `1f8c117`, with a real 489-document SCIP index:
//   before — 200 sites visited · 200 model calls · gate reached 200× · 0 staged · every site
//            "no admission seam wired (mine default)".
//   after  — same frontier, same proposer, the gate's own verdict at every site.

import { admit } from '@atlas/genesis';
import type {
  AdmitDeps,
  AdvisoryProposal,
  Candidate,
  EmitGate,
  EmitVerdict,
  SeedProposal,
  SkeletonSource,
} from '@atlas/genesis';
import { buildMineAdmission } from '@atlas/adapter-io';
import type { Reground } from '@atlas/adapter-io';
import { asNodeKey } from '@atlas/kernel';

/** The abstention an UNSUPPLIED gate serves. Exported because it is the fingerprint of the defect above:
 *  a golden that cannot name this string cannot tell a working gate from an absent one, and that
 *  indistinguishability IS what let the product ship mining nothing (SCN-CLI-4d-2). */
export const UNWIRED_GATE_REASON = 'no admission seam wired (mine default)';

/**
 * The gate a pass gets when NOTHING supplies admission: every site abstains, honestly, naming the wiring
 * rather than the repository (a fabricated fact is never the alternative).
 *
 * IT IS NO LONGER THE PRODUCTION DEFAULT — `withDefaults` (mine.ts) now falls back to `composedGate`. It is
 * retained and EXPORTED for one reason, stated so the next reachability probe does not read it as the same
 * dead-module defect this file closes: SCN-CLI-4d-2 runs the REAL driver with the supply deliberately
 * removed, and without that control the positive golden cannot attribute its admissions to the gate.
 */
export function unwiredGate(): EmitGate {
  return { emit: (_seed, cand) => ({ emitted: false, whyNot: { site: cand.site, reason: UNWIRED_GATE_REASON } }) };
}

/**
 * Build an `EmitGate` that forwards the FROZEN `admit` verdict VERBATIM (GEN-4/12): the seed becomes an
 * advisory candidate (the driver adds NO predicate), `admit` casts the mechanical decision, and its outcome
 * maps 1:1 to the emit verdict. The driver injects NO admission of its own — admission is `admit`'s alone.
 *
 * `reground` is the composition root's FROZEN GROUND-3 anchor builder (`buildMineAdmission().reground`).
 * Production ALWAYS supplies it and SCN-CLI-4d-1 pins the consequence: a structural seed carries the
 * DEPENDENCY-axis node identity as its `subtreeHash`, an anchor `driftDetect` refuses by construction, so a
 * receipt built from the raw seed reads DRIFTED and the truth door drops all 200 of Atlas's sites. Omitted,
 * the receipt is the raw seed's — the shape a hand-built skeleton fixture with one shared identity space
 * needs, and the ONLY case in which it is right.
 */
export function makeAdmitGate(deps: AdmitDeps, reground?: Reground): EmitGate {
  return {
    emit(seed: SeedProposal, cand: Candidate): EmitVerdict {
      const proposal: AdvisoryProposal = {
        kind: 'advisory',
        site: cand,
        nodeKey: asNodeKey(cand.site.qualifiedPath),
        claimNorm: seed.claim,
        grounding: (reground !== undefined
          ? reground(cand.site)
          : { entries: [{ anchor: cand.site, path: cand.site.qualifiedPath }] }) as AdvisoryProposal['grounding'],
        tier: 'T2',
      };
      const verdict = admit(proposal, deps);
      if (verdict.outcome === 'admitted') return { emitted: true, fact: verdict.fact };
      const reason = verdict.outcome === 'dropped' ? verdict.reason : verdict.whyNot.reason;
      return { emitted: false, whyNot: { site: cand.site, reason } };
    },
  };
}

/**
 * THE SUPPLY (REQ-CLI-4d). The gate `atlas mine` runs when the caller injects none: the frozen `admit`
 * seams, built by the composition root over THE VERY AXES THIS PASS IS MINING.
 *
 * The axes come from the pass's own `SkeletonSource`, never from a second index build. That is not only an
 * optimisation (the source memoizes per `(repo, rev)`, and the controller already asks it twice per pass) —
 * it is a correctness property: a gate that re-walked the tree could resolve a different index from the one
 * the sites were ranked out of, and would then refuse anchors that the frontier says exist.
 *
 * LAZY, because construction is not free and abstention is not the only outcome that costs nothing: a repo
 * with an empty frontier visits no site, calls no model, and must not pay for an index build it never reads.
 * Memoized on first `emit` — the skeleton is deterministic, so the memo is behaviour-preserving.
 */
export function composedGate(skeleton: SkeletonSource, repoPath: string, rev: string): EmitGate {
  let gate: EmitGate | undefined;
  const resolve = (): EmitGate => {
    const { deps, reground } = buildMineAdmission(skeleton.skeleton(repoPath, rev).axes);
    return makeAdmitGate(deps, reground);
  };
  return { emit: (seed, cand) => (gate ??= resolve()).emit(seed, cand) };
}
