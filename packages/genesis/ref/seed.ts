// @atlas/genesis — ref/seed.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// GEN-9 — seed the self-model (Awareness sources, method-tags-gen:72-77). Transcribed from atlas-genesis
// §S4 "Seed the self-model" (lines 101-105) + GEN-9 (lines 134-136) + acceptance 9. A fresh brownfield
// move-in has no DEFINE artifact, zero invariants (KNOW-6), an un-ratified T0 — so @atlas/memory Awareness
// (MEM-11) would be BLANK exactly when a worker needs it. Genesis MUST seed the sources each facet rolls
// up from: a `DEFINE` stub `mission` at S0 (marked UNRATIFIED), `constitution` from the ratified T0
// manifest the S3 interview produces, `taste` at `CONVENTIONS.md@sha`. A facet with NO source renders the
// labeled `UN-SEEDED` sentinel — NEVER fabricated (MEM-11). The `mission` stub STAYS unratified until a
// real DEFINE artifact is ratified.

import type { StructRef } from '@atlas/contracts';
import type { Awareness, AwarenessFacet } from '@atlas/memory';
import type { Ratified } from './types.js';
import type { Skeleton } from './scan.js';

/**
 * The `DEFINE` stub `mission` (GEN-9). On a brownfield move-in with no ratified DEFINE artifact, genesis
 * assembles an UNRATIFIED thesis stub so Awareness's `mission` facet is not blank. It MUST stay
 * `unratified: true` until a real DEFINE artifact is ratified. GENESIS-HOME.
 *
 * [SIG-TBD — `content` render] the stub thesis line's exact byte-stable render is a WP concern (mirrors
 * @atlas/memory `AwarenessFacet.content: string`) — transcribed as `string`, NOT invented.
 */
export interface MissionStub {
  readonly content: string; // [SIG-TBD] the DEFINE stub thesis line — exact render not frozen
  readonly grounding: readonly StructRef[]; // the node@sha the stub anchors to (grounded, GEN-4)
  readonly unratified: true; // MUST stay unratified until a real DEFINE artifact exists (GEN-9)
}

export interface SeedApi {
  /** GEN-9 seed the Awareness sources. Assembles the @atlas/memory `Awareness` slab from the seeded
   *  skeleton + the S3-ratified facts: `mission` = the unratified DEFINE stub; `constitution` = the
   *  ratified `T0` manifest; `taste` = `CONVENTIONS.md@sha`. A source-less facet → `UN-SEEDED` (never
   *  fabricated, MEM-11). Reuses the MEM-11 reference; adds no new subsystem. */
  seed(skeleton: Skeleton, ratified: readonly Ratified[]): Awareness;

  /** The S0 `DEFINE` stub `mission` on a fresh brownfield move-in (GEN-9) — marked UNRATIFIED. */
  mission(skeleton: Skeleton): MissionStub;

  /** One facet's seed from its OWN source — absent source ⇒ the `UN-SEEDED` sentinel (never fabricated,
   *  MEM-11). Mirrors @atlas/memory `AwarenessApi.facet`.
   *
   *  [SIG-TBD — `source` type] each facet's source differs (DEFINE artifact / T0 manifest /
   *  `CONVENTIONS.md@sha`) with no single frozen type — transcribed as `unknown`, NOT invented. Flagged. */
  facet(source: unknown): AwarenessFacet;
}
