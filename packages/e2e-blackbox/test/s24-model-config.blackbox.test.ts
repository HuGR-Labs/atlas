// @atlas/e2e-blackbox — test/s24-model-config.blackbox.test.ts  (S24 — the operator model config, ADR-0011)
//
// NARRATIVE: the model command is OPERATOR-scoped, and three of its properties are only observable through
// the real `atlas mine` subprocess — which is precisely why they belong here rather than in a unit suite.
//
//   1. THE SHIPPED PROMPT TEMPLATE MUST BE REACHABLE FROM THE BUILT CLI. This exists because it was NOT.
//      `tsc` copies no assets, so a module-relative template path resolved to `dist/prompts/` — a directory
//      that is never created — and the built binary refused EVERY run while the unit suite, which imports
//      from `src/`, stayed green. That defect is invisible to any in-process test by construction: only a
//      subprocess against the built bytes can see it. Found by probing the binary; pinned here so it cannot
//      come back quietly.
//
//   2. A CONFIG PLANTED INSIDE THE REPO IS REFUSED. The command names an executable Atlas will RUN, so
//      sourcing it from the repository under analysis would make `atlas mine` on a clone an
//      arbitrary-code-execution path. Asserted against a REAL repo, through the real door.
//
//   3. A MALFORMED CONFIG REFUSES RATHER THAN REPORTING "NO FACTS". Absent is a state; malformed is an
//      error. Collapsing them would make a broken setup indistinguishable from a barren repository — the
//      one failure that would invalidate a whole genesis run invisibly.
//
// Case 3 doubles as this suite's ANTI-VACUITY control: it proves refusals actually surface on this path, so
// case 1's "no template refusal appeared" cannot pass merely because no refusal ever reaches stdout.
//
// No live model is involved. `roles.propose.cmd` names a POSIX no-op, because what is under test is whether
// the CONFIGURED PATH IS REACHED — never what a model would say.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { makeFixtureRepo, runAtlas } from '../src/harness.js';
import type { FixtureRepo } from '../src/harness.js';

/** A valid operator config in every respect. `true` is the POSIX no-op: exit 0, no output ⇒ an abstention. */
const VALID = JSON.stringify({ roles: { propose: { cmd: 'true', args: [] } } });

/** The refusal text the template loader emits — matched loosely, since the failing path is what matters. */
const TEMPLATE_REFUSAL = /prompt template .* could not be read/;

let repo: FixtureRepo;
const scratch: string[] = [];

function operatorConfig(body: string): string {
  const d = mkdtempSync(join(tmpdir(), 'atlas-s24-operator-'));
  scratch.push(d);
  const p = join(d, 'model.json');
  writeFileSync(p, body);
  return p;
}

afterAll(() => {
  repo?.cleanup();
  while (scratch.length > 0) rmSync(scratch.pop()!, { recursive: true, force: true });
});

describe('S24 — the operator model config, through the real `atlas mine` door', () => {
  it('a VALID config reaches the model path: the SHIPPED prompt template resolves from the built CLI', () => {
    // teeth (breaks-on "the template is resolved module-relative instead of from the package root"): the
    // built binary looks in `dist/prompts/`, finds nothing, and every run exits 2 with TEMPLATE_REFUSAL.
    repo ??= makeFixtureRepo({ files: { 'src/charge.ts': 'export function charge(): void {}\n' } });
    const run = runAtlas(repo.repoPath, ['mine', '.'], { ATLAS_MODEL_CONFIG: operatorConfig(VALID) });

    expect(run.stdout + run.stderr).not.toMatch(TEMPLATE_REFUSAL);
    expect(run.exitCode).toBe(0);
    // The pass itself still seeds nothing here — the structural stage yields no site in a fixture repo —
    // and it says so. What this story pins is that the refusal never came from the TEMPLATE.
    expect(run.stdout).toContain('mine: 0 candidate facts');
  });

  it('a config planted INSIDE the repo is refused — the executable is never taken from the subject', () => {
    repo ??= makeFixtureRepo({ files: { 'src/charge.ts': 'export function charge(): void {}\n' } });
    mkdirSync(join(repo.repoPath, '.atlas'), { recursive: true });
    const planted = join(repo.repoPath, '.atlas', 'model.json');
    writeFileSync(planted, VALID); // byte-identical to the config that runs fine from outside

    const run = runAtlas(repo.repoPath, ['mine', '.'], { ATLAS_MODEL_CONFIG: planted });

    expect(run.exitCode).toBe(2); // a governed refusal, not a crash and not a silent pass
    expect(run.stdout).toContain('refusing to read the model command from inside the repository');
    expect(run.stdout).toContain('arbitrary-code-execution');
    rmSync(planted, { force: true });
  });

  it('a MALFORMED config refuses — it never degrades into "this repo has no facts"', () => {
    // Doubles as the anti-vacuity control for the first case: refusals demonstrably DO surface here.
    repo ??= makeFixtureRepo({ files: { 'src/charge.ts': 'export function charge(): void {}\n' } });
    const run = runAtlas(repo.repoPath, ['mine', '.'], { ATLAS_MODEL_CONFIG: operatorConfig('{ not json') });

    expect(run.exitCode).toBe(2);
    expect(run.stdout).toContain('is not valid JSON');
    // The decisive assertion: a broken CONFIG must not be reported as an empty mining OUTCOME.
    expect(run.stdout).not.toContain('mine: 0 candidate facts');
  });

  it('an ABSENT config is a state, not an error — the zero-config run completes and explains itself', () => {
    repo ??= makeFixtureRepo({ files: { 'src/charge.ts': 'export function charge(): void {}\n' } });
    const absent = join(operatorConfig('{}'), '..', 'no-such-model.json');
    const run = runAtlas(repo.repoPath, ['mine', '.'], { ATLAS_MODEL_CONFIG: absent });

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain('mine: 0 candidate facts');
  });
});
