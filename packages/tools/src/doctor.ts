// @atlas/tools — src/doctor.ts   (WP-7.26-b.TOOLS — TOOLS-12, INV-TOOLS-12; guidance INV-TOOLS-4)
//
// `atlas doctor` — the read-only + advisory diagnostic surface + the frozen `DoctorApi`: archive browse,
// drift-explain, hot-set-vs-budget, and a GUIDED re-ground/retire plan. Built over a read-only port, it
// PERSISTS NOTHING — any proposed write is a `RegroundPlan` funnelled through `atlas-emit` (not a 5th tool).

import type { GroundedFact } from '@atlas/knowledge';
import type { DoctorOut, DriftItem, Guidance, Hash, RegroundPlan } from './types.js';

export interface DoctorApi {
  /** Browse the monotone archive / supersede lineage for a scope (atlas-tools:136). Read-only. */
  archive(scope?: string): DoctorOut;

  /** Drift-explain: which anchor drifted, mechanical vs semantic (atlas-tools:137). Read-only. */
  whyBroken(fact: string): DoctorOut;

  /** Hot-set size vs budget; flags an over-budget hot-set (advisory, atlas-tools:138). Read-only. */
  hotSet(budget: number): DoctorOut;

  /** Guided re-ground/retire — returns a `RegroundPlan` (on `DoctorOut.plan`) and PERSISTS NOTHING; the
   *  store changes only when that plan is run through `atlas-emit` (TOOLS-12, atlas-tools:139). Read-only:
   *  a write attempted directly via `doctor` is rejected (method-tags-tls:107). */
  reground(fact: string): DoctorOut;
}

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
 *  Diagnosis is read-only: the follow-up for any proposed write is ALWAYS the governed `atlas-emit` write door. */
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

// differential-vs-oracle (compile-time): the impl conforms to the co-located frozen `DoctorApi` —
// a read/advisory projection with NO write-returning method (the write surface is the two governed doors atlas-emit + atlas-link, TOOLS-1).
const _doctorConforms: DoctorApi = createDoctor({
  lineage: () => [],
  drift: () => undefined,
  hotSetSize: () => 0,
  plan: () => undefined,
});
void _doctorConforms;
