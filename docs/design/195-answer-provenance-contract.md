# #195 — Answer provenance: bind a fact to the exact bytes the model returned

> **Status:** contract frozen 2026-08-10. Owner ratified legs **(a)+(b)+(c)** the same day. Leg (b)
> widens a ratified surface (KNOW-11 / scrubber scope) and is called out for that reason below.
> **Search-before-freeze:** the current provenance carriers were re-measured against master `195c2d6`
> (not assumed from the 9-day-old finding); the corrections are recorded in §1.

## 0. The crux

Atlas content-addresses **everything it stores** (CAS, blake3, `id = hash(canonicalForm)`) — except the
one non-deterministic external input, the model's answer, which it treats as unaddressed text. A fact
that survives admission cannot be audited back to the exact bytes the model produced. The 2026-08-04
contamination incident (a broken shim delivered byte-spliced answers; the product admitted 200 facts and
reported `exit 0`) exposed the class: **a thing the system assumes and does not verify.**

## 1. Measured current state (corrects the original finding)

What an admitted mined fact records today (re-measured, `master 195c2d6`):
- **the claim** — the *trimmed* answer persists as `claimNorm` inside the fact's CAS bytes
  (`llm.ts:116` `out.trim()` → `mine-gate.ts:76` `claimNorm: seed.claim` → `admit-harness.ts:334`
  `buildAdvisory` → `mine.ts:290` `id(f)` into CAS). **Correction:** the original finding said the
  answer "never lands in CAS" — false. The claim body does. What is genuinely absent is below.
- **the prompt-template digest** — in the *run report* only (`mine-render.ts:118-120`), never on the fact.
- **anchor + subtreeHash** — inside the fact's `grounding` (CAS bytes), not a projection-row field.
- **derivedAt** — the freshness watermark; **not set on the mine path** (stamped only at publication).

What is genuinely absent, and is the whole of #195:
1. **No independent digest of the answer.** `claimNorm` is a *normalised* projection of the answer; the
   raw envelope (pre-trim bytes, any chain-of-thought, any framing) is dropped
   (`admit-harness.ts:311` "chain-of-thought is structurally absent"). Nothing hashes the exact bytes.
2. **No admission sanity gate on the answer** beyond non-empty. `execFileSync(..., encoding:'utf8')`
   silently maps invalid bytes to U+FFFD; a spliced/concatenated multi-answer flows straight to
   `claimNorm` (`llm.ts:116-117`, `:122-138` even salvages a claim from a *partially delivered* prompt).
3. **No content-addressed link** from the fact to the answer bytes.

## 2. The decided design — three legs (owner-ratified a+b+c, 2026-08-10)

The legs compose as a **pipeline at the answer boundary**, ordered so each later leg trusts the earlier:

```
raw stdout bytes  ──(c) SANITY GATE──►  scrub (KNOW-11)  ──(b) put→CAS──►  answerRef
                         │ fail                                │
                         ▼                                     ▼
                  grounded abstention                  (a) answerDigest = hash(stored bytes)
                  WhyNot('answer-malformed')                   │
                                                               ▼
                                                    fact carries {answerRef, answerDigest}
```

### (c) Admission sanity gate — `llm.ts`, at the answer boundary, BEFORE the answer becomes a claim
Three checks, all fail-closed to a **grounded abstention** (`WhyNot('answer-malformed', <reason>)`), never
a fabricated fact:
- **non-empty** — already present; keep.
- **valid UTF-8** — reject if the raw bytes are not valid UTF-8 (read the subprocess output as a Buffer
  and validate, rather than letting `encoding:'utf8'` mask corruption with U+FFFD).
- **single-response** — reject the splice/interleave class that the 2026-08-04 incident produced: more
  than one top-level response envelope (e.g. concatenated JSON objects / a repeated response delimiter /
  a byte-overlap signature). The exact predicate is specified in §4; it must **kill the incident's own
  fixture** (a mutation test using a spliced answer is a DoD item).

This closes the **coarse class** (empty, corrupt, spliced, truncated-to-empty) at the door.

### (a) Answer digest on the fact — tamper-evidence at rest
The fact carries `answerDigest = blake3(<the bytes actually stored in (b)>)`. It is **independent of
`claimNorm`** (which is trimmed/normalised) and makes the stored answer self-verifying: any later
mutation of the stored answer is detectable. Always-on, cheap.

### (b) Answer → CAS — real traceability (THE RATIFIED LEG)
The answer bytes go to CAS via the store's `put()` and the fact carries `answerRef = <cas id>`. This is
the leg that makes a fact auditable back to what produced it.
- **Privacy / KNOW-11 (why this needed ratification):** the answer may contain a secret. It is scrubbed
  **before** `put()`, exactly as every other write into the objects map must be (fitness function #121).
  This adds a **new call site** to the scrubber's surface; the scrubber-coverage fitness function must be
  extended to cover it (a DoD item, not an assumption).
- **Storage cost:** accepted by the owner as the price of real provenance.

### The one design tension, resolved
Legs (a) and (b) could disagree: a digest over *raw* bytes will not match a *scrubbed* stored copy.
**Resolution:** `answerDigest` is taken over the **exact bytes stored by (b)** (post-scrub), so
`answerDigest == hash(answerRef's content)` is an invariant a gate can check. The **raw pre-scrub bytes
are not retained** — the sanity gate (c) is what inspects the raw answer at the boundary, before scrub,
so corruption is caught in transit; (a)+(b) then guarantee integrity of what is kept. This keeps the
scrubber the sole authority over what persists, with no un-scrubbed raw copy anywhere.

## 3. Interaction with #209 (the ledger must witness the transcript)
Once answers are stored and digested, the run report can carry a **count / digest over the stored
`answerRef`s of admitted facts** — so *issued* (`modelCalls`) vs *stored* becomes verifiable in the
artifact, not only in a probe. This is exactly the witness #209 asks for; **#209 consumes #195(b)**.
Sequencing: #195(b) lands the stored answers, then #209 makes the report digest them.

## 4. Shapes (frozen)
- `WhyNot` reason gains `'answer-malformed'` with a sub-reason `'empty' | 'not-utf8' | 'multi-response'`.
- The fact / `CurrentNode` shape gains `readonly answerRef?: string` (CAS id) and
  `readonly answerDigest?: string` (blake3 over the stored answer). **Optional** for additive tolerance
  (facts authored by non-mine paths, e.g. human `atlas emit`, carry neither).
- The single-response predicate: **specified at build time from the incident fixture**, not guessed here;
  its only frozen requirement is that it REJECTS the 2026-08-04 splice fixture and ADMITS a normal single
  answer (both are DoD tests).

## 5. Godfile / blast radius
- `upsert.ts` is at **397/400**; adding `answerRef`/`answerDigest` to the row shape forces a split (mirror
  the prior `router.ts`→`upsert.ts` and `mine-proposer`/`mine-gate`/`mine-render` extractions).
- `llm.ts` is at **165/400** — the sanity gate + capture + scrub-and-put land here with room.
- `mine.ts` is at **399/400** — any new wiring forces a split.
- The sole production reader of a fact's provenance is the read/pack surface; new optional fields are
  additive (no exhaustive switch ranges over them). tsc + full suite + gates are the reachability proof.

## 6. Ratification (GAP-2 rite)
- **(a)+(b)+(c) owner-ratified 2026-08-10** (this is the record).
- Leg **(b)** touches **KNOW-11 / the scrubber surface** — the scrubber-coverage fitness function (#121)
  must be extended to the new `put()` call site as a **mandatory DoD item**, and **billy** cold-reviews the
  door (a secret reaching CAS unscrubbed is the exact failure this leg must not introduce).
- **lucy** cold-reviews each WP; one-fix-round. Gates (layer/godfile≤400/spec-conformance/id-integrity/
  reference-model) on every WP.
