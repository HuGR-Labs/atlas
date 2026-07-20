// @atlas/adapter-io — src/compose.ts  (COMPOSE-A: the runtime composition root + the real seams)
//
// The capstone: `composeRuntime(repoPath)` stands up a FULLY GOVERNED, DURABLE `WiredHandler` over the real
// adapters, the real GROUND truth-gate, the real KNOW-11 authz policy, and the real KNOW-15 write path. It
// supplies the seams the WIRE assembler injects — the ones that have no raw adapter:
//   - `heuristic` — the T0-candidate keyword matcher, driven by the admin policy's declared keyword set.
//   - `gate`      — the REAL GROUND truth-gate (`bindGate({ isGrounded, driftDetect })`) adapted to the
//                   tools `TruthGate` surface: the incoming verdict is a predicate's `.status`, or `HOLDS`
//                   injected for an advisory (no Status field); freshness is re-derived against the index
//                   `Axes` built ONCE at the repo root (the `at` sha is vestigial — the gate re-derives
//                   against the built index, not a passed sha).
//   - reconcile seams — v1-EMPTY: no drifted facts, no anchor resolver, and a fail-closed `reDerives`
//                   (index-at-rev re-derivation is a separate deferred WP). Reconcile detects NO drift in v1.
//
// This module OWNS the runtime seam construction; `assembleHandler` (wire.ts) OWNS the leg assembly. Their
// composition is the driver — no per-entrypoint copy (WIRE-1).

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Hash } from '@atlas/contracts';
import { build } from '@atlas/index';
import type { Axes, ScipOutput } from '@atlas/index';
import { bindGate, isGrounded, driftDetect } from '@atlas/grounding';
import { bindReconcile } from '@atlas/knowledge';
import type { GroundedFact } from '@atlas/knowledge';
import type { T0Heuristic, TruthGate } from '@atlas/tools';
import { walkFileTree } from './fs.js';
import { readScip } from './scip.js';
import { loadPolicy } from './policy.js';
import type { AtlasPolicy } from './policy.js';
import { assembleHandler } from './wire.js';
import type { WireConfig, WireSeams, WiredHandler } from './wire.js';

/** Where `composeRuntime` looks for the optional SCIP dump under a repo (empty axes if absent, per §7). */
const SCIP_REL = join('.atlas', 'index.scip');
/** The durable CAS root under a repo (D4). */
const CAS_REL = join('.atlas', 'cas');
/** An empty SCIP projection — the honest input when no `.scip` dump is present at the repo root. */
const EMPTY_SCIP: ScipOutput = { documents: [] };

/**
 * The T0-candidate keyword heuristic (TOOLS-5): a territory is a T0 candidate iff its name contains one of
 * the admin-declared keywords. An EMPTY keyword set (the fail-closed default) flags NOTHING — the heuristic
 * proposes nothing on its own until an admin declares the set. Pure + total.
 */
export function buildHeuristic(policy: AtlasPolicy): T0Heuristic {
  return { isCandidate: (t) => policy.t0Heuristic.keywords.some((k) => t.name.includes(k)) };
}

/**
 * Adapt the REAL GROUND truth-gate (`bindGate({ isGrounded, driftDetect })`) into the tools `TruthGate`
 * surface. The GROUND gate reads the candidate's incoming `Status` verdict + re-derives freshness against
 * `src = Axes`; here:
 *   - the incoming verdict is a `PredicateNode`'s `.status`, or `HOLDS` injected for an `AdvisoryNode`
 *     (which has no Status field) — an advisory is admitted iff it is grounded ∧ FRESH.
 *   - the `at` sha is IGNORED (vestigial): freshness is re-derived against the built-index `axes`, not a sha.
 * Downgrade-only + fail-closed: an ungrounded/DRIFTED node collapses to `NA`, never `HOLDS`.
 */
export function buildGate(axes: Axes): TruthGate {
  const real = bindGate({ isGrounded, driftDetect });
  return {
    gateHolds: (node: GroundedFact, _at: Hash) =>
      real.gateHolds(node.kind === 'predicate' ? node.status : 'HOLDS', node.grounding, axes),
  };
}

/**
 * The v1 fail-closed `reDerives`: index-at-rev re-derivation is a separate deferred WP, so no drifted fact
 * ever auto-re-grounds — every DRIFTED fact is semantic. With `driftFacts: []` no drift is even detected in
 * v1, so this is never consulted; it is fail-closed by construction regardless.
 */
const failClosedReDerives = (): boolean => false;

/** Read the optional SCIP dump at `scipPath`, or the empty projection when none is present (§7). */
function readScipOrEmpty(scipPath: string): ScipOutput {
  return existsSync(scipPath) ? readScip(scipPath) : EMPTY_SCIP;
}

/**
 * Stand up the FULLY GOVERNED, DURABLE runtime handler for a repo. Builds the index `Axes` ONCE at the
 * root, resolves the admin policy + the `ATLAS_ACTOR` identity (fail-closed when unset — every write
 * denied), assembles the real seams, and hands them to the shared WIRE assembler, which wires the governed
 * durable emit leg (truth-door → authz → upsert → durable persist). Returns THE one `WiredHandler`.
 */
export function composeRuntime(repoPath: string): WiredHandler {
  const policy = loadPolicy(repoPath);
  const scipPath = join(repoPath, SCIP_REL);
  const axes = build(walkFileTree(repoPath), readScipOrEmpty(scipPath));

  const seams: WireSeams = {
    heuristic: buildHeuristic(policy),
    gate: buildGate(axes),
    classifier: { reconcile: bindReconcile(failClosedReDerives) },
    driftFacts: [] as readonly GroundedFact[],
    resolveAnchorAt: () => undefined,
  };

  const config: WireConfig = {
    repoPath,
    casPath: join(repoPath, CAS_REL),
    scipPath,
    seams,
  };

  return assembleHandler(config);
}
