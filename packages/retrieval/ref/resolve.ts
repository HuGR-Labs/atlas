// @atlas/retrieval — ref/resolve.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Scope → covering territory/-ies via the hashed structural index (RETR-1, §3.5). The axes-only
// reference resolver: relevance is a PURE function of (scope, dependency, trigger) over the index — 0
// embedding / vector / RAG calls (A-14); two identical queries return byte-identical results
// (determinism inherited from INDEX-8). Total: a malformed scope yields an empty result, never a throw
// (RETR-9). Transcribed from atlas-retrieval:167 + method-tags-ret:21-26.

import type { Territory } from '@atlas/contracts';
import type { Path } from './types.js';

export interface ResolveApi {
  /** Scope (path) → the covering territory/-ies, resolved by the index (§3.5). Pure + total (miss ⇒
   *  empty, no throw — RETR-9); byte-identical for equal input (RETR-1). (atlas-retrieval:167) */
  resolve(scope: Path): readonly Territory[];
}
