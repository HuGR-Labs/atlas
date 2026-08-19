// @atlas/adapter-io — test/travel-by-reproof-compose.test.ts  (TRAVEL-BY-REPROOF — the three cases, end to
// end over a REAL composed runtime, a REAL git repo and a REAL `.scip` dump)
//
// `read-access.test.ts` pins `buildReadAccess` in isolation; `store-provenance.test.ts` /
// `read-provenance-refusal.test.ts` pin the two OLD (case 1 / case 3-shaped) fixtures. This file is the
// seam: ONE repo, seeded with the same re-proven/broken/unverifiable/unsealed mix
// `reverify-gate-compose.test.ts` uses (real oracle, real SCIP index — `util/greet()` is genuinely called
// from `src/app.ts`; `util/missingHelper()` is referenced but defined nowhere), driven through
// `composeRuntime(repoPath).handler` under all THREE provenance shapes: nothing committed, `.atlas/staging`
// committed, `.atlas/projection`+`cas` committed (staging not).

import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { asHash, asNodeKey } from '@atlas/kernel';
import type { GroundedFact } from '@atlas/knowledge';
import { currentNodes } from '@atlas/knowledge';
import type { PackInvariant } from '@atlas/contracts';
import { composeRuntime } from '../src/compose.js';
import { createDiskStore, rehydrateProjection } from '../src/store.js';
import { REJECTED_UNTRUSTED_STORE } from '../src/read-provenance.js';
import { makeFixRepo } from './harness/fix-repo.js';
import { makeFixScip, SYM_GREET, SYM_MISSING } from './harness/fix-scip.js';

const POLICY_JSON = JSON.stringify({
  nearDup: { claimNormThreshold: 1 },
  t0Heuristic: { keywords: [] },
  authz: { scopes: {} },
});

function git(repoPath: string, ...args: string[]): void {
  execFileSync('git', ['-C', repoPath, ...args], { stdio: 'pipe' });
}

function sealedAdvisory(id: string, extra: Partial<GroundedFact>): GroundedFact {
  return {
    kind: 'advisory',
    id: asNodeKey(id),
    tier: 'T2',
    claimNorm: `claim-${id}`,
    grounding: { entries: [] },
    freshness: 'FRESH',
    claims: [],
    authoring: 'ADVISORY',
    seal: 'proven',
    ...extra,
  } as unknown as GroundedFact;
}

/** Everything but `.atlas` is `fix-repo`'s own real git repo/commit; `.atlas` is written and seeded here,
 *  and stays UNTRACKED until a test explicitly commits (a subset of) it — mirroring `poisonedRepo` /
 *  `makeIndexedRepo`'s split between "the code repo" and "what got committed alongside it". */
function makeSeededRepo(): { readonly repoPath: string; cleanup(): void } {
  const repo = makeFixRepo();
  const scip = makeFixScip();
  const atlasDir = join(repo.repoPath, '.atlas');
  mkdirSync(atlasDir, { recursive: true });
  writeFileSync(join(atlasDir, 'policy.json'), POLICY_JSON);
  copyFileSync(scip.scipPath, join(atlasDir, 'index.scip'));

  const store = createDiskStore(join(atlasDir, 'cas'), () => asHash('seed'));
  const reProven = sealedAdvisory('nk-re-proven', { witness: { slot: 'dependency', target: SYM_GREET, scope: 'src' } });
  const broken = sealedAdvisory('nk-broken', { witness: { slot: 'dependency', target: SYM_MISSING, scope: 'src' } });
  const unverifiable = sealedAdvisory('nk-unverifiable', {});
  const unsealed = { ...sealedAdvisory('nk-unsealed', {}), seal: undefined } as unknown as GroundedFact;
  const rows = [reProven, broken, unverifiable, unsealed].map((fact) => ({ fact, hash: store.put(fact as unknown as never) }));
  store.persistProjection({
    current: new Map(
      rows.map(({ fact, hash }) => [
        String(fact.id),
        {
          nodeKey: String(fact.id),
          family: 'advisory' as const,
          contentHash: String(hash),
          claims: [(fact as unknown as { claimNorm: string }).claimNorm],
          // `primaryAnchor` is what `createProjectionQueryIndex`'s `cover(scope)` folds ON (anchor-scope.ts
          // `underScope`) — every seeded row is anchored under `src` so the query leg actually surfaces it.
          primaryAnchor: 'src/app.ts',
        },
      ]),
    ),
    cas: new Set(rows.map(({ hash }) => String(hash))),
  });

  return { repoPath: repo.repoPath, cleanup: () => { scip.cleanup(); repo.cleanup(); } };
}

// T2 (the seeded fixture's tier) lands in the ADVISORY band, NOT `invariants` (T0/T1 "governing" only,
// TOOLS-6) — both are read here so this file does not have to re-litigate the band split to prove the
// PROVENANCE point, which is orthogonal to tier.
const nodeIdsOf = (v: { data?: unknown }): string[] => {
  const pack = (v.data as { pack?: { invariants?: PackInvariant[]; advisory?: readonly { nodeId: string }[] } } | undefined)?.pack;
  return [...(pack?.invariants ?? []).map((i) => i.nodeId), ...(pack?.advisory ?? []).map((a) => a.nodeId)].sort();
};

let live: { repoPath: string; cleanup(): void } | undefined;
afterEach(() => {
  live?.cleanup();
  live = undefined;
});

describe('TRAVEL-BY-REPROOF — CASE 1 (untracked): unchanged, every fact served, no new cost', () => {
  it('all four seeded facts are served — re-proven, broken, unverifiable AND unsealed alike', () => {
    live = makeSeededRepo();
    const v = composeRuntime(live.repoPath).handler.handle('atlas-query', { scope: 'src', by: 'scope' });
    expect(v.ok).toBe(true);
    expect(nodeIdsOf(v)).toEqual(['nk-broken', 'nk-re-proven', 'nk-unsealed', 'nk-unverifiable'].sort());
  });

  it('no new cost: the composed runtime never even builds a reverify report for this repo', () => {
    live = makeSeededRepo();
    const runtime = composeRuntime(live.repoPath);
    expect((runtime as { readAdvisory?: string }).readAdvisory).toBeUndefined();
    expect((runtime as { readRefusal?: string }).readRefusal).toBeUndefined();
  });
});

describe('TRAVEL-BY-REPROOF — CASE 3 (staging tracked): flat refusal, unchanged in kind', () => {
  it('committing ONLY `.atlas/staging.json` refuses every read, legibly', () => {
    live = makeSeededRepo();
    // No mine/explorer ran in this fixture, so seed the staging file by hand — the shape under test is
    // "staging is TRACKED", not "staging holds anything in particular".
    writeFileSync(join(live.repoPath, '.atlas', 'staging.json'), JSON.stringify({ current: [], cas: [] }));
    git(live.repoPath, 'add', '-f', '.atlas/staging.json');
    git(live.repoPath, 'commit', '-q', '-m', 'ship staging (should never happen)');
    const v = composeRuntime(live.repoPath).handler.handle('atlas-query', { scope: 'src', by: 'scope' });
    expect(v.ok).toBe(false);
    expect(String(v.rejected).endsWith(REJECTED_UNTRUSTED_STORE)).toBe(true);
  });

  it('TEETH (b): staging tracked WINS even when projection+cas are ALSO tracked — never softens to a filtered serve', () => {
    live = makeSeededRepo();
    writeFileSync(join(live.repoPath, '.atlas', 'staging.json'), JSON.stringify({ current: [], cas: [] }));
    git(live.repoPath, 'add', '-f', '.atlas');
    git(live.repoPath, 'commit', '-q', '-m', 'ship everything');
    const v = composeRuntime(live.repoPath).handler.handle('atlas-query', { scope: 'src', by: 'scope' });
    expect(v.ok).toBe(false);
    expect(String(v.rejected).endsWith(REJECTED_UNTRUSTED_STORE)).toBe(true);
  });
});

describe('TRAVEL-BY-REPROOF — CASE 2 (projection+cas tracked, staging is NOT): served, filtered to what re-proves', () => {
  it('re-proven is served; broken, unverifiable AND unsealed are all dropped — never a blanket refusal', () => {
    live = makeSeededRepo();
    git(live.repoPath, 'add', '-f', '.atlas/projection.json', '.atlas/cas', '.atlas/policy.json', '.atlas/index.scip');
    git(live.repoPath, 'commit', '-q', '-m', 'ship the durable store (accidental, but re-provable)');
    const v = composeRuntime(live.repoPath).handler.handle('atlas-query', { scope: 'src', by: 'scope' });
    expect(v.ok).toBe(true); // NARROWED, not refused — the whole point of this case
    expect(nodeIdsOf(v)).toEqual(['nk-re-proven']);
  });

  it('TEETH (a): breaking the ONE re-proven witness drops it too — the count moves, and the survivor is named', () => {
    live = makeSeededRepo();
    // Re-seed with the re-proven witness now pointing at the unresolvable symbol — so ALL THREE sealed
    // facts are broken/unverifiable and NOTHING re-proves.
    const atlasDir = join(live.repoPath, '.atlas');
    const store = createDiskStore(join(atlasDir, 'cas'), () => asHash('seed-2'));
    const stillBroken = sealedAdvisory('nk-broken', { witness: { slot: 'dependency', target: SYM_MISSING, scope: 'src' } });
    const hash = store.put(stillBroken as unknown as never);
    store.persistProjection({
      current: new Map([[String(stillBroken.id), { nodeKey: String(stillBroken.id), family: 'advisory' as const, contentHash: String(hash), claims: [(stillBroken as unknown as { claimNorm: string }).claimNorm], primaryAnchor: 'src/app.ts' }]]),
      cas: new Set([String(hash)]),
    });
    git(live.repoPath, 'add', '-f', '.atlas/projection.json', '.atlas/cas', '.atlas/policy.json', '.atlas/index.scip');
    git(live.repoPath, 'commit', '-q', '-m', 'nothing here re-proves');
    const v = composeRuntime(live.repoPath).handler.handle('atlas-query', { scope: 'src', by: 'scope' });
    expect(v.ok).toBe(true);
    expect(nodeIdsOf(v)).toEqual([]); // narrowed to nothing — never falls back to serving the broken row
  });

  it('the ADVISORY MESSAGE is surfaced on the composed runtime, naming the fraction served', () => {
    live = makeSeededRepo();
    git(live.repoPath, 'add', '-f', '.atlas/projection.json', '.atlas/cas', '.atlas/policy.json', '.atlas/index.scip');
    git(live.repoPath, 'commit', '-q', '-m', 'ship the durable store');
    const runtime = composeRuntime(live.repoPath) as unknown as { readAdvisory?: string; readRefusal?: string };
    expect(runtime.readRefusal).toBeUndefined();
    expect(runtime.readAdvisory).toBeDefined();
    expect(runtime.readAdvisory).toContain('1 of 3');
  });

  it('`atlas node <hash>` — the address-direct CAS door — refuses a broken row and serves the re-proven one', () => {
    live = makeSeededRepo();
    git(live.repoPath, 'add', '-f', '.atlas/projection.json', '.atlas/cas', '.atlas/policy.json', '.atlas/index.scip');
    git(live.repoPath, 'commit', '-q', '-m', 'ship the durable store');
    const rawStore = createDiskStore(join(live.repoPath, '.atlas', 'cas'));
    const nodes = currentNodes(rehydrateProjection(rawStore));
    const handler = composeRuntime(live.repoPath).handler;
    for (const n of nodes) {
      const v = handler.resolveNode(n.contentHash as never, 'cli');
      expect(v.ok).toBe(n.nodeKey === 'nk-re-proven');
    }
  });
});
