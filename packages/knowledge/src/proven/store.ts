// @atlas/knowledge — src/proven/store.ts  (SPIKE-1 R1 — the proven-store map + keying + admission rule)
//
// ── REFERENCE MODEL (declared in harness/gates/reference-model-guard.mjs) ──────────────────────────────
// Until R2 / P1 / H1a wire it, `bindProvenStore` has ZERO production callers — SPIKE-1's taproot ships the
// TYPE + store + keying + admission RULE first, and its dependents reach for it next. So this module is, for
// now, the executable SPECIFICATION of the §3.4 admission rule and the two-digest keying: compiled, barrel-
// exported, tested, but not yet reached from any product door. It is registered in that gate's LEDGER with
// `shipped: null`; the row is DELETED the moment a dependent value-imports `bindProvenStore` (the same
// dead→live transition `own.ts` and the `verify-fact` family already made).
//
// A proven fact is MEMBERSHIP IN ITS OWN content-addressed map — a NEW `nodeKey → id(receipt)` map, with the
// receipt bytes living in the disk CAS (contract §2). This is DISJOINT from the advisory `current`/`Status`
// projection: it is NOT a reuse of `StoreProjection`/`CurrentNode` (which has no receipt slot, and whose
// `Status` enum — `HOLDS|BROKEN|NA|advisory`, `contracts/src/status.ts` — has no `proven` value, lucy F3). The
// proven store therefore cannot be filed into `CurrentNode`; it is its own map, defined here.
//
// TWO DIGESTS, SEPARATED (contract §2, lucy F3):
//   · membership key   `nodeKey     = id(predicate ⊕ sourceSpan)` — the FACT identity (WHICH dependency, WHERE).
//   · tamper-evidence  `contentHash = id(receipt)`               — the WHOLE receipt, `put()` into the disk CAS,
//                                                                   which re-hashes on read (`store.ts:280`).
// v1 wrongly equated them (§3.5); AC-24 keys on `contentHash`, NEVER on `nodeKey`.
//
// THE STORE SEAM. This module holds only the pure map + keying + admission RULE; the durable CAS is the
// injected `StoreApi` seam (`@atlas/kernel`) — the same seam `evaluator.ts`/`archive.ts`/`router.ts` take, so
// the composition root supplies the DISK store (whose re-hash-on-read is the at-rest tamper evidence) and a
// test may supply the in-memory one. Nothing here does IO or reaches for a concrete store.
//
// THE ADMISSION RULE (contract §3.4 — two honest claims). Admit is keyed on `nodeKey`:
//   (a) admission idempotency — a BYTE-IDENTICAL re-admit (retry / concurrent double-admit) hits the same
//       `nodeKey` with the same `contentHash` ⇒ a DEDUP no-op (`outcome:'dedup'`): exactly one entry, and — the
//       load-bearing part — the second `put` is NEVER issued, so no new CAS object is minted.
//   (b) re-proposal — a FRESH proof of the same `(predicate, sourceSpan)` from a different model call has a
//       different `answerRef` ⇒ a different `id(receipt)`. This is NOT a no-op in `routeWrite`'s sense (a fresh
//       `contentHash` would DEDUP-miss there and route to SUPERSEDE, `upsert.ts:130,292`). The FROZEN rule for
//       the PROVEN store is: if the `nodeKey` is already present (the fact is already proven), the second proof
//       is a MEMBERSHIP no-op — the FIRST receipt is RETAINED (`outcome:'membership'`), sidestepping the
//       SUPERSEDE-not-restamping latent. Recall counts each `nodeKey` ONCE (`size`, AC-32/AC-39); the token
//       ledger still counts both proposer calls (AC-25), which is a metering concern, not this map's.
//
// TOTAL, PURE. No throw on the admit path for a well-formed receipt; `id` itself throws only on a canonical-
// form violation (floats/bigint/NFC key collision), which a `ProvenReceipt` — all strings + safe integers —
// cannot contain, so admit is total over the type.

import { id } from '@atlas/kernel';
import type { StoreApi } from '@atlas/kernel';
import type { GroundingSpan } from '@atlas/grounding';
import type { DepPredicate, ProvenReceipt } from './receipt.js';

/** Why an `admit` returned as it did — the three exhaustive dispositions of the §3.4 admission rule.
 *  - `admitted`   — a fresh `nodeKey`: the receipt was `put()` into CAS and the membership entry created.
 *  - `dedup`      — §3.4(a): a byte-identical re-admit (`nodeKey` present AND `id(receipt)` == the stored one).
 *  - `membership` — §3.4(b): a fresh proof of an already-proven `(predicate, sourceSpan)` (`nodeKey` present,
 *                   `id(receipt)` DIFFERS); the FIRST receipt is retained, the second is not stored. */
export type ProvenAdmitOutcome = 'admitted' | 'dedup' | 'membership';

/** The outcome of one `admit`. `contentHash` is the RETAINED receipt's `id` — the incoming one on `admitted`,
 *  the first-proof one on a no-op — so a caller always learns the address of the receipt that actually holds
 *  this `nodeKey`. */
export interface ProvenAdmitResult {
  readonly outcome: ProvenAdmitOutcome;
  readonly nodeKey: string;      // id(predicate ⊕ sourceSpan)
  readonly contentHash: string;  // id(receipt) of the RETAINED receipt — the map's value for `nodeKey`
}

/** The proven store: membership in a `nodeKey → id(receipt)` map over an injected CAS seam. */
export interface ProvenStore {
  /** Admit a proof under the §3.4 rule (nodeKey-keyed; first receipt retained on a hit). */
  admit(receipt: ProvenReceipt): ProvenAdmitResult;
  /** Is this `nodeKey` already proven? (membership — the query AC-4/AC-32 recall counts.) */
  has(nodeKey: string): boolean;
  /** The `contentHash` (`id(receipt)`) filed under `nodeKey`, or `undefined` if the fact is not proven. */
  contentHashOf(nodeKey: string): string | undefined;
  /** How many DISTINCT facts are proven — recall counts each `nodeKey` ONCE (AC-32/AC-39). */
  readonly size: number;
  /** The membership identity for a `(predicate, sourceSpan)` pair — `id(predicate ⊕ sourceSpan)`. Exposed so a
   *  caller can query `has`/`contentHashOf` WITHOUT reconstructing a whole receipt. */
  nodeKeyOf(predicate: DepPredicate, sourceSpan: GroundingSpan): string;
}

/** The `predicate ⊕ sourceSpan` membership preimage: `id({predicate, sourceSpan})`. Both keys are part of the
 *  canonical preimage (`sourceSpan` is NOT a `{grounding,status,freshness}` side-index, so it is NOT excluded —
 *  §3.5), so the `nodeKey` is a total function of WHICH dependency and WHERE, and nothing else. */
function provenNodeKey(predicate: DepPredicate, sourceSpan: GroundingSpan): string {
  return id({ predicate, sourceSpan }) as unknown as string;
}

/** Construct a proven store over an injected CAS `StoreApi` (the disk store in production — its re-hash-on-read
 *  is the at-rest tamper evidence AC-24 leans on). One backing `Map`; nothing else is stored. */
export function bindProvenStore(store: StoreApi): ProvenStore {
  // nodeKey → contentHash. The ONLY mutable state; membership is presence of a key.
  const index = new Map<string, string>();

  const nodeKeyOf = (predicate: DepPredicate, sourceSpan: GroundingSpan): string =>
    provenNodeKey(predicate, sourceSpan);

  return {
    admit(receipt: ProvenReceipt): ProvenAdmitResult {
      const nodeKey = provenNodeKey(receipt.predicate, receipt.sourceSpan);
      // `id(receipt)` is exactly what `store.put(receipt)` would return; computing it HERE lets the no-op path
      // classify dedup-vs-membership WITHOUT issuing a `put` (so §3.4(a) mints no new CAS object).
      const contentHash = id(receipt) as unknown as string;
      const existing = index.get(nodeKey);
      if (existing !== undefined) {
        // nodeKey-hit: MEMBERSHIP no-op, the first receipt is retained (§3.4). No `put`, no map write.
        // `dedup` (byte-identical, §3.4a) vs `membership` (fresh answer, §3.4b) only names WHY; both retain.
        return { outcome: existing === contentHash ? 'dedup' : 'membership', nodeKey, contentHash: existing };
      }
      // Fresh fact: the receipt becomes a CAS object (the disk store dedups byte-identical bytes on disk), and
      // the membership entry is created. `stored` === `contentHash` — the store re-derives the same `id`.
      const stored = store.put(receipt) as unknown as string;
      index.set(nodeKey, stored);
      return { outcome: 'admitted', nodeKey, contentHash: stored };
    },
    has(nodeKey: string): boolean {
      return index.has(nodeKey);
    },
    contentHashOf(nodeKey: string): string | undefined {
      return index.get(nodeKey);
    },
    get size(): number {
      return index.size;
    },
    nodeKeyOf,
  };
}
