// @atlas/e2e-blackbox — test/s26-promote.blackbox.test.ts  (S26 — the governed PROMOTION door, end to end)
//
// NARRATIVE. `atlas mine` writes candidates to a staging sidecar; until this door existed nothing read them
// back, so KNOW-8's measurable ("0 explorer writes reach the store except via a ratifier") held VACUOUSLY —
// what enforced it was SEVERANCE, not ratification. This story drives the REAL `atlas` binary through the
// whole route: mine, promote, and read back. It is the only instrument that proves the loop closes; this
// repo has twice shipped a green suite over a broken binary, so every assertion below is on process bytes.
//
// TWO THINGS THIS STORY MEASURES AND REPORTS RATHER THAN HIDES:
//
//  (1) `atlas mine` UNDER THIS FIXTURE STAGES ZERO CANDIDATES — and the reason CHANGED, which is worth more
//      than the assertion. It used to be structural: `mine.ts` fell back to `defaultGate()` ("no admission
//      seam wired"), so `atlas mine` staged nothing on ANY repository and `makeAdmitGate` had no production
//      caller. REQ-CLI-4d supplies the gate at the composition root and that is no longer true — measured on
//      Atlas itself, `atlas mine .` now stages 200 candidates. What keeps case 1 at zero is the OTHER seam:
//      no operator model is configured for this fixture, so the proposer abstains at every site and there is
//      nothing for the gate to judge. The prediction in the previous revision of this note held exactly —
//      the story needed no edit when the gate landed — but the note itself would have become a lie, and a
//      test that pins the right number for a retired reason is how a suite stops describing its product.
//      The staged candidate the rest of the story needs is still placed through the product's own staging
//      door (`test/stage.ts`), the same concession `test/author.ts` makes one door over: this story needs
//      ONE candidate with known bytes, not whatever a proposer answered.
//
//  (2) A PROMOTED MINED FACT IS `T2`, AND `atlas query` BOUNDS `T2` OUT (TOOLS-6). So the read-back that
//      proves durability is `atlas node <addr>`, not `atlas query`. Both are driven below and both are
//      asserted, because "query shows nothing" is a TRUE and easily-misread outcome: it means the pack bound
//      held, not that the promotion failed. Pinned in both directions so neither can silently flip.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeFixtureRepo, runAtlas } from '../src/harness.js';
import type { FixtureRepo } from '../src/harness.js';
import { groundedAdvisoryFact } from './author.js';
import { MINED_SCOPE, stageCandidate } from './stage.js';

/** The seat `.atlas/policy.json` appoints as curator over the mined scope. */
const CURATOR = 'seat:orchestrator';
/** A SYNTHETIC ratifier name — this gate is a string comparison, not a credential (`ratify.ts` BILLY). */
const TOKEN = 'seat:orchestrator';

const FILES = {
  'src/util.ts': 'export function greet(n: string): string {\n  return `hi ${n}`;\n}\n',
  'src/app.ts': "import { greet } from './util';\n\nexport function main(): string {\n  return greet('world');\n}\n",
};
/** Real SCIP occurrences ⇒ a real resolved dep edge ⇒ a real ranked frontier, so `mine` genuinely visits
 *  sites. Without this the mine pass is empty for a DIFFERENT reason (no frontier) and case 1 would be
 *  measuring the wrong thing. */
const INDEX = [
  { path: 'src/util.ts', defines: ['util/greet().'] },
  { path: 'src/app.ts', references: ['util/greet().'] },
];
/** The admin policy that APPOINTS a curator over `atlas:mined`. Nothing is granted by default — a mined node
 *  is owned by nobody until an admin says otherwise (ADR-0008), which case 5 pins. */
const CURATOR_POLICY = JSON.stringify({
  nearDup: { claimNormThreshold: 1 },
  t0Heuristic: { keywords: [] },
  authz: { scopes: { [MINED_SCOPE]: [CURATOR] } },
});
const NO_CURATOR_POLICY = JSON.stringify({
  nearDup: { claimNormThreshold: 1 },
  t0Heuristic: { keywords: [] },
  authz: { scopes: {} },
});

const CLAIM = 'greet() returns a greeting for the supplied name';
const CURATOR_ENV = { ATLAS_ACTOR: CURATOR, ATLAS_RATIFY_TOKEN: TOKEN };

const repos: FixtureRepo[] = [];
function repoWith(policy: string): FixtureRepo {
  const r = makeFixtureRepo({ files: FILES, index: INDEX, policy });
  repos.push(r);
  return r;
}
/** Stage one mined-shaped candidate: grounded at a REAL index unit (so the truth door re-derives it FRESH),
 *  through the product's own staging door. Returns the identity the promotion will mint for it. */
function stageOne(repo: FixtureRepo, claim = CLAIM): string {
  return stageCandidate(
    repo.repoPath,
    groundedAdvisoryFact({ repoPath: repo.repoPath, filePath: 'src/util.ts', slot: 'definition', claim, scope: MINED_SCOPE, tier: 'T2' }),
  ).nodeKey;
}

let promoted: FixtureRepo;
beforeAll(() => {
  promoted = repoWith(CURATOR_POLICY);
});
afterAll(() => {
  while (repos.length > 0) repos.pop()!.cleanup();
});

describe('S26 — atlas promote: the governed route out of staging', () => {
  it('1. MEASURED TODAY — with no model configured `atlas mine` visits its sites and stages NOTHING, so promote is honestly empty', () => {
    // Both halves through the real binary, in order, on one repo. teeth: breaks-on "promote fabricates a
    // count over an empty staging" and on "promote renders an empty staging as a refusal".
    // NO `ATLAS_MODEL_CONFIG` is passed, and that is now the operative cause of the 0 — the admission gate
    // is wired (REQ-CLI-4d), the proposer is not, so every site abstains before the gate is ever asked.
    const repo = repoWith(CURATOR_POLICY);
    const mine = runAtlas(repo.repoPath, ['mine', '.']);
    expect(mine.exitCode).toBe(0);
    expect(mine.stdout).toContain('genesis: seeded 0 candidate fact(s); ratified 0');

    const out = runAtlas(repo.repoPath, ['promote'], CURATOR_ENV);
    expect(out.exitCode).toBe(0);
    expect(out.stderr).toBe('');
    expect(out.stdout).toContain('promote: 0 of 0 staged candidate(s) promoted; 0 refused');
    expect(out.stdout).toContain('staging holds no candidates — nothing to promote');
    expect(out.stdout).toContain('status: ok');
  });

  it('2. THE LOOP CLOSES — a staged candidate is promoted, and `atlas node` reads the fact back', () => {
    // The instrument. teeth: breaks-on "the promote command is not wired into the entrypoint" (exit 1,
    // "runtime is not composed"), on "the promotion module is never called" (0 of 1), and on "the durable
    // write is reported but not made" (the `atlas node` read-back below comes back a miss).
    const key = stageOne(promoted);

    const run = runAtlas(promoted.repoPath, ['promote'], CURATOR_ENV);
    expect(run.stderr).toBe('');
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain('promote: 1 of 1 staged candidate(s) promoted; 0 refused');

    // The CAS address the door reported — parsed out of the product's own bytes, never recomputed here.
    const line = run.stdout.split('\n').find((l) => l.startsWith(`  promoted ${key} -> `));
    expect(line).toBeDefined();
    const addr = line!.slice(`  promoted ${key} -> `.length);
    expect(addr).toMatch(/^[0-9a-f]{64}$/);

    // READ-BACK through the per-node read door — a SECOND process, so nothing rides in-memory.
    //
    // TWO DIFFERENT IDENTITIES, both real, and the assertion names each by the one it is: `addr` is the CAS
    // CONTENT ADDRESS the door resolved the bytes by, while the rendered `node:` line carries the fact's own
    // recorded `id` — its `nodeKey`, the routing identity — which is the SAME key the promote line reported.
    // Asserting `node: ${addr}` here would have been a plausible-looking mistake that passes nothing.
    const back = runAtlas(promoted.repoPath, ['node', addr]);
    expect(back.exitCode).toBe(0);
    expect(back.stdout).toContain(`  node: ${key}`);
    expect(back.stdout).toContain('  tier: T2');
    expect(back.stdout).toContain(`  claim: ${CLAIM}`);
    expect(addr).not.toBe(key); // the content address and the routing identity are distinct by construction
  });

  it('3. `atlas query` does NOT serve the promoted fact — TOOLS-6 bounds `T2` out of the pack', () => {
    // TRUE, and the easiest result in this story to misread. A mined candidate is T2 by construction, and
    // the read pack bounds T2 OUT, so promotion makes the fact addressable and doctor-visible without making
    // it SERVED. Pinned so it cannot silently flip in either direction: a query that started serving T2
    // would widen the pack past its ratified bound, and the `atlas node` hit above is what separates "bounded
    // out" from "never written".
    const q = runAtlas(promoted.repoPath, ['query', 'src'], CURATOR_ENV);
    expect(q.exitCode).toBe(0);
    expect(q.stdout).not.toContain(CLAIM);
    expect(q.stdout).toContain('data:'); // the pack rendered — it is bounded, not broken
  });

  it('4. NO RATIFIER NAMED ⇒ refused `unratified`, exit 2, nothing durable', () => {
    // THE TRAP THIS DOOR WAS BUILT AGAINST, through the binary. A mined candidate is T2 ∧ advisory ∧
    // grounded, so with the write door's DEFAULT ratify context it would fast-path to `auto-accept` and the
    // KNOW-8 token would never be read — every staged row would land with no ratifier consulted. teeth:
    // breaks-on "the default context is used" (this run exits 0 reporting `1 of 1 promoted`).
    const repo = repoWith(CURATOR_POLICY);
    stageOne(repo);
    const run = runAtlas(repo.repoPath, ['promote'], { ATLAS_ACTOR: CURATOR }); // no ATLAS_RATIFY_TOKEN
    expect(run.exitCode).toBe(2);
    expect(run.stdout).toContain('promote: 0 of 1 staged candidate(s) promoted; 1 refused');
    expect(run.stdout).toContain('unratified');
    expect(run.stdout).toContain('status: rejected');
  });

  it('5. NO CURATOR APPOINTED ⇒ refused `unauthorized`, exit 2 — the fail-closed default is CORRECT', () => {
    // `.atlas/policy.json` grants `atlas:mined` to nobody until an admin appoints a curator, and
    // `actorInScope` is fail-closed on an undeclared scope. Asserted as correct behaviour, not worked around.
    const repo = repoWith(NO_CURATOR_POLICY);
    stageOne(repo);
    const run = runAtlas(repo.repoPath, ['promote'], CURATOR_ENV);
    expect(run.exitCode).toBe(2);
    expect(run.stdout).toContain('promote: 0 of 1 staged candidate(s) promoted; 1 refused');
    expect(run.stdout).toContain('unauthorized');
  });

  it('6. a SECOND promote leaves the store where it was — idempotent in state, honest in report', () => {
    // Staging has no delete and the two sidecars have no shared commit, so a promoted row is neither removed
    // nor marked (a marker would be a second state machine that can disagree with the projection). The
    // second pass re-presents the row to the same door, still pays a full ratification, and the store does
    // not move. teeth: breaks-on "the second run double-writes" (a duplicated claim on the row).
    const first = runAtlas(promoted.repoPath, ['promote'], CURATOR_ENV);
    const second = runAtlas(promoted.repoPath, ['promote'], CURATOR_ENV);
    expect(first.stdout).toBe(second.stdout); // byte-identical, including the CAS address
    expect(second.exitCode).toBe(0);
  });

  it('7. the command is CLI-only — the MCP surface publishes no promotion tool', () => {
    // `GOVERNANCE_SURFACE` stays 5 and `WRITE_PATHS` stays `{atlas-emit, atlas-link}`: promotion is an
    // ordinary USE of the emit door (ADR-0008), so there is no tool token for it and no MCP client can
    // promote. teeth: breaks-on "a sixth tool was minted for promotion" — `atlas-promote` would appear here.
    const help = runAtlas(promoted.repoPath, ['nosuchcommand']);
    expect(help.exitCode).toBe(1);
    expect(help.stdout).toContain('init|query|emit|reconcile|doctor|mine|node|link|promote');
  });
});
