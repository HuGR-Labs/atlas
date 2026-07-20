// @atlas/adapter-io — test/compose.test.ts  (COMPOSE-A — the runtime composition root, end-to-end)
//
// `composeRuntime(repoPath)` stands up the FULLY GOVERNED, DURABLE handler over a real repo: the real
// GROUND truth-gate (built once over the index Axes at the root), the real KNOW-11 authz policy, the real
// KNOW-15 durable write path, and the `ATLAS_ACTOR` identity (fail-closed when unset). This exercises the
// whole governed leg through the assembled handler — emit in-scope persists + re-derives; emit out-of-scope
// is denied; init/query still resolve. Teeth: the out-of-scope denial + the durable re-read bite the authz
// and durability legs (drop either and a golden flips).

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from '@atlas/index';
import type { StructRef } from '@atlas/contracts';
import { asNodeKey, asHash } from '@atlas/kernel';
import type { GroundedFact } from '@atlas/knowledge';
import type { EmitOut, Tool } from '@atlas/tools';
import { composeRuntime } from '../src/compose.js';
import { createDiskStore } from '../src/store.js';
import { walkFileTree } from '../src/fs.js';
import { readScip } from '../src/scip.js';
import { makeFixRepo } from './harness/fix-repo.js';
import { makeFixScip } from './harness/fix-scip.js';

const POLICY_JSON = JSON.stringify({
  nearDup: { claimNormThreshold: 1 },
  t0Heuristic: { keywords: [] },
  authz: { scopes: { core: ['alice'] } },
});

/** Materialize a governed repo: the fix-repo git tree + a `.atlas/policy.json` granting `alice` scope
 *  `core` + a `.atlas/index.scip` so the composition root's index build has a real dump. */
function makeGovernedRepo() {
  const repo = makeFixRepo();
  const scip = makeFixScip();
  const atlasDir = join(repo.repoPath, '.atlas');
  mkdirSync(atlasDir, { recursive: true });
  writeFileSync(join(atlasDir, 'policy.json'), POLICY_JSON);
  copyFileSync(scip.scipPath, join(atlasDir, 'index.scip'));
  return { repoPath: repo.repoPath, cleanup: () => { scip.cleanup(); repo.cleanup(); } };
}

/** A grounded advisory fact whose anchor resolves FRESH against the built index root (so the real gate
 *  serves HOLDS), scoped to `scope`. */
function groundedFact(repoPath: string, scope: string): GroundedFact {
  const axes = build(walkFileTree(repoPath), readScip(join(repoPath, '.atlas', 'index.scip')));
  const root = axes.spatial; // the repo-level unit — non-empty subtreeHash, resolves to itself (FRESH)
  const anchor: StructRef = { kind: 'repo', qualifiedPath: root.key, subtreeHash: root.subtreeHash };
  return {
    kind: 'advisory',
    id: asNodeKey(`nk-${scope}`),
    tier: 'T2',
    claimNorm: `a grounded claim for ${scope}`,
    grounding: { entries: [{ anchor, path: '.' }] },
    freshness: 'FRESH',
    claims: [],
    authoring: 'ADVISORY',
    scope,
  };
}

const AT = asHash('cafe');
const EMIT = 'atlas-emit' as Tool;
const INIT = 'atlas-init' as Tool;
const QUERY = 'atlas-query' as Tool;

describe('COMPOSE-A — composeRuntime end-to-end (governed durable handler)', () => {
  it('SCN-CR-1 — an in-scope grounded emit PERSISTS durably + is re-derivable from CAS', () => {
    const { repoPath, cleanup } = makeGovernedRepo();
    const prev = process.env.ATLAS_ACTOR;
    process.env.ATLAS_ACTOR = 'alice';
    try {
      const { handler } = composeRuntime(repoPath);
      const node = groundedFact(repoPath, 'core');
      const v = handler.handle(EMIT, { node, at: AT });
      expect(v.ok).toBe(true);
      const out = v.data as EmitOut;
      expect(out.emitted).toBe(true);
      expect(out.id).toBeDefined();

      // TEETH — durable: re-open the CAS at the composition root's cas path and read the fact back.
      const store = createDiskStore(join(repoPath, '.atlas', 'cas'));
      expect(store.get(out.id!)).toEqual(node);
      // the projection sidecar was persisted too (the KNOW-15 durable write).
      expect(store.loadProjection()).toBeDefined();
    } finally {
      if (prev === undefined) delete process.env.ATLAS_ACTOR;
      else process.env.ATLAS_ACTOR = prev;
      cleanup();
    }
  });

  it('SCN-CR-2 — an out-of-scope emit is DENIED (authz), and init/query still resolve', () => {
    const { repoPath, cleanup } = makeGovernedRepo();
    const prev = process.env.ATLAS_ACTOR;
    process.env.ATLAS_ACTOR = 'alice';
    try {
      const { handler } = composeRuntime(repoPath);
      // alice holds `core`, not `secret` → the KNOW-11 authz gate denies, nothing persists.
      const v = handler.handle(EMIT, { node: groundedFact(repoPath, 'secret'), at: AT });
      const out = v.data as EmitOut;
      expect(out.emitted).toBe(false);
      expect(out.rejected ?? '').toContain('unauthorized');

      // the other governance legs are still wired + resolving (not "not wired at this seam").
      const initV = handler.handle(INIT, { path: repoPath });
      expect(initV.rejected ?? '').not.toContain('not wired at this seam');
      expect(initV.ok).toBe(true);
      const queryV = handler.handle(QUERY, { scope: '.' });
      expect(queryV.rejected ?? '').not.toContain('not wired at this seam');
    } finally {
      if (prev === undefined) delete process.env.ATLAS_ACTOR;
      else process.env.ATLAS_ACTOR = prev;
      cleanup();
    }
  });

  it('SCN-CR-3 — unset ATLAS_ACTOR ⇒ every write denied (fail-closed composition)', () => {
    const { repoPath, cleanup } = makeGovernedRepo();
    const prev = process.env.ATLAS_ACTOR;
    delete process.env.ATLAS_ACTOR;
    try {
      const { handler } = composeRuntime(repoPath);
      const v = handler.handle(EMIT, { node: groundedFact(repoPath, 'core'), at: AT });
      const out = v.data as EmitOut;
      expect(out.emitted).toBe(false);
      expect(out.rejected ?? '').toContain('unauthorized');
    } finally {
      if (prev === undefined) delete process.env.ATLAS_ACTOR;
      else process.env.ATLAS_ACTOR = prev;
      cleanup();
    }
  });
});
