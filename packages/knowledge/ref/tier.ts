// @atlas/knowledge — ref/tier.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The criticality classifier (KNOW-7, spec A-6). Criticality is NEVER auto-assigned: a `T0`-keyword
// match yields `t0Candidate:true` AND `tier=='T2'` (0 auto-promotes); heuristics may only FLAG a
// candidate for human ratification, never write the tier. Transcribed from atlas-knowledge:77, 195-196
// and method-tags-knw:60-65.

import type { Tier } from '@atlas/contracts';
import type { TerritoryView } from './types.js';

export interface TierApi {
  /** Classify a territory's criticality (KNOW-7). Sets `t0Candidate` by keyword but ALWAYS emits
   *  `tier='T2'` — the invariant `t0Candidate ⇒ tier=='T2'` holds over the whole keyword corpus
   *  (method-tags-knw:64). A `T0` tier is human-ratified only (never mechanical). Pure + total.
   *
   *  [FLAG — arg] The reference names `classify(territory)`. Typed as the knowledge-local `TerritoryView`
   *  (the `ref/init.ts` output shape); the canonical contracts `Territory` could also apply — flagged for
   *  the WP to confirm which territory shape the classifier consumes. */
  classify(territory: TerritoryView): { readonly t0Candidate: boolean; readonly tier: Tier };
}
