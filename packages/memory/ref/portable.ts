// @atlas/memory — ref/portable.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Portable + scrubbed (MEM-9). Memory travels with the repo, is inherited by a fork, exports to OPEN JSON
// that replays 1:1 — no lock-in: `deepEqual(mem, import(export(mem)))`. Reuses KERNEL-6's `portable.ts`
// (de)serializer. Transcribed from method-tags-mem:77-82 (INV-MEM-9 down-model) + atlas-memory:123.
//
// [DELEGATED — the secret-scrub gate is NOT modeled here] MEM-9 also requires a fail-closed secret/PII
// scrub by a NAMED scanner (gitleaks / trufflehog) that BLOCKS a secret-carrying write (mirrors
// PERSIST-10). Per method-tags-mem:80-82, a black-box scanner has no pure-function oracle: its
// verification is an INTEGRATION/CONFORMANCE gate against the real binary, delegated to FR-12 (billy) —
// OUT of this block's reference-model scope. Only the round-trip is modeled here; the scrub gate carries
// NO signature in this file (it is not a modelable seam).

import type { MemoryStore } from './types.js';

export interface PortableApi {
  /** Open-JSON dump of the member's Memory — replays 1:1, no proprietary encoding, no host dependency
   *  (MEM-9). Reuses KERNEL-6 `portable.ts`. (method-tags-mem:81) */
  export(): string;

  /** Replay an open-JSON dump 1:1 into a fresh store — `deepEqual(mem, import(export(mem)))` (MEM-9).
   *  (method-tags-mem:81) */
  import(json: string): MemoryStore;
}
