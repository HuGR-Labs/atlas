# SPIKE-1 · R1 — the per-clause receipt carrier (CONTRACT — ENGINEERING-FROZEN v2)

> **Status:** ✅ ENGINEERING-FROZEN 2026-08-12 — three COLD seats (billy security · lucy correctness · bobby
> architecture) reviewed v1, all findings integrated into v2, and both delta-confirms (billy scrub-order +
> lucy AC-31/32/routing) returned HOLD with the one prescribed scrub-order fix applied. TAPROOT of SPIKE-1
> (first spike of `DESIGN_sound_genesis_v2`). Freezes ONE new type — the receipt a PROVEN `dependency` fact
> carries — and the sequencing invariants that make it sound.
>
> **Owner ratification (SEPARATE gate, PENDING):** this introduces a NEW invariant — "a proven fact carries a
> re-runnable receipt whose every clause is discharged by a deterministic check." Per the atlas ratification-gate
> rite, the OWNER ratifies the invariant; the lead does not self-ratify. R1 CODE builds against this frozen
> shape now (the code is the witness); owner ratification is a **merge gate**, not a build gate.
>
> **v2 = one consolidated fix-round over three COLD reviews** (billy security · lucy correctness · bobby
> architecture), which found real mechanical defects in v1 — exactly what freezing before code exists for.
> Every change below is attributed. The theme: v1 CLAIMED guarantees the shipped machinery does not deliver;
> v2 states what it ACTUALLY delivers and names the residual limits instead of implying them away.
>
> **What changed from v1 (all evidence-backed by the reviews):**
> 1. **`answerSpan` REMOVED** (lucy F1 + bobby cut). A `GroundingSpan` hashes the WHOLE buffer (`span.ts:78/82`),
>    so answerSpan_A and answerSpan_B share one whole-answer digest — mutating B fails A's read too; it never
>    isolated candidates. Replaced by **per-candidate `answerRef`**: each candidate's scrubbed answer slice is
>    CAS-put individually, so its CAS id isolates it (AC-31 for real). Back to 4 fields.
> 2. **`check` slimmed to `{oracle}`** (bobby): `check.claim`/`check.class` duplicated `predicate`.
> 3. **Idempotency (§3.4) reframed** (lucy F2 + bobby): DEDUP routes on `contentHash` ALONE (`router.ts:130`),
>    not nodeKey; re-proposing a fact with a fresh answer is SUPERSEDE, not a no-op. Split into two honest claims.
> 4. **Store keys separated** (lucy F3): membership = `nodeKey = id(predicate⊕sourceSpan)`; tamper-evidence =
>    `contentHash = id(receipt)`. v1 wrongly equated them in §3.5. AC-24 keys on `id(receipt)`, NEVER `nodeKey`.
> 5. **TOCTOU (AC-33) reframed to a shared-REV pin** (billy claim-4): the dependency oracle consumes the SCIP
>    index, not source bytes — there is no shared buffer to thread. The invariant is a same-committed-SHA pin.
> 6. **AC-30 weakening stated** (billy): `answerRef = id(scrubbed)` is NFC-blind — the accepted, KNOW-11-mandated
>    price of the struck raw digest. §3.2 no longer overstates it as byte-exact whole-answer evidence.
> 7. **Ledger re-columned honestly** (lucy F4/F5): AC-3/28/29/30 are NOT dischargeable by the frozen type; moved
>    out of R1's owned column. R1 owns ~5 genuinely non-vacuous ACs.
> 8. **Known limits section added** (billy claim-3): the stale-but-valid ref-substitution binding hole, named.
>
> Ratification-gate territory (new invariant: "a proven fact carries a re-runnable receipt whose every clause
> is discharged by a deterministic check"). This v2 goes back to the three seats for a confirm on the deltas,
> then R1 code.

## 0. What already exists (the receipt REUSES, not reinvents)

| machinery | where (verbatim) | the receipt's use |
|---|---|---|
| `GroundingSpan {contentHash,start,end}` | `grounding/src/types.ts:103` | source-span shape — UTF-8 byte offsets, **whole-buffer** digest (drift granularity = the buffer, §3.6) |
| `bindSpan(encoder).{mintSpan,readSpan}` | `grounding/src/span.ts:73` | mint/re-derive a slice; fail-closed, total, no-throw, no-IO |
| `answerRef?: string` (CAS id of scrubbed answer bytes) | `knowledge/src/write/projection-types.ts:48,149` | fact→model-output binding (#195b); made **per-candidate** here (§3.3) |
| scrub-then-put pipeline | `cli/src/mine-answer.ts:45`, `mine-decide.ts:108-234`, leg-c on raw bytes `adapter-io/src/llm.ts:201` | scrub STRICTLY precedes hash+put (billy claim-1 confirmed); a per-candidate put is a NEW #121 scrub-fitness site |
| `FactVerdict {verdict:'proven'\|'abstain', oracle:'symbol-reverse', reason?}` | `genesis/src/verify-fact.ts:60` | the dependency check's output (dependency never `refuted`, only proven/abstain) |
| `verifyDependency(SymbolReverseApi, pathOfHash, isLocal, …)` | `genesis/src/verify-fact.ts:85` | the oracle — consumes the **SCIP index**, reads NO source bytes (§3.7) |
| DISK store re-hash-on-read `rehash=id(parsed); if rehash!==h return undefined` | `adapter-io/src/store.ts:280` | the tamper-evidence at rest — **disk store only**; in-memory `kernel/src/store.ts:45` does NOT re-hash |
| `SidecarTrust` committed-store refusal | `adapter-io/src/store.ts:174` | the protection for the fact↔receipt BINDING (§3.8), since CAS re-hash provably cannot cover a ref swap |
| `upsert`/`routeWrite` (`DEDUP` on `contentHashHit` alone) | `knowledge/src/write/router.ts:130`, `upsert.ts:244` | the byte-identical re-admit no-op (§3.4) |
| `defaultEncoder.hash = blake3(bytes)`; `id = blake3(canonicalForm)` NFC+JSON | `kernel/src/encoder.ts:32`, `canonical.ts:52` | the two digest conventions (§3.2) |

**Two facts that reshape the naive design:**
- `CurrentNode` has NO `status` field; `Status = 'HOLDS'|'BROKEN'|'NA'|'advisory'` (`contracts/src/status.ts:11`)
  has no `proven`. `proven` lives ONLY in the disjoint genesis `FactVerdict`. ⇒ the proven record is NEW/disjoint.
- `grounding` is EXCLUDED from the canonical preimage **by literal key name** `{grounding,status,freshness}`
  (`canonical.ts:36`, billy claim-3 confirmed). ⇒ receipt spans named `sourceSpan` (NOT under a `grounding`
  key) ARE id-covered; but the receipt must be a **CAS object** (`put(receipt)`), never a loose sidecar row.

## 1. The frozen type

Home: **`@atlas/knowledge` (L4)** — references `GroundingSpan` (grounding L3, strictly lower ✓, already a
declared+used edge, bobby §1), consumed by genesis (L8) + ring; the **lowest legal** home (kernel L1 would
invert). Placing it in kernel is forbidden (`layer-guard.mjs:87`).

```ts
// @atlas/knowledge — src/proven/receipt.ts  (NEW; the SPIKE-1 taproot)

import type { GroundingSpan } from '@atlas/grounding';

/** The typed dependency predicate — the model's PROPOSAL, never a truth assertion. Carries NO
 *  verdict/confidence/admit field (AC-37, enforced at the propose boundary in P1). */
export interface DepPredicate {
  readonly class: 'dependency';
  readonly sourceScope: string;   // the symbol/scope that depends
  readonly target: string;        // the symbol it depends on
  readonly worldScope: string;    // the resolution world (mirrors DepClaim, verify-fact.ts:40)
}

/** The re-runnable check dispatch — WHICH deterministic oracle discharged the predicate (AC-20).
 *  Slimmed from v1: the claim IS `predicate`, the class is `predicate.class` — no duplicate copies (bobby). */
export interface DepCheckInvocation {
  readonly oracle: 'symbol-reverse';   // the only dependency oracle today (verify-fact.ts:62)
}

/** The receipt a PROVEN dependency fact carries. A CAS object: `id(receipt)` covers every field (AC-24). */
export interface ProvenReceipt {
  readonly predicate: DepPredicate;    // WHAT was claimed (typed, not prose — AC-8)
  readonly check: DepCheckInvocation;  // HOW discharged, re-runnably (AC-20)
  readonly sourceSpan: GroundingSpan;  // WHERE in the cited UNIT's bytes — unit-granular drift (§3.6, AC-5/6/19/29)
  readonly answerRef: string;          // CAS id of THIS candidate's OWN scrubbed answer slice (#195b, per-candidate — AC-31/45)
}
```

The original AC-1 "four fields {predicate, check, span, generationHash}" map 1:1: `span`→`sourceSpan`,
`generationHash`→`answerRef` (per-candidate CAS id, §3.2/3.3).

## 2. The proven store (AC-28, AC-4 by construction)

A proven fact is **membership in its OWN content-addressed map** — a NEW `nodeKey → id(receipt)` map with the
receipt bytes in the disk CAS, DISJOINT from the advisory `current`/`Status` projection (NOT a literal reuse of
the `StoreProjection`/`CurrentNode` type — `CurrentNode` has no receipt slot; it does NOT file receipts into
`CurrentNode`, whose `Status` enum has no `proven` — lucy F3). Shape:

- **membership key:** `nodeKey = id(predicate ⊕ sourceSpan)` — the FACT identity (WHICH dependency, WHERE).
- **membership value / tamper-evidence:** `contentHash = id(receipt)` — the receipt is `put()` into the DISK
  CAS store (`adapter-io/src/store.ts`, which re-hashes on read). Altering ANY receipt field changes
  `id(receipt)` and the read refuses (AC-24, keyed on `contentHash`, **never** `nodeKey`).

There is no `status` field ⇒ **no value other than proven** (AC-28 holds by construction). An abstained
candidate is **absent** — no receipt minted, nothing in the map (AC-4). *AC-28 is a compile-time property, not
a runtime mutation-test (lucy F5); it is documented, not counted as a mechanical R1 discharge.*

## 3. The nail-downs (each: frozen invariant + honest reconciliation)

### 3.1 Offset unit — UTF-8 BYTES (AC-29). *Property of `span.ts`, not the type.*
`GroundingSpan` offsets index a `Uint8Array` (`span.ts:85`), digest over raw bytes, continuation-byte guard
(`splitsCodePoint`, `span.ts:58`). **Frozen:** any producer feeding INTERIOR offsets (tree-sitter reports
UTF-16 code units, hazard at `grounding/src/types.ts:62`) MUST convert UTF-16→UTF-8 before `mintSpan`. The
live hazard + its test are **R2's** (the type only reuses the verb). *Ledger: documentation, discharged in R2.*

### 3.2 The answer binding — per-candidate `answerRef`, NFC-blind (AC-3/AC-30/AC-45 RECONCILED).
> **Collision (billy, explicit):** AC-30 as written ("generationHash over RAW wire bytes") reopens a decision
> #195 struck and the owner ratified (2026-08-10): a raw-bytes digest is false-by-construction (`id` NFC+JSON-
> frames, never raw bytes — `195-...:38-47`) and a KNOW-11 violation (raw bytes may carry a secret).

**Reconciliation:** the answer binding is `answerRef = id(scrubbed answer bytes)` (#195b). Tamper-evidence at
rest is the DISK-store re-hash (`store.ts:280`). AC-30's real intent — catch a re-serialized/spliced answer —
is served by #195 **leg-(c)**, which validates raw UTF-8 + single-response on the raw subprocess bytes at the
boundary BEFORE scrub (`llm.ts:201`), fail-closed to a tagged abstention. The receipt adds NO raw digest.
> **Stated, not implied away (billy, the AC-30 weakening):** `answerRef` is **NFC-blind**. The disk re-hash
> runs `id(parsed)`, which NFC-normalizes, so a stored answer rewritten NFC↔NFD re-hashes EQUAL and is returned
> as authentic. This is strictly weaker than a byte-exact raw digest — the ACCEPTED, KNOW-11-mandated price of
> the struck raw digest. AC-30 is therefore a **property CHANGE** (rest-time byte-exact → admit-time leg-c +
> NFC-equal at rest), **discharged by leg-c/#195, not by the frozen type** (ledger: NOT an R1 discharge).

### 3.3 Per-candidate isolation — per-candidate scrub+put (AC-31). *Replaces v1's broken `answerSpan`.*
> **v1 defect (lucy F1):** a whole-answer `answerSpan` cannot isolate candidates — `readSpan` re-hashes the
> whole buffer, so mutating B fails A's read too.

**Frozen (scrub-order corrected, billy delta-confirm):** the admit path **scrubs the WHOLE proposer envelope
ONCE, THEN slices the SCRUBBED bytes per-candidate** and CAS-puts each slice; `answerRef` is per-candidate by
construction. Mutating candidate B's stored bytes changes B's `answerRef` re-hash (detected) and leaves A's
`answerRef` untouched (AC-31, AC-45). **The order is load-bearing:** splitting BEFORE scrub would reintroduce
the cross-boundary credential straddle (#97/#119) — a secret spanning the A|B slice boundary is two
non-matching halves under isolated `scrub(sliceA)`/`scrub(sliceB)` and both land raw in CAS (`scrub.ts:22-54`
runs its seam over the whole buffer, not per-slice). Slicing the **scrubbed** output (whose byte length scrub
changed) preserves chunk-independence and is provably equal to `scrub(whole)`.
> **Security follow (billy claim-1 + leg-b, DoD):** reuse the same `@atlas/persist` scrub over the WHOLE
> envelope. The #121-style AST fitness function MUST assert BOTH (i) the bytes reaching each per-candidate
> `put` flow from `scrub(...)`, AND (ii) scrub's INPUT is the whole envelope, never a slice — the latter is the
> part that actually closes the straddle (proving flow-from-scrub alone is necessary but NOT sufficient).

### 3.4 Idempotency — two honest claims (AC-32 RECONCILED, lucy F2 + bobby).
`routeWrite` returns `DEDUP` on `contentHashHit` (`router.ts:130`) **alone** — nodeKey is not consulted for it.
Therefore:
- **(a) admission idempotency (real):** re-admitting the **byte-identical receipt** (retry / concurrent
  double-admit) has `contentHashHit=true` ⇒ DEDUP no-op (`upsert.ts:244`, no CAS object, no mint). Exactly one
  entry.
- **(b) re-proposal (NOT a no-op):** a fresh proof of the same `(predicate, sourceSpan)` from a different model
  call has a different `answerRef` ⇒ different `id(receipt)` ⇒ `contentHashHit=false`. **Frozen admission rule
  for the proven store:** admit is keyed on `nodeKey`; if the `nodeKey` is already present (fact already
  proven), the second proof is a **membership no-op — the first receipt is retained** (avoids the
  SUPERSEDE-not-restamping latent, `upsert.ts:292`). Recall counts each `nodeKey` **once** (AC-32, AC-39);
  tokens count both proposer calls (AC-25).

### 3.5 Receipt id-coverage + field-level mutation test (AC-24 receipt-level). *The crux (billy claim-3 ✓).*
Because grounding is preimage-excluded **by key name** and `sourceSpan` is not under a `grounding` key,
`id(receipt)` genuinely covers it (billy confirmed via `canonical.ts:36`). **Frozen:** the receipt is stored
as a **CAS object** in the disk store; altering any of {predicate, check, sourceSpan, answerRef} changes
`id(receipt)` and the disk re-hash (`store.ts:280`) refuses. **Pulled INTO R1 (bobby Correction B):** a
minimal R1 mutation test — mutate each field, assert `id(receipt)` changes — so the §3.5 crux ships EXERCISED,
not deferred. (The store/attestation content-addressing over the receipt SET stays H1c.)

### 3.6 Drift granularity — the cited UNIT, not the byte-span (AC-5/6/19 RECONCILED).
`readSpan` re-hashes the WHOLE buffer it is handed. The buffer for `sourceSpan` is the **cited unit's bytes**
(the anchor's unit). So: AC-5 (mutate a byte in the cited unit → refuse) holds; **AC-19 (mutate OUTSIDE →
FRESH) holds at UNIT granularity** — mutating a DIFFERENT unit leaves the fact fresh; a mutation elsewhere
inside the same unit still drifts it. Byte-local drift (finer than the unit) would need a new span type and is
**out of spike scope**, stated so it is not mistaken for delivered. This matches the existing unit-granular
drift oracle (subtreeHash). *Owned by R2.*

### 3.7 Single-read → shared-REV pin (AC-33 RECONCILED, billy claim-4).
> **v1 category error:** the dependency oracle `verifyDependency` (`verify-fact.ts:85`) consumes the SCIP CODE
> INDEX (built once at composition, `verify-fact-source.ts:19`), NOT source bytes. There is no shared buffer to
> thread between the check and `mintSpan`.

**Frozen:** the SCIP index and every `mintSpan` in one admit MUST derive from the **same committed SHA /
content pin**. A source edit between index-build and span-mint means the check (over immutable SCIP-at-rev)
and the span (over bytes-at-admit) disagree; the invariant forbids that skew by pinning both to one rev.
**R2/H1a acceptance test:** inject a source mutation **between the index build and the span mint** (not between
a double-read of one buffer) and assert the fact abstains. *Owned by R2/H1a.*

## 3.8 KNOWN LIMITS — stated, not implied away
- **Fact↔receipt binding: stale-but-valid ref substitution (billy claim-3, MED).** Membership points at
  `contentHash = id(receipt)` via a mutable map entry (the `answerRef`/pointer class is `NOT ROUTED`,
  `upsert.ts:182`). Swapping one AUTHENTIC receipt-id for another AUTHENTIC one is caught by NEITHER CAS
  re-hash (both contents are real) NOR `readSpan`. This is the exact gap #195 admits (`195-...:98-101`). The
  actual protection is the `SidecarTrust` committed-store refusal (`store.ts:174`); R1 leans on it explicitly
  and does not claim CAS covers the binding. **Scope caveat (billy):** `SidecarTrust` only bites in the
  committed/published posture; in a live working tree `trusted` is absent and the refusal is never consulted
  (`store.ts:178`), so the binding has NO at-rest tamper protection there — bounded (the spike reads numbers
  from committed state), not open, but stated.
- **NFC-blind answer tamper (§3.2):** an NFC↔NFD rewrite of a stored answer re-hashes equal. Accepted price of
  KNOW-11.
- **Unit-granular drift (§3.6):** byte-local source drift is not delivered by the spike.
- **Pre-existing, untouched:** the `ClaimEntry` divergence (`kernel/types.ts:84` vs `atlas-knowledge:26`); the
  SUPERSEDE-not-restamping-`answerRef` latent (`upsert.ts:292`) — the §3.4 no-op rule sidesteps it for a
  first-proof spike.

## 4. AC ledger (re-columned honestly, lucy F4/F5)
- **R1 owns, genuinely non-vacuous (RED→GREEN, mutation-scoped):** **AC-1** (each field resolves via
  `readSpan`/`store.get`), **AC-2** (type stores no text — a pointer), **AC-31** (per-candidate `answerRef`
  isolation, mutation-scoped), **AC-32** (the two-claim idempotency of §3.4), **AC-24 receipt-level** (field
  mutation ⇒ `id(receipt)` changes, §3.5).
- **Frozen here, BUILT by dependents:** AC-5/6/19 unit-drift + AC-33 rev-pin → **R2**; AC-45 answer tamper →
  R2; AC-24 store/attestation → H1c; AC-4 abstain-absent e2e → H1b/H1c.
- **NOT an R1 discharge (property of #195/span.ts/mine-door, referenced not re-owned):** AC-3 (`answerRef==
  id(scrubbed)` — kernel `id`/#195 pipeline), AC-29 (UTF-8 — `span.ts`), AC-30 (property change, leg-c/#195).
  AC-28 is a compile-time tautology (documented, not counted).

## 5. Definition of done (R1)
1. `packages/knowledge/src/proven/receipt.ts` with the frozen types; exported at the barrel.
2. The proven-store map (a NEW `nodeKey → id(receipt)` map, receipt bytes in disk CAS — not a `StoreProjection`
   reuse) + `nodeKey`/`id(receipt)` keying + the §3.4 admission rule (membership no-op on nodeKey-hit; DEDUP on
   byte-identical contentHash).
3. Tests owning AC-1, AC-2, AC-31, AC-32, AC-24(receipt-level) RED→GREEN, each mapped 1:1, mutation-non-vacuous.
4. Gates green: `layer-guard`, `godfile-guard` (≤400 warn / ≤600 hard), `spec-conformance`, `id-integrity`,
   `reference-model`; tsc includes the new file.
5. **billy** re-confirm: no raw-secret path to CAS via the per-candidate `put` (KNOW-11, #121 fitness extended
   to the new site); the NFC weakening + binding-hole are stated, not silently relied on. **lucy** re-confirm:
   the 5 owned ACs are non-vacuous and AC-31/32 match the reconciled routing. **bobby** re-confirm: the deltas
   (dropped answerSpan, split keys, rev-pin) hold against ARCH + minimality.
6. One-fix-round on the v2 deltas. Then R2 ∥ P1 unblock against this frozen shape.
