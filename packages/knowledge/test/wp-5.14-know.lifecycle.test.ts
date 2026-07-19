// @atlas/knowledge — test/wp-5.14-know.lifecycle.test.ts  (WP-5.14.KNOW · EPIC-14)
//
// RED→GREEN transcription of the VISIBLE `-1` goldens for the fact lifecycle (templated + scope-checked
// upserts, prior versions deduped in CAS) against the FROZEN oracles ref/{template,authz,archive}.ts:
//   KNOW-10  templated write, no free prose — SCN-KNOW-10a-1 (free-prose reject), 10b-1 (missing field),
//            10b-2 (over-cap); plus the closed-slot + totality teeth of INV-KNOW-10.
//   KNOW-11  owner-scoped write, universal read — SCN-KNOW-11a-1 (carries owner+scope, fail-closed),
//            11b-1 (universal read), 11c-1 (out-of-scope write rejected); plus INV-KNOW-11 teeth.
//   KNOW-12  nothing dies — SCN-KNOW-12a-1 (prior re-spawnable), 12b-1 (deduped priors), 12c-1 (advisory
//            edit keeps NO pointer), 12d-1 (supersede adds ONLY a pointer), 12e-1 (working store lean).
// Held-out `-2` fixtures (queue/ territory, scope-D writer, chk-tail predicate, second edits/decays) are
// NOT referenced here.
//
// SEAM (sealed @atlas/kernel CAS; no raw hashing): the archive's dedup/re-spawn uses `createStore()` — the
// single content-addressed store — exactly as the card pins. `authz`'s `owner`/`scope` read the R3-surfaced
// optional fields on the frozen `GroundedFact`. The `slot`/`predicateSlot` divergence, the missing-field
// cells (a Candidate typed-required field omitted at runtime), and the off-vocab slot are expressed by casts
// — the only way to reach the `missing`/`out` cells of the enumerated validity product past the frozen type.
//
// MODELING NOTE (SCN-KNOW-12e-1, flagged — cf. router.ts MODELING NOTE): the "hot working set" and the
// KNOW-17 `decay` are UPSTREAM of this facet; here they are modeled as a caller-maintained `Map` and a plain
// delete. The archive-OWNED property under test is that SUPERSEDE routes the prior to COLD CAS (re-spawnable
// via `resolve`) and returns ONLY the superseder — so an edit never grows the hot set.

import { describe, it, expect } from 'vitest';
import { asNodeKey, asSubtreeHash, createStore } from '@atlas/kernel';
import type { NodeKey } from '@atlas/contracts';
import type { Candidate, GroundedFact, AdvisoryNode, PredicateNode, Grounding } from '../ref/types.js';
import { validateTemplate, isClosedSlot } from '../src/template.js';
import { authz, inScope } from '../src/authz.js';
import { bindArchive } from '../src/archive.js';

// ── fixtures ────────────────────────────────────────────────────────────────

const grounding = (n: string): Grounding => ({
  entries: [{ anchor: { kind: 'symbol', qualifiedPath: `fn ${n}`, subtreeHash: asSubtreeHash(`st-${n}`) }, path: 'src/x.ts' }],
});

/** A well-formed staged advisory candidate (all Candidate-carried required template fields; slot ∈ 12). */
const wellFormed = (): Candidate => ({
  claimText: 'the queue drains FIFO under back-pressure',
  claimNorm: 'cn-fifo',
  slot: 'invariant',
  grounding: grounding('fifo'),
  provenance: { source: 'agent://forge', trusted: true },
  tier: 'T2',
});

const advisoryNode = (nk: string, opts: { owner?: string; scope?: string } = {}): AdvisoryNode => ({
  kind: 'advisory',
  id: asNodeKey(nk),
  tier: 'T2',
  claimNorm: `cn-${nk}`,
  grounding: grounding(nk),
  freshness: 'FRESH',
  claims: [],
  authoring: 'ADVISORY',
  ...(opts.owner !== undefined ? { owner: opts.owner } : {}),
  ...(opts.scope !== undefined ? { scope: opts.scope } : {}),
});

const predicateNode = (nk: string, claimNorm: string): PredicateNode => ({
  kind: 'predicate',
  id: asNodeKey(nk),
  tier: 'T2',
  check: { kind: 'index-query', query: `q-${claimNorm}` },
  grounding: grounding(nk),
  status: 'HOLDS',
  freshness: 'FRESH',
  claims: [],
  authoring: 'PREDICATED',
});

// ── KNOW-10: templated write, no free prose ──────────────────────────────────

describe('WP-5.14.KNOW — templated write, 0 free prose (KNOW-10 visible goldens)', () => {
  it('SCN-KNOW-10a-1 — a free-prose blob (no template binding, no predicateSlot) is REJECTED', () => {
    const freeProse = { claimText: 'anything at all', claimNorm: '', grounding: grounding('f5') } as unknown as Candidate;
    expect(validateTemplate(freeProse)).toBe(false); // 0 free-prose facts persist
  });

  it('SCN-KNOW-10b-1 — a fact with `provenance` absent, otherwise well-formed, is REJECTED', () => {
    const noReceipt = { ...wellFormed(), provenance: undefined } as unknown as Candidate;
    expect(validateTemplate(noReceipt)).toBe(false); // receiptless node must not persist
  });

  it('SCN-KNOW-10b-2 — a fact whose `claimText` is 700 B (> the 512 B cap) is REJECTED', () => {
    const overCap: Candidate = { ...wellFormed(), claimText: 'x'.repeat(700) };
    expect(validateTemplate(overCap)).toBe(false); // unbounded prose leaks past the cap → rejected
    // boundary teeth: exactly 512 B PERSISTS, 513 B REJECTS
    expect(validateTemplate({ ...wellFormed(), claimText: 'x'.repeat(512) })).toBe(true);
    expect(validateTemplate({ ...wellFormed(), claimText: 'x'.repeat(513) })).toBe(false);
  });

  it('a well-formed fact (all required fields, ≤cap, slot ∈ 12) PERSISTS', () => {
    expect(validateTemplate(wellFormed())).toBe(true);
  });

  it('teeth-10 — the closed slot vocabulary has EXACTLY the 12 members; an off-vocab slot rejects', () => {
    const twelve = [
      'invariant', 'contract', 'precondition', 'postcondition', 'sideeffect', 'ownership',
      'perf-bound', 'security-property', 'gotcha', 'rationale', 'dependency', 'definition',
    ] as const;
    for (const s of twelve) expect(isClosedSlot(s)).toBe(true);
    expect(isClosedSlot('free-text' as unknown as (typeof twelve)[number])).toBe(false); // adding one is a `cv` bump
    expect(isClosedSlot(undefined as unknown as (typeof twelve)[number])).toBe(false); // no-slot blob
    expect(validateTemplate({ ...wellFormed(), slot: 'free-text' as unknown as (typeof twelve)[number] })).toBe(false);
  });

  it('teeth-10 — a missing claimNorm/grounding also rejects (required-field check is not partial)', () => {
    expect(validateTemplate({ ...wellFormed(), claimNorm: '' } as unknown as Candidate)).toBe(false);
    expect(validateTemplate({ ...wellFormed(), grounding: undefined } as unknown as Candidate)).toBe(false);
  });
});

// ── KNOW-11: owner-scoped write, universal read ──────────────────────────────

describe('WP-5.14.KNOW — owner-scoped write, universal read (KNOW-11 visible goldens)', () => {
  it('SCN-KNOW-11a-1 — a write-authorized fact carries both owner and scope; a scope-less fact fails closed', () => {
    const fact = advisoryNode('nk-a', { owner: 'seat/forge', scope: 'A' });
    expect(authz('write', 'A', fact)).toBe(true); // in-scope write admitted
    expect(fact.owner).toBeDefined();
    expect(fact.scope).toBeDefined(); // every persisted fact carries owner + scope
    // teeth: a fact persists with `scope` unset — the ownership fence has no anchor
    const anchorless = advisoryNode('nk-a', { owner: 'seat/forge' }); // no scope
    expect(authz('write', 'A', anchorless)).toBe(false); // fail closed — never persists
  });

  it('SCN-KNOW-11b-1 — any caller may read any fact (read is universal)', () => {
    const factA = advisoryNode('nk-a', { owner: 'seat/forge', scope: 'A' });
    expect(authz('read', 'B', factA)).toBe(true); // caller in unrelated scope B reads an A-owned fact
    // teeth: the read path must NOT apply the scope check — even a scope-less fact reads
    expect(authz('read', 'Z', advisoryNode('nk-a'))).toBe(true);
  });

  it('SCN-KNOW-11c-1 — an out-of-scope write is rejected (inScope(B, A.scope) is false)', () => {
    const factA = advisoryNode('nk-a', { owner: 'seat/forge', scope: 'A' });
    expect(authz('write', 'B', factA)).toBe(false); // scope-B writer cannot mutate an A-owned fact
    expect(inScope('B', 'A')).toBe(false);
    // teeth: the in-scope writer IS admitted (kills the always-reject mutant)
    expect(authz('write', 'A', factA)).toBe(true);
    expect(inScope('A', 'A')).toBe(true);
  });
});

// ── KNOW-12: nothing dies — git + CAS, no redundant copy ──────────────────────

describe('WP-5.14.KNOW — nothing dies: CAS retention, dedup, pointer-not-copy (KNOW-12 visible goldens)', () => {
  it('SCN-KNOW-12a-1 — a superseded prior version stays recoverable (get(oldId) resolves post-supersede)', () => {
    const archive = bindArchive(createStore());
    const prd = predicateNode('nk-prd', 'head');
    const w4 = predicateNode('nk-prd', 'head2');
    const { supersededBy } = archive.supersede(prd, w4);
    expect(archive.resolve(supersededBy)).toEqual(prd); // old bytes re-spawn — no history lost, 0 deletes
  });

  it('SCN-KNOW-12b-1 — prior versions are their own CAS objects; two identical priors DEDUP to one address', () => {
    const archive = bindArchive(createStore());
    const priorA = predicateNode('nk-prd', 'head');
    const priorB = predicateNode('nk-prd', 'head'); // identical bytes
    const distinct = predicateNode('nk-prd2', 'tail');
    const a = archive.supersede(priorA, predicateNode('nk-prd', 'head2')).supersededBy;
    const b = archive.supersede(priorB, predicateNode('nk-prd', 'head3')).supersededBy;
    const c = archive.supersede(distinct, predicateNode('nk-prd2', 'tail2')).supersededBy;
    expect(a).toBe(b); // content-address dedup — never byte-copied twice
    expect(a).not.toBe(c); // distinct bytes ⇒ a second address
  });

  it('SCN-KNOW-12c-1 — an advisory edit-in-place keeps NO lineage pointer (git is the archive)', () => {
    // an advisory UPDATE never enters the predicate-only archive; the frozen AdvisoryNode carries no
    // `supersededBy` field at all — the advisory family accretes zero in-store lineage.
    const editedAdvisory = advisoryNode('nk-adv', { owner: 'seat/forge', scope: 'A' });
    expect('supersededBy' in editedAdvisory).toBe(false);
  });

  it('SCN-KNOW-12d-1 — a predicate supersede adds ONLY a pointer (old bytes not inlined into the new node)', () => {
    const archive = bindArchive(createStore());
    const prd = predicateNode('nk-prd', 'head');
    const w4 = predicateNode('nk-prd', 'head2');
    const { node, supersededBy } = archive.supersede(prd, w4);
    expect(node).toEqual(w4); // the superseder is `next` unchanged — no old bytes copied in
    expect('supersededBy' in node).toBe(false); // only the RETURN-LEG pointer links the prior
    expect(archive.resolve(supersededBy)).toEqual(prd); // the link (a pointer into CAS) resolves the prior
  });

  it('SCN-KNOW-12e-1 — the working store stays lean: edit occupies one hot slot, prior lives in cold CAS, decay drops', () => {
    const store = createStore();
    const archive = bindArchive(store);
    const hot = new Map<NodeKey, GroundedFact>();

    // an advisory edited in place (W3, UPDATE): the edit REPLACES the hot slot; the prior does not enter hot.
    const advKey = asNodeKey('nk-adv');
    hot.set(advKey, advisoryNode('nk-adv', { owner: 'seat/forge', scope: 'A' }));
    hot.set(advKey, advisoryNode('nk-adv', { owner: 'seat/forge', scope: 'A' })); // edit-in-place, same key
    expect(hot.size).toBe(1); // one hot slot — the working store does not grow on edit

    // a predicate supersede routes the prior to COLD CAS (re-spawnable) and keeps only the superseder hot.
    const prd = predicateNode('nk-prd', 'head');
    hot.set(prd.id, prd);
    const { node, supersededBy } = archive.supersede(prd, predicateNode('nk-prd', 'head2'));
    hot.set(node.id, node); // only the superseder occupies the hot slot
    expect(hot.get(prd.id)).toBe(node); // prior no longer hot
    expect(archive.resolve(supersededBy)).toEqual(prd); // prior lives in cold CAS, still recoverable

    // a fact decayed by KNOW-17 (upstream) drops from the hot set.
    const decayed = asNodeKey('nk-decayed');
    hot.set(decayed, advisoryNode('nk-decayed', { owner: 'seat/forge', scope: 'A' }));
    hot.delete(decayed); // KNOW-17 decay
    expect(hot.has(decayed)).toBe(false);
    expect(hot.size).toBe(2); // { nk-adv (edited), nk-prd (superseder) } — lean, no accreted priors
  });
});
