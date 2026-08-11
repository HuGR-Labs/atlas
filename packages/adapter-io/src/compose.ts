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
import { runGit, headSha } from './run-git.js';
import { createDoctorSource, isMechanicalAt } from './doctor-source.js';
import { createGovernedEmit } from './governed-emit.js';
import { createGovernedPromote } from './governed-promote.js';
import type { PromoteOut } from './governed-promote.js';
import { createOwnLeg } from './own-source.js';
import type { OwnLeg } from './own-source.js';
import { createRelationLeg } from './relation-source.js';
import { createNegationLeg } from './negation-source.js';
import type { RelationLeg } from './relation-source.js';
import type { NegationLeg } from './negation-source.js';
import { createDiskStore, rehydrateProjection } from './store.js';
import { gitSidecarTrust } from './store-provenance.js';
import { readProvenanceRefusal } from './read-provenance.js';
import { assembleHandler, bindFreshnessOracle, edgeModelVersion } from './wire.js';
import type { WireConfig, WireSeams, WiredHandler } from './wire.js';

// The `mine` ADMISSION SUPPLY (REQ-CLI-4d), split to its own file at the LOC ceiling and RE-EXPORTED here so
// the composition root's SURFACE is unchanged — see that file's header for why the seam is real, and for the
// measurement that made it necessary (0 candidates staged on every repository `atlas mine` was ever run on).
export { buildMineAdmission } from './compose-mine-admission.js';
export type { MineAdmission, Reground } from './compose-mine-admission.js';

/** The composed runtime: the ONE governed durable `WiredHandler` every entrypoint drives, PLUS the real
 *  read-only `DoctorSource` `atlas doctor` reads over — both built from the SAME store + revIndex so they
 *  can never diverge (WIRE-1). The CLI passes both; the MCP entrypoint drives only the handler. */
export interface ComposedRuntime {
  readonly handler: WiredHandler;
  readonly doctorSource: DoctorSource;
  /**
   * The governed PROMOTION leg (KNOW-8) — `promote(at)` lifts the explorer's staged candidates into governed
   * knowledge THROUGH the emit door. It rides beside the handler for the same reason `doctorSource` does: it
   * opens no new governed surface (`GOVERNANCE_SURFACE` stays 5, `WRITE_PATHS` stays `{atlas-emit,
   * atlas-link}`) so it is not a `Tool` and has no leg to dispatch to — ADR-0008 pre-decided that a curator
   * door is an ordinary USE of the existing emit door. It is built over the SAME durable store PATH and the
   * SAME seams the handler's emit leg and query readback ride — a `DiskStore` holds no state of its own (all
   * of it is the sidecar + CAS files it names), which is why `driftFacts` above can already read back what
   * the handler wrote — so a promoted fact is visible to the very next `atlas query`.
   */
  readonly promote: (at: Hash) => PromoteOut;
  /**
   * The `own_<scope>` READ leg (RETR-12) — `own(scope)` composes the curated, mechanically-ranked briefing
   * for a scope-unit through `@atlas/retrieval`'s `createOwn`, over the feed in `own-source.ts`.
   *
   * IT IS BUILT FROM `store` AND `axes`, THE SAME TWO OBJECTS THE HANDLER'S QUERY LEG READS, and that is the
   * whole reason it is composed here rather than in the CLI: a briefing assembled over a second store would
   * be a different repository's knowledge wearing this repository's scope name. `DiskStore` holds no state of
   * its own (all of it is the sidecar + CAS files it names), so a fact emitted through the handler in the
   * same process is visible to the very next `own` — the feed re-reads the live projection per call.
   *
   * It rides BESIDE the handler for the same reason `doctorSource` and `promote` do: it is not a `Tool`.
   * `GOVERNANCE_SURFACE` stays 5 and `WRITE_PATHS` stays `{atlas-emit, atlas-link}` — this is a READ door,
   * it opens no write path, and there is nothing for `WiredHandler.handle` to route.
   *
   * NO AUTHZ GATE, DELIBERATELY (KNOW-11b): reads are universal in Atlas. The actor is a self-asserted
   * string (see the posture note on {@link composeRuntime}), so gating a read on it would refuse an honest
   * caller and stop a dishonest one for exactly as long as it takes to set one environment variable.
   */
  readonly own: OwnLeg;
  /**
   * The grounded-relation READ leg (#99a / ADR-0015 D2) — `relations(unit, direction)` returns the
   * `family:'relation'` facts touching a unit, both directions, via the `relationsOf` fold.
   *
   * IT IS BUILT FROM `store`, THE SAME OBJECT THE HANDLER'S QUERY LEG READS, and that is the whole reason it
   * is composed here rather than in a transport: the relations touching a unit are read off the very
   * projection `atlas query` reads back, so the two can never diverge. `DiskStore` holds no state of its own
   * (all of it is the sidecar + CAS files it names), so a relation emitted through the handler in the same
   * process is visible to the very next `atlas relations` — the leg re-reads the live projection per call.
   *
   * It rides BESIDE the handler for the same reason `doctorSource`/`promote`/`own` do: it is not a `Tool`.
   * `GOVERNANCE_SURFACE` stays 5 and `WRITE_PATHS` is untouched — this is a READ door, it opens no write
   * path, and there is nothing for `WiredHandler.handle` to route.
   */
  readonly relations: RelationLeg;
  /**
   * The grounded-negation + abstention READ leg (#99b / ADR-0015 D3) — `negations(scope)` returns the
   * `family:'negation'` negatives the truth door admitted AND the honest ABSTENTIONS it filed under a scope,
   * via the `negationsOf`/`abstentionsOf` folds. Built from `store`, the SAME object the handler's query leg
   * reads — passed, not rebuilt — so `atlas negations <scope>` and `atlas query <scope>` are two projections
   * of ONE store. It rides BESIDE the handler for the same reason `relations`/`own` do: it is not a `Tool`,
   * `GOVERNANCE_SURFACE` stays 5 and `WRITE_PATHS` is untouched — a READ door, no write path. This leg is what
   * makes `negationsOf`/`abstentionsOf` running code rather than reference models, and it is the surface that
   * makes a fired abstention observable (closes #202).
   */
  readonly negations: NegationLeg;
  /**
   * The PROVENANCE refusal for this repo's durable store, or `undefined` when it is trustworthy
   * (`read-provenance.ts`). PRESENT means `.atlas/` arrived by COMMIT rather than through a door, so every
   * read serves nothing and every write refuses.
   *
   * It is surfaced HERE, on the composed runtime, because the refusal has to be legible on doors that the
   * handler does not own: `atlas doctor` sub-dispatches to `DoctorApi` without touching the handler, and
   * `atlas node` reaches `resolveNode`, which the frozen handler does NOT wrap in a try/catch. One value the
   * entrypoint can render once covers all of them, in the entrypoint's own prose, instead of each door
   * rediscovering the condition — and the leg-level guards stay as the backstop for every other caller.
   */
  readonly readRefusal?: string;
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
 * result ⇒ `undefined`. Uses the shared no-shell git seam (`runGit`, #74).
 *
 * SECURITY, STATED PRECISELY BECAUSE THE PREVIOUS WORDING WAS NOT. This is a LOCAL-MACHINE source only: the
 * value is never derived from an emitted fact or a tool-call payload, so a WRITE REQUEST cannot choose who
 * it is attributed to. That is the whole of the property, and the earlier note here — "so it cannot be used
 * to spoof the KNOW-11 write actor" — overstated it into something false. `git config user.email` is a line
 * in a file the caller owns and can rewrite; `ATLAS_ACTOR` overrides it outright. Neither is verified.
 * See {@link composeRuntime} for the posture in full.
 */
export function gitUserEmail(repoPath: string): string | undefined {
  try {
    const email = runGit(repoPath, ['config', 'user.email']).trim();
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
 * git identity; otherwise empty. It is passed EXPLICITLY into the WIRE config (`config.actor`) — no
 * `process.env` mutation, no global state. Fail-closed is preserved: an actor not in a policy scope is
 * denied, and empty policy scopes deny every write.
 *
 * ── THIS IS NOT AUTHENTICATION, AND KNOW-11 MUST NOT BE READ AS THOUGH IT WERE ───────────────────────────
 * There is no authentication anywhere in Atlas. `actor` is a CLAIM. `ATLAS_ACTOR` is set by whoever starts
 * the process; the git-config fallback is a line in a file that same person owns. Nothing verifies either,
 * and nothing in the system COULD — there is no key, no session, no challenge, no third party. Any caller
 * can present as any actor the policy names, by setting one environment variable.
 *
 * So KNOW-11 is an ANTI-ACCIDENT GUARDRAIL, not an adversarial control (`docs/reference/atlas-architecture.md`
 * §3.3 / ARCH-12 — the same posture, stated for the architecture; this note exists because the posture was
 * documented ONLY there while the code here read the other way). It stops the wrong seat from casually
 * writing another team's scope, which is the failure a local developer tool actually suffers. It stops
 * nobody who does not want to be stopped. Every authz gate downstream — the confused-deputy incumbent gate,
 * scope monotonicity, the disclosure ordering between `unauthorized for target` and `unverifiable target` —
 * is correct ABOUT THE ACTOR IT IS GIVEN and inherits this ceiling: they are the structure a real identity
 * would plug into, not a substitute for one.
 *
 * WHAT THE ENV-ONLY SOURCING DOES BUY, precisely, since it was previously written up as "the spoof-guard"
 * and that name claimed too much: the actor is never read from an emitted fact or a tool-call payload, so a
 * write REQUEST cannot choose the identity it is judged as, and a fact that travels between repos carries no
 * authority with it. That is a real and necessary property. It is not resistance to spoofing.
 *
 * IF THE TRANSPORT EVER BECOMES REMOTE OR MULTI-TENANT (ARCH-12 says this in the same words), the env-var
 * actor and the world-readable policy both become live vulnerabilities and this seam MUST be replaced with a
 * real identity before that transport ships. Pinned by `test/actor-is-unauthenticated.test.ts`.
 */
export function composeRuntime(repoPath: string): ComposedRuntime {
  // Resolve the KNOW-11 write actor at the composition root: ATLAS_ACTOR (env) wins; else the LOCAL git
  // identity (`git config user.email`); else empty (fail-closed ⇒ every write denied). Passed EXPLICITLY to
  // the assembler below (no global env write).
  //
  // NOT AUTHENTICATION — see the doc block above. This line reads a self-asserted string; it does not
  // establish who anyone is, and no code downstream of it does either.
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
  // N11: the doctor/reconcile store stamps the same freshness watermark (HEAD at persist) as the handler's.
  // PROVENANCE (the root the doors hang from): git is owned HERE, so the tripwire that asks whether the
  // durable store is TRACKED — i.e. arrived by commit rather than through a door — is built here and
  // injected, exactly as the N11 watermark is. One `git ls-files`, memoized for the life of the runtime.
  const trusted = gitSidecarTrust(repoPath);
  const store = createDiskStore(join(repoPath, CAS_REL), () => headSha(repoPath), trusted);
  const driftFacts = currentNodes(rehydrateProjection(store))
    .map((n) => store.get(n.contentHash as Hash))
    .filter((o): o is GroundedFact => o !== undefined);

  const seams: WireSeams = {
    heuristic: buildHeuristic(policy),
    gate: buildGate(axes),
    // N10 — the reconcile classifier is CONTENT-ADDRESSED: a drifted fact is MECHANICAL iff its recorded
    // content re-derives SOMEWHERE at the new sha (`resolveBySubtreeAt`), not just at the SAME
    // qualifiedPath. The original predicate was PATH-KEYED, so a genuinely moved-but-alive fact read `false`
    // ⇒ was ALWAYS `semantic`, making `mechanical` structurally unreachable for real drift.
    //
    // IT IS NOW THE SAME BODY DOCTOR RUNS, not a second copy of it, and that is the whole point of the
    // import. This site used to inline its own predicate over `primaryAnchor(fact)` — `entries[0]` alone —
    // while doctor's classifier spanned every drifted citation. Two copies of one question, free to
    // diverge, and they had: a fact whose NON-PRIMARY citation had rotted away resolved its primary anchor
    // at the new sha, classified `mechanical`, and this gate — `exitCode = |semantic| > 0 ? 2 : 0`, the
    // answer a CI job merges on — reported CLEAN over a knowledge base holding a dead citation. MEASURED
    // end to end through this composition root (`test/reconcile-entry-symmetry.test.ts`): `exitCode 0`,
    // `semantic []` before; `exitCode 2`, `semantic ['mixed']` after.
    //
    // BLAST RADIUS, STATED BECAUSE IT IS A MERGE GATE MOVING: a repo whose grounding is multi-entry and
    // whose non-primary citation has rotted will now FAIL `atlas reconcile` (exit 2, re-author) where it
    // used to pass. A single-entry grounding, and a multi-entry one whose drifted citations all re-derive
    // somewhere, are UNCHANGED (exit 0) — pinned in both directions by that test.
    classifier: { reconcile: bindReconcile((fact, newSha) => isMechanicalAt(revIndex, fact, newSha)) },
    driftFacts,
    resolveAnchorAt: revIndex.resolveAnchorAt,
    // N10 secondary — the DETECTION half needs the content-addressed resolver too, so `driftAt` can surface a
    // PURE RENAME (old path deleted at HEAD ⇒ path-keyed `now` undefined ⇒ no pair under the old logic ⇒ the
    // moved fact was silently dropped before the classifier ever saw it). Same frozen revIndex method N9 uses.
    resolveBySubtreeAt: revIndex.resolveBySubtreeAt,
  };

  const config: WireConfig = {
    repoPath,
    casPath: join(repoPath, CAS_REL),
    scipPath,
    seams,
    actor,
    // N2: the STRUCTURAL axes the CLOSED three-mode retrieval surface reads (`edges` drive the dependency blast
    // radius). Only the axes are threaded — the fact-dependent read model is rebuilt PER QUERY from the live
    // durable store inside the query leg (retrieval-model.ts), so `--by dependency|trigger` reflects an
    // in-session `atlas-emit` EXACTLY as `--by scope` does (no frozen startup snapshot). `byTrigger` stays a
    // documented dormant mode (no trigger producer exists).
    axes,
    // The provenance tripwire rides the ASSEMBLED store too — that is the one `atlas query`/`atlas emit`
    // actually read and write. Threading it only onto the store built above would guard doctor/reconcile
    // and leave both user-facing doors open.
    trusted,
    // Conditional spread keeps `ratifyToken` ABSENT (not `undefined`) when unset — exactOptionalPropertyTypes.
    ...(ratifyToken !== undefined ? { ratifyToken } : {}),
  };

  // The real read-only diagnostic port — built over the SAME durable store + revIndex the governed emit
  // leg rides, so `atlas doctor` reads the very facts the write door persists (never a fresh oracle).
  const doctorSource = createDoctorSource(store, revIndex, trusted);

  // The provenance verdict, resolved ONCE (the seam memoizes its `git ls-files` for the life of the runtime)
  // and handed to the entrypoint. Conditional spread keeps it ABSENT (not `undefined`) on a healthy repo —
  // `exactOptionalPropertyTypes`, and the same discipline `ratifyToken` uses above.
  const readRefusal = readProvenanceRefusal(trusted);

  // THE GOVERNED PROMOTION LEG (KNOW-8). It is composed from the SAME parts the `atlas-emit` leg above is —
  // this store, this policy, this truth-gate, this actor, this ratify token — and differs in EXACTLY one
  // field: `origin: 'promoted'`, which the door DERIVES from the fact that it read the row out of staging.
  // Without it a staged candidate (T2 ∧ advisory ∧ grounded) fast-paths to `auto-accept` and the KNOW-8 token
  // is never consulted, i.e. the one path built to run through the ratifier would be the one path that skips
  // it. See `governed-emit-route.ts` for the measurement and `RatifyContext.origin` for why this is a new
  // field rather than a forged `contested`/`lowRisk`.
  //
  // A SECOND `createGovernedEmit` INSTANCE IS NOT A SECOND DOOR: `createGovernedEmit` is a pure factory over
  // its deps (no module state, no cache), and both instances publish through the SAME durable files by the
  // SAME atomic `commitProjection` protocol — which is exactly the concurrency case that protocol was written
  // for, since two `atlas emit` PROCESSES are already two instances. What would be a second door is a second
  // gate ladder or a second write medium; neither exists here.
  const promoteLeg = createGovernedPromote({
    store,
    emit: createGovernedEmit({
      store,
      gate: seams.gate,
      policy,
      actor,
      origin: 'promoted',
      ...(ratifyToken !== undefined ? { ratifyToken } : {}),
    }).emit,
  });

  return {
    handler: assembleHandler(config),
    doctorSource,
    promote: promoteLeg.promote,
    // THE `own_<scope>` READ LEG. `store` and `axes` here are the very objects the handler's query leg reads
    // — passed, not rebuilt — so `atlas own <scope>` and `atlas query <scope>` are two projections of ONE
    // store, and `policy` is the same loaded `.atlas/policy.json` the write door gates on (it supplies the
    // terrain OWNER, which is the declared scope membership, not a second notion of ownership).
    own: createOwnLeg({ axes, store, policy }),
    // THE GROUNDED-RELATION READ LEG (#99a). `store` is the very object the handler's query leg reads —
    // passed, not rebuilt — so `atlas relations <unit>` and `atlas query <unit>` are two projections of ONE
    // store, and a relation emitted through the emit door is visible to the very next `relations` call.
    relations: createRelationLeg(store),
    // THE GROUNDED-NEGATION + ABSTENTION READ LEG (#99b). Same `store` the query leg reads — passed, not
    // rebuilt — so `atlas negations <scope>` reads the SAME projection `atlas query` reads back, and a fired
    // abstention is observable off it (#202). Read-only; no governed token, GOVERNANCE_SURFACE stays 5.
    // N4 (billy F1): threaded the SAME family-aware freshness oracle the query readback rides — `driftDetect`
    // over the `axes` built once above PLUS the §3 clause-4 `edgeModel === edgeModelVersion()` conjunct for a
    // negation — so `atlas negations` surfaces a per-row FRESH/DRIFTED verdict (a re-opened scope OR an
    // extractor bump reads DRIFTED). `currentEdgeModel` is `edgeModelVersion()`, the SAME value the door stamps.
    negations: createNegationLeg(store, bindFreshnessOracle(axes, edgeModelVersion())),
    ...(readRefusal !== undefined ? { readRefusal } : {}),
  };
}
