// @atlas/tools — ref/init.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// `atlas-init` — the `$0`-LLM STRUCTURAL move-in (TOOLS-5, spec A-5/A-6). One of the EXACTLY-FOUR
// governance tools (TOOLS-1). It walks a tree structurally (no LLM) and returns the territory skeleton +
// blast radius + T0-candidate flags: EVERY territory ships at the `T2/advisory` default with ZERO
// invariants, and a T0-keyword territory yields a candidate flag AND `tier=='T2'` — it AUTO-PROMOTES
// NOTHING (a heuristic MAY only *flag*). Pure + total. Transcribed from atlas-tools:42-44, 124, 142 +
// method-tags-tls:47-52.

import type { InitOut } from './types.js';

export interface InitApi {
  /** `$0`-LLM structural move-in over a tree path (TOOLS-5). Returns the `T2/advisory` skeleton + blast
   *  radius + T0-candidate names; sets NO tier above `T2` and promotes NO `T0` (A-5, A-6). Pure + total.
   *  (method-tags-tls:51)
   *
   *  [PINNED — `path` arg] atlas-tools:124 names `atlas-init <path>`; no `Path`/tree brand is frozen at
   *  this seam (contracts exposes none — cf retrieval `Path = string`). Pinned to `string`, NOT a brand
   *  nor a lower-layer index tree type. */
  init(path: string): InitOut;
}
