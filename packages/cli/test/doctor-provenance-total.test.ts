// @atlas/cli — test/doctor-provenance-total.test.ts  (`runDoctor` promises "never a throw" — keep it true)
//
// `atlas doctor` sub-dispatches WITHOUT going through the frozen handler, so nothing between `runDoctor` and
// `bin.ts` catches; and `main` is `async`, which means an escaping throw becomes an UNHANDLED REJECTION
// rather than a rendered outcome with an exit code.
//
// That mattered the moment the read-provenance refusal landed: `DoctorSource` is documented total, and its
// legs now THROW over a COMMITTED durable store, because the frozen leg return types (`number`, `Hash[]`,
// `DriftItem | undefined`) have no refusal channel and every one of them would otherwise have to report a
// healthy, empty knowledge base for a store the read doors had just refused to serve. The entrypoint refuses
// the whole invocation earlier in production; this pins the backstop for every other composition.

import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDiskStore, createDoctorSource, gitSidecarTrust } from '@atlas/adapter-io';
import type { RevIndex } from '@atlas/adapter-io';
import { runDoctor, DOCTOR_SUBCOMMANDS } from '../src/doctor.js';

/** Never reached on a refused read — if one of these fires, the refusal did not happen. */
const DEAD_REV = {
  reDerives: () => false,
  resolveAnchorAt: () => undefined,
  resolveBySubtreeAt: () => undefined,
} as unknown as RevIndex;

let repoPath: string | undefined;
afterEach(() => {
  if (repoPath !== undefined) rmSync(repoPath, { recursive: true, force: true });
  repoPath = undefined;
});

/** A real repo whose durable store was landed by `git add -f` — the accident a missing ignore rule produces. */
function committedStoreRepo(): string {
  const p = mkdtempSync(join(tmpdir(), 'atlas-doctor-prov-'));
  const git = (...a: string[]): void => void execFileSync('git', ['-C', p, ...a], { stdio: 'ignore' });
  git('init', '-q');
  // Obviously-synthetic identity on the RFC 2606 reserved TLD; not a credential.
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'user.name', 'synthetic-fixture');
  git('config', 'commit.gpgsign', 'false');
  mkdirSync(join(p, '.atlas'), { recursive: true });
  writeFileSync(join(p, '.atlas', 'projection.json'), '{"current":[],"cas":[]}');
  git('add', '-f', '.atlas');
  git('commit', '-q', '-m', 'ship the store');
  return p;
}

describe('runDoctor stays TOTAL over a refusing DoctorSource', () => {
  it('EVERY doctor sub-command renders a structured non-zero outcome carrying the reason — never a throw', () => {
    repoPath = committedStoreRepo();
    const trusted = gitSidecarTrust(repoPath);
    const source = createDoctorSource(createDiskStore(join(repoPath, '.atlas', 'cas'), undefined, trusted), DEAD_REV, trusted);
    // The whole closed surface, not a sample: a leg added later inherits this or turns it red.
    for (const sub of DOCTOR_SUBCOMMANDS) {
      const arg = sub === 'hotset' ? '5' : 'k:whatever';
      const cv = runDoctor([sub, arg], source);
      expect(cv.exitCode, `doctor ${sub} exited 0 over a refused store`).not.toBe(0);
      expect(cv.stdout, `doctor ${sub} did not name the refusal`).toContain('untrusted-store');
    }
  });

  it('CONTROL: with no provenance seam the same legs answer normally — an honest empty store', () => {
    repoPath = mkdtempSync(join(tmpdir(), 'atlas-doctor-clean-'));
    const source = createDoctorSource(createDiskStore(join(repoPath, '.atlas', 'cas')), DEAD_REV);
    const cv = runDoctor(['hotset', '5'], source);
    expect(cv.exitCode).toBe(0);
    expect(cv.stdout).toContain('hotSet: size=0');
    expect(cv.stdout).not.toContain('untrusted-store');
  });
});
