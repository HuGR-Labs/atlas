// @atlas/e2e-blackbox — test/s5-mcp-parity.blackbox.test.ts  (S5 — the agent journey over real MCP stdio)
//
// NARRATIVE: an agent connects to the real `atlas-mcp` server over real MCP stdio, lists the tools, runs an
// `atlas-query` (against a repo the CLI already wrote a grounded fact into), and attempts a fail-closed
// `atlas-emit`. Drives the REAL server subprocess through the SDK `Client` — highest agent fidelity.
//
// SOTA invariants pinned: TRANSPORT PARITY (one governed core, two doors — the MCP `atlas-query` verdict is
// SEMANTICALLY identical to the CLI's for the same input), and FAIL-CLOSED SURVIVES stdio (a rejected emit
// carries `emitted:false` + the rejection reason + guidance through the transport — never a silent success).
//
// FINDING #2 (documented in the fail-closed test): a rejected `atlas-emit` over MCP does NOT set
// `isError:true` — the handler wraps the `EmitOut{emitted:false}` in an `ok:true` verdict, so the SDK result
// carries the rejection ONLY in `data.emitted:false` + `data.rejected` (the CLI maps the SAME verdict to exit
// 2). The governed VERDICT is faithfully transported (parity holds); the error-CHANNEL semantics diverge.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeFixtureRepo, mcpSession, runAtlas } from '../src/harness.js';
import type { FixtureRepo } from '../src/harness.js';
import { groundedAdvisoryFact, ungroundedFact } from './author.js';
import type { GroundedFact } from '@atlas/knowledge';
import { ACTOR, emitFact, invLines, scopedPolicy } from './support.js';

const GOVERNANCE_TOOLS = ['atlas-init', 'atlas-query', 'atlas-emit', 'atlas-reconcile'];
const REQUIRED: Record<string, string[]> = {
  'atlas-init': ['path'],
  'atlas-query': ['scope'],
  'atlas-emit': ['node', 'at'],
  'atlas-reconcile': ['mergeBase'],
};

interface McpText { data?: unknown; rejected?: unknown; guidance?: { next?: string; invariant?: string } }
const textOf = (r: { content: Array<{ text?: string }> }): McpText => JSON.parse(r.content[0]?.text ?? '{}') as McpText;

let repo: FixtureRepo;
let fact: GroundedFact;
let priorActor: string | undefined;

beforeAll(() => {
  priorActor = process.env.ATLAS_ACTOR;
  process.env.ATLAS_ACTOR = ACTOR;
  repo = makeFixtureRepo({ files: { 'src/foo.ts': 'export const foo = 1;\n' }, policy: scopedPolicy('src') });
  fact = groundedAdvisoryFact({ repoPath: repo.repoPath, filePath: 'src/foo.ts', slot: 'invariant', claim: 'foo is 1' });
  const e = emitFact(repo, fact); // persist ONE grounded fact via the CLI door — both transports read it back
  if (e.exitCode !== 0) throw new Error(`S5 setup: grounded emit failed:\n${e.stdout}`);
});

afterAll(() => {
  repo?.cleanup();
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR;
  else process.env.ATLAS_ACTOR = priorActor;
});

describe('S5 — MCP stdio parity with the CLI over the one governed core', () => {
  it('listTools() advertises EXACTLY the 4 governance tools, each with an object input schema + required args', { timeout: 20000 }, async () => {
    const session = await mcpSession(repo.repoPath);
    try {
      const { tools } = await session.client.listTools();
      expect(tools.map((t) => t.name)).toEqual(GOVERNANCE_TOOLS);
      for (const t of tools) {
        expect(t.inputSchema).toMatchObject({ type: 'object' });
        expect(t.inputSchema.required).toEqual(REQUIRED[t.name]);
      }
    } finally {
      await session.close();
    }
  });

  it('SOTA transport parity: MCP `atlas-query` returns the SAME governed verdict the CLI does', { timeout: 20000 }, async () => {
    // the CLI verdict for the same input (rendered rows).
    const cli = runAtlas(repo.repoPath, ['query', 'src']);
    expect(invLines(cli.stdout)).toEqual([`  inv T1 ${fact.id}: foo is 1`]);

    const session = await mcpSession(repo.repoPath);
    try {
      const res = await session.client.callTool({ name: 'atlas-query', arguments: { scope: 'src' } });
      expect(res.isError).toBeFalsy();
      const body = textOf(res as { content: Array<{ text?: string }> });
      const pack = (body.data as { pack?: { invariants?: unknown } }).pack;
      // the SAME semantic invariant (nodeId/tier/claim) the CLI rendered — parity across the two doors.
      expect(pack?.invariants).toEqual([{ nodeId: fact.id, tier: 'T1', claim: 'foo is 1' }]);
    } finally {
      await session.close();
    }
  });

  it('SOTA fail-closed survives stdio: a rejected MCP `atlas-emit` carries emitted:false + reason + guidance', { timeout: 20000 }, async () => {
    const session = await mcpSession(repo.repoPath);
    try {
      const res = await session.client.callTool({
        name: 'atlas-emit',
        arguments: { node: ungroundedFact('bad over mcp'), at: repo.sha() },
      });
      const body = textOf(res as { content: Array<{ text?: string }> });
      const data = body.data as { emitted?: unknown; rejected?: unknown };
      // the fail-closed signal survives the transport: the write did NOT land, and the reason is carried.
      expect(data.emitted).toBe(false);
      expect(String(data.rejected)).toContain('ungrounded');
      expect(body.guidance?.next).toBeTruthy();
      expect(body.guidance?.invariant).toContain('TOOLS-1/7');
      // FINDING #2: `isError` is NOT set for this fail-closed emit (rejection rides `data`, not the error
      // channel) — the CLI maps the identical verdict to exit 2. Asserted to PIN the current behavior.
      expect(res.isError).toBeFalsy();
    } finally {
      await session.close();
    }
  });

  it('fail-closed did not persist: a subsequent CLI query still shows only the ONE grounded fact', () => {
    const r = runAtlas(repo.repoPath, ['query', 'src']);
    expect(invLines(r.stdout)).toEqual([`  inv T1 ${fact.id}: foo is 1`]); // the bad MCP emit left nothing
  });
});
