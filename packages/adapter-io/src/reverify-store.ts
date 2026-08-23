// @atlas/adapter-io — src/reverify-store.ts  (REVERIFY-GATE: re-prove every `proven` seal against the LIVE index)
//
// The versioned-store chapter's premise is that knowledge travels WITH the repo, not that it is trusted
// because it sits in `.atlas/`. A committed durable store authenticates INTEGRITY (content-addressing) and
// says nothing about PROVENANCE — which is why `store-provenance.ts` turns Atlas off when `.atlas/` is
// tracked by git (untouched here, and this module does NOT narrow that tripwire). The way out is not to
// trust the committed fact but to RE-PROVE it: a fact whose own recorded derivation (`witness`,
// `@atlas/knowledge` `PredicateWitness`, #195 SEAL-CARRIES-ITS-WITNESS) replays PROVEN against the CURRENT
// index is true regardless of who committed it or when. This module is that re-prover.
//
// ── THE THREE-BUCKET CLASSIFICATION IS THE WHOLE POINT ──────────────────────────────────────────────────
//   `re-proven`    — the witness replayed through the REAL oracle (the SAME `VerifyFactLeg` `atlas
//                    verify-fact` drives — no second oracle, no duplicated index build) and came back `proven`.
//   `broken`       — replayed and did NOT come back `proven` (abstain/refuted/anything else). The fact no
//                    longer holds against this index — drift, a deleted caller, a moved symbol.
//   `unverifiable` — `seal:'proven'` with NO witness, or an INCOMPLETE one (missing slot/target/scope, or a
//                    slot the witness family does not cover). There is nothing to replay. THIS MUST NEVER BE
//                    COUNTED AS A PASS: a witness-less `proven` seal is precisely the trust-me-it-was-proved
//                    shape the versioned-store chapter exists to eliminate. Cold review of #195 established
//                    this arm is UNREACHABLE in shipped code today (`compose-mine-admission.ts` wires
//                    `typeOracle.expressible: () => false`) — it is checked anyway, and its count is
//                    reported rather than assumed empty.
//
// A fact that carries NO `seal` at all (an ordinary advisory/predicate/relation/negation) is not sealed
// `proven` and is simply not in scope for this pass — it is neither re-proven nor broken nor unverifiable,
// it is UNSEALED, and this module never counts it.
//
// ── `seal:'justified'` IS ALSO OUT OF SCOPE — BY DESIGN, NOT BY OVERSIGHT (196b, A5) ────────────────────
// A `justified` fact (ADR-0017's second seal) has NO mechanical witness: its grounds are a contestable
// `derivation` prose plus a grounding span into the cited bytes, NOT a re-provable `PredicateWitness`
// (`genesis-epistemic-contract.md` §JUSTIFIED — "the justification travels with the fact", contestable, not
// oracle-backed). There is nothing to REPLAY, so this pass treats it EXACTLY like a seal-less advisory: not
// re-proven, not broken, and — the load-bearing distinction — NOT `unverifiable`. `unverifiable` is reserved
// for a `seal:'proven'` fact whose witness is missing or incomplete (the trust-me-it-was-proved shape this
// chapter exists to catch); a `justified` fact has no witness BY CONSTRUCTION and carrying no witness is its
// CORRECT shape, never a defect. Counting it `unverifiable` would slander an honestly-sealed justified fact
// as a broken proven one. So the seal gate below admits ONLY `seal:'proven'` (`justified` and unsealed both
// fall out to `undefined`, uncounted) — the seal's proof-strength, not merely its presence, decides scope.
//
// ── WHY THIS TAKES `NodeFactPair[]`, NOT A STORE PATH ────────────────────────────────────────────────────
// `compose.ts` already builds the projection readback — `currentNodes(rehydrateProjection(store)).map(n =>
// ({ node: n, fact: store.get(n.contentHash) }))` — for the reconcile seams (`driftFacts` is that same
// readback's `.fact` projection). This module reuses exactly that pairing rather than re-reading the store a
// second time: ONE store read, ONE index build, shared by reconcile AND reverify (the sizing note's binding
// constraint — ~800ms to build the index once — is paid ONCE per `composeRuntime` call regardless of how
// many read doors ride it). `CurrentNode` rides alongside each fact because `reverifyFact`'s anchor binding
// (finding 1b, #199 fix-round) needs `node.primaryAnchor`, which `GroundedFact` itself never carries.
//
// PURE + TOTAL: no IO, no clock. `leg` is the ONLY effectful thing touched, and it is INJECTED — never a
// second oracle constructed here (a duplicated oracle that drifts from the shipped one is a known failure
// class in this repo, see `verify-fact-source.ts`'s header).

import type { CurrentNode, GroundedFact, PredicateSlot } from '@atlas/knowledge';
import { claimNormFromWitness } from '@atlas/genesis';
import { unitScopeOf } from './llm.js';
import type { VerifyFactLeg, VerifyReq } from './verify-fact-source.js';

// MIRRORS `packages/cli/src/mine-staging.ts` `MINED_TIER`. `adapter-io` cannot import `@atlas/cli` — `cli`
// depends on `adapter-io`, so the reverse would be a layer cycle (the ARCH constitution's `adapter-io` →
// `tools` direction, never the other way) — so this is a LITERAL MIRROR. It is not a duplicated SOURCE OF
// TRUTH so much as a duplicated CONSEQUENCE of one: every `seal:'proven'` fact is minted EXCLUSIVELY by the
// mine pipeline's sound-oracle arm (`buildSound`, `@atlas/genesis` `admit-harness.ts`), and every proposer
// that can reach that arm hardcodes `tier: 'T2'` (`mine-gate.ts`) — so "a `proven` fact's tier is the mined
// tier" is a structural invariant of the shipped mint path, true for EVERY store, not a tracked-store-only
// rule.
//
// STALENESS (#199 fix-round round 2): a mirror with no shared import can silently start enforcing a STALE
// tier if `MINED_TIER` is ever bumped without updating this copy. EXPORTED (not module-private) so
// `packages/cli/test/mined-tier-mirror-pin.test.ts` — which CAN import both `@atlas/cli`'s own
// `MINED_TIER` and this one, `cli` depending on `adapter-io` — pins byte-equality between them; that test
// fails LOUDLY the moment either literal changes without the other. `e2e-blackbox/test/stage.ts`'s former
// third copy is GONE — it now imports `MINED_TIER` from `@atlas/cli` directly (the same `MINED_SCOPE`
// discipline that file already used), so only TWO literals remain: the true source (`mine-staging.ts`) and
// this one unavoidable cross-layer mirror.
export const MINED_TIER = 'T2' as const;

/** The three re-verification outcomes — see the module header. Closed vocabulary. */
export type ReverifyOutcome = 're-proven' | 'broken' | 'unverifiable';

/** One sealed fact's re-verification row. `reason` carries the oracle's abstain/refute reason for `broken`,
 *  or a fixed diagnostic for `unverifiable` — always present so a reader never has to re-derive WHY. */
export interface ReverifyRow {
  readonly nodeKey: string;
  readonly outcome: ReverifyOutcome;
  readonly reason: string;
}

/** The whole pass's report. `sealedProven` is the denominator (every fact this pass even considered) —
 *  the three counts below always sum to it, and an EMPTY store (or one with no `proven` seals at all) is
 *  `sealedProven: 0`, distinguishable from a store this pass could not read (that is a separate FAILURE,
 *  not a `ReverifyReport` — see `reverifyStore`'s caller in `compose.ts`, which fails closed on an unreadable
 *  store rather than reporting an empty one). */
export interface ReverifyReport {
  readonly sealedProven: number;
  readonly reProven: number;
  readonly broken: number;
  readonly unverifiable: number;
  readonly rows: readonly ReverifyRow[];
}

/** The two witness slots the oracle family actually witnesses today (#195 `witnessOf`: a witness exists
 *  only when `p.target`/`p.scope` are both strings, which the admit path only sets for these two slots). A
 *  witness naming any OTHER slot is, BY CONSTRUCTION of the shipped mint path, unreachable — but this module
 *  does not trust that absence: an out-of-family slot fails closed to `unverifiable`, not a throw and not a
 *  silent `broken`. */
const WITNESSED_SLOTS: ReadonlySet<PredicateSlot> = new Set(['dependency', 'count', 'definition']);

/** Build the typed `VerifyReq` a witness replays as — the SAME shape `verifyFactVerdict` builds off CLI argv
 *  (`--scope` = `witness.scope`, `--world` defaults to `--scope`), so a re-verified claim is decided by
 *  EXACTLY the invocation `atlas verify-fact` would run if handed the witness back (as `s33-seal-witness`
 *  already demonstrates one row of, by hand, over the CLI). */
function reqOf(slot: 'dependency' | 'count' | 'definition', target: string, scope: string, atLeast: number | undefined): VerifyReq {
  if (slot === 'dependency') {
    return { kind: 'dependency', claim: { sourceScope: scope, target, worldScope: scope } };
  }
  // slot === 'definition' (196d) — the SAME shape the CLI leg builds (`verify-fact-source.ts`): a positive
  // witnessed existence, no `worldScope` and no `atLeast` (definition carries neither — it proves the def
  // occurrence lies UNDER `scope`, no cardinality, no closed-world).
  if (slot === 'definition') {
    return { kind: 'definition', claim: { sourceScope: scope, target } };
  }
  // slot === 'count' — `atLeast` is REQUIRED by the witness contract (#195 `witnessOf`, present only for the
  // count slot); absent here means the stored witness itself is malformed, not something this fold invents —
  // callers reach this branch only after `atLeast` has been checked present (see `reverifyFact`).
  return { kind: 'count', claim: { sourceScope: scope, target, worldScope: scope, atLeast: atLeast ?? 0, exact: false } };
}

/** `primaryAnchor` is the fact's OWN anchor (the tightest structural unit its grounding names,
 *  `primaryAnchorId`/KNOW-15d); `scope` is the verify-scope the witness was minted over (`witness.scope`,
 *  the directory the oracle actually ranged over when it proved the claim).
 *
 * TIGHTENED (#199 fix-round, security seat re-attack): a CONTAINMENT rule ("anchor is at or under scope")
 * is monotone in the WIDENING direction — any real reference under a narrow scope is trivially also under
 * every ancestor of it, so a committer was never forced to write the NARROW scope the mine pipeline
 * actually emits (proved live against the real production index: a fact re-anchored to `src/payments/deep/
 * nested/charge.ts` still bound against `witness.scope: 'src'`, an honestly-worded, oracle-backed T2 badge
 * planted at an arbitrary file by citing any true cross-package reference in a broad ancestor directory).
 *
 * The actual relation the mine pipeline PRODUCES — and the only one this check now ADMITS — is `scope IS
 * the anchor's own containing directory`, exactly `unitScopeOf` (`llm.ts`, the SAME function
 * `makeDependencyClaimParser` calls to derive `scope` from `cand.site.qualifiedPath` at mint time). REUSED
 * here, never reimplemented, so the read-side check cannot drift from the write-side relation it is
 * checking (this repo's recurring failure class — #186/N10 — one layer removed: a second COPY of a path
 * relation, not a second oracle). MEASURED against the 17 REAL `seal:'proven'` facts in the main repo's own
 * `.atlas/`: `unitScopeOf(primaryAnchor) === witness.scope` holds for all 17 (e.g. anchor
 * `packages/knowledge/src/write/router.ts`, scope `packages/knowledge/src/write` — the anchor's OWN parent
 * directory, never a grandparent, never a sibling). */
function anchorMatchesWitnessScope(primaryAnchor: string, scope: string): boolean {
  return unitScopeOf(primaryAnchor) === scope;
}

/** Whether the live SCIP index has a document at `path` — INJECTED (never a second index build here; see
 *  `reverifyFact`'s doc comment on binding (d) and `compose.ts`, which builds this from the SAME
 *  `scipOutput.documents` list `createVerifyFactLeg`'s own `pathByHash` already iterates). */
export type DocExists = (path: string) => boolean;

/** The FILE half of a `primaryAnchor` — anchors are either a bare file path or `file::item::block` (the
 *  sub-file structural-refinement chain `ast.ts`'s `::` join mints, KNOW-15d) — strip everything from the
 *  first `::` onward, exactly the split `unitScopeOf` (above) already performs on the same string, so the
 *  two functions can never disagree about which FILE an anchor names. */
function anchorFileOf(primaryAnchor: string): string {
  const at = primaryAnchor.indexOf('::');
  return at === -1 ? primaryAnchor : primaryAnchor.slice(0, at);
}

/** Re-verify ONE sealed fact against the live oracle. `node` is the fact's OWN `CurrentNode` row — the
 *  source of `primaryAnchor`, which `GroundedFact` itself does not carry (KNOW-15d: the anchor is a
 *  projection-row carrier, `projection-types.ts`, not part of the CAS-stored fact). `undefined` iff the
 *  fact is not `seal:'proven'` at all — an unsealed fact OR a `seal:'justified'` one, BOTH out of scope for
 *  this pass (a justified fact has no re-provable witness by design; see the module header's §justified).
 *
 * ── THE FOUR TAMPER BINDINGS (security seat findings, #199 fix-round, three rounds) ─────────────────────
 * A witness that replays PROVEN authenticates only a fact SHAPE — "this scope references this target" —
 * never THIS fact's tier, anchor, prose, or even that the anchor NAMES ANYTHING REAL, all four of which a
 * committer can otherwise choose freely and bolt onto an unrelated true edge (round 1, measured live: a T0
 * "no SQL injection" claim at `charge.ts`, riding a `greet()` reference witness, served `ok:true`; round 3,
 * measured live against the real production index: a witness-matching, correctly-derived, correctly-tiered
 * fact anchored at `…/TOTALLY-FAKE-FILE-DOES-NOT-EXIST.ts` — a file the SCIP index has never heard of —
 * still served `ok:true`, and a bare directory `'src/'` did too). These four checks close exactly that gap
 * and run BEFORE the (comparatively expensive) oracle replay — a tampered fact never needs the oracle to be
 * dropped:
 *   (a) TIER    — `fact.tier` must be the mined tier (see `MINED_TIER` above); a `proven` seal is minted
 *                 ONLY by the mine pipeline, so any other tier is a committer's own invention.
 *   (b) ANCHOR SCOPE — `unitScopeOf(node.primaryAnchor)` must EQUAL `w.scope` (`anchorMatchesWitnessScope`)
 *                 — the anchor's own containing directory, never a broader ancestor (round 2: containment
 *                 alone is widening-monotone and was found still open after round 1).
 *   (c) PROSE   — `fact.claimNorm` must be BYTE-EQUAL to `claimNormFromWitness(w)`, the same pure function
 *                 `admit-harness.ts` mints the sentence with (#197 CLAIM-DERIVED-FROM-WITNESS) — re-derived
 *                 HERE from the stored witness, never trusted from the stored sentence itself. Hand-written
 *                 prose cannot match; the correctly-derived sentence CAN, and that is fine — it says exactly
 *                 what the witness proves and nothing more.
 *   (d) ANCHOR EXISTS — `docExists(anchorFileOf(node.primaryAnchor))` must be `true` — the anchor's FILE
 *                 half must name a document the LIVE SCIP index actually contains (round 3: (b) alone
 *                 checks the RELATION between two strings, never that either one refers to something real —
 *                 a fabricated filename, or a bare directory with no filename at all, satisfied `unitScopeOf
 *                 = scope` trivially and was served). `docExists` is INJECTED, built from the SAME
 *                 `scipOutput.documents` the oracle's own `pathByHash` iterates (`verify-fact-source.ts`) —
 *                 no second index build, no new seam.
 * All four failures are reported as `broken` (the fact is not served, same bucket a drifted witness lands
 * in) with a `TAMPERED:` reason — DISTINCT wording from a drift `broken` ("did NOT re-prove"), so an
 * operator can tell "the code moved under this fact" from "this fact was altered after the oracle proved
 * something else". Dropped, never clamped: silently rewriting a tampered tier/anchor/prose back to the
 * derived value would hide that a tamper was attempted at all. */
export function reverifyFact(node: CurrentNode, fact: GroundedFact, leg: VerifyFactLeg, docExists: DocExists): ReverifyRow | undefined {
  // SEAL GATE — admit ONLY `seal:'proven'` into the re-proof. `seal:'justified'` (contestable derivation, no
  // mechanical witness) and unsealed facts BOTH return `undefined` here: out of scope, never counted in any
  // bucket — and crucially NEVER `unverifiable`, which is a `proven`-only diagnosis (see module header §justified).
  if (fact.seal !== 'proven') return undefined;
  const nodeKey = String(fact.id);
  // `witness` is carried ONLY on `AdvisoryNode` (#195 `buildSound` mints the sound-oracle arm as an
  // advisory, never a predicate/relation/negation — see `admit-harness.ts`), so a `proven`-sealed
  // predicate/relation/negation is STRUCTURALLY witness-less: `unverifiable`, not a type-narrowing dodge.
  const w = fact.kind === 'advisory' ? fact.witness : undefined;
  if (w === undefined) {
    return { nodeKey, outcome: 'unverifiable', reason: 'seal:proven but no witness was recorded — nothing to replay' };
  }
  if (typeof w.target !== 'string' || w.target.length === 0 || typeof w.scope !== 'string' || w.scope.length === 0) {
    return { nodeKey, outcome: 'unverifiable', reason: 'witness is incomplete (missing target/scope) — nothing to replay' };
  }
  if (!WITNESSED_SLOTS.has(w.slot)) {
    return { nodeKey, outcome: 'unverifiable', reason: `witness names slot '${w.slot}', outside the witnessed family (dependency|count|definition) — nothing to replay` };
  }
  if (w.slot === 'count' && typeof w.atLeast !== 'number') {
    return { nodeKey, outcome: 'unverifiable', reason: "witness slot 'count' carries no atLeast bound — nothing to replay" };
  }
  // ── TAMPER BINDINGS (a)/(b)/(c) — see the doc comment above. Checked BEFORE the oracle replay. ──────────
  if (fact.tier !== MINED_TIER) {
    return {
      nodeKey,
      outcome: 'broken',
      reason: `TAMPERED: tier '${String(fact.tier)}' is not the mined tier '${MINED_TIER}' — every seal:'proven' fact is minted by the mine pipeline, so a different tier was chosen by whoever committed it, not proven by anything`,
    };
  }
  const anchor = node.primaryAnchor;
  if (typeof anchor !== 'string' || anchor.length === 0 || !anchorMatchesWitnessScope(anchor, w.scope)) {
    return {
      nodeKey,
      outcome: 'broken',
      reason: `TAMPERED: primary anchor '${anchor ?? '(none)'}' does not sit directly under the witness's own scope '${w.scope}' (unitScopeOf(anchor) must equal scope, never a broader ancestor) — the fact is not about what its witness proves`,
    };
  }
  if (!docExists(anchorFileOf(anchor))) {
    return {
      nodeKey,
      outcome: 'broken',
      reason: `TAMPERED: primary anchor '${anchor}' does not name a document the live SCIP index actually contains — the anchor is fabricated or a bare directory, not a real file the witness's edge is about`,
    };
  }
  const expectedClaim = claimNormFromWitness(w);
  if (fact.kind !== 'advisory' || fact.claimNorm !== expectedClaim) {
    return {
      nodeKey,
      outcome: 'broken',
      reason: `TAMPERED: claim text does not match the sentence DERIVED from the witness ('${expectedClaim}') — hand-written prose over a witness that proves something narrower`,
    };
  }
  const verdict = leg(reqOf(w.slot as 'dependency' | 'count' | 'definition', w.target, w.scope, w.atLeast));
  if (verdict.verdict === 'proven') {
    return { nodeKey, outcome: 're-proven', reason: `replayed PROVEN over (${w.slot}, ${w.target}, ${w.scope})` };
  }
  return {
    nodeKey,
    outcome: 'broken',
    reason: `replay did NOT re-prove — oracle returned '${verdict.verdict}'${verdict.reason !== undefined ? ` (${verdict.reason})` : ''}`,
  };
}

/** One projection row paired with the `GroundedFact` its `contentHash` resolves to — the shape
 *  `reverifyFact` needs (`node.primaryAnchor` for the anchor binding) and the shape every caller already
 *  has lying around from `currentNodes(rehydrateProjection(store)).map(n => ({ node: n, fact: store.get(n.contentHash) }))`. */
export interface NodeFactPair {
  readonly node: CurrentNode;
  readonly fact: GroundedFact;
}

/**
 * Re-verify EVERY `proven`-sealed fact in `pairs` against `leg` — build the index ONCE (the caller's job,
 * `compose.ts`), loop, count three buckets. Anti-overengineering by construction: no cache, no worker pool, no
 * config. `pairs` is the FULL durable-store readback (`driftFacts`-shaped, now carrying each fact's own
 * `CurrentNode` alongside it) — reading the STORE, never a command's own summary, per the chapter's honesty
 * requirement.
 */
export function reverifyStore(pairs: readonly NodeFactPair[], leg: VerifyFactLeg, docExists: DocExists): ReverifyReport {
  const rows: ReverifyRow[] = [];
  for (const { node, fact } of pairs) {
    const row = reverifyFact(node, fact, leg, docExists);
    if (row !== undefined) rows.push(row);
  }
  return {
    sealedProven: rows.length,
    reProven: rows.filter((r) => r.outcome === 're-proven').length,
    broken: rows.filter((r) => r.outcome === 'broken').length,
    unverifiable: rows.filter((r) => r.outcome === 'unverifiable').length,
    rows,
  };
}
