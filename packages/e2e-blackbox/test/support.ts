// @atlas/e2e-blackbox — test/support.ts  (story plumbing over the black-box harness — no product logic)
//
// Thin conveniences the stories share: the scoped admin policy that authorizes the KNOW-11 write actor, the
// deterministic actor id, and an `emitFact` that writes a fact JSON to disk and drives the REAL `atlas emit`
// subprocess. NOTE the CLI arg convention: the hand-rolled parser only accepts `--at=<sha>` (the `=` form) —
// a bare `--at <sha>` folds the flag to `'true'` and drops the sha to a positional (a real CLI-usability
// quirk, surfaced in the findings). All calls go through `runAtlas` (subprocess) — pure black-box execution.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runAtlas } from '../src/harness.js';
import type { AtlasRun, FixtureRepo } from '../src/harness.js';
import type { GroundedFact } from '@atlas/knowledge';

/** The deterministic KNOW-11 write actor — set as `ATLAS_ACTOR` (env wins in `composeRuntime`), so authz is
 *  stable regardless of the host's `git config user.email`. */
export const ACTOR = 'e2e@atlas.local';

/** The deterministic KNOW-8 ratifier — set as `ATLAS_RATIFY_TOKEN` (env-sourced by `composeRuntime`, never
 *  the fact payload). The stories emit `tier≥T1` facts (visible in the bounded read pack, TOOLS-6), which
 *  route to KNOW-18 full-ratify — so the operator driving `atlas emit` carries a ratifier signature, exactly
 *  as a lead would. Any non-empty ratifier commits a NON-T0 fact; a T0 fact would still require `billy`. */
export const RATIFIER = 'lead';

/** An admin policy that AUTHORIZES {@link ACTOR} to write `scope` (KNOW-11). Empty near-dup τ=1 + no T0
 *  keywords (the conservative floor). Absent this, every scoped write is fail-closed denied. */
export function scopedPolicy(scope = 'src'): string {
  return JSON.stringify({
    nearDup: { claimNormThreshold: 1 },
    t0Heuristic: { keywords: [] },
    authz: { scopes: { [scope]: [ACTOR] } },
  });
}

let seq = 0;

/** Write `fact` to a fresh JSON file in the repo and drive `atlas emit <file> --at=<HEAD>` (real subprocess).
 *  The `at` sha is vestigial for grounding (the gate re-derives against the built index), but the CLI
 *  requires a non-empty `--at`. Returns the real `{stdout, stderr, exitCode}`. */
export function emitFact(repo: FixtureRepo, fact: GroundedFact): AtlasRun {
  const path = join(repo.repoPath, `emit-${seq++}.json`);
  writeFileSync(path, JSON.stringify(fact));
  return runAtlas(repo.repoPath, ['emit', path, `--at=${repo.sha()}`]);
}

/** The rendered `  inv <tier> <nodeId>: <claim>` lines of a query verdict (the observable fact rows). */
export function invLines(stdout: string): string[] {
  return stdout.split('\n').filter((l) => l.trimStart().startsWith('inv '));
}

/** The rendered `  subsumes <broader> ⊃ <narrower>` lines of a query verdict. */
export function subsumesLines(stdout: string): string[] {
  return stdout.split('\n').filter((l) => l.includes('subsumes '));
}
