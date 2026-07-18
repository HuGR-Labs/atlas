// @atlas/tools — ref/doctor.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// `atlas doctor` — the READ-ONLY + advisory diagnostic surface (TOOLS-12). The human-facing
// inspect/repair/GC view for a store where nothing dies and the archive grows monotone: archive browse,
// drift-explain / `why-broken <fact>`, hot-set size vs budget, and a GUIDED re-ground/retire flow. It
// PERSISTS NOTHING (0 direct store mutation); any write it proposes is a `RegroundPlan` that funnels
// through `atlas-emit` (the single write door). It carries NO write authority and is NOT a fifth
// governance tool — the write surface stays EXACTLY FOUR (TOOLS-1), like the per-node read projections
// (TOOLS-10). This facet exposes NO write-returning method. Transcribed from atlas-tools:67-72, 135-139,
// 151-153 + method-tags-tls:103-108.

import type { DoctorOut } from './types.js';

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
