// @atlas/tools — src/doctor.ts   (WP-7.26-b.TOOLS — TOOLS-12, INV-TOOLS-12; guidance INV-TOOLS-4)
//
// `atlas doctor` — the READ-ONLY + ADVISORY diagnostic surface. The human-facing inspect/repair/GC view for
// a store where nothing dies and the archive grows monotone: archive browse, drift-explain / `why-broken`,
// hot-set size vs budget, and a GUIDED re-ground/retire flow. It PERSISTS NOTHING (0 direct store mutation)
// and carries NO write authority: it is built over a READ-ONLY diagnostic port and exposes NO
// store-mutating method — so it is structurally incapable of writing. Any write it proposes is a
// `RegroundPlan` that funnels through `atlas-emit` (the single write door, TOOLS-1) — doctor only PROPOSES
// the templated candidate, never persists it. It is NOT a fifth governance tool: the write surface stays
// EXACTLY FOUR (TOOLS-1), like the per-node read projections (TOOLS-10) and `atlas-diff` (TOOLS-16).
// Transcribed against the frozen oracle `../ref/doctor.ts` (`DoctorApi`) + `../ref/types.ts` (`DoctorOut` /
// `RegroundPlan` / `HotSet` / `DriftItem`).
//
// SCOPE (this facet): the read/advisory projection — the four read legs + the guided plan proposal + the
// no-write-authority shape + the shipped guidance envelope. EXCLUDED — actually PERSISTING a re-ground (that
// is `atlas-emit`, the sealed write door, NEVER doctor); the drift mechanical/semantic classifier itself
// (the @atlas-knowledge KNOW-5 split, referenced not redefined); identity/hashing (sealed @atlas/kernel).

import type { GroundedFact } from '@atlas/knowledge';
import type { DoctorApi } from '../ref/doctor.js';
import type { DoctorOut, DriftItem, Guidance, Hash, RegroundPlan } from '../ref/types.js';

/**
 * The READ-ONLY diagnostic port doctor is built over. EVERY leg reads; NONE writes. Doctor holds no store
 * handle beyond this port and this port surfaces no mutation — so doctor is structurally incapable of
 * persisting. Tools CONSUMES this port; the store/index own the concrete reads — NOT defined here.
 */
export interface DoctorSource {
  /** The monotone supersede-lineage for a scope — the ordered CAS chain (atlas-tools:136). Read-only. */
  lineage(scope?: string): readonly Hash[];
  /** Drift-explain for a fact: which anchor drifted, mechanical vs semantic (KNOW-5). Read-only. */
  drift(fact: string): DriftItem | undefined;
  /** The current hot-set size (node count) — the advisory budget check reads this. Read-only. */
  hotSetSize(): number;
  /** The templated re-ground/retire candidate for a fact — the payload the plan funnels through
   *  `atlas-emit`. Read-only: producing the template PERSISTS NOTHING. */
  plan(fact: string): { readonly action: 'reground' | 'retire'; readonly emit: GroundedFact } | undefined;
}

/** The `next + invariant` guidance the doctor surface ships on its advisory result envelope (INV-TOOLS-4).
 *  Diagnosis is read-only: the follow-up for any proposed write is ALWAYS the single write door. */
export const DOCTOR_GUIDANCE: Guidance = {
  next: 'doctor is read-only — run any proposed RegroundPlan through atlas-emit to persist it',
  invariant: 'TOOLS-12: read/advisory-only diagnosis, persists nothing, carries no write authority',
};

/**
 * Build `atlas doctor` over an injected READ-ONLY diagnostic source. The returned object conforms EXACTLY to
 * the frozen `DoctorApi` — four read legs, each returning a `DoctorOut`, and NO store-mutating method. Pure
 * + total and read-only: no clock, no IO, no write, no throw. `reground` returns a `RegroundPlan` (a
 * proposal); the store changes only when that plan is later run through `atlas-emit` — doctor persists
 * nothing itself.
 */
export function createDoctor(source: DoctorSource): DoctorApi {
  const archive = (scope?: string): DoctorOut => ({ archive: source.lineage(scope) });

  const whyBroken = (fact: string): DoctorOut => {
    const d = source.drift(fact);
    return d ? { whyBroken: d } : {};
  };

  const hotSet = (budget: number): DoctorOut => {
    const size = source.hotSetSize();
    return { hotSet: { size, budget, over: size > budget } }; // advisory over-budget flag
  };

  const reground = (fact: string): DoctorOut => {
    const candidate = source.plan(fact);
    if (candidate === undefined) return {};
    // a PROPOSAL only — persists nothing; the store mutates solely when this runs through atlas-emit.
    const plan: RegroundPlan = { fact, action: candidate.action, emit: candidate.emit };
    return { plan };
  };

  return { archive, whyBroken, hotSet, reground };
}

// differential-vs-oracle (compile-time): the impl conforms to the frozen `DoctorApi` (../ref/doctor.ts) —
// a read/advisory projection with NO write-returning method (the write surface stays exactly four, TOOLS-1).
const _doctorConforms: DoctorApi = createDoctor({
  lineage: () => [],
  drift: () => undefined,
  hotSetSize: () => 0,
  plan: () => undefined,
});
void _doctorConforms;
