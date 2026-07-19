// @atlas/persist — ref/attach.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Index-as-attachment: what is attached to a commit/PR is the hashed index of POINTERS; the content
// lives in the CAS (PERSIST-4). The reference names `attach()` (stores only `{hash}` pointers) and
// `get()` (resolves via the CAS by hash), with a size-gate that no inlined payload exceeds the pointer
// threshold (method-tags-pst:42-43) — but freezes no concrete arg/return types.
//
// PINNED (oracle-pin reconciliation) — the signature is now transcribed from golden SCN-PERSIST-4a-1/4b-1:
// `attach(B)` takes the BODY and yields the `{hash}` pointer (goldens-pst:168-169); `get(hash)` resolves
// the body from the CAS (goldens-pst:187-188). The previous `attach(pointer)` was INVERTED vs the golden.

import type { Hash } from '@atlas/contracts';
import type { CasObject } from '@atlas/kernel';

/** A CAS pointer — the ONLY thing attached; the content resolves from the CAS by this hash
 *  (PERSIST-4, method-tags-pst:42). */
export interface Pointer {
  readonly hash: Hash;
}

export interface AttachApi {
  /** Attach a content body; what is stored is the hashed `{hash}` pointer, never the inlined body
   *  (SCN-PERSIST-4a-1: `attach(B) → {hash: blake3hex(B)}`). */
  attach(body: CasObject): Pointer;
  /** Resolve the content body from the single CAS by its hash (SCN-PERSIST-4b-1). */
  get(hash: Hash): CasObject;
}
