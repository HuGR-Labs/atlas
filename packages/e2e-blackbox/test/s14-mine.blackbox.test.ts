// @atlas/e2e-blackbox — test/s14-mine.blackbox.test.ts  (S14 — `atlas mine` abstain-by-design, WAVE-COV-5)
//
// NARRATIVE: `atlas mine` drives the FROZEN genesis run-controller one governed pass, candidate-only
// (mine.ts). The default CLI invocation wires NO proposer model (`modelWired = deps?.proposer !==
// undefined`, false at the `atlas mine <repo>` subprocess door — there is no seam to inject one from argv),
// so every injectable seam falls back to its honest fail-closed default: `defaultProposer` abstains at
// every site (`propose: () => null`), seeding 0 candidates. This is NOT an error — mining is model-gated and
// fails CLOSED, never fabricating a fact merely because no model is wired. `foldVerdict` renders that
// 0-candidate outcome LEGIBLY via the exact `MINE_ABSTAIN_LINE`, and the run still exits 0 (a resumeToken,
// not an absent model, is what would signal a partial/error exit 1).
//
// SOTA invariant pinned: NO MODEL ⇒ ABSTAIN, NEVER FABRICATE (WP-F6/GEN-12) — proven end-to-end through the
// REAL subprocess `atlas` bin (no in-process shortcut), asserting the exact abstain line byte-for-byte.

import { afterAll, describe, expect, it } from 'vitest';
import { makeFixtureRepo, runAtlas } from '../src/harness.js';
import type { FixtureRepo } from '../src/harness.js';

/** The exact abstain-by-design legibility line (mine.ts `MINE_ABSTAIN_LINE`) — pinned as a LITERAL string
 *  here (not imported) so this black-box test never touches in-process product source, only observed bytes. */
const MINE_ABSTAIN_LINE =
  'mine: 0 candidates — no proposer model wired (abstain-by-design; facts are never fabricated)';

let repo: FixtureRepo;

describe('S14 — atlas mine: abstain-by-design with no proposer model wired (candidate-only, never fabricates)', () => {
  afterAll(() => {
    repo?.cleanup();
  });

  it('1. a default `atlas mine <repo>` run seeds 0 candidates, emits the exact abstain line, and exits 0', () => {
    repo = makeFixtureRepo({ files: { 'src/foo.ts': 'export const foo = 1;\n' } });

    const r = runAtlas(repo.repoPath, ['mine', repo.repoPath]);

    // exit 0 — a default abstain run is a clean honest abstain, NOT an error (`r.resumeToken` is unset).
    expect(r.exitCode).toBe(0);

    const lines = r.stdout.split('\n');
    expect(lines).toContain('genesis: seeded 0 candidate fact(s); ratified 0');
    expect(lines).toContain('cost: llmCalls 0 · budgetSpent 0');
    // byte-exact match of the abstain line (em-dash U+2014, middle-dot U+00B7 both present verbatim above).
    expect(lines).toContain(MINE_ABSTAIN_LINE);

    // no thrown stack / crash leaked to stderr — the abstain path is a normal, structured render.
    expect(r.stderr).toBe('');

    // the three lines appear in the documented order (genesis → cost → abstain), with a trailing newline.
    const idxGenesis = lines.indexOf('genesis: seeded 0 candidate fact(s); ratified 0');
    const idxCost = lines.indexOf('cost: llmCalls 0 · budgetSpent 0');
    const idxAbstain = lines.indexOf(MINE_ABSTAIN_LINE);
    expect(idxGenesis).toBeGreaterThanOrEqual(0);
    expect(idxCost).toBe(idxGenesis + 1);
    expect(idxAbstain).toBe(idxCost + 1);
  });

  it('2. re-running `atlas mine` on the SAME repo stays abstain-stable — idempotent, no accumulation, no fabrication', () => {
    // A second independent pass over the same fixture: still 0 candidates, still the same abstain line,
    // still exit 0 — abstain-by-design is a structural property of the seam, not a one-shot fluke.
    const r2 = runAtlas(repo.repoPath, ['mine', repo.repoPath]);
    expect(r2.exitCode).toBe(0);
    expect(r2.stdout).toContain('genesis: seeded 0 candidate fact(s); ratified 0');
    expect(r2.stdout).toContain(MINE_ABSTAIN_LINE);
  });
});
