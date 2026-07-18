// @atlas/kernel — ref/store.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The single content-addressed store (KERNEL-3): every Atlas object is keyed by its hash in ONE CAS.
// `put` = canonicalize → hash → store, idempotent on equal canonical bytes; `get` is total — a miss
// yields `undefined`, never a throw (KERNEL-7). (atlas-kernel:99-100, 108-109)

import type { Hash } from '@atlas/contracts';
import type { CasObject } from './types.js';

export interface StoreApi {
  /** Canonicalize → hash → store. Idempotent: putting bytes that already exist returns the same
   *  `Hash` and stores nothing new. (atlas-kernel:99, 108) */
  put(obj: CasObject): Hash;
  /** Resolve by key; total (miss ⇒ `undefined`, no throw). (atlas-kernel:100) */
  get(h: Hash): CasObject | undefined;
}
