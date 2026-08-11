// @atlas/cli — src/mine-decide.ts  (#195 · REQ-CLI-4d — the pure staging decision, split from mine.ts)
//
// EXTRACTED from `mine.ts` at the 400-LOC godfile ceiling along the cohesive boundary #195 forced: "how one
// batch of admitted facts becomes the next staging snapshot" — THE WHOLE PASS BODY AS ONE PURE DECISION over
// a staging snapshot, the shape `commitStaging` requires. The exact sibling of the mine-proposer / mine-gate /
// mine-render / mine-staging extractions. `mine.ts` keeps the run composition and CALLS this; `claimNormOf`
// and the decision were both file-internal to `mine.ts`, so nothing here is (or was) re-exported.
//
// #195 (b) LANDS HERE: a mined fact carries a content-addressed, tamper-evident receipt (`answerRef`, the CAS
// id) for the exact answer bytes the model returned. The receipt is built by `mine-answer.ts` (SCRUB → CAS
// object → CAS id, KNOW-11 order), and the answer's provenance NEVER enters the fact's identity: `rawAnswer`
// arrives as a
// transport field on the fact (attached in `mine-gate.ts`) and is STRIPPED here before `id(f)` / `nodeKey`,
// so a fact mined WITH a receipt has a byte-identical contentHash to one mined without.

import type { CommitDecision } from '@atlas/adapter-io';
import type { Fact } from '@atlas/genesis';
import { upsert as knowledgeUpsert, normalizeCheck, primaryAnchorId, nodeKey } from '@atlas/knowledge';
import type { WriteRequest, StoreProjection, Candidate as KnowledgeCandidate } from '@atlas/knowledge';
import { id } from '@atlas/kernel';
import { MINED_SCOPE, MINED_TIER } from './mine-staging.js';
import { answerReceipt } from './mine-answer.js';
import { scrubClaimNorm } from './mine-claim-scrub.js';

/** The advisory claim body a write carries (the KNOW-4c set-union element); a predicate carries its check. */
const claimNormOf = (f: Fact): string =>
  f.kind === 'advisory' ? f.claimNorm : f.kind === 'predicate' ? normalizeCheck(f.check) : '';

/**
 * THE WHOLE PASS BODY AS ONE PURE DECISION over a staging snapshot — the seam `commitStaging` requires. It used to be
 * `loadStaging() ?? emptyStore()` at pass start plus `persistStaging` per site: atomic (no torn read, no annihilation) but
 * UNCONDITIONAL, hence last-writer-wins BY DEFINITION — two concurrent passes rehydrate one snapshot, each compute a whole-Map
 * replacement, and the second publish erases the first's candidates while BOTH exit 0 reporting what they "seeded" (MEASURED at
 * 8 processes × 5 sites: 40 reported committed, 5 durable). `commitStaging` re-runs this from scratch on every lost compare-and-
 * swap — hence PURE: no writes (CAS objects ride out in `put`, ordered before publication), no clock, no random. ESTABLISHED is
 * recomputed per attempt via `grounded`: a key in THIS snapshot this pass did not itself write. A pass-start set computed once is
 * not re-runnable and missed a row a CONCURRENT pass staged after we started, which the old code then set-unioned into; the
 * exclusion is `grounded`/`minted`, not the running projection, so a pass can still make a SECOND claim about a symbol it wrote.
 *
 * `grounded` is passed in (the caller keeps it across settled commits) rather than closed over, which is the only change the
 * mine.ts→mine-decide.ts split imposed on the body — the decision stays a pure function of `(staged, incoming, grounded)`.
 */
/** A grounded row, WIDENED to optionally carry its own `answerRef` alongside it — additive, and read by
 *  exactly one caller: `mine.ts`'s `upsert` fold, which is also `ControllerDeps.answerReceipts`'s (#209) sole
 *  source (see the header there). `Fact` itself (genesis, frozen) is NOT touched; this is a CLI-local
 *  transport shape for the one hop between "this row minted with a receipt" and "the report counts it". */
export type MintedFact = Fact & { readonly answerRef?: string };

export function decideStaging(
  staged: StoreProjection,
  incoming: readonly Fact[],
  grounded: ReadonlyMap<string, Fact>,
): CommitDecision<Map<string, MintedFact>> {
  let projection = staged;
  const minted = new Map<string, MintedFact>(); // what THIS attempt would write; folded into `grounded` only on settle
  const puts: unknown[] = []; // the CAS bytes the protocol makes durable BEFORE publishing the rows naming them
  for (const raw of incoming) {
    // [#195 b] SEPARATE the answer-provenance transport field from the fact BEFORE anything hashes the fact:
    // `rawAnswer` (attached by mine-gate.ts) is a RECEIPT INPUT, never a part of identity. Stripped here, the
    // fact's contentHash and nodeKey are byte-identical to a fact mined without provenance.
    const { rawAnswer, ...factNoAnswer } = raw as Fact & { readonly rawAnswer?: string };
    // SCRUB THE CLAIM BEFORE ANYTHING HASHES OR STORES IT (KNOW-11, T0) — `claimNorm` is identity-bearing
    // (KNOW-4c) and becomes part of the fact object `id(f)` hashes into CAS, so it cannot be stripped like
    // `rawAnswer`; it must be scrubbed at source instead, same as the answer (`mine-answer.ts`). Advisory
    // only — see `mine-claim-scrub.ts` for why a predicate's `check` is a separate, unmeasured identity leg
    // left untouched here. This must run BEFORE `f` is built so `id(f)`/`nodeKey`/`claimNormOf` all see the
    // one (scrubbed) claim text — no raw copy survives anywhere downstream.
    const factScrubbed =
      factNoAnswer.kind === 'advisory' ? { ...factNoAnswer, claimNorm: scrubClaimNorm(factNoAnswer.claimNorm) } : factNoAnswer;
    // STAMP THE CANDIDATE SCOPE — PROVENANCE plus a fail-closed default (ADR-0008 kept it when the boundary
    // crossing was removed). A mined fact has no actor, so nobody owns it, and an unowned node is writable by
    // NOBODY until an admin appoints a curator. Stamped BEFORE the content hash so the bytes carry it — AND onto
    // the request below so the ROW does too.
    const f = { ...factScrubbed, scope: MINED_SCOPE } as Fact;
    // IDENTITY IS MINTED, NEVER TRUSTED — `nodeKey` is RECOMPUTED from the content by the frozen formula
    // (KNOW-15b), the SAME seam that mints contentHash/primaryAnchor; the payload's own `f.id` never routes, or
    // an author could spoof another node's identity (governed-emit.ts parity, WP-F3). Map `predicateSlot` →
    // `.slot` first: the cast is otherwise LOSSY (identity fns read `.slot`) and yields a slot-free key.
    const fSlot = f.kind === 'relation' || f.kind === 'negation' ? undefined : f.predicateSlot; // relation (D2)/negation (D3) have no slot
    const view = { ...f, slot: fSlot } as unknown as KnowledgeCandidate;
    const key = nodeKey(view) as unknown as string;
    // A MINED CANDIDATE NEVER RE-AUTHORS AN ESTABLISHED ONE — belt-and-braces since ADR-0008, load-bearing before
    // it: a mined key colliding with a governed node routed UPDATE and set-unioned into it, mutating a ratified
    // T0 fact from whatever text sat in a source file (prompt-injectable, reproduced). It STAYS — a set-union
    // between two candidates is just as unreviewable.
    if (staged.current.has(key) && !grounded.has(key) && !minted.has(key)) continue;
    // [#195 (b) SCRUB-THEN-CAS, KNOW-11] the answer is scrubbed BEFORE it becomes a CAS object (mine-answer.ts),
    // so a secret in the answer NEVER reaches CAS raw. `answerReceipt` yields the scrubbed CAS object (pushed to
    // `puts`, durable before the row naming it) plus its `answerRef` (the CAS id). Absent ⇒ a non-mine/human
    // write, which carries no receipt (additive tolerance).
    const receipt = rawAnswer !== undefined ? answerReceipt(rawAnswer) : undefined;
    const req: WriteRequest = {
      nodeKey: key,
      contentHash: id(f) as unknown as string,
      family: f.kind,
      claimNorm: claimNormOf(f),
      // ── ADJACENCY carrier (ADDITIVE) — primary anchor + R3-optional slot for a later sibling-adjacency
      //    scan (WP-B). NOT routed; `slot` stays ABSENT when omitted (exactOptionalPropertyTypes).
      primaryAnchor: primaryAnchorId(view) as unknown as string,
      ...(fSlot !== undefined ? { slot: fSlot } : {}),
      // ── GOVERNANCE carrier (ADR-0007) — from the MINED constants, never forwarded from the fact. Neither
      //    half is routed (`RouteInputs` reads neither), so no hash and no route moves; what changes is that
      //    the row now DECLARES what it is — what the ARCH-10 guard derives authority from.
      scope: MINED_SCOPE,
      tier: MINED_TIER,
      // ── ANSWER-PROVENANCE carrier (ADDITIVE — #195 b) — the CAS id of the scrubbed answer bytes. NOT routed
      //    (`RouteInputs` reads it not), so identity is unchanged; present ONLY when the model produced the claim.
      //    The CAS id is its OWN tamper-evidence (store.get re-hashes on read) — no separate digest field.
      ...(receipt !== undefined ? { answerRef: receipt.answerRef } : {}),
    };
    // BYTES BEFORE THE ROW, as the governed door does — here by handing them to the protocol, which puts them
    // before it publishes. A row naming a contentHash (or `answerRef`) absent from CAS is a node whose bytes can
    // never be read back, and the doors correctly refuse a node whose class they cannot read. The scrubbed answer
    // rides FIRST so it, too, is durable before the row that names it.
    if (receipt !== undefined) puts.push(receipt.obj);
    puts.push(f);
    projection = knowledgeUpsert(projection, req).store; // route the write-decision
    // [#209] the minted row carries its OWN answerRef alongside it (MintedFact) — the one additive field
    // `mine.ts`'s fold reads to build `ControllerDeps.answerReceipts()`. Absent when this row minted with no
    // receipt (a non-mine/human write, or #195 leg (b) not applicable) — fail-closed, never fabricated.
    minted.set(key, receipt !== undefined ? { ...f, answerRef: receipt.answerRef } : f);
  }
  // `next` is published even when nothing was minted, keeping the write cadence identical to the
  // `persistStaging`-per-site one it replaces — so a mutant seeding from `emptyStore()` still publishes that
  // empty store and is caught (SCN-CLI-4d's first case).
  return { out: minted, next: projection, put: puts };
}
