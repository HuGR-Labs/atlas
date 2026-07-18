// @atlas/persist — ref/attach.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Index-as-attachment: what is attached to a commit/PR is the hashed index of POINTERS; the content
// lives in the CAS (PERSIST-4). The reference names `attach()` (stores only `{hash}` pointers) and
// `get()` (resolves via the CAS by hash), with a size-gate that no inlined payload exceeds the pointer
// threshold (method-tags-pst:42-43) — but freezes no concrete arg/return types.
//
// [SIG-TBD] The op NAMES (`attach`/`get`) and the pointer shape (`{hash}`) are grounded; the exact
// arg/return signatures are NOT frozen — flagged, not invented beyond the named pointer-only contract.

import type { Hash } from '@atlas/contracts';

/** A CAS pointer — the ONLY thing attached; the content resolves from the CAS by this hash
 *  (PERSIST-4, method-tags-pst:42). */
export interface Pointer {
  readonly hash: Hash;
}

export interface AttachApi {
  /** Attach only `{hash}` pointers (never an inlined body). [SIG-TBD] exact arg/return not frozen. */
  attach(pointer: Pointer): unknown;
  /** Resolve the content from the CAS by hash. [SIG-TBD] exact return not frozen. */
  get(hash: Hash): unknown;
}
