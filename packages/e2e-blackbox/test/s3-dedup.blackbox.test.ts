// @atlas/e2e-blackbox — test/s3-dedup.blackbox.test.ts  (S3 — Dedup identity, the star)
//
// NARRATIVE: with GROUNDED facts, a user emits F; re-emits byte-identical F (D0 dedup); emits the SAME
// (anchor,slot) reworded (D1 union); and emits the same claim at two DISTINCT anchors (non-destructive
// A2 — two nodes, no write-time merge). Everything through the real `atlas emit`/`query` subprocesses.
//
// SOTA invariants pinned: NO always-merge / NON-DESTRUCTIVE (A2 — distinct anchors keep distinct grounded
// nodes), CONTENT-ADDRESSED idempotency (KERNEL-1 — identical bytes DEDUP to the same id), and D1 union
// (a reworded claim at the same (anchor,slot) collides on the REAL nodeKey and set-unions in place).
//
// FINDING (subsumes unreachable end-to-end) — see the last test: the manifest's "module⊃function ⇒ subsumes"
// case CANNOT be authored through the black-box grounding surface, because the index build produces ONLY
// file/dir nodes (no sub-file `::` symbol granularity), so no GROUNDED fact can carry a `::` primaryAnchor,
// and `deriveSubsumes` (wired at read) requires `::` proper-containment. This is flagged, not asserted-around.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeFixtureRepo, runAtlas } from '../src/harness.js';
import type { FixtureRepo } from '../src/harness.js';
import { groundedAdvisoryFact } from './author.js';
import type { GroundedFact } from '@atlas/knowledge';
import { ACTOR, emitFact, invLines, scopedPolicy, subsumesLines } from './support.js';

const FILES = { 'src/foo.ts': 'export const foo = 1;\n', 'src/bar.ts': 'export const bar = 2;\n' };
const idOf = (s: string): string | undefined => s.match(/^ {2}id: ([0-9a-f]{64})$/m)?.[1];
const query = (repo: FixtureRepo): string => runAtlas(repo.repoPath, ['query', 'src']).stdout;

let repo: FixtureRepo;
let F: GroundedFact; //           claim C1 at src/foo.ts::invariant
let Frew: GroundedFact; //        claim C1-reworded at the SAME (anchor,slot) ⇒ same nodeKey
let Gbar: GroundedFact; //        claim C1 at src/bar.ts::invariant ⇒ a DISTINCT nodeKey
let priorActor: string | undefined;

beforeAll(() => {
  priorActor = process.env.ATLAS_ACTOR;
  process.env.ATLAS_ACTOR = ACTOR;
  repo = makeFixtureRepo({ files: FILES, policy: scopedPolicy('src') });
  const at = (filePath: string, claim: string): GroundedFact =>
    groundedAdvisoryFact({ repoPath: repo.repoPath, filePath, slot: 'invariant', claim });
  F = at('src/foo.ts', 'C1');
  Frew = at('src/foo.ts', 'C1-reworded');
  Gbar = at('src/bar.ts', 'C1');
});

afterAll(() => {
  repo?.cleanup();
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR;
  else process.env.ATLAS_ACTOR = priorActor;
});

describe('S3 — dedup / update / non-destructive identity (ordered — durable store accretes)', () => {
  it('D0 DEDUP: byte-identical re-emit yields the SAME content-addressed id; query shows ONE node', () => {
    const first = emitFact(repo, F);
    const second = emitFact(repo, F);
    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(idOf(second.stdout)).toBe(idOf(first.stdout)); // idempotent — same bytes, same id (KERNEL-1)
    expect(invLines(query(repo))).toEqual([`  inv T1 ${F.id}: C1`]); // exactly ONE node
  });

  it('D1 UNION: a reworded claim at the SAME (anchor,slot) collides on the real nodeKey → ONE node, merged', () => {
    expect(Frew.id).toBe(F.id); // GENUINE identity: advisory nodeKey = hash(anchor‖slot), wording-independent
    const r = emitFact(repo, Frew);
    expect(r.exitCode).toBe(0);
    // still ONE node at the same nodeKey; the two claim bodies are set-unioned (prose-independent identity).
    expect(invLines(query(repo))).toEqual([`  inv T1 ${F.id}: C1; C1-reworded`]);
  });

  it('A2 NON-DESTRUCTIVE: the SAME claim at a DISTINCT anchor mints its OWN node — NO write-time merge', () => {
    expect(Gbar.id).not.toBe(F.id); // distinct anchor ⇒ distinct nodeKey
    const r = emitFact(repo, Gbar);
    expect(r.exitCode).toBe(0);
    // TWO nodes now coexist — each keeps its own grounding; neither was folded into the other (A2).
    expect(invLines(query(repo))).toEqual([
      `  inv T1 ${Gbar.id}: C1`, // src/bar.ts node (nodeKey sorts first)
      `  inv T1 ${F.id}: C1; C1-reworded`, // src/foo.ts node
    ]);
  });

  it('determinism: after all writes, the merged query renders BYTE-IDENTICAL across runs', () => {
    expect(query(repo)).toBe(query(repo)); // deterministic projection over the durable store
  });

  it('FINDING — subsumes module⊃function is UNREACHABLE end-to-end (no sub-file index granularity)', () => {
    // Two nodes share slot+family+the exact claim `C1`, but their anchors are SIBLINGS (src/foo.ts,
    // src/bar.ts) — never ancestor/descendant. A genuine module⊃function pair (`src/foo.ts` ⊃
    // `src/foo.ts::bar`) CANNOT be authored: the `::bar` symbol anchor does not resolve in the index (build
    // makes only file/dir nodes), so such a fact is rejected as ungrounded. Hence `deriveSubsumes` (wired at
    // read) can never fire on grounded input. We assert the HONEST current state (no subsumes line) and flag
    // the gap — never faking a subsumes edge.
    const out = query(repo);
    expect(invLines(out).length).toBe(2); // the two nodes ARE both present (A2 holds)
    expect(subsumesLines(out)).toEqual([]); // subsumes structurally unreachable — FINDING #1
  });
});
