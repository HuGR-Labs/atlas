// @atlas/e2e-blackbox — test/harness.smoke.test.ts  (WP-E2E-HARNESS — the harness proves itself)
//
// The harness is worthless if it can't drive the real bins. This smoke test spawns the ACTUAL built
// `atlas` CLI + `atlas-mcp` stdio server against a real temp git repo and asserts they ran end-to-end
// (NOT a crash, NOT empty). It REQUIRES the dist built first — the tsconfig references (../cli, ../mcp-server)
// make `tsc -b` build them before this suite runs; a hard guard below fails loud if the bins are missing.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CLI_BIN, MCP_BIN, makeFixtureRepo, mcpSession, runAtlas } from '../src/harness.js';
import type { FixtureRepo } from '../src/harness.js';

/** The CLOSED governance surface — these tools, in this order (mirrors GOVERNANCE_SURFACE; WP-SAMEAS added
 *  the governed `atlas-link` write door as the fifth). */
const GOVERNANCE_TOOLS = ['atlas-init', 'atlas-query', 'atlas-emit', 'atlas-reconcile', 'atlas-link'];

let repo: FixtureRepo;

beforeAll(() => {
  // Hard build-dependency guard: the black-box harness spawns dist bins — if they're absent, fail LOUD
  // (never silently pass a harness that spawned nothing).
  expect(existsSync(CLI_BIN), `CLI bin not built: ${CLI_BIN}`).toBe(true);
  expect(existsSync(MCP_BIN), `MCP bin not built: ${MCP_BIN}`).toBe(true);
  repo = makeFixtureRepo({ files: { 'src/foo.ts': 'export const foo = (): number => 1;\n' } });
});

afterAll(() => repo?.cleanup());

describe('makeFixtureRepo — builds a real on-disk git repo', () => {
  it('produces .atlas/policy.json + .git + the source tree on disk', () => {
    expect(existsSync(join(repo.repoPath, '.atlas', 'policy.json'))).toBe(true);
    expect(existsSync(join(repo.repoPath, '.atlas', 'index.scip'))).toBe(true);
    expect(existsSync(join(repo.repoPath, '.git'))).toBe(true);
    expect(existsSync(join(repo.repoPath, 'src', 'foo.ts'))).toBe(true);
    expect(repo.sha()).toMatch(/^[0-9a-f]{40}$/);
  });

  it('commit(files) writes+commits and advances HEAD to a new SHA', () => {
    const before = repo.sha();
    const after = repo.commit({ 'src/bar.ts': 'export const bar = (): number => 2;\n' });
    expect(after).toMatch(/^[0-9a-f]{40}$/);
    expect(after).not.toBe(before);
    expect(existsSync(join(repo.repoPath, 'src', 'bar.ts'))).toBe(true);
  });
});

describe('runAtlas — drives the REAL atlas CLI as a subprocess', () => {
  it('`atlas query src` runs end-to-end via composeRuntime (numeric exit + `status:` in stdout)', () => {
    const r = runAtlas(repo.repoPath, ['query', 'src']);
    expect(typeof r.exitCode).toBe('number');
    // The real CLI rendered a real verdict — not a crash, not empty.
    expect(r.stdout).toContain('status:');
    expect(r.stdout.length).toBeGreaterThan(0);
  });

  it('`atlas doctor hotset 5` exits 0 with `doctor: hotset` (read-only advisory ran)', () => {
    const r = runAtlas(repo.repoPath, ['doctor', 'hotset', '5']);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('doctor: hotset');
  });
});

describe('mcpSession — drives the REAL atlas-mcp server over stdio', () => {
  it('listTools() returns EXACTLY the 4 governance tools with input schemas; then close()', async () => {
    const session = await mcpSession(repo.repoPath);
    try {
      const { tools } = await session.client.listTools();
      expect(tools.map((t) => t.name)).toEqual(GOVERNANCE_TOOLS);
      for (const t of tools) expect(t.inputSchema).toMatchObject({ type: 'object' });
    } finally {
      await session.close();
    }
  });
});
