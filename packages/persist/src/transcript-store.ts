// @atlas/persist — src/transcript-store.ts  (WP-3.5-a.PERSIST · PERSIST-10)
//
// The content-addressed large-object transcript store. The transcript body is retained IN FULL — the raw,
// unadulterated total context of the agent — never truncated, never lossily compressed (owner law,
// atlas-persist:118-131). `put(body) → hash` stores the full, lossless body and returns its content hash;
// `fetch(ref)` resolves the EXACT bytes on demand (byte-identity round-trip, 0 truncation). Only the
// POINTER (`TranscriptRef {sha, store}`) lives in git — a routine clone no longer drags every MB, yet the
// body is fetchable everywhere (fetch-on-demand). Any future size mitigation MUST stay LOSSLESS + REVERSIBLE
// (never lossy): the current mitigation is the identity round-trip, the point at which that contract holds.
//
// Content-addressing goes ONLY through the SEALED @atlas/kernel `id` seam (KERNEL-1) — no hash is
// hand-rolled here. The reference names the read `fetchTranscript(ref)`; the frozen `TranscriptStoreApi`
// names it `fetch` (same operation).

import type { Hash } from '@atlas/contracts';
import { id } from '@atlas/kernel';
import type { TranscriptRef } from '../ref/types.js';
import type { Transcript, TranscriptStoreApi } from '../ref/transcript-store.js';

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
