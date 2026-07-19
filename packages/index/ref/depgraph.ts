// @atlas/index — ref/depgraph.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The `dependency` axis — blast radius, a DAG (INDEX-13). Honest under-approximation: every import/call
// the SCIP indexer cannot statically resolve, AND every cross-language boundary (FFI, codegen, a TS
// frontend calling a Rust binary), is recorded as an explicit `unresolved`/`dynamic` edge — never
// silently omitted, never a fabricated target. A reverse closure over such a node is reportable
// `under-approximate` and, when so flagged, UNIONS the node's `coChanged` git-history band, labeled
// correlational — never a static edge. (atlas-index:103-125, 185-191; method-tags-idx:104-109)

import type { Hash } from '@atlas/contracts';

/** An edge's resolution class — defined in `./types.ts`, re-exported here for depgraph consumers.
 *  (atlas-index:185-188; method-tags-idx:108) */
export type { EdgeKind } from './types.js';

/**
 * The result of a reverse (transpose) closure = blast radius. Transcribed from the reference model
 * (method-tags-idx:108): `reverseClosure(node) = { closure, underApprox, coChanged }`.
 *   - `closure`    — the reachable reverse-closure node set (referenced by hash).
 *   - `underApprox` — `true` iff any `unresolved`/`dynamic` edge is in scope (honest incompleteness).
 *   - `coChanged`  — the correlational `coChanged` git-history band, unioned in ONLY when `underApprox`
 *     (labeled correlational, never a static edge). Empty otherwise.
 */
export interface ReverseClosure {
  readonly closure: readonly Hash[];
  readonly underApprox: boolean;
  readonly coChanged: readonly Hash[];
}

export interface DepgraphApi {
  /** Reverse / transpose closure (blast radius) over the `depends-on` DAG; reports `underApprox` and
   *  unions the correlational `coChanged` band when an `unresolved` edge is in scope (INDEX-13).
   *  (method-tags-idx:108)
   *
   *  The reference names `reverseClosure(node)` with no concrete type for `node`; CONFIRMED as the
   *  node's CAS `Hash` — the dependency axis keys structural units by hash (atlas-index:105) and the
   *  closure node set is referenced by hash (method-tags-idx:108). Finalized `Hash`, not `IndexNode`. */
  reverseClosure(node: Hash): ReverseClosure;
}
