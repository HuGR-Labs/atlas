// @atlas/adapter-io — src/governed-emit-negation.ts  (ADR-0015 D3 · #99b N2 — THE ABSTENTION DOOR)
//
// The honesty core. A NEGATION is `¬∃` over a relation ("no unit `relationKind`s the GLOBAL symbol X within
// the CLOSED directory scope S"). A closed-world negative is SOUND ONLY IF the negated relation was computed
// COMPLETELY over S — an under-approximated graph (an unresolved/dynamic reference anywhere in S) makes every
// negative a lie (contract §0). So this door REFUSES to admit any negation it cannot prove closed, and emits
// an EXPLICIT, DURABLE `AbstainedRecord` when it must abstain — never a silent fail-closed drop (closes #202).
//
// It rides the SAME governed emit surface (`createGovernedEmit`) — the door's `emit` branches here on
// `kind:'negation'` — but its GATES are RE-ROUTED (contract §4, normative and transcribed here, no invented
// policy):
//   gate 0.1 WELL-FORMED : target/scope non-empty, relationKind ∈ the closed vocabulary, AND target GLOBAL
//                          (not a `local ` SCIP symbol — a local's callers are intra-doc, out of #99b v1).
//                          A malformed triple ⇒ fail-closed REFUSE; a non-global target ⇒ ABSTAIN
//                          (`target-not-global`).
//   gate 1   ABSTENTION  : the crux. Over the scope S, using the N0 completeness feed (`SymbolReverseApi`):
//                            · S does not resolve on the spatial rail  ⇒ ABSTAIN (`scope-empty`).
//                            · holeSources() ∩ S ≠ ∅  (S is OPEN)      ⇒ ABSTAIN (`scope-open`, witness).
//                            · reverseCallers(target) ∩ S ≠ ∅ (a real  ⇒ REJECT (the negative is FALSE —
//                              caller EXISTS)                             refuted, NOT abstained).
//                            · callers∩S == ∅ ∧ holes∩S == ∅           ⇒ ADMIT with the §3 grounding.
//                          ⚠ SOUNDNESS (billy): the open-scope test is `holeSources() ∩ S ≠ ∅`, NOT the naive
//                          `reverseCallers(target) == []` — the latter reads `[]` for a local/undefined target
//                          over an OPEN world too, which is the exact false-negative §0 forbids.
//   §3 grounding         : constructed AT ADMIT — ONE `kind:'directory'` entry at S whose `subtreeHash` is S's
//                          CURRENT folded scope-Merkle (`resolveCurrent`, the insertion-sensitive dir hash a
//                          new caller entering S drifts). `edgeModel` stamped = the extractor release (§3
//                          clause 4, the ONE completeness clause `driftDetect` cannot see).
//   gate 2.1 ANCHOR/AUTHZ: the ANCHOR binds on the negation's OWN witness `scope` (the assertion IS about S)
//                          and `primaryAnchorId` is NEVER called — a negation routes by `negationKey`. The
//                          AUTHZ gate binds `authzScope ?? scope` (F3, WP-96-N): absent ⇒ the witness `scope`
//                          exactly as #99b shipped (human negations unchanged), present ⇒ the separate
//                          `authzScope` (a MINED negation binds `atlas:mined` while keeping its witness identity).
//   gates 2.25 / 2.5 / 3 : incumbent keyed on `negationKey`, ratify as ADVISORY-class (no `check`), upsert+put
//                          with family 'negation' — VERBATIM the main door's atomic-commit machinery, reused.
//
// The `∩ S` containment is the SAME segment-wise `underScope` predicate the read projection scopes on — NOT a
// second string-containment (the ADR-0010 "one predicate, two consumers" rule; #153 containment lesson). A
// docHash is "in S" iff its repo-relative FILE PATH (recovered from the spatial axis) is UNDER S.

import type { CasObject } from '@atlas/kernel';
import type { Hash, NodeKey, Tier } from '@atlas/contracts';
import { upsert, route, stage, ratify, isTier, isScope, negationKey, isKnownRelationKind } from '@atlas/knowledge';
import type {
  Candidate, CurrentNode, NegationNode, AbstainedRecord, RelationKind, RatifyToken, StoreProjection, WriteRequest,
} from '@atlas/knowledge';
import { isLocalSymbol } from '@atlas/index';
import type { Axes, IndexNode, SymbolReverseApi } from '@atlas/index';
import { resolveCurrent } from '@atlas/grounding';
import type { Grounding } from '@atlas/grounding';
import type { EmitOut } from '@atlas/tools';
import type { GovernedEmitDeps } from './governed-emit.js';
import { addressOf, commitRefusalOf } from './governed-emit-address.js';
import { actorInScope, scopeOwnsAnchor } from './policy.js';
import { incumbentDecision } from './governed-emit-incumbent.js';
import { ratifyCtxFor } from './governed-emit-route.js';
import { underScope } from './anchor-scope.js';
import {
  REJECTED_CONTENDED, REJECTED_UNREADABLE_STORE, REJECTED_UNAUTHORIZED, REJECTED_UNAUTHORIZED_ANCHOR, REJECTED_UNRATIFIED,
} from './governed-emit-reasons.js';
import { REJECTED_UNTRUSTED_STORE } from './read-provenance.js';
import type { CommitResult } from './sidecar.js';

/**
 * The NEGATION LEG's extra deps — the channels ONLY a negation reads, folded into `GovernedEmitDeps` (which
 * `extends` this) so they live WITH the leg that consumes them (the cohesive seam, not a line-count dodge).
 * ADDITIVE + OPTIONAL: absent (the bare-WIRE fake assembly, or any non-negation caller) ⇒ a negation cannot be
 * proven closed AND cannot be grounded ⇒ the door ABSTAINS fail-closed. No non-negation write reads any of them.
 */
export interface NegationEmitDeps {
  /** The N0 symbol-level reverse-caller view (`reverseCallers`/`holeSources`) — the completeness feed. */
  readonly symbolReverse?: () => SymbolReverseApi;
  /** The SAME live axes the truth-gate rides — resolves S's folded subtree-Merkle (§3) + file paths for `∩ S`. */
  readonly axes?: Axes;
  /** The sealed-kernel path→docHash keying (`id({file:p})`) — maps a feed docHash back to its path for `∩ S`. */
  readonly nodeHashOfPath?: (path: string) => Hash;
  /** The pinned extractor release (`IndexerPlan.version`) stamped onto an admitted negation's `edgeModel` (§3
   *  clause 4 — the ONE completeness clause `driftDetect` cannot see: an upgrade changes no file bytes). */
  readonly edgeModel?: string;
}

/** Malformed-negation refusal (fail-closed verdict) — the door's own gate-0.1 shape check on the caller's OWN
 *  payload, disclosing nothing about any incumbent. Distinct from an ABSTENTION: a malformed triple has no
 *  well-formed address to abstain AT, whereas a well-formed-but-undecidable negative earns a durable record. */
export const REJECTED_MALFORMED_NEGATION =
  'malformed negation: a negation identity is the triple (relationKind, target, scope). target and scope must ' +
  'each be a non-empty string and relationKind must be a closed-vocabulary member (depends-on | calls). This ' +
  'reads the payload\'s OWN shape and is refused before any completeness check, so it discloses nothing';

/** The negative is FALSE — a real caller of the target EXISTS in the closed scope (`reverseCallers ∩ S ≠ ∅`).
 *  A REJECTION, not an abstention: the door DECIDED, and it decided against the claim. No durable record. */
export const REJECTED_NEGATION_REFUTED =
  'negation refuted: a caller of the target EXISTS within the closed scope, so the negative is FALSE (this is ' +
  'a decision, not an abstention — the scope was closed and a witness against the claim was found)';

/** The three ABSTENTION verdicts the EmitOut carries back (emitted:false). The DURABLE evidence is the
 *  `AbstainedRecord` written into `projection.abstained` at the SAME `negationKey` address; these strings are
 *  the door's transport-visible echo of that record's `reason`, so an abstention reads as a refusal (exit 2 /
 *  MCP isError), never a silent success. The reader (N3) surfaces the record itself. */
const REASON_TEXT: Readonly<Record<AbstainedRecord['reason'], string>> = {
  'scope-open':
    'abstained (scope-open): the negated relation is UNDER-APPROXIMATED over this scope — an unresolved/dynamic ' +
    'reference lives in S, so absence of a caller cannot be proven. A durable AbstainedRecord was written; read ' +
    'it back with the negation read surface. Close the scope (resolve the hole) or narrow S, then re-emit',
  'target-not-global':
    'abstained (target-not-global): the target is a `local ` SCIP symbol, document-scoped by the grammar — its ' +
    'callers are intra-document (a different closed procedure), out of #99b v1 scope. Name the GLOBAL symbol',
  'scope-empty':
    'abstained (scope-empty): the scope directory S does not resolve on the spatial rail, so it cannot be ' +
    'grounded (a negation grounds against S\'s folded subtree-Merkle). Name a directory that exists in the tree',
};

/** Build the ABSTAINED emitted-false verdict + its durable record at the negation's own `negationKey`. */
function abstainOut(reason: AbstainedRecord['reason']): EmitOut {
  return { emitted: false, rejected: REASON_TEXT[reason] };
}

/** Walk the spatial axis once and index every path-node by its docHash — `nodeHashOfPath(node.key)` — so a
 *  docHash returned by the N0 feed (`reverseCallers`/`holeSources`, both keyed by `nodeHashOfPath(path)`) can
 *  be mapped BACK to its repo-relative file path and tested against the scope with `underScope`. `::` AST
 *  refinement keys are skipped (they are not file docHashes). Deterministic, pure. */
function indexPathsByHash(spatial: IndexNode, nodeHashOfPath: (p: string) => Hash): Map<string, string> {
  const byHash = new Map<string, string>();
  const walk = (node: IndexNode): void => {
    if (!node.key.includes('::')) byHash.set(String(nodeHashOfPath(node.key)), node.key);
    for (const child of node.children) walk(child);
  };
  walk(spatial);
  return byHash;
}

/** The subset of `hashes` whose file path (recovered from `byHash`) lies UNDER the directory scope `S` — the
 *  `∩ S` operator, computed on the SAME `underScope` predicate the read projection uses (never a second
 *  containment). A hash with no known path is NOT in scope (fail-closed). Returns the offending hashes as
 *  strings (the witness form). */
function inScope(hashes: readonly Hash[], byHash: ReadonlyMap<string, string>, scope: string): string[] {
  const out: string[] = [];
  for (const h of hashes) {
    const path = byHash.get(String(h));
    if (path !== undefined && underScope(path, scope)) out.push(String(h));
  }
  return out.sort();
}

/**
 * THE NEGATION DOOR. Returns the frozen `EmitOut`. Fail-closed at every gate; on ADMIT it constructs the §3
 * grounding, routes through the SAME KNOW-15 upsert + KNOW-8 ratify machinery the main door uses, and — the §2
 * supersede — DELETES any abstention standing at the same `negationKey` as it lands the fact in `current`. On
 * an abstention it writes the `AbstainedRecord` durably (through `commitProjection`, NOT `upsert` — the
 * abstention is not a fact). Pure of clock/random given a pure store/policy/feed.
 */
export function emitNegation(deps: GovernedEmitDeps, raw: NegationNode): EmitOut {
  // gate 0 — the payload fields the later gates route on (mirrors the main door's gate 0).
  const tier = raw.tier;
  if (!isTier(tier)) return { emitted: false, rejected: REJECTED_MALFORMED_NEGATION };
  const scope = raw.scope;
  if (!isScope(scope)) return { emitted: false, rejected: REJECTED_MALFORMED_NEGATION };
  const target = raw.target;
  const relationKind = raw.relationKind;
  // gate 0.1 WELL-FORMED — a malformed triple has no address to abstain at (fail-closed REFUSE).
  if (typeof target !== 'string' || target.length === 0 || !isKnownRelationKind(relationKind)) {
    return { emitted: false, rejected: REJECTED_MALFORMED_NEGATION };
  }
  // The negation's address — the SAME address an abstention or a later admitted negation takes (§2). Cannot
  // throw: the three legs above already passed `negationKey`'s own total-over-unknown guard.
  const key = negationKey(relationKind, target, scope);
  const record = (reason: AbstainedRecord['reason'], underApproxSources: readonly string[]): AbstainedRecord => ({
    kind: 'abstained', id: key, relationKind: relationKind as RelationKind, target, scope, reason,
    witness: { underApproxSources },
  });

  // gate 0.1 (target GLOBAL) — a `local ` symbol is document-scoped; its callers are intra-doc ⇒ ABSTAIN.
  if (isLocalSymbol(target)) return writeAbstention(deps, key, record('target-not-global', []));

  // The completeness feed + the live axes must both be wired to decide closure at all. Absent (the bare-WIRE
  // fake assembly) ⇒ the scope cannot be proven closed AND cannot be grounded ⇒ ABSTAIN scope-empty (honest
  // fail-closed: no negation is admitted without the machinery to prove it).
  const axes: Axes | undefined = deps.axes;
  const symbolReverse: SymbolReverseApi | undefined = deps.symbolReverse?.();
  const nodeHashOfPath = deps.nodeHashOfPath;
  if (axes === undefined || symbolReverse === undefined || nodeHashOfPath === undefined) {
    return writeAbstention(deps, key, record('scope-empty', []));
  }

  // gate 1 — THE ABSTENTION GATE, in the contract's normative order.
  //   (a) S resolves on the spatial rail? Its folded subtree-Merkle IS the §3 grounding witness — no
  //       resolution ⇒ ungroundable ⇒ ABSTAIN scope-empty.
  const subtreeHash = resolveCurrent(axes, scope);
  if (subtreeHash === undefined) return writeAbstention(deps, key, record('scope-empty', []));

  const byHash = indexPathsByHash(axes.spatial, nodeHashOfPath);
  //   (b) scope OPEN? An unresolved/dynamic reference ANYWHERE in S under-approximates the graph ⇒ ABSTAIN
  //       scope-open, WITH the offending docHashes as the witness (durable + readable, NOT a silent refuse).
  //       ⚠ This is the SOUND condition — `holeSources() ∩ S`, NOT `reverseCallers(target) == []`.
  const openSources = inScope(symbolReverse.holeSources(), byHash, scope);
  if (openSources.length > 0) return writeAbstention(deps, key, record('scope-open', openSources));
  //   (c) a real caller in S? The negative is FALSE ⇒ REJECT (a decision, not an abstention — no record).
  const callersInScope = inScope(symbolReverse.reverseCallers(target), byHash, scope);
  if (callersInScope.length > 0) return { emitted: false, rejected: REJECTED_NEGATION_REFUTED };

  //   (d) callers∩S == ∅ ∧ holes∩S == ∅ ∧ S resolves ⇒ ADMIT with the §3 directory grounding.
  const grounding: Grounding = {
    entries: [{ anchor: { kind: 'directory', qualifiedPath: scope, subtreeHash }, path: scope }],
  };
  const node: NegationNode = {
    ...raw,
    id: key, // MINTED, never trusted from the payload
    tier,
    scope,
    grounding, // CONSTRUCTED here — §3
    edgeModel: deps.edgeModel ?? '', // the extractor release at emit — §3 clause 4
  };

  // 0.5 ADDRESSABLE — mint the content address off the constructed node, refusing (not throwing) a canonical-
  //     form violation, exactly as the main door does.
  const addressed = addressOf(node);
  if (addressed.rejected !== undefined) return { emitted: false, rejected: addressed.rejected };
  const contentHash = addressed.hash;

  // 2. AUTHZ — the actor must be in the negation's AUTHZ scope. F3 (WP-96-N, owner-ratified 2026-08-11): the
  //    gate binds `node.authzScope ?? scope`. ABSENT ⇒ binds the witness `scope` EXACTLY as before (a human
  //    `atlas emit` negation carries no `authzScope`, so it still needs authority over the very scope it
  //    asserts about — #99b back-compat, UNCHANGED). PRESENT ⇒ binds `authzScope`, so a MINED negation can keep
  //    its witness directory as IDENTITY (the real scoped-negative) while the orchestrator's `atlas:mined`
  //    grant authorizes it. This is the ONLY behavioural change to the door's authz; identity (`negationKey`
  //    over the witness `scope`) and the honest-abstention law (both above) are untouched — they never read it.
  const authzScope = node.authzScope ?? scope;
  if (!actorInScope(deps.policy, deps.actor, authzScope)) return { emitted: false, rejected: REJECTED_UNAUTHORIZED };
  // 2.1 ANCHOR — bind the write scope on the negation's OWN scope. `primaryAnchorId` is NOT called: a negation
  //     is anchored at the scope directory and routes by `negationKey`. Reuses the existing scope-authz path.
  if (!scopeOwnsAnchor(deps.policy, scope, scope)) return { emitted: false, rejected: REJECTED_UNAUTHORIZED_ANCHOR };

  // The advisory-CLASS candidate view (no `check`) the ratify gate reads (`tier`/`grounding`). A negation
  // ratifies on the advisory path — its IDENTITY is `negationKey`, NOT nodeKey-of-this-view.
  const candidateView = { ...node, slot: undefined } as unknown as Candidate;

  // ── THE ATOMIC COMMIT (2.25 → 3) — ONE decision over ONE snapshot, re-run from scratch on a lost race, so it
  //    MUST carry the gates, not merely the state change (the confused-deputy-by-retry rule, see store.ts).
  let committed: CommitResult<EmitOut>;
  try {
    committed = deps.store.commitProjection<EmitOut>((projection) => {
      // 2.25 INCUMBENT — keyed on `negationKey`. A prior ABSTENTION lives in `projection.abstained`, NOT
      //      `current`, so it is not an incumbent here (its supersede is the delete below).
      const incumbent: CurrentNode | undefined = projection.current.get(String(key));
      let derivedTier: Tier | undefined;
      if (incumbent !== undefined) {
        const decision = incumbentDecision(deps, incumbent, node, tier);
        if (decision.refusal !== undefined) return { out: { emitted: false, rejected: decision.refusal } };
        derivedTier = decision.derivedTier;
      }
      // 2.5 RATIFY — advisory-class routing. A T2 grounded negation auto-accepts; a T0 needs the billy token.
      if (route(candidateView, ratifyCtxFor(derivedTier, deps.origin)) === 'full-ratify') {
        const token: RatifyToken = { by: deps.ratifyToken ?? '' };
        if (!ratify(stage(candidateView), token).committed) return { out: { emitted: false, rejected: REJECTED_UNRATIFIED } };
      }
      // 3. UPSERT + PUT — family 'negation'; the row carries (scope, tier) + the ADR-0007 governance carrier.
      const req: WriteRequest = {
        nodeKey: String(key),
        contentHash: contentHash as unknown as string,
        family: 'negation',
        claimNorm: `NOT(${target} ${relationKind})@${scope}`,
        primaryAnchor: scope, // the scope directory the negation is anchored at (bound at gate 2.1)
        // IDENTITY CARRIERS onto the row — `negationsOf` (knowledge/read/negations.ts) reads the target off
        // `endpointB` and the kind off `relationKind` and SKIPS a row missing either, so a door-emitted negation
        // is invisible to `atlas negations` without these (lucy P0). `endpointA` (the subject) stays ABSENT: a
        // negation quantifies the subject away — it is ¬∃·→X, about the OBJECT X only.
        endpointB: target,
        relationKind,
        scope,
        tier,
      };
      const upserted = upsert(projection, req).store;
      // §2 SUPERSEDE — "couldn't decide" → "decided false": drop any abstention at this address as the fact lands.
      const abstained = new Map(projection.abstained ?? []);
      abstained.delete(String(key));
      const next: StoreProjection = {
        current: upserted.current,
        cas: upserted.cas,
        ...(abstained.size > 0 ? { abstained } : {}),
        ...(projection.builtAt !== undefined ? { builtAt: projection.builtAt } : {}),
      };
      return { out: { emitted: true, id: contentHash }, next, put: [node as CasObject] };
    });
  } catch (e) {
    return { emitted: false, rejected: commitRefusalOf(e) };
  }
  if (committed.settled) return committed.out;
  return { emitted: false, rejected: commitRefusalFor(committed.refusal) };
}

/** Write a durable `AbstainedRecord` into `projection.abstained` at `key` through the atomic projection door
 *  (NOT `upsert` — the reducer is for facts, and an abstention asserts nothing). Carries `current`/`cas`
 *  forward untouched. Returns the abstention verdict, or a visible commit refusal. */
function writeAbstention(deps: GovernedEmitDeps, key: NodeKey, rec: AbstainedRecord): EmitOut {
  let committed: CommitResult<EmitOut>;
  try {
    committed = deps.store.commitProjection<EmitOut>((projection) => {
      const abstained = new Map(projection.abstained ?? []);
      abstained.set(String(key), rec);
      const next: StoreProjection = {
        current: projection.current,
        cas: projection.cas,
        abstained,
        ...(projection.builtAt !== undefined ? { builtAt: projection.builtAt } : {}),
      };
      return { out: abstainOut(rec.reason), next };
    });
  } catch (e) {
    return { emitted: false, rejected: commitRefusalOf(e) };
  }
  if (committed.settled) return committed.out;
  return { emitted: false, rejected: commitRefusalFor(committed.refusal) };
}

/** The commit's own visible refusals (door stage 5), shared by both legs above — never a silent no-op. */
function commitRefusalFor(refusal: 'contended' | 'unreadable' | 'untrusted'): string {
  return refusal === 'contended'
    ? REJECTED_CONTENDED
    : refusal === 'untrusted'
      ? REJECTED_UNTRUSTED_STORE
      : REJECTED_UNREADABLE_STORE;
}
