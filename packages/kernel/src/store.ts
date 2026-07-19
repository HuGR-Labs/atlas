// @atlas/kernel — src/store.ts  (the single content-addressed store — KERNEL-3 / KERNEL-7)
//
// ONE CAS: every Atlas object is keyed by its content hash in a single `Map<Hash, CasObject>`; there is no
// second, non-content-addressed store for any object kind (KERNEL-3a/3b). Identity is minted ONLY through
// the sealed seam (`id` → canonicalForm → encoder) — a caller-supplied id is never a key, so equal content
// always collapses to one slot (content-keyed dedup, idempotent). Both entry points are total: `get` misses
// return `undefined`, and a malformed object (a canonical-form violation) yields an honest empty handle
// instead of a throw (KERNEL-7a/7b).

import type { Hash } from '@atlas/contracts';
import type { StoreApi } from '../ref/store.js';
import type { CasObject } from '../ref/types.js';
import { id } from './canonical.js';
import { asHash } from './brand.js';

/** The honest-empty content handle: a malformed put stores nothing and returns this non-resolving key. */
const EMPTY: Hash = asHash('');

/** Construct THE single content-addressed store. One backing `Map` — no second store, ever. */
export function createStore(): StoreApi {
  const cas = new Map<Hash, CasObject>();
  return {
    put(obj: CasObject): Hash {
      let key: Hash;
      try {
        // canonicalize → hash → store, via the sealed seam; the caller never supplies the key.
        key = id(obj);
      } catch {
        // malformed input (float / bigint / symbol / cyclic) → honest empty, never a throw (KERNEL-7b).
        return EMPTY;
      }
      // content-keyed dedup: equal content already present ⇒ store nothing new, return the same Hash.
      if (!cas.has(key)) cas.set(key, obj);
      return key;
    },
    get(h: Hash): CasObject | undefined {
      // total: a miss is `undefined`, never a throw (KERNEL-7a).
      return cas.get(h);
    },
  };
}
