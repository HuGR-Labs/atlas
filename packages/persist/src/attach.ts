// @atlas/persist — src/attach.ts  (index-as-attachment over the single CAS — PERSIST-4)
//
// What is attached to a commit/PR MUST be the hashed index of POINTERS; the content MUST live in the CAS,
// and a git object MUST NOT be the canonical container of a large body (PERSIST-4, atlas-persist:51). The
// oracle (ref/attach.ts, reconciled to SCN-PERSIST-4a-1/4b-1) pins: `attach(B)` takes the BODY and yields
// the `{hash}` pointer; `get(hash)` resolves the body from the CAS. Hashing/identity flow ONLY through the
// SEALED @atlas/kernel seam — `createStore().put` content-keys the body via `id` (== `blake3hex(B)`), so
// the returned pointer's hash equals the sealed `id(B)` and equal content collapses to one CAS slot. The
// attachment carries the pointer alone, so no git object ever inlines the body (SCN-PERSIST-4c-1).

import type { Hash } from '@atlas/contracts';
import type { CasObject, StoreApi } from '@atlas/kernel';
import { createStore } from '@atlas/kernel';
import type { AttachApi, Pointer } from '../ref/attach.js';

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

// differential-vs-oracle (compile-time): the facet conforms to the frozen AttachApi (ref/attach.ts).
const _apiCheck: AttachApi = createAttach();
void _apiCheck;
