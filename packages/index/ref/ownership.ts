// @atlas/index — ref/ownership.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Generated + reconciled ownership (INDEX-15, anti-CODEOWNERS-rot). Territory `owner` is GENERATED from
// the structural graph + git-blame authorship the index already holds; an explicit manifest override
// BEATS the generated owner; reconciliation is deterministic and `$0`-LLM; `tier` stays human-ratified
// (never generated), passed through untouched. (atlas-index:83-91, 197-201; method-tags-idx:118-123)

import type { Manifest } from './types.js';

/**
 * The reconciled ownership map — the deterministic partition (after overlap resolution). Transcribed
 * from the reference `reconcile(...)` return (method-tags-idx:122).
 *
 * [SIG-TBD — shape underspecified] No cited source gives `OwnerMap` a concrete shape (method-tags-idx:
 * 122 names it as the reconciler output only). Transcribed as `path/unit → owner(seat)` keyed by
 * string (owner is the nominal seat id, `string` — see @atlas/contracts `Territory` FLAG) rather than
 * invented with extra fields. Flagged for the WP to pin (key granularity: path vs StructRef).
 */
export type OwnerMap = ReadonlyMap<string, string>;

export interface OwnershipApi {
  /** Deterministic owner-generator over the structural graph + git-blame, then the manifest override
   *  as a precedence layer (override beats generated); `tier` passed through untouched, `$0`-LLM
   *  (INDEX-15). (method-tags-idx:122)
   *
   *  [SIG-TBD — args underspecified] `graph` (the structural/depends-on graph) and `blame` (git-blame
   *  authorship) have NO concrete type in any cited source — both are transcribed as `unknown` (a
   *  black-box signal, method-tags-idx:148-149), NOT invented. `manifest` is the hashed `Manifest`. */
  reconcile(graph: unknown, blame: unknown, manifest: Manifest): OwnerMap;
}
