// @atlas/persist — src/attach.ts  (index-as-attachment over the single CAS — PERSIST-4)
//
// What is attached is the `{hash}` POINTER; the body lives in the CAS, never inlined in a git object.
// Hashing flows ONLY through the SEALED @atlas/kernel `put`/`id` seam, so equal content collapses to one slot.

import type { Hash } from '@atlas/contracts';
import type { CasObject, StoreApi } from '@atlas/kernel';
import { createStore } from '@atlas/kernel';

/** A CAS pointer — the ONLY thing attached; the content resolves from the CAS by this hash
 *  (PERSIST-4, method-tags-pst:42). */
export interface Pointer {
  readonly hash: Hash;
}

/** Index-as-attachment surface (PERSIST-4): `attach(B)` stores the body and yields the `{hash}` pointer
 *  (SCN-PERSIST-4a-1); `get(hash)` resolves the body from the single CAS (SCN-PERSIST-4b-1). */
export interface AttachApi {
  attach(body: CasObject): Pointer;
  get(hash: Hash): CasObject;
}

/**
 * Construct the attach surface over a single content-addressed store. `attach` returns ONLY the `{hash}`
 * pointer (never the inlined body); `get` resolves the body from that same CAS by its content hash. The
 * store defaults to a fresh sealed `createStore()`; an explicit store lets a caller share one CAS.
 */
export function createAttach(store: StoreApi = createStore()): AttachApi {
  return {
    /** Attach a content body; store it in the CAS (content-keyed via the sealed seam) and return the
     *  hashed `{hash}` pointer — never the body bytes (SCN-PERSIST-4a-1). */
    attach(body: CasObject): Pointer {
      const hash: Hash = store.put(body);
      return { hash };
    },
    /** Resolve the content body from the single CAS by its content hash (SCN-PERSIST-4b-1). Total: a miss
     *  is an honest empty handle (`undefined` widens to the `unknown` CasObject), never a throw. */
    get(hash: Hash): CasObject {
      return store.get(hash) as CasObject;
    },
  };
}

// differential-vs-oracle (compile-time): the facet conforms to the co-located frozen AttachApi.
const _apiCheck: AttachApi = createAttach();
void _apiCheck;
