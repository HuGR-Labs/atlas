// @atlas/persist — src/transcript-store.ts  (WP-3.5-a.PERSIST · PERSIST-10)
//
// The content-addressed large-object transcript store: the body is retained IN FULL (never truncated / lossily
// compressed — owner law). `put(body) → hash` stores the lossless body; `fetch(ref)` returns the EXACT bytes
// on demand (byte-identity round-trip). Only the `TranscriptRef` pointer lives in git; `id` is the SEALED seam.

import type { Hash } from '@atlas/contracts';
import { id } from '@atlas/kernel';
import type { TranscriptRef } from './types.js';

/** The full, lossless transcript body — byte-identity `fetch(put(body)) ≡ body` forces raw bytes. */
export type Transcript = Uint8Array;

/** The content-addressed large-object transcript store (PERSIST-10): `put(body) → hash` stores the full
 *  lossless body; `fetch(ref)` returns the EXACT bytes on demand (0 truncation). (atlas-persist:107) */
export interface TranscriptStoreApi {
  put(body: Uint8Array): Hash;
  fetch(ref: TranscriptRef): Transcript;
}

/** The large-object store kind for the CAS-backed transcript pointer (atlas-persist:122-124). */
const STORE_KIND: TranscriptRef['store'] = 'cas';

/** Content-address the raw byte body over the SEALED kernel `id` seam (never a hand-rolled digest). The
 *  body is tagged so an equal body always maps to the same hash and no arbitrary array collides with it. */
function contentHash(body: Uint8Array): Hash {
  return id({ kind: 'Transcript', bytes: Array.from(body) });
}

/** The git-side POINTER to a stored large object — only `{sha, store}`, never the body (PERSIST-10-c). */
export function toGitPointer(sha: Hash): TranscriptRef {
  return { sha, store: STORE_KIND };
}

/** The frozen `TranscriptStoreApi` surface (`put`/`fetch`) — content-addressed, immutable, fetch-on-demand. */
export type TranscriptStore = TranscriptStoreApi;

/**
 * A content-addressed large-object transcript store (PERSIST-10). `put` is idempotent on equal bodies and
 * stores a stable copy in full; `fetch` returns the exact bytes for a pointer, on demand. Byte-identity
 * `fetch(put(body)) ≡ body` holds by construction — no code path truncates or lossily abridges the body.
 */
export function createTranscriptStore(): TranscriptStore {
  const objects = new Map<Hash, Uint8Array>();
  return {
    put(body: Uint8Array): Hash {
      const h = contentHash(body);
      // immutable + idempotent: store the full body once; equal bytes re-use the same object.
      if (!objects.has(h)) objects.set(h, Uint8Array.from(body));
      return h;
    },
    fetch(ref: TranscriptRef): Transcript {
      const body = objects.get(ref.sha);
      if (body === undefined) {
        throw new Error(`transcript large-object not found for pointer ${String(ref.sha)}`);
      }
      // the EXACT bytes — a defensive copy so a caller cannot mutate the immutable object in place.
      return Uint8Array.from(body);
    },
  };
}

// ── size mitigation — lossless + reversible (PERSIST-10-d) ──────────────────────────────────────────────
//
// No lossy transform is applied to the transcript body. The `mitigate`/`reverse` pair is the round-trip
// contract point for ANY future size mitigation: it MUST satisfy `reverse(mitigate(T)) ≡ T` byte-identical.
// The current mitigation is the identity round-trip (fully lossless + reversible); a lossy compression that
// dropped bytes would fail the byte-identity guard.

/** Apply the (currently lossless, identity) size-mitigation transform to a transcript body. */
export function mitigate(body: Uint8Array): Uint8Array {
  return Uint8Array.from(body);
}

/** Invert the size-mitigation transform — `reverse(mitigate(T)) ≡ T` byte-identical (lossless). */
export function reverse(mitigated: Uint8Array): Uint8Array {
  return Uint8Array.from(mitigated);
}
