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
//   - reconcile seams — the REAL arbitrary-rev drift seams over `createRevIndex(repoPath)` (COMPOSE-C):
//                   `resolveAnchorAt` re-derives an anchor's `StructRef` at a rev, `reDerives` is the
//                   `driftDetect` oracle at a rev, and `driftFacts` is the durable projection's grounded
//                   facts (read back from CAS — invariant 6). Reconcile now DETECTS real structural drift.
//
// This module OWNS the runtime seam construction; `assembleHandler` (wire.ts) OWNS the leg assembly. Their
// composition is the driver — no per-entrypoint copy (WIRE-1).

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import type { Hash } from '@atlas/contracts';
import { build } from '@atlas/index';
import type { Axes } from '@atlas/index';
import { bindGate, isGrounded, driftDetect } from '@atlas/grounding';
import { bindReconcile, currentNodes } from '@atlas/knowledge';
import type { GroundedFact } from '@atlas/knowledge';
import type { DoctorSource, T0Heuristic, TruthGate } from '@atlas/tools';
import { walkFileTree } from './fs.js';
import { foldAstUnits } from './ast.js';
import { readScipOrEmpty } from './scip.js';
import { loadPolicy } from './policy.js';
import type { AtlasPolicy } from './policy.js';
import { createRevIndex } from './rev-index.js';
import { createDoctorSource } from './doctor-source.js';
import { createDiskStore, rehydrateProjection } from './store.js';
import { assembleHandler } from './wire.js';
import type { WireConfig, WireSeams, WiredHandler } from './wire.js';

/** The composed runtime: the ONE governed durable `WiredHandler` every entrypoint drives, PLUS the real
 *  read-only `DoctorSource` `atlas doctor` reads over — both built from the SAME store + revIndex so they
 *  can never diverge (WIRE-1). The CLI passes both; the MCP entrypoint drives only the handler. */
export interface ComposedRuntime {
  readonly handler: WiredHandler;
  readonly doctorSource: DoctorSource;
}

/** Where `composeRuntime` looks for the optional SCIP dump under a repo (empty axes if absent, per §7). */
const SCIP_REL = join('.atlas', 'index.scip');
/** The durable CAS root under a repo (D4). */
const CAS_REL = join('.atlas', 'cas');

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
 * The LOCAL git identity (`git config user.email`) at `repoPath`, or `undefined`. TOTAL — never throws:
 * no git, no configured email, a non-repo/absent path, or ANY execFile failure ⇒ `undefined`; an empty
 * result ⇒ `undefined`. Uses the same no-shell git seam as git-history.ts (`execFileSync 'git'`, no shell).
 *
 * SECURITY: this is a LOCAL-MACHINE identity source ONLY (the developer's own git config) — it is NEVER
 * derived from an emitted fact or a tool-call payload, so it cannot be used to spoof the KNOW-11 write actor.
 */
export function gitUserEmail(repoPath: string): string | undefined {
  try {
    const email = execFileSync('git', ['config', 'user.email'], {
      cwd: repoPath,
      encoding: 'utf8',
    }).trim();
    return email.length > 0 ? email : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Stand up the FULLY GOVERNED, DURABLE runtime handler for a repo. Builds the index `Axes` ONCE at the
 * root, resolves the admin policy + the write-actor identity, assembles the real seams, and hands them to
 * the shared WIRE assembler, which wires the governed durable emit leg (truth-door → authz → upsert →
 * durable persist). Returns THE one `WiredHandler`. Also builds the real read-only `DoctorSource`
 * (`atlas doctor`'s port) from the SAME store + revIndex.
 *
 * ACTOR RESOLUTION (KNOW-11): `actor = ATLAS_ACTOR ?? gitUserEmail(repoPath) ?? ''` — the env var wins
 * (a `??` fall-through only on absent, so an explicit empty `ATLAS_ACTOR` stays empty); otherwise the LOCAL
 * git identity; otherwise empty. The actor comes ONLY from the environment / local machine — NEVER from an
 * emitted fact or a tool-call payload (the spoof-guard). It is passed EXPLICITLY into the WIRE config
 * (`config.actor`) — no `process.env` mutation, no global state. Fail-closed is preserved: an actor (git
 * email or env) not in a policy scope is still denied, and empty policy scopes deny every write.
 */
export function composeRuntime(repoPath: string): ComposedRuntime {
  // Resolve the KNOW-11 write actor at the composition root: ATLAS_ACTOR (env) wins; else the LOCAL git
  // identity (`git config user.email`); else empty (fail-closed ⇒ every write denied). A configured git
  // email is a better default than a bare env var. NEVER sourced from untrusted input; passed EXPLICITLY
  // to the assembler below (no global env write).
  const actor = process.env.ATLAS_ACTOR ?? gitUserEmail(repoPath) ?? '';
  // The KNOW-8 ratify token for a full-ratify (T0/predicate/contested) commit. Env-sourced ONLY
  // (`ATLAS_RATIFY_TOKEN`) — the SAME payload-free channel as the actor; there is NO git/machine fallback (a
  // ratifier signature is deliberate, not a local default). ABSENT ⇒ passed as absent below ⇒ the door fails
  // closed on a full-ratify fact (a T0 fact requires the `billy` token). NEVER sourced from an emitted fact.
  const ratifyToken = process.env.ATLAS_RATIFY_TOKEN;

  const policy = loadPolicy(repoPath);
  const scipPath = join(repoPath, SCIP_REL);
  // Fold sub-file AST units BEFORE `build` (F1), the SAME transform `assembleHandler` applies to its index
  // FileTree, so the truth-gate re-derives freshness against an index that carries `::` symbol nodes. A
  // symbol-grounded fact therefore resolves FRESH and its `::` primaryAnchor lets `deriveSubsumes` fire.
  // `foldAstUnits` is a no-op until `initAst()` has been awaited (the entrypoint bins do this once, before
  // composeRuntime); this keeps composeRuntime SYNC for its many direct callers while the production doors
  // (which spawn these bins) get real sub-file granularity.
  const axes = build(foldAstUnits(walkFileTree(repoPath)), readScipOrEmpty(scipPath));

  // The REAL reconcile drift seams (COMPOSE-C). `revIndex` builds the code index at an arbitrary rev:
  //   - `reDerives`         — a fact re-derives iff its grounding is still FRESH at the topic sha.
  //   - `resolveAnchorAt`   — the anchor's `StructRef` at a rev (the drift-source diffs mergeBase vs topic).
  //   - `driftFacts`        — the current grounded facts from the durable projection. Governed-emit
  //     `store.put`s the WHOLE `GroundedFact` (invariant 6), so `store.get(contentHash)` reads it back.
  const revIndex = createRevIndex(repoPath);
  const store = createDiskStore(join(repoPath, CAS_REL));
  const driftFacts = currentNodes(rehydrateProjection(store))
    .map((n) => store.get(n.contentHash as Hash))
    .filter((o): o is GroundedFact => o !== undefined);

  const seams: WireSeams = {
    heuristic: buildHeuristic(policy),
    gate: buildGate(axes),
    classifier: { reconcile: bindReconcile(revIndex.reDerives) },
    driftFacts,
    resolveAnchorAt: revIndex.resolveAnchorAt,
  };

  const config: WireConfig = {
    repoPath,
    casPath: join(repoPath, CAS_REL),
    scipPath,
    seams,
    actor,
    // Conditional spread keeps `ratifyToken` ABSENT (not `undefined`) when unset — exactOptionalPropertyTypes.
    ...(ratifyToken !== undefined ? { ratifyToken } : {}),
  };

  // The real read-only diagnostic port — built over the SAME durable store + revIndex the governed emit
  // leg rides, so `atlas doctor` reads the very facts the write door persists (never a fresh oracle).
  const doctorSource = createDoctorSource(store, revIndex);

  return { handler: assembleHandler(config), doctorSource };
}
