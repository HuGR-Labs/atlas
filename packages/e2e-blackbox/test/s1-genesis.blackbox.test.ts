// @atlas/e2e-blackbox — test/s1-genesis.blackbox.test.ts  (S1 — Onboarding & first knowledge)
//
// NARRATIVE: a user runs `atlas init .` on a fresh repo, authors a GROUNDED fact and `atlas emit`s it, then
// `atlas query <scope>` and sees the fact rendered. Driven ONLY through the real `atlas` CLI subprocess.
//
// THE GROUNDED-FACT CRUX (crux option 2): the emit truth-gate accepts a fact only if its grounding RE-DERIVES
// FRESH against the built index. The fact is authored by `groundedAdvisoryFact` (test/author.ts), which reads
// the fixture file's ACTUAL `subtreeHash` from the SAME `Axes` the runtime builds — so the anchor re-derives
// by construction. Authoring uses product libs (the stand-in for the tool a user would use, since `atlas
// mine` abstains — a finding); EXECUTION + every ASSERTION below is pure black-box (subprocess stdout/exit).
//
// SOTA invariants pinned here: DETERMINISM (RETR-1/INDEX-8 — the same query renders byte-identically) and
// CONTENT-ADDRESSED identity (KERNEL-1 — the emitted `id` is a stable function of the fact bytes).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeFixtureRepo, runAtlas } from '../src/harness.js';
import type { FixtureRepo } from '../src/harness.js';
import { groundedAdvisoryFact } from './author.js';
import type { FactSpec } from './author.js';
import { ACTOR, emitFact, invLines, scopedPolicy } from './support.js';
import type { GroundedFact } from '@atlas/knowledge';

const SRC = 'export const foo = (): number => 1;\n';
const CLAIM = 'foo returns the constant 1';

let repo: FixtureRepo;
let fact: GroundedFact;
let priorActor: string | undefined;

beforeAll(() => {
  priorActor = process.env.ATLAS_ACTOR;
  process.env.ATLAS_ACTOR = ACTOR; // KNOW-11 write actor — matches the scoped policy below
  repo = makeFixtureRepo({ files: { 'src/foo.ts': SRC }, policy: scopedPolicy('src') });
  const spec: FactSpec = { repoPath: repo.repoPath, filePath: 'src/foo.ts', slot: 'invariant', claim: CLAIM };
  fact = groundedAdvisoryFact(spec);
});

afterAll(() => {
  repo?.cleanup();
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR;
  else process.env.ATLAS_ACTOR = priorActor;
});

describe('S1 — genesis: init → grounded emit → query sees it', () => {
  it('`atlas init .` exits 0 and renders territories INCLUDING the source tree', () => {
    const r = runAtlas(repo.repoPath, ['init', '.']);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('status: ok');
    // The structural move-in renders the top-level territories; the `src` source tree MUST be one of them.
    expect(r.stdout).toContain('  territory: src');
  });

  it('a GROUNDED `atlas emit` is ACCEPTED (exit 0) and renders the content-addressed `id:`', () => {
    const r = emitFact(repo, fact);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('status: ok');
    // The persisted CAS id is a 64-hex content address — rendered by the Seam-2 data block.
    expect(r.stdout).toMatch(/^ {2}id: [0-9a-f]{64}$/m);
  });

  it('`atlas query src` SEES the emitted fact — rendered as `inv <tier> <nodeId>: <claim>`', () => {
    const r = runAtlas(repo.repoPath, ['query', 'src']);
    expect(r.exitCode).toBe(0);
    const rows = invLines(r.stdout);
    // exactly the one fact we emitted, at its real nodeKey, tier T1, with our claim body.
    expect(rows).toEqual([`  inv T1 ${fact.id}: ${CLAIM}`]);
    // a non-drifted pack is served fresh.
    expect(r.stdout).toContain('  stale: false');
  });

  it('SOTA determinism (RETR-1/INDEX-8): the same query renders BYTE-IDENTICAL stdout across runs', () => {
    const a = runAtlas(repo.repoPath, ['query', 'src']);
    const b = runAtlas(repo.repoPath, ['query', 'src']);
    expect(a.exitCode).toBe(0);
    expect(b.stdout).toBe(a.stdout); // byte-for-byte — an embedding/clock/nonce would break this
    expect(a.stdout).toContain(`inv T1 ${fact.id}`); // and it is NON-vacuously the fact, not empty
  });

  it('SOTA content-addressed id (KERNEL-1): re-emitting the SAME fact yields the SAME stable `id`', () => {
    const first = emitFact(repo, fact);
    const second = emitFact(repo, fact);
    const idOf = (s: string): string | undefined => s.match(/^ {2}id: ([0-9a-f]{64})$/m)?.[1];
    const idA = idOf(first.stdout);
    const idB = idOf(second.stdout);
    expect(idA).toMatch(/^[0-9a-f]{64}$/);
    expect(idB).toBe(idA); // content-addressed: identical bytes ⇒ identical id (idempotent, DEDUP)
  });
});
