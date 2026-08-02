// @atlas/knowledge — src/ratify.ts  (WP-5.15.KNOW · EPIC-15)
//
// The staging / ratifier gate (KNOW-8). Propose ≠ ratify: the explorer MAY write only CANDIDATES
// (staging); ratification is the reconcile/lead's. The explorer never self-commits; a `T0` candidate
// requires billy. Binds the FROZEN, PINNED `RatifyApi` (co-located below): `stage(candidate): Staged` and
// `ratify(staged, token): { committed: boolean }`, over the minimal `Staged`/`RatifyToken` records.
//
// ── WHAT KNOW-8 ACTUALLY ENFORCES TODAY (A-D4, MEASURED — read this before the paragraph above) ───────────
// KNOW-8's measurable is "0 explorer writes reach the store except via a ratifier". IT HOLDS. IT HOLDS
// VACUOUSLY, and the difference matters because the sentence above describes a propose→ratify FLOW that is
// NOT WIRED.
//
// Measured in task #83 by probe (`process.stderr.write` + stack attribution at each function, rebuilt, driven
// through the whole suite including the real CLI subprocesses):
//   · the explorer (`atlas mine`) writes candidates DURABLY, to its own sidecar, via `DiskStore.commitStaging`
//     — 80 hits, all from `cli/src/mine.ts`. That half of KNOW-8 is real and built.
//   · NOTHING READS STAGING BACK. `loadStaging` had zero production callers (it has since been deleted), and
//     there is no `promote` command in the CLI's `COMMANDS`. There is no path from staging into the governed
//     projection, ratified or otherwise.
//   · `stage()` (below) is not on the explorer's path at all — its only production callers are the two
//     governed write doors in `adapter-io`.
//
// So what stops an explorer write from reaching governed knowledge today is SEVERANCE, NOT RATIFICATION. The
// ratifier is not the gate on that path; the ABSENCE of a path is. `cli/src/mine.ts` says it in its own
// words: "mining cannot mutate governed knowledge because it cannot REACH it, not because a check says no."
//
// This is a statement of the CURRENT STATE, not a retirement of the design. Propose→ratify remains the
// intended shape; the governed PROMOTION door (staging → projection through the ratifier, reusing the
// existing gate ladder, plus a staging read leg) is simply not built yet and is tracked as its own task.
// Recorded here rather than left implicit because a reader who takes the paragraph above at face value will
// build on a review workflow that does not exist.
//
// FACET BOUNDARY (BIND — resolved vs the frozen RatifyApi, co-located below):
//  • [PINNED — oracle-pin-map §8] the gate types (`Staged{node}`, `RatifyToken{by}`) are frozen; this
//    facet supplies ONLY the routing method-tags-knw:70-72 freezes: `candidate → staging → ratifier`,
//    the explorer writes only to staging, no staged candidate commits without a ratifier token, and a
//    `T0` candidate requires the billy token. The single-`by` token models "requires billy" as a token
//    whose ratifier IS billy (the frozen signature carries one token — the honest binding).
//
// POSTURE — READ THIS BEFORE READING "TOKEN" AS AUTHENTICATION (ADR-0010). Everything below is a STRING
// COMPARISON. `RatifyToken.by` arrives from `process.env.ATLAS_RATIFY_TOKEN` (`adapter-io/compose.ts`)
// with no verification of any kind, so "the explorer never self-commits" is true only of an explorer that
// does not set an environment variable: ANY non-empty string commits a `T1` (which is INSIDE the read
// bound), and the literal `'billy'` commits a `T0`. This gate is an ANTI-ACCIDENT guardrail — the same
// posture ARCH-12/§3.3 already records for `actor` — not an adversarial control. It is written here
// because a reader who takes it for authentication will build on a guarantee that does not exist.

import type { Candidate } from '../types.js';

// ── frozen RatifyApi surface, co-located here (was ref/ratify.ts) ─────────────────────────────────────

/**
 * The staged-handle a candidate becomes on the explorer's write path (KNOW-8). [PINNED —
 * oracle-pin-map §8] minimal honest record: the node held in staging, un-committed until ratified.
 */
export interface Staged {
  readonly node: Candidate;
}

/**
 * The ratifier record a commit carries (method-tags-knw:70-72). [PINNED — oracle-pin-map §8] minimal honest
 * record: `by` NAMES the ratifier (human for T0 / contested / predicate).
 *
 * IT NAMES, IT DOES NOT PROVE. `by` is an unauthenticated, caller-supplied string — see {@link BILLY}. The
 * type is called a "token" for continuity with the frozen reference; read it as an ADVISORY MARKER, i.e. a
 * declaration of who is taking responsibility, not evidence that they did.
 */
export interface RatifyToken {
  readonly by: string;
}

export interface RatifyApi {
  /** Wrap a candidate in the `Staged` handle the ratifier gate consumes. Pure + total.
   *
   *  IT IS NOT "THE EXPLORER'S ONLY WRITE PATH", WHICH IS WHAT THIS DOCSTRING USED TO SAY (A-D4, measured in
   *  task #83). Two things are wrong with that sentence and both were measured by probe, not read off the
   *  code: (1) this function persists NOTHING — it returns `{ node }`; (2) its only PRODUCTION callers are
   *  `adapter-io`'s two governed write doors (`governed-emit.ts`, `governed-link.ts`), i.e. the LEAD's doors.
   *  The explorer (`atlas mine`) never calls it. Its real durable path is `DiskStore.commitStaging`.
   *  What this actually is: the in-memory adapter that hands a candidate to {@link RatifyApi.ratify}. */
  stage(candidate: Candidate): Staged;

  /** The reconcile/lead ratifier gate: a staged candidate commits ONLY with a ratifier token; a `T0`
   *  candidate additionally requires the billy token (method-tags-knw:71). Pure + total. The `committed`
   *  boolean is the reference-implied return leg (no self-commit assertion). */
  ratify(staged: Staged, token: RatifyToken): { readonly committed: boolean };
}

/**
 * The NAME a `T0` commit's ratifier must give (method-tags-knw:71).
 *
 * A NAME, NOT A CREDENTIAL — stated here because the surrounding vocabulary ("token", "security gate",
 * "requires billy") reads like authentication and is not. `RatifyToken.by` is compared to this string and
 * nothing else happens: no signature is verified, no key is consulted, no identity is established. The value
 * reaches this function from `process.env.ATLAS_RATIFY_TOKEN` (`adapter-io/compose.ts`), which anyone able
 * to invoke the CLI can set to any string including this one. So the `T0` gate is satisfied by
 * `ATLAS_RATIFY_TOKEN=billy`, and every gate below `T0` is satisfied by ANY non-empty string at all.
 *
 * WHY IT IS STILL WORTH HAVING, and why it is not being dressed up as more: it is an ANTI-ACCIDENT
 * guardrail, exactly the posture ARCH-12/§3.3 already records for `actor` (`ATLAS_ACTOR` ?? git email —
 * equally caller-settable). It stops an agent from silently self-committing a critical fact as a side
 * effect of ordinary work, because committing one now requires a deliberate, visible, auditable act by
 * whoever runs the process. It stops nothing at all done deliberately by that person. Making it a real
 * credential needs a verifier and a key-distribution story this product does not have — see ADR-0010, where
 * that is an OPEN owner decision, not a silent gap.
 */
export const BILLY = 'billy';

/**
 * Wrap a candidate in the `Staged` handle {@link ratify} consumes. Pure + total — it persists NOTHING.
 *
 * See {@link RatifyApi.stage} for why the previous description ("the explorer's ONLY write path … held in
 * staging, un-committed until the reconcile/lead ratifies") was false on every clause: nothing is held, there
 * is no staging here, and the explorer does not call this. A-D4 / task #83.
 */
export function stage(candidate: Candidate): Staged {
  return { node: candidate };
}

/**
 * The reconcile/lead ratifier gate (KNOW-8): a staged candidate commits ONLY when a ratifier is NAMED; a
 * `T0` candidate additionally requires that the name be {@link BILLY}. Pure + total.
 *  - no ratifier named (empty `by`)  ⇒ not committed (the propose/ratify separation holds);
 *  - a `T0` staged node whose ratifier is not `billy` ⇒ refused;
 *  - otherwise ⇒ committed.
 *
 * WHAT A `committed: true` MEANS, EXACTLY. That a ratifier was NAMED and — for `T0` — that the name matched.
 * It does NOT mean anyone was authenticated: both branches below are string comparisons against a value the
 * caller supplies (`ATLAS_RATIFY_TOKEN`), so ANY non-empty string commits a `T1`, and `'billy'` commits a
 * `T0`. `T1` is INSIDE the read bound (`atlas-query` bounds only `T2` out, TOOLS-6), so a self-named
 * ratifier is enough to put a SERVED invariant into the pack. That is a real, currently-open exposure and it
 * is written here rather than left to be inferred: ADR-0010 records it, ARCH-12 records the same posture for
 * `actor`, and closing it is an owner decision about verification, not an implementation detail.
 *
 * ARCH-9 NOTE — the tier this gate reads is the STAGED CANDIDATE'S OWN `tier`, an author-supplied field, so
 * on a CREATE the author chooses which of these two branches applies to them. The route INTO this gate is
 * where that is corrected (`fastpath.route`'s `derivedTier`); the gate itself is downstream of the choice
 * and cannot re-derive it.
 */
export function ratify(staged: Staged, token: RatifyToken): { readonly committed: boolean } {
  if (token.by.length === 0) return { committed: false }; // no ratifier token
  if (staged.node.tier === 'T0' && token.by !== BILLY) return { committed: false }; // T0 requires billy
  return { committed: true };
}

/** The frozen-`RatifyApi` binding (conformance handle). */
export const ratifier: RatifyApi = { stage, ratify };
