// @atlas/index — ref/resolve.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Path resolution + hierarchy roll-up (INDEX-4). `resolve(axis, key)` returns the covering node; a file
// query also surfaces its module's and crate's invariants (the roll-up happens at the retrieval layer).
// Total: a malformed / missing axis/key yields `undefined`, never a throw (INDEX-9). (atlas-index:164-165,
// 210; method-tags-idx:41-46)

import type { Axis, IndexNode } from './types.js';

export interface ResolveApi {
  /** Axis + key → the covering node, total (miss ⇒ `undefined`, no throw — INDEX-9). (atlas-index:210) */
  resolve(axis: Axis, key: string): IndexNode | undefined;
}
