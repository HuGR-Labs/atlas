// @atlas/genesis — src/extract.ts  (WP-8.28-a.GEN · GEN-2 / GEN-4 / GEN-6 — the S2 proposal driver)
//
// The BUDGETED, RANKED-SITE S2 driver: the LLM fires only on ranked sites, HIGHEST-PPR-FIRST, ONE bounded
// call per site, under a HARD budget ceiling (default `min(frontier_size, 200)`, GEN-2), halting at the
// marginal-value floor (trailing-20 admit-rate `< 20%`). Every candidate is routed through the 2-door bar
// at atlas-emit (grounding re-derives ∧ non-obvious, GEN-4); admission is the gate's MECHANICAL verdict —
// a seed's self-declaration is NEVER consulted (GEN-4d). Mined signals stay ranking heuristics: the fact
// set is built SOLELY from gate-admitted facts, never minted from a candidate's `signals` (GEN-6).
//
// SCOPE (card exclusions): this driver does NOT compute the ranking (consumed from the PPR frontier), does
// NOT define the 2-door gate or the admission/teeth engine, does NOT set escalation defaults — it CALLS
// them through the injected `ExtractDeps` seams (the `SiteProposer` bounded call + the `EmitGate` 2-door
// bar). SEAM: no hashing/identity is performed here (grounded facts arrive from the gate); imports are
// types-only. Digest `<filled-at-freeze>` on the interface_contract is SIMULATED (resolved by disciplined
// judgment, not a real freeze hash) — FLAGGED.

import type { Candidate, Fact, WhyNot } from '../ref/types.js';
import type { GenesisBudget } from '../ref/budget.js';
import type { ExtractApi, ExtractResult } from '../ref/extract.js';

// ── GEN-2 marginal-value stop — the FIXED scheduler policy (atlas-genesis:117, ref/budget.ts) ──────────
// Transcribed from the frozen `MarginalValueStop` literal type: a trailing window of the last 20 ranked
// sites; HALT once that window admits fewer than 4 (a `< 20%` admit-rate). Applied by the scheduler here,
// never carried on `GenesisBudget`.
export const MARGINAL_WINDOW = 20 as const;
export const MARGINAL_MIN_ADMITS = 4 as const;

/**
 * The hard budget ceiling default (GEN-2): `min(frontier_size, 200)` sites/run. A bare numeric `--budget N`
 * overrides it via `GenesisBudget.ceiling`; the driver enforces whatever ceiling it is handed. Named here
 * so the GEN-2 formula lives with the enforcement it governs.
 */
export function defaultCeiling(frontierSize: number): number {
  return Math.min(frontierSize, 200);
}

/**
 * A proposed seed from ONE bounded S2 call (GEN-12: the model only PROPOSES; admission is mechanical and
 * lives at the gate). Opaque to the driver — it is routed straight to `EmitGate.emit`. A model MAY attach
 * a self-declaration (`selfAsserted` / `confidence`); the driver NEVER reads it (GEN-4d) — admission is the
 * gate's verdict alone.
 */
export interface SeedProposal {
  readonly cand: Candidate;
  readonly claim: string;
  readonly selfAsserted?: boolean; // IGNORED by the driver (GEN-4d) — never promotes a seed
  readonly confidence?: number; //    IGNORED by the driver (GEN-4d) — never promotes a seed
}

/**
 * The single bounded LLM call per site (GEN-2). CALLED, never defined here (the proposer/admission engine
 * is EPIC-28-b). Returns the proposed seed, or `null` when the model abstains at the site (abstention is a
 * valid, unpressured outcome — GEN-12). The driver invokes this EXACTLY ONCE per visited site.
 */
export interface SiteProposer {
  propose(cand: Candidate): SeedProposal | null;
}

/** The gate's mechanical verdict: an admitted grounded `Fact`, or a grounded `WhyNot` abstention. */
export type EmitVerdict =
  | { readonly emitted: true; readonly fact: Fact }
  | { readonly emitted: false; readonly whyNot: WhyNot };

/**
 * The 2-door bar at atlas-emit (truth: grounding re-derives FRESH by subtreeHash; usefulness: non-obvious
 * ∧ actionable) — CALLED, never defined here (CAMPAIGN-4). Admission depends ONLY on this verdict; the
 * seed's own self-declaration is never an input (GEN-4d). An un-admitted seed yields a grounded `WhyNot`.
 */
export interface EmitGate {
  emit(seed: SeedProposal, cand: Candidate): EmitVerdict;
}

/** The injected S2 seams the driver calls (GEN-2/4). Nothing here is authored by this WP — it orchestrates. */
export interface ExtractDeps {
  readonly proposer: SiteProposer;
  readonly gate: EmitGate;
}

/** Highest-PPR-first order (GEN-2). Deterministic: PPR descending, ties broken by the stable `rank` (GEN-11). */
function byPprDescending(a: Candidate, b: Candidate): number {
  if (b.ppr !== a.ppr) return b.ppr - a.ppr;
  return a.rank - b.rank;
}

/** Count of admits within the trailing window (GEN-2 marginal-value stop). */
function admitsIn(window: readonly boolean[]): number {
  let n = 0;
  for (const admitted of window) if (admitted) n += 1;
  return n;
}

/**
 * The S2 proposal driver (GEN-2/4/6). Consumes the RANKED frontier and:
 *   • visits highest-PPR-first, ONE bounded call per site (GEN-2b/2c) — never an un-ranked site, no
 *     repo-wide sweep (GEN-2a/2f: the driver only ever iterates the frontier it is handed);
 *   • enforces the HARD ceiling `budget.ceiling` (GEN-2d) and HALTS at the marginal-value floor once the
 *     trailing-20 window admits `< 4` (GEN-2e);
 *   • routes every seed through the 2-door bar (GEN-4) — a fact enters the set ONLY on `emitted:true`,
 *     carrying the gate's grounded (subtreeHash) record; a self-declaration never promotes a seed (GEN-4d);
 *   • mints NO fact from `candidate.signals` — the fact set is built solely from gate verdicts (GEN-6).
 * Total: never throws on the driver path.
 */
export function runExtract(
  cands: readonly Candidate[],
  budget: GenesisBudget,
  deps: ExtractDeps,
): ExtractResult {
  const ranked = [...cands].sort(byPprDescending); // highest-PPR-first (GEN-2b), deterministic
  const facts: Fact[] = [];
  const abstained: WhyNot[] = [];
  const window: boolean[] = []; // trailing admit-outcomes (GEN-2 marginal-value stop)
  let visited = 0; // one bounded call per visited site — the GEN-2 spend counter

  for (const cand of ranked) {
    // GEN-2d hard ceiling: no call past the budget.
    if (visited >= budget.ceiling) break;
    // GEN-2e marginal-value halt: once the trailing-20 window admits `< 4`, stop — do NOT drain the budget.
    if (window.length >= MARGINAL_WINDOW && admitsIn(window) < MARGINAL_MIN_ADMITS) break;

    // GEN-2c: EXACTLY ONE bounded call per site (no self-consistency, no re-call).
    const seed = deps.proposer.propose(cand);
    visited += 1;

    let admitted = false;
    if (seed === null) {
      // GEN-12: abstention is first-class — a site that yields no proposal yields a grounded WhyNot.
      abstained.push({ site: cand.site, reason: 'model abstained: no non-obvious grounded fact at site' });
    } else {
      // GEN-4: admission is the mechanical 2-door verdict alone (self-declaration on `seed` is NOT read).
      const verdict = deps.gate.emit(seed, cand);
      if (verdict.emitted) {
        facts.push(verdict.fact); // GEN-6: the fact comes from the gate, never from cand.signals
        admitted = true;
      } else {
        abstained.push(verdict.whyNot);
      }
    }

    window.push(admitted);
    if (window.length > MARGINAL_WINDOW) window.shift(); // keep only the trailing 20
  }

  return { facts, abstained };
}

/**
 * Bind the driver to the frozen `ExtractApi` (ref/extract.ts) — `extract(cands, budget)` with the injected
 * S2 seams captured in the closure. The signature is EXACTLY the frozen surface; the seams are the "it
 * calls them" ports (card exclusions), never a change to the contract.
 */
export function makeExtract(deps: ExtractDeps): ExtractApi {
  return {
    extract: (cands: readonly Candidate[], budget: GenesisBudget): ExtractResult =>
      runExtract(cands, budget, deps),
  };
}

// differential-vs-oracle (compile-time): `makeExtract` conforms to the frozen ExtractApi surface.
const _extract: (deps: ExtractDeps) => ExtractApi = makeExtract;
void _extract;
