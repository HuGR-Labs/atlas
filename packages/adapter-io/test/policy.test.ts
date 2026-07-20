// @atlas/adapter-io — test/policy.test.ts  (WP-POLICY: admin-locked governance policy, fail-closed loader)
//
// Teeth on the two invariants that make the policy SAFE to externalize:
//   1. FAIL-CLOSED LOAD — a missing OR malformed policy resolves to `defaultPolicy()` WITHOUT throwing,
//      and the default DENIES writes (empty scopes). A mutant that throws on malformed, or that returns a
//      permissive default (non-empty scopes), flips a golden RED.
//   2. FAIL-CLOSED AUTHZ — `actorInScope` mirrors @atlas/knowledge `inScope` (KNOW-11a): true only for a
//      listed actor in a declared scope; false for unlisted / absent / empty / undeclared scope. A mutant
//      that allows an absent scope flips RED.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadPolicy,
  defaultPolicy,
  actorInScope,
  nearDupConfig,
  type AtlasPolicy,
} from '../src/policy.js';

// A throwaway repo dir with an optional `.atlas/policy.json` body (raw string ⇒ can be malformed).
let repoPath: string | undefined;
function makeRepo(policyBody?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-policy-'));
  if (policyBody !== undefined) {
    mkdirSync(join(dir, '.atlas'), { recursive: true });
    writeFileSync(join(dir, '.atlas', 'policy.json'), policyBody, 'utf8');
  }
  repoPath = dir;
  return dir;
}
afterEach(() => {
  if (repoPath) rmSync(repoPath, { recursive: true, force: true });
  repoPath = undefined;
});

describe('loadPolicy — fail-closed load of .atlas/policy.json', () => {
  it('POLICY-load-1 — a valid policy loads with exact fields (happy)', () => {
    const body = JSON.stringify({
      nearDup: { claimNormThreshold: 0.9 },
      t0Heuristic: { keywords: ['invariant', 'security'] },
      authz: { scopes: { 'core/knowledge': ['seat:lucy', 'seat:billy'] } },
    });
    const p = loadPolicy(makeRepo(body));
    expect(p).toStrictEqual<AtlasPolicy>({
      nearDup: { claimNormThreshold: 0.9 },
      t0Heuristic: { keywords: ['invariant', 'security'] },
      authz: { scopes: { 'core/knowledge': ['seat:lucy', 'seat:billy'] } },
    });
    // the τ feeds NearDupConfig EXACTLY
    expect(nearDupConfig(p)).toStrictEqual({ claimNormThreshold: 0.9 });
  });

  it('POLICY-load-2 — a MISSING policy file → defaultPolicy(), no throw (fail-closed)', () => {
    const dir = makeRepo(); // no .atlas/policy.json written
    expect(() => loadPolicy(dir)).not.toThrow();
    expect(loadPolicy(dir)).toStrictEqual(defaultPolicy());
  });

  it('POLICY-load-3 — MALFORMED JSON → defaultPolicy(), no throw (TEETH: mutant that throws flips RED)', () => {
    const dir = makeRepo('{ this is not json ]]]');
    expect(() => loadPolicy(dir)).not.toThrow();
    expect(loadPolicy(dir)).toStrictEqual(defaultPolicy());
  });

  it('POLICY-load-4 — structurally-invalid policy → defaultPolicy() (wrong types fail closed)', () => {
    const dir = makeRepo(JSON.stringify({ nearDup: { claimNormThreshold: 'high' }, t0Heuristic: {}, authz: {} }));
    expect(loadPolicy(dir)).toStrictEqual(defaultPolicy());
  });

  it('POLICY-load-5 — the default is CONSERVATIVE: empty scopes ⇒ NO write authorized (TEETH: permissive default flips RED)', () => {
    const def = defaultPolicy();
    expect(def.authz.scopes).toStrictEqual({}); // no actor in any scope
    expect(def.nearDup.claimNormThreshold).toBe(1); // exact-match only
    expect(def.t0Heuristic.keywords).toStrictEqual([]);
    // no actor can write ANY scope under the default
    expect(actorInScope(def, 'seat:anyone', 'any/scope')).toBe(false);
  });
});

describe('actorInScope — fail-closed authz, mirrors KNOW-11a inScope', () => {
  const policy: AtlasPolicy = {
    nearDup: { claimNormThreshold: 1 },
    t0Heuristic: { keywords: [] },
    authz: { scopes: { 'core/knowledge': ['seat:lucy'] } },
  };

  it('POLICY-authz-1 — a listed actor in a declared scope → true (happy)', () => {
    expect(actorInScope(policy, 'seat:lucy', 'core/knowledge')).toBe(true);
  });

  it('POLICY-authz-2 — an UNLISTED actor in a declared scope → false (fail-closed)', () => {
    expect(actorInScope(policy, 'seat:mallory', 'core/knowledge')).toBe(false);
  });

  it('POLICY-authz-3 — an UNDECLARED scope → false (fail-closed)', () => {
    expect(actorInScope(policy, 'seat:lucy', 'core/other')).toBe(false);
  });

  it('POLICY-authz-4 — an ABSENT scope → false (TEETH: mutant allowing absent-scope flips RED)', () => {
    expect(actorInScope(policy, 'seat:lucy', undefined)).toBe(false);
  });

  it('POLICY-authz-5 — an EMPTY scope → false (fail-closed)', () => {
    expect(actorInScope(policy, 'seat:lucy', '')).toBe(false);
  });
});
