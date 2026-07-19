// @atlas/e2e — S5 · Write governance: authorization + the human-in-the-loop T0 bar
// AXIS: SECURITY (who may write, what auto-promotes, what fast-paths — every path fail-closed).
//
// STORY. Before a fact ever lands, Atlas must decide WHO may write it and WHETHER a human must sign.
// This story composes the REAL wired lifecycle of @atlas/knowledge (authz · tier · ratify · fastpath ·
// template · router/upsert · archive) over the SEALED @atlas/kernel CAS across the package seam, and
// proves the governance invariants cannot be tricked:
//   • an out-of-scope OR scope-less write is REFUSED (no ownership anchor ⇒ no write), reads are universal;
//   • the $0-LLM classifier NEVER auto-promotes a node to T0 — a keyword only FLAGS a candidate;
//   • a T0 node is NEVER auto-ratified — it takes the billy/human token, never an explorer, never empty;
//   • ONLY a grounded ∧ lowRisk ∧ T2 ∧ advisory ∧ ¬contested candidate fast-paths to auto-accept;
//   • an oversized / malformed / free-prose fact never passes template validation;
//   • every write routes to an upsert cell (DEDUP/CREATE/UPDATE/SUPERSEDE) — never a silent REJECT/loss —
//     and a predicate supersede is a dedup POINTER into CAS (0 byte-copy, 0 delete).
//
// HONESTY / PARK BOUNDARY (stated, not glossed). The frozen composed-store FRONT DOOR
// `RouterApi.writeDecision(candidate, cfg)` is an OWNER-DEFINE seam: it needs the OWNER-DEFINE composed
// store (knowledge/ref/store.ts — "NO concrete signature frozen") + WP-5.13-b's nodeKey VALUE, so it is
// DEFERRED (PARK), deliberately NOT wired in src — NOT a gap glossed here. The runtime routes AROUND it
// via `routeWrite(RouteInputs)` + `upsert(store, req)` over ALREADY-RESOLVED identity. This story
// exercises that routed-around path and asserts, with teeth, that `writeDecision` has NO runtime binding
// (it must NOT be called expecting it to work) while `routeWrite`/`upsert` ARE wired — the PARK is real.
//
// INJECTED PORT (legitimate seam): the archive's SUPERSEDE defers its dedup/re-spawn to the CAS —
// `bindArchive(StoreApi)` is wired to the REAL sealed @atlas/kernel `createStore()` (the truest double),
// so the pointer-not-copy assertion has real teeth. All other oracles are the concrete exports, not fakes.

import { describe, it, expect } from 'vitest';
import * as knowledge from '@atlas/knowledge';
import {
  authz, inScope,
  classify, isT0Candidate,
  stage, ratify,
  route, isGrounded, isAdvisory,
  validateTemplate,
  routeWrite, upsert, emptyStore, currentNodes,
  bindArchive,
} from '@atlas/knowledge';
import type {
  Candidate, AdvisoryNode, PredicateNode, TerritoryView, Check,
} from '@atlas/knowledge';
import type { RouteInputs, WriteRequest, StoreProjection, NodeFamily } from '@atlas/knowledge';
import { asNodeKey, asSubtreeHash, createStore } from '@atlas/kernel';
import type { Tier } from '@atlas/contracts';
import type { Grounding } from '@atlas/grounding';

// ── fixtures (mirrored from the proven WP-5.13/5.14/5.15 test shapes — not re-derived) ───────────────
const grounding = (n: string): Grounding => ({
  entries: [{ anchor: { kind: 'symbol', qualifiedPath: `fn ${n}`, subtreeHash: asSubtreeHash(`st-${n}`) }, path: 'src/x.ts' }],
});
const UNGROUNDED: Grounding = { entries: [] }; // 0 entries — GROUND-2: never grounded

/** A persisted advisory fact, `owner`/`scope` R3-optional (the KNOW-11 ownership fence). */
const advisoryFact = (opts: { owner?: string; scope?: string } = {}): AdvisoryNode => ({
  kind: 'advisory',
  id: asNodeKey('fact:payments.charge'),
  tier: 'T2',
  claimNorm: 'cn-charge',
  grounding: grounding('charge'),
  freshness: 'FRESH',
  claims: [],
  authoring: 'ADVISORY',
  ...(opts.owner !== undefined ? { owner: opts.owner } : {}),
  ...(opts.scope !== undefined ? { scope: opts.scope } : {}),
});

const territory = (path: string): TerritoryView => ({
  path, owner: 'seat/forge', tier: 'T2', files: [`${path}mod.ts`], blastRadius: [],
});

const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  claimText: 'charge is idempotent per idempotency-key',
  claimNorm: 'cn-idem',
  slot: 'invariant',
  grounding: grounding('charge'),
  provenance: { source: 'agent:explorer', trusted: true },
  tier: 'T2',
  ...over,
});
const predicateCheck: Check = { kind: 'assertion', expr: 'balance >= 0' };

const predicateNode = (nk: string, q: string): PredicateNode => ({
  kind: 'predicate',
  id: asNodeKey(nk),
  tier: 'T2',
  check: { kind: 'index-query', query: `q-${q}` },
  grounding: grounding(nk),
  status: 'HOLDS',
  freshness: 'FRESH',
  claims: [],
  authoring: 'PREDICATED',
});

describe('S5 · write governance — authorization + the human-in-the-loop T0 bar (fail-closed)', () => {
  // ── 1. AUTHZ FAIL-CLOSED — owner-scoped write, universal read ──────────────────────────────────────
  it('refuses an out-of-scope OR scope-less write, admits the owner, and reads are universal', () => {
    const factInScope = advisoryFact({ owner: 'seat/forge', scope: 'payments' });
    const factOutOfScope = advisoryFact({ owner: 'seat/forge', scope: 'payments' });
    const scopeless = advisoryFact({ owner: 'seat/forge' }); // no scope ⇒ no ownership anchor

    expect(authz('write', 'payments', factInScope)).toBe(true); // the owner writes
    // teeth (breaks-on "an out-of-scope or scope-less write is authorized"):
    expect(authz('write', 'ui', factOutOfScope)).toBe(false); // a foreign scope cannot mutate
    expect(authz('write', 'payments', scopeless)).toBe(false); // fail-closed: absent scope ⇒ refuse
    expect(inScope('ui', 'payments')).toBe(false);
    expect(inScope('payments', undefined)).toBe(false); // scope-less has no anchor
    expect(inScope('payments', '')).toBe(false); // empty scope has no anchor

    // reads are universal — any caller, any (even absent) scope — and authz never throws.
    expect(authz('read', 'ui', factInScope)).toBe(true);
    expect(authz('read', 'anyone', scopeless)).toBe(true);
  });

  // ── 2. NO AUTO-PROMOTE TIER — classify only FLAGS, never assigns ───────────────────────────────────
  it('classifies every territory as T2 and a T0-ish path only sets the t0Candidate flag (never a promotion)', () => {
    const t0ish = classify(territory('payments/'));
    expect(t0ish.t0Candidate).toBe(true); // security-critical name is FLAGGED
    // teeth (breaks-on "classify auto-promotes a node to T0"):
    expect(t0ish.tier).toBe('T2'); // ...but the tier is NEVER written to T0 — human-ratified only
    expect(isT0Candidate('payments/charge.ts')).toBe(true);

    // the invariant `t0Candidate ⇒ tier == 'T2'` holds across the whole corpus.
    for (const p of ['auth/', 'secrets/', 'kms/', 'crypto/', 'queue/', 'src/util/']) {
      expect(classify(territory(p)).tier).toBe('T2');
    }
    expect(classify(territory('queue/')).t0Candidate).toBe(false); // a non-keyword path is not flagged
  });

  // ── 3. T0 NEVER AUTO-RATIFIES — billy/human token or nothing ───────────────────────────────────────
  it('never auto-ratifies a T0 node — it takes the billy token, never an explorer, never an empty token', () => {
    const t0Staged = stage(candidate({ tier: 'T0' as Tier }));
    expect(ratify(t0Staged, { by: 'billy' }).committed).toBe(true); // the human/security gate signs
    // teeth (breaks-on "a T0 node is auto-ratified without the human/billy gate"):
    expect(ratify(t0Staged, { by: 'someExplorer' })).toEqual({ committed: false }); // an explorer cannot sign T0
    expect(ratify(t0Staged, { by: '' })).toEqual({ committed: false }); // an empty token never commits

    // a non-T0 staged candidate still needs SOME ratifier token (propose ≠ ratify), and it is a
    // returned verdict — never a throw.
    expect(ratify(stage(candidate()), { by: 'lead' }).committed).toBe(true);
    expect(ratify(stage(candidate()), { by: '' }).committed).toBe(false);
    // the explorer's staged handle carries no commit — it cannot self-commit.
    expect('committed' in (stage(candidate()) as object)).toBe(false);
  });

  // ── 4. FASTPATH DISCIPLINE — only grounded ∧ lowRisk ∧ T2 ∧ advisory ∧ ¬contested auto-accepts ──────
  it('fast-paths ONLY a grounded low-risk T2 advisory candidate — risk/contest/T0/predicate route to full ratify', () => {
    const clean = candidate({ tier: 'T2' }); // grounded advisory, no check
    expect(isGrounded(clean.grounding)).toBe(true);
    expect(isAdvisory(clean)).toBe(true);
    expect(route(clean, { lowRisk: true, contested: false })).toBe('auto-accept');

    // teeth (breaks-on "a risky/contested/T0 candidate is fast-pathed to auto-accept"):
    expect(route(candidate({ tier: 'T0' as Tier }), { lowRisk: true, contested: false })).toBe('full-ratify'); // T0
    expect(route(clean, { lowRisk: true, contested: true })).toBe('full-ratify'); // reviewer veto / conflict
    expect(route(clean, { lowRisk: false, contested: false })).toBe('full-ratify'); // over the risk threshold
    expect(route(candidate({ check: predicateCheck }), { lowRisk: true, contested: false })).toBe('full-ratify'); // predicate
    expect(route(candidate({ grounding: UNGROUNDED }), { lowRisk: true, contested: false })).toBe('full-ratify'); // ungrounded
    expect(isGrounded(UNGROUNDED)).toBe(false);
  });

  // ── 5. TEMPLATE CAP — no free prose, ≤512 B, closed-12 slot ────────────────────────────────────────
  it('rejects an oversized / missing-field / out-of-vocab-slot fact and accepts a well-formed one', () => {
    expect(validateTemplate(candidate())).toBe(true); // well-formed ⇒ persists

    // teeth (breaks-on "an oversized/malformed fact passes template validation"):
    expect(validateTemplate({ ...candidate(), claimText: 'x'.repeat(513) })).toBe(false); // > 512 UTF-8 bytes
    expect(validateTemplate({ ...candidate(), claimText: 'x'.repeat(512) })).toBe(true); // exactly the cap persists
    expect(validateTemplate({ ...candidate(), provenance: undefined } as unknown as Candidate)).toBe(false); // missing required receipt
    expect(validateTemplate({ ...candidate(), claimNorm: '' } as unknown as Candidate)).toBe(false); // missing required field
    expect(validateTemplate({ ...candidate(), slot: 'free-text' as unknown as Candidate['slot'] })).toBe(false); // out-of-closed-slot
  });

  // ── 6a. EVERY WRITE AN UPSERT — DEDUP/CREATE/UPDATE/SUPERSEDE, never REJECT/throw ───────────────────
  it('routes every write to an upsert cell — never a silent REJECT/loss — leaving the inputs untouched', () => {
    // S0: an advisory @ nk-adv (bytes ch-a00) + a predicate @ nk-prd (check folded, bytes ch-p00).
    const seedS0 = (): StoreProjection => {
      let s = emptyStore();
      s = upsert(s, { nodeKey: 'nk-adv', contentHash: 'ch-a00', family: 'advisory', claimNorm: 'cn-eqbytes' }).store;
      s = upsert(s, { nodeKey: 'nk-prd', contentHash: 'ch-p00', family: 'predicate', claimNorm: 'cn-head' }).store;
      return s;
    };
    const stream: readonly WriteRequest[] = [
      { nodeKey: 'nk-adv', contentHash: 'ch-a00', family: 'advisory', claimNorm: 'cn-eqbytes' }, // byte-identical ⇒ DEDUP
      { nodeKey: 'nk-new', contentHash: 'ch-b11', family: 'advisory', claimNorm: 'cn-fresh' }, // new subject ⇒ CREATE
      { nodeKey: 'nk-adv', contentHash: 'ch-c22', family: 'advisory', claimNorm: 'cn-latency' }, // advisory hit ⇒ UPDATE
      { nodeKey: 'nk-prd', contentHash: 'ch-d33', family: 'predicate', claimNorm: 'cn-head2' }, // same check ⇒ SUPERSEDE
      { nodeKey: 'nk-prd2', contentHash: 'ch-e44', family: 'predicate', claimNorm: 'cn-tail' }, // diff check ⇒ CREATE
    ];

    const s0 = seedS0();
    const before = currentNodes(s0).length;
    let s = s0;
    const routes: string[] = [];
    for (const w of stream) {
      const r = upsert(s, w);
      routes.push(r.decision);
      s = r.store;
    }
    expect(routes).toEqual(['DEDUP', 'CREATE', 'UPDATE', 'SUPERSEDE', 'CREATE']);
    // teeth (breaks-on "a write is silently rejected/lost instead of routed as an upsert"):
    expect(routes).not.toContain('REJECT'); // admission (KNOW-2) is a separate door; the route never REJECTs
    expect(currentNodes(s0).length).toBe(before); // the seed projection is untouched (pure — no mutation)
    // nk-adv is still exactly ONE node after DEDUP+UPDATE — no append, no loss.
    expect(currentNodes(s).filter((n) => n.nodeKey === 'nk-adv')).toHaveLength(1);

    // the routing is TOTAL over the finite hash-state product — every cell lands in an upsert cell.
    const valid = new Set(['DEDUP', 'CREATE', 'UPDATE', 'SUPERSEDE']);
    for (const contentHashHit of [false, true])
      for (const nodeKeyHit of [false, true])
        for (const family of ['advisory', 'predicate'] as readonly NodeFamily[])
          for (const checkSame of [false, true]) {
            const inputs: RouteInputs = { contentHashHit, nodeKeyHit, family, checkSame };
            expect(valid.has(routeWrite(inputs))).toBe(true); // never REJECT, never a throw
          }
  });

  // ── 6b. SUPERSEDE IS A DEDUP POINTER — 0 byte-copy, 0 delete (injected real CAS) ────────────────────
  it('supersedes a predicate as a dedup CAS pointer, returning `next` unchanged (0 byte-copy, 0 delete)', () => {
    const archive = bindArchive(createStore()); // INJECTED PORT wired to the REAL sealed kernel CAS
    const prior = predicateNode('nk-prd', 'head');
    const next = predicateNode('nk-prd', 'head2');
    const { node, supersededBy } = archive.supersede(prior, next);

    expect(node).toBe(next); // the superseder is `next` UNCHANGED — old bytes never inlined
    expect('supersededBy' in node).toBe(false); // only the RETURN-LEG pointer links the prior
    // teeth (breaks-on "a write is silently rejected/lost instead of routed as an upsert"):
    expect(archive.resolve(supersededBy)).toEqual(prior); // prior lives in cold CAS, re-spawnable — nothing dies
    // content-address dedup: two identical priors collapse to ONE address (0 redundant byte-copy).
    const a = archive.supersede(predicateNode('nk-p', 'x'), predicateNode('nk-p', 'y')).supersededBy;
    const b = archive.supersede(predicateNode('nk-p', 'x'), predicateNode('nk-p', 'z')).supersededBy;
    expect(a).toBe(b);
  });

  // ── PARK boundary — the composed-store front-door is intentionally unbuilt (NOT a glossed gap) ──────
  it('PARK: the frozen writeDecision front-door has NO runtime binding — the runtime routes AROUND it', () => {
    // RouterApi.writeDecision(candidate,cfg) needs the OWNER-DEFINE composed store (knowledge/ref/store.ts:
    // "NO concrete signature frozen") + WP-5.13-b's nodeKey VALUE — DEFERRED (PARK), never invented. So it
    // must NOT be called expecting it to work: there is deliberately no runtime `writeDecision` export.
    expect('writeDecision' in knowledge).toBe(false);
    // ...while the routed-around path this story exercised IS wired:
    expect(typeof routeWrite).toBe('function');
    expect(typeof upsert).toBe('function');
  });
});
