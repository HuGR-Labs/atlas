// @atlas/persist — ref/transcript-store.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The content-addressed large-object transcript store (PERSIST-10). `put(body) → hash` stores the full,
// lossless body; `fetch(ref)` returns the EXACT bytes (byte-identity round-trip, 0 truncation) —
// fetch-on-demand, with only the pointer (`TranscriptRef`) in git (method-tags-pst:84-85).
// (atlas-persist:107)
//
// The reference's surface names the read `fetchTranscript(ref): Transcript` (atlas-persist:107); the
// task's frozen `TranscriptStoreApi` names it `fetch` — same operation, transcribed as `fetch`.

import type { Hash } from '@atlas/contracts';
import type { TranscriptRef } from './types.js';

/**
 * The full, lossless transcript body.
 * PINNED: byte-identity `fetch(put(body)) ≡ body` (SCN-PERSIST-10a-1, method-tags-pst:84) forces the raw
 * byte body → `Uint8Array`. No richer structure is frozen.
 */
export type Transcript = Uint8Array;

export interface TranscriptStoreApi {
  /** Store the full body → content hash; the object is immutable + content-addressed. `body` is the
   *  raw byte body (byte-identity round-trip, method-tags-pst:84). (atlas-persist:107) */
  put(body: Uint8Array): Hash;
  /** Resolve the content-addressed large object by its pointer, on demand — the exact bytes.
   *  (atlas-persist:107) */
  fetch(ref: TranscriptRef): Transcript;
}
