// @atlas/memory — ref/awareness.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Awareness — the project's standing self-model (MEM-11). The first injected slab: a DERIVED ROLLUP of
// the Atlas root, NOT a hand-written blob. Five facets — mission / constitution / terrain / ontology /
// taste — each GROUNDED (`node@sha`) + drift-checked, carrying only the TOP tier under `≤ ~400 tok`,
// BYTE-IDENTICAL across all members (never hand-written, so it can't rot). A facet whose source is ABSENT
// (fresh brownfield move-in, pre-genesis-seed GEN-9) renders a labeled `UN-SEEDED` sentinel — NEVER a
// fabricated line; a generic language/stack card never stands in. Tag PBT-by-shape (determinism /
// byte-identical derivation). Transcribed from method-tags-mem:91-96 (INV-MEM-11 down-model) +
// atlas-memory:38-48, 125.

import type { Node } from '@atlas/kernel';
import type { StructRef } from '@atlas/contracts';

/**
 * A facet's derivation state (MEM-11). `seeded` = derived from a present, drift-clean source; `UN-SEEDED`
 * = source absent → the labeled sentinel (never fabricated); `drifted` = source moved → the facet is
 * SERVE-FLAGGED (flagged, not served stale).
 */
export type FacetState = 'seeded' | 'UN-SEEDED' | 'drifted';

/**
 * One Awareness facet — a top-tier rollup grounded to its Atlas source(s) (MEM-11).
 *
 * [PINNED — rendered `content` format not frozen] transcribed as `string` (the top-tier derived line
 * under cap); the exact byte-stable render is a WP concern, NOT invented.
 * `grounding` is the `node@sha` anchor set the facet rolls up from — transcribed as the frozen
 * `StructRef` grounding anchor (`path@subtreeHash`, the drift oracle).
 */
export interface AwarenessFacet {
  readonly content: string; // [PINNED] top-tier rendered rollup under ~400 tok — exact format not frozen
  readonly grounding: readonly StructRef[]; // the node@sha anchors — grounded + drift-checked
  readonly state: FacetState; // seeded / UN-SEEDED sentinel / drift flag
}

/**
 * The Awareness slab (atlas-memory:39-45). Five facets, byte-identical across members, `≤ ~400 tok`.
 *   - `mission`      — the enduring thesis. Source: ratified DEFINE artifact (GEN-9).
 *   - `constitution` — the non-negotiable laws. Source: highest-tier invariant set (T0 manifest).
 *   - `terrain`      — the territory map + owners + which are T0. Source: territory-axis top rollup.
 *   - `ontology`     — the core vocabulary. Source: `slot='definition'` nodes curated by walt (DEFINE).
 *   - `taste`        — what "good"/"rejected" looks like here. Source: `CONVENTIONS.md@sha` + gate config.
 */
export interface Awareness {
  readonly mission: AwarenessFacet;
  readonly constitution: AwarenessFacet;
  readonly terrain: AwarenessFacet;
  readonly ontology: AwarenessFacet;
  readonly taste: AwarenessFacet;
}

export interface AwarenessApi {
  /** Assemble Awareness as a PURE rollup of the Atlas root — deterministic (same root ⇒ byte-identical
   *  across seats and re-runs), top-tier under `≤ ~400 tok`, tail pull-reachable (MEM-11).
   *  (method-tags-mem:95) */
  rollup(root: Node): Awareness;

  /** A single facet's rollup from ITS OWN source — absent source ⇒ `UN-SEEDED`, moved source ⇒ drift-flag
   *  (served flagged, not stale) (MEM-11).
   *
   *  [OPAQUE-BY-DESIGN — `source` type] each facet's source differs (DEFINE artifact / T0 manifest / territory-axis
   *  top / `slot='definition'` nodes / `CONVENTIONS.md@sha`) and has no single frozen type; transcribed as
   *  `unknown` rather than invented. Flagged. */
  facet(source: unknown): AwarenessFacet;
}
