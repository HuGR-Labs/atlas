// @atlas/index — ref/cas.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Universal content-addressing (INDEX-11): EVERY Atlas object kind — code, knowledge, memory,
// provenance, transcripts, AND the docs — is a BLAKE3-keyed CAS object, keyed by `blake3(canonical)`
// into the ONE CAS and registered for grounding + drift. `put` content-addresses ANY kind (incl. a
// `Doc`) and returns its hash. (atlas-index:216, 176-177; method-tags-idx:90-95)
//
// The CAS is the KERNEL's single store (KERNEL-3): the index does NOT stand up a second store — it
// reuses the kernel's `CasObject` (the stored-object type) and returns the contracts `Hash`. This
// facet shares the KERNEL CAS reference `kernel/ref/store.ts` (method-tags-idx:95).

import type { Hash } from '@atlas/contracts';
import type { CasObject } from '@atlas/kernel';

export interface CasIndexApi {
  /** Canonicalize → BLAKE3 → store; content-address ANY object kind (incl. a `Doc`), returns its
   *  hash. Shares the KERNEL CAS reference `kernel/ref/store.ts` — one store, not a second.
   *  `object` is the kernel's `CasObject` (the stored-object type).
   *  (atlas-index:216; method-tags-idx:95) */
  put(object: CasObject): Hash;
}
