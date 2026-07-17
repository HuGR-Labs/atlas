# Goldens — Block KRN (kernel) · S3 generate-from-method-tag

> **state:** S3 · **protocol:** [`goldens`](../../.claude/skills/goldens/SKILL.md) + [`completeness`](../../.claude/skills/completeness/SKILL.md) Gate-3 teeth ·
> **axiom:** S2 frozen (`method-tags-krn.md`; every INV method-tagged, `FSPEC-merge` exists for the core) ·
> **owner:** charlie (FORGE). This is the **KRN pilot** — it carries the one `formal` cluster in the Atlas.
>
> **Derivation (not hand-authored where a generator exists):**
> - **KERNEL-9 / 10 / 11** are `formal` and S2 did **NOT** escalate to TLC (the ladder stops at PBT step 1–2),
>   so their SCNs are **concrete witness instances of the semilattice/partial-order laws** in
>   [`fspec-merge.md`](../spec/fspec-merge.md) §escalation-ladder (commutative · associative · idempotent ·
>   convergence · no-drop · head-tiebreak · seq-invariant) — `gen: PBT`.
> - **KERNEL-1..8 / 12b / 12c** are `reference-model` → **conformance / differential** against the named
>   build-language mock (`kernel/ref/*.ts`, reused as the unit-test mock; anti-rot) — `gen: conformance`.
> - **KERNEL-12a** (self-install) has **no pure-function oracle** (method-tags-krn.md §INV-KERNEL-12): it is
>   the one genuine **residue** — a hand-written integration test delegated to PERSIST-11 — `gen: residue`.
>
> **Head-rule provenance note (load-bearing for teeth direction):** the authoritative model
> `fspec-merge.md` defines the forced single head as **`max-by-contentHash`** among the FRESH entries
> (§UP KERNEL-10 line 80; `head()` sort line 139 returns the largest). The illustrative "copy the *form*"
> examples in `S3.md` / `goldens/SKILL.md` show the *smaller* hash — those are shape templates, not the
> content oracle. **This block follows the model: head = MAX-by-contentHash.** The 10b teeth break on the
> min-flip accordingly. (Raised as a surprise in the completion card — worth a cold-review reconcile.)

Concrete event universe reused by the formal cluster (fields per `fspec-merge` §DOWN `Event`):

| ref | seq | nodeKey | contentHash | fresh | supersedes | id = blake3hex(canonical({…e, seq:0})) |
|---|---|---|---|---|---|---|
| e1 | 1 | `claim:acme-arr-2024` | `1c9f2a` | true | [] | `id-a7f0` |
| e2 | 2 | `claim:acme-arr-2024` | `7e40bb` | true | [] | `id-c3d1` |
| e3 | 3 | `claim:acme-hq`       | `3d81ee` | true | [] | `id-f009` |
| eX | 7 (writer A) | `claim:acme-headcount` | `aa1101` | true | [] | `id-9b21` |
| eY | 7 (writer B) | `claim:acme-runway`    | `bb2202` | true | [] | `id-7c44` |

(`1c9f2a` < `7e40bb` lexicographically ⇒ MAX-by-contentHash of {e1,e2} is e2.)

---

## REQ-KERNEL-1 — content-addressed object identity

### REQ-KERNEL-1a — content-addressed object identity   (happy)

### SCN-KERNEL-1a-1 — id is hash of the canonical preimage   (happy)
source: REQ-KERNEL-1a
Given the object `{"b":2,"a":1}` presented with its keys in the order `b,a`, and the CI test-vector corpus row whose expected id for this fact is `blake3hex(canonical({"a":1,"b":2}))` = `id-9f2c`
When the kernel computes the object's id (canonicalForm sorts keys → `{"a":1,"b":2}`, then `Encoder.hash`)
Then the id is `id-9f2c` — byte-identical to the corpus vector, regardless of the presented key order
teeth: breaks-on "canonicalizer skips the key-sort — the b,a-ordered preimage hashes to `id-1abd` ≠ the corpus vector"
gen: conformance   # differential vs `kernel/ref/canonical.ts` + the language-agnostic corpus

### REQ-KERNEL-1b — reject hand-rolled ids   (guard)

### SCN-KERNEL-1b-1 — caller-supplied id is rejected   (guard)
source: REQ-KERNEL-1b
Given a caller that calls `put(object={"a":1}, id="acme-fact-001")` where `"acme-fact-001"` ≠ `Encoder.hash(canonicalForm({"a":1}))` = `id-3e77`
When the kernel ingests the object
Then it returns a structured rejection (mismatched-id) and stores nothing under `"acme-fact-001"`
teeth: breaks-on "kernel trusts the caller's id and stores the object keyed by `acme-fact-001` (a hand-rolled key enters the CAS)"
gen: conformance

### REQ-KERNEL-1c — encoder divergence fails build   (guard)

### SCN-KERNEL-1c-1 — corpus divergence fails the build   (guard)
source: REQ-KERNEL-1c
Given a code encoder that emits `id-DIVERGE` for corpus row #12 while the reference canonicalizer emits `id-9f2c` (a real divergence — e.g. the code omits NFC normalization)
When the conformance test-vector corpus runs in CI
Then the build **fails** (non-zero exit) and no object is stored — the two-CAS-objects-for-one-fact fork is blocked
teeth: breaks-on "divergence is logged as a warning and the build stays green — two CAS objects silently stored for one fact"
gen: conformance

---

## REQ-KERNEL-2 — the encoder seam

### REQ-KERNEL-2a — hash only via seam   (happy)

### SCN-KERNEL-2a-1 — the hash function is reached only through the seam   (happy)
source: REQ-KERNEL-2a
Given the kernel wired so every id computation calls `@orchestra/kernel` encoder seam `Encoder.hash(bytes)`, with the reference `kernel/ref/encoder.ts` parametrized by the seam fn
When the module graph is audited (no direct `blake3`/`sha256` import outside the seam) and every id path is exercised
Then every id in the run was produced through the seam — 0 direct-digest call sites
teeth: breaks-on "a node-builder imports `blake3` directly and hashes off-seam (an id is produced bypassing `@orchestra/kernel`)"
gen: conformance

### REQ-KERNEL-2b — swap changes only digest bytes   (happy)

### SCN-KERNEL-2b-1 — swapping the digest changes only the digest bytes   (happy)
source: REQ-KERNEL-2b
Given the reference kernel run twice — once with the seam fn = BLAKE3, once with the seam fn = SHA-256 — over the identical contract-test suite
When every non-digest contract test (identity determinism, set-union, fold round-trip, export) runs under each encoder
Then every non-digest contract test passes under both; only the digest bytes (the id strings) differ
teeth: breaks-on "a contract other than the digest bytes depends on the encoder — swapping BLAKE3→SHA-256 breaks the fold-round-trip test"
gen: conformance

### REQ-KERNEL-2c — default encoder is BLAKE3   (happy)

### SCN-KERNEL-2c-1 — the unconfigured seam defaults to BLAKE3   (happy)
source: REQ-KERNEL-2c
Given a kernel constructed with no encoder override
When it hashes the byte string `"abc"`
Then the result equals `blake3hex(utf8("abc"))` = `id-b3ab` (not the SHA-256 digest)
teeth: breaks-on "the default seam resolves to SHA-256 — `hash('abc')` returns the sha256 digest"
gen: conformance

---

## REQ-KERNEL-3 — the single content-addressed store

### REQ-KERNEL-3a — single content-addressed store   (happy)

### SCN-KERNEL-3a-1 — all three object kinds key by hash in one CAS   (happy)
source: REQ-KERNEL-3a
Given one structural node `N`, one Knowledge fact `K`, one Memory entry `M`, each `put` into the CAS
When each is fetched by its own hash `Encoder.hash(canonicalForm(x))`
Then all three resolve from the single `Cas=Map<Hash,CasObject>` — `get(hash(N))=N`, `get(hash(K))=K`, `get(hash(M))=M`
teeth: breaks-on "Memory entries are keyed by an insertion counter, not their hash — `get(hash(M))` misses"
gen: conformance

### REQ-KERNEL-3b — no second store   (guard)

### SCN-KERNEL-3b-1 — exactly one store exists across all kinds   (guard)
source: REQ-KERNEL-3b
Given the reference store after ingesting a node, a Knowledge fact, and a Memory entry
When the store-count assertion runs (`store-count == 1`)
Then exactly one CAS map holds all three kinds — no second, non-content-addressed store
teeth: breaks-on "Memory entries are routed to a second non-CAS side-store — `store-count == 2`"
gen: conformance

---

## REQ-KERNEL-4 — the append-only event log

### REQ-KERNEL-4a — append-only event log   (happy)

### SCN-KERNEL-4a-1 — log length is monotone non-decreasing   (happy)
source: REQ-KERNEL-4a
Given an empty `EventLog` (insert-only `Map<Hash,Event>`)
When e1, then e2, then e3 are appended
Then `size` observes the strictly non-decreasing sequence 0→1→2→3; no prior event's bytes change
teeth: breaks-on "the log compacts/truncates in place — `size` drops from 3 to 2"
gen: conformance

### REQ-KERNEL-4b — reject in-place mutation or deletion   (guard)

### SCN-KERNEL-4b-1 — mutate/delete of an extant event is rejected   (guard)
source: REQ-KERNEL-4b
Given a log containing e1 (id `id-a7f0`)
When a caller attempts `mutate(id-a7f0, newPayload)` and then `delete(id-a7f0)`
Then both are rejected (a correction must be a **new** event); e1's bytes and the log `size` are unchanged
teeth: breaks-on "in-place mutate is accepted — e1's stored payload is overwritten under the same id"
gen: conformance

---

## REQ-KERNEL-5 — state rebuilt by fold

### REQ-KERNEL-5a — state rebuilt by fold   (happy)

### SCN-KERNEL-5a-1 — replay from empty rebuilds a byte-identical Atlas   (happy)
source: REQ-KERNEL-5a
Given an Atlas folded from the log {e1,e2,e3} with serialized `AtlasState` `A0`
When the log is exported, imported into a fresh empty store, and `fold` is replayed from empty
Then the rebuilt `AtlasState` serializes byte-identically to `A0`
teeth: breaks-on "fold seeds from a cached mutable snapshot — replay-from-empty omits e3's node and diverges from `A0`"
gen: conformance   # oracle = the reference `fold` (`kernel/ref/fold.ts`, shared with FSPEC-merge)

### REQ-KERNEL-5b — no mutable snapshot dependency   (happy)

### SCN-KERNEL-5b-1 — no capability reads a mutable in-place snapshot   (happy)
source: REQ-KERNEL-5b
Given the Atlas serving a query with its in-memory snapshot discarded (forcing a pure replay `fold(EventLog)`)
When the query is answered before and after discarding the snapshot
Then both answers are identical — every capability derives from the fold, none from a mutable snapshot
teeth: breaks-on "a capability reads a stale mutable snapshot — the answer changes once the snapshot is dropped and rebuilt"
gen: conformance

---

## REQ-KERNEL-6 — portable open-JSON export

### REQ-KERNEL-6a — portable open-JSON export   (happy)

### SCN-KERNEL-6a-1 — export→import round-trips 1:1   (happy)
source: REQ-KERNEL-6a
Given a CAS holding {N, K, M}
When `import(export(cas))` is computed
Then `deepEqual(cas, import(export(cas)))` holds — the open-JSON dump replays 1:1 into a fresh store
teeth: breaks-on "export omits the version map — `import(export(cas))` loses M and ≠ `cas`"
gen: conformance   # oracle = `kernel/ref/portable.ts`

### REQ-KERNEL-6b — export self-contained   (happy)

### SCN-KERNEL-6b-1 — export carries no host/external/proprietary reference   (happy)
source: REQ-KERNEL-6b
Given the open-JSON export dump of the CAS
When the dump is scanned for host paths, external references, and proprietary encodings
Then the scan finds 0 of each — the dump is self-contained and host-independent
teeth: breaks-on "export embeds an absolute host path `/Users/…/atlas.db` — the dump no longer replays on another machine"
gen: conformance

---

## REQ-KERNEL-7 — entry points pure and total

### REQ-KERNEL-7a — entry points pure and total   (happy)

### SCN-KERNEL-7a-1 — every entry point is total under fuzz   (happy)
source: REQ-KERNEL-7a
Given the total reference kernel and the production kernel run side-by-side over a PBT-fuzz stream of arbitrary + malformed inputs (10k cases, corner-biased)
When each entry point is invoked on each fuzzed input
Then every call returns a `Result` / honest empty — **0 exceptions thrown** — and prod matches ref
teeth: breaks-on "an entry point throws a `TypeError` on a deeply-nested but valid input (a non-total path)"
gen: conformance   # PBT-fuzz **differential** vs the total reference kernel (tag stays reference-model per method-tags-krn.md §K7)

### REQ-KERNEL-7b — malformed input never throws   (guard)

### SCN-KERNEL-7b-1 — malformed input yields a rejection, never an exception   (guard)
source: REQ-KERNEL-7b
Given the entry point `ingest` and a malformed input (a non-NFC string with a wrong-typed `seq: "two"`)
When `ingest` is called on it
Then it returns a structured rejection (malformed-input) — it does **not** throw
teeth: breaks-on "the malformed input propagates an uncaught exception instead of a structured rejection"
gen: conformance

---

## REQ-KERNEL-8 — the canonical preimage excludes side-indexes

### REQ-KERNEL-8a — preimage excludes side-indexes   (happy)

### SCN-KERNEL-8a-1 — grounding/status/freshness are outside the preimage   (happy)
source: REQ-KERNEL-8a
Given an object with `grounding`, `status`, and `freshness` fields populated
When `canonicalForm(object)` is computed
Then the preimage omits all three — `canonicalForm` contains no `grounding`/`status`/`freshness` bytes
teeth: breaks-on "`canonicalForm` includes `freshness` — the object re-keys the moment freshness is recomputed"
gen: conformance   # shares the K1 canonicalizer mock `kernel/ref/canonical.ts`

### REQ-KERNEL-8b — recompute never re-keys   (guard)

### SCN-KERNEL-8b-1 — perturbing the side-indexes leaves the Hash invariant   (guard)
source: REQ-KERNEL-8b
Given an object whose id is `id-5c8a`
When `grounding`, `status`, and `freshness` are each recomputed to new values and the id is recomputed
Then the id is still `id-5c8a` — recomputing the side-indexes perturbs no key
teeth: breaks-on "`status` leaks into the preimage — recomputing status changes the id to `id-5c8b` (a re-key)"
gen: conformance

---

## REQ-KERNEL-9 — idempotent content-keyed set-union log (FSPEC-merge · formal → PBT)

### REQ-KERNEL-9a — event identity is content   (happy)

### SCN-KERNEL-9a-1 — event id = hash(canonicalForm), seq excluded   (happy)
source: REQ-KERNEL-9a
Given e1 and a second event e1' identical to e1 in every field **except** `seq` (e1.seq=1, e1'.seq=99)
When each id is computed as `RefLog.id(e)=blake3hex(canonical({…e, seq:0}))`
Then `id(e1) = id(e1') = id-a7f0` — identity is the content hash, invariant under seq
teeth: breaks-on "id is assigned from a monotonic counter (or the preimage includes `seq`) — e1 and e1' get distinct ids and re-append stops being idempotent"
gen: PBT   # witness of the identity/seq-invariant law (fspec §laws seq-invariant; `RefLog.id`)

### REQ-KERNEL-9b — idempotent append   (happy)

### SCN-KERNEL-9b-1 — re-appending an existing event is a no-op   (happy)
source: REQ-KERNEL-9b
Given a log `L = append(∅, e1)` with `size = 1`
When e1 is appended a second time — `append(append(L,e1), e1)`
Then `size` is still 1 and the log equals `append(L,e1)` (idempotence: `append∘append ≡ append`)
teeth: breaks-on "append inserts unconditionally (no id-membership check) — the second append duplicates e1 and `size` becomes 2"
gen: PBT   # witness of the idempotence law `append(append(L,e),e) ≡ append(L,e)`

### REQ-KERNEL-9c — logs merge by set-union   (happy)

### SCN-KERNEL-9c-1 — two logs combine by set-union on the id   (happy)
source: REQ-KERNEL-9c
Given `A = {e1, e2}` and `B = {e2, e3}` (e2 shared by id `id-c3d1`)
When `RefLog.merge(A, B)` is computed
Then the result is exactly `{e1, e2, e3}` (`size = 3`) — e2 deduped by id, nothing dropped or duplicated
teeth: breaks-on "merge concatenates the version maps — e2 appears twice (`size = 4`); or merge keeps the max-seq log and drops e1"
gen: PBT   # witness of `merge = set-union on the id` (fspec `RefLog.merge`)

### REQ-KERNEL-9d — seq is never an identity or merge key   (guard)

### SCN-KERNEL-9d-1 — reseq leaves the keyset and the fold unchanged   (guard)
source: REQ-KERNEL-9d
Given the log `L = {e1(seq1), e2(seq2), e3(seq3)}` with keyset `{id-a7f0, id-c3d1, id-f009}` and fold `F`
When every event's `seq` is relabelled — `reseq(L, e ↦ 100−e.seq)` — and ids + fold are recomputed
Then `keyset(reseq(L)) = keyset(L)` and `fold(reseq(L)) = F` — `seq` is neither an object key nor a merge discriminator
teeth: breaks-on "`seq` is folded into the identity/merge key — after reseq the keyset changes to fresh ids and the fold diverges"
gen: PBT   # witness of the seq-invariant law `keyset(reseq)≡keyset ∧ fold(reseq)≡fold` (`RefLog.reseq`)

### REQ-KERNEL-9e — colliding seq never collides identity   (guard)

### SCN-KERNEL-9e-1 — two writers, same seq, distinct identity   (guard)
source: REQ-KERNEL-9e
Given writer A emits eX (`seq=7`, contentHash `aa1101`) and writer B independently emits eY (`seq=7`, contentHash `bb2202`) — a real cross-writer `seq` collision
When both are appended to one log
Then `id(eX)=id-9b21 ≠ id(eY)=id-7c44` and both are retained (`size = 2`) — the shared `seq=7` collides no identity
teeth: breaks-on "`seq` is used as the object key — the two `seq=7` events collide to one slot and the log collapses to `size = 1` (an event is lost)"
gen: PBT   # interesting witness: a genuine 2-writer seq collision (not an empty log)

---

## REQ-KERNEL-10 — deterministic order-independent nodeKey union (FSPEC-merge · formal → PBT)

### REQ-KERNEL-10a — collision resolves by set-union   (happy)

### SCN-KERNEL-10a-1 — two events on one nodeKey union into one node   (happy)
source: REQ-KERNEL-10a
Given e1 (`contentHash 1c9f2a`) and e2 (`contentHash 7e40bb`) both folding onto nodeKey `claim:acme-arr-2024`
When the node is merged in order [e1,e2] and, separately, in order [e2,e1]
Then both yield the **same** node whose `entries` = `{1c9f2a, 7e40bb}` (`|entries| = 2`) — order-independent set-union, 0 dropped
teeth: breaks-on "`mergeNode` overwrites on collision (last-writer-wins) — the node keeps only one entry and the two orders disagree"
gen: PBT   # witness of commutative + no-drop `mergeNode` (fspec §laws commutative, no-drop)

### REQ-KERNEL-10b — forced head tie-break by contentHash   (guard)

### SCN-KERNEL-10b-1 — unordered fresh heads → max-contentHash wins   (guard)
source: REQ-KERNEL-10b
Given nodeKey `claim:acme-arr-2024` with two FRESH heads e1 (`1c9f2a`) and e2 (`7e40bb`), neither superseding the other (unordered in the supersedes DAG)
When a single current head is forced — `head(node)`
Then the head is **e2** (`7e40bb`), the **max-by-contentHash** among the fresh entries — `contentHash` alone, never `seq`/clock/LLM
teeth: breaks-on "the tie-break is mutated to **min-by-contentHash** (or to lowest `seq`) — head flips to e1 (`1c9f2a`)"
gen: PBT   # witness of the head-tiebreak law (fspec §UP K10 line 80 + `head()` line 139: MAX-by-contentHash)

### REQ-KERNEL-10c — collision path lossless and deterministic   (guard)

### SCN-KERNEL-10c-1 — no collision path drops an event, reads a clock, or calls an LLM   (guard)
source: REQ-KERNEL-10c
Given the nodeKey `claim:acme-arr-2024` collision {e1, e2}, folded twice under **different wall-clock times and different seq assignments**
When each fold resolves the collision and picks the head
Then both entries are retained every time (`|entries| = 2`, `≥ max(|x|,|y|)`) and the head is identically e2 in both runs — the result is invariant under clock and seq, and no LLM is consulted
teeth: breaks-on "the tie-break reads the wall-clock (picks the later-arriving event) — the head flips between the two runs (nondeterministic); or the collision path drops the lower-contentHash entry"
gen: PBT   # witness of no-drop + head-invariance-under-reclock (fspec §UP K10: never seq/clock/LLM)

---

## REQ-KERNEL-11 — convergent commutative fold (FSPEC-merge · formal → PBT)

### REQ-KERNEL-11 — convergent commutative fold   (happy)

### SCN-KERNEL-11-1 — permutation, re-batching, and branch-union all fold byte-identically   (happy)
source: REQ-KERNEL-11
Given the event set `S = {e1, e2, e3}` (two nodeKeys: `claim:acme-arr-2024`←{e1,e2}, `claim:acme-hq`←{e3})
When `S` is folded three ways, each **reversing the order of the colliding `e1`/`e2` pair** — (i) `fold([e1,e2,e3])`, (ii) `fold([e2,e1,e3])` (e2 before e1), (iii) `fold(RefLog.merge({e2,e3},{e1}))` (re-batched branch-union of the **same** set, delivering e1 last)
Then all three `AtlasState`s serialize (KERNEL-1 canonicalizer, sorted keys) to the **same bytes** — the `acme-arr-2024` node is the union `{e1,e2}` with head = `max-by-contentHash(e1,e2)` in every ordering — `fold(π(S)) = fold(S)` for every set-preserving `π`
teeth: breaks-on "`mergeNode` overwrites instead of unions (last-writer-wins) — under the reversed order (ii)/(iii) the `arr` node resolves to `e1` while (i) resolves to `e2`, so the folds diverge byte-wise"
gen: PBT   # witness of the convergence + associativity laws `fold(shuffle(S)) ≡ fold(S)` (fspec §laws convergence)

---

## REQ-KERNEL-12 — the git log seam (self-install · safe-degrade · JSONL)

### REQ-KERNEL-12a — merge driver self-installing   (happy)

### SCN-KERNEL-12a-1 — a fresh clone re-registers the merge driver with no manual step   (happy)
source: REQ-KERNEL-12a
Given a fresh `git clone` of an Atlas repo (the merge driver lives in `.git/config`, which does not clone)
When the repo setup hook / `git config` bootstrap runs
Then `git config merge.orchestra-atlas.driver` is registered **and** `.gitattributes` carries `<atlas-log> merge=orchestra-atlas` — with no manual step
teeth: breaks-on "the driver requires a manual `git config` invocation — a fresh clone leaves `merge.orchestra-atlas` unregistered and falls back to text merge unannounced"
gen: residue   # no pure-function oracle — hand-written integration test, delegated to PERSIST-11 (method-tags-krn.md §K12)

### REQ-KERNEL-12b — text merge never corrupts set   (guard)

### SCN-KERNEL-12b-1 — a plain git line-merge degrades to a lossless id-union   (guard)
source: REQ-KERNEL-12b
Given branch `ours` JSONL log `[line(e1), line(e2)]` and branch `theirs` `[line(e2), line(e3)]` (each line one content-keyed event), merged by git's **default text/line** merge with the driver bypassed
When the merged file is re-folded — `fold(lineMerge(ours,theirs))`
Then no event's bytes are spliced into another; `lineMerge` = `dedup-by-id(lines(ours) ∪ lines(theirs))`, and `re-fold(lineMerge) ≡ fold(RefLog.merge)` (worst case a harmless duplicate line the fold dedups by id)
teeth: breaks-on "the log is stored as a single blob/array line — the 3-way text merge splices e1 and e3 into one corrupt line and `fold` fails to parse (an event is lost/corrupted)"
gen: conformance   # `lineMerge` reuses the FSPEC-merge `RefLog.merge` reducer as its mock (anti-rot floor)

### REQ-KERNEL-12c — log is content-keyed JSONL   (happy)

### SCN-KERNEL-12c-1 — the log path is append-only, one content-keyed event per line   (happy)
source: REQ-KERNEL-12c
Given the on-disk log of {e1, e2, e3}
When the file is inspected
Then it is exactly three lines — one JSON event per line, append-only — and each line `L` satisfies `RefLog.id(parse(L)) == parse(L).id` (the line is content-keyed)
teeth: breaks-on "the log is serialized as a single nested JSON array (not one-event-per-line JSONL) — a git line-merge can no longer union it cleanly and corrupts the set"
gen: conformance

---

## Coverage ledger (S3 completeness facet)

- **REQ coverage:** 30/30 REQ have ≥1 SCN.
- **Guard coverage:** 11/11 unwanted/If-then REQ have a guard SCN — 1b, 1c, 3b, 4b, 7b, 8b, 9d, 9e, 10b, 10c, 12b.
- **Teeth (Gate 3):** 30/30 SCN name the exact mutant of their REQ they flip to BROKEN on; none vacuous; the formal-cluster witnesses are interesting (a real 2-writer `seq` collision for 9e, a real 2-event `nodeKey` collision for 10a/10b/10c, a genuine shuffle+branch-union for 11 — no antecedent-failure passes).
- **gen histogram:** PBT 9 (9a/9b/9c/9d/9e/10a/10b/10c/11) · conformance 20 (1a/1b/1c/2a/2b/2c/3a/3b/4a/4b/5a/5b/6a/6b/7a/7b/8a/8b/12b/12c) · residue 1 (12a).
