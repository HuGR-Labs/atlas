// @atlas/contracts — pack.ts
//
// The shared injection vocabulary. These types break the retrieval⟷memory cycle: both packages
// speak this dialect without importing each other. Transcribed from atlas-retrieval §Data model.

import type { Hash, NodeKey } from './hash.js';
import type { Tier } from './tier.js';

/** A retrieval pack: every `tier≥T1` invariant of a territory, capped, with a drift flag.
 *  (atlas-retrieval line 16)
 *
 *  FLAG (reference underspecifies these field types — line 16 lists names, types only for
 *  `invariants`). Inferred, not invented:
 *   - `territory`  → the territory NAME (the governance key, lead-ratified) — a pack references
 *     its scope by key, not by value-embedding the full Territory (CAS thesis); avoids dragging
 *     authoring-time `globs` into a consumer briefing. owner/tier ride per-invariant below.
 *   - `axisHash`   → Hash (content identity of the axis snapshot the pack was built from).
 *   - `tokenEstimate` → number (the pinned cl100k_base / UTF-8 count, retrieval line 61-62).
 *   - `stale`      → boolean (`true` iff any backing grounding drifted, retrieval line 53-55). */
export interface Pack {
  readonly territory: string;
  readonly axisHash: Hash;
  readonly invariants: readonly PackInvariant[];
  readonly tokenEstimate: number;
  readonly stale: boolean;
}

/** One structured (never-prose) invariant line inside a Pack. (atlas-retrieval line 17)
 *
 *  FLAG (underspecified field types): `nodeId` inferred as NodeKey (the node's identity key);
 *  `claim` inferred as string (a 1-line structured claim, "never a prose blob"). `tier` is Tier. */
export interface PackInvariant {
  readonly nodeId: NodeKey;
  readonly tier: Tier;
  readonly claim: string;
}

/** The closed vocabulary of auto-injection surfaces (drop-order / budget keys). (atlas-retrieval line 45) */
export type InjectionKind =
  | 'awareness'
  | 'orientation'
  | 'projectMem'
  | 'own'
  | 'pack'
  | 'protocols.safetyCritical'
  | 'protocols.advisory'
  | 'poke';

/** Per-injection-kind cap + hits ledger + observed hit-rate (the drop-order oracle, RETR-6).
 *  (atlas-retrieval line 46)
 *
 *  FLAG (underspecified field types): `capTokens`, `hits`, `hitRate` inferred as number
 *  (a per-type token cap, a hits count, an observed rate). `kind` is InjectionKind. */
export interface Budget {
  readonly kind: InjectionKind;
  readonly capTokens: number;
  readonly hits: number;
  readonly hitRate: number;
}
