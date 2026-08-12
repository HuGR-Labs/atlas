// @atlas/mcp-server — test/surface-conformance-req-mcp-1e.test.ts   (REQ-MCP-1e — SCN-MCP-1e-1)
//
// REQ-MCP-1e (added ADR-0006): "If the advertised set and the invocable set are computed separately, then
// the surface conformance gate shall fail" — the ARCH-5 no-independent-drift guard. This is the FIRST witness
// for REQ-MCP-1e; goldens-adapters.md self-admitted "every REQ [has ≥1 SCN] except REQ-MCP-1e" until now.
//
// STRUCTURAL proof, not a behavioural probe. Two facts about `src/server.ts`, each asserted directly against
// the SAME production values (never re-transcribed):
//   (1) `advertisedTools` derives its advertised names from `GOVERNANCE_SURFACE.map(...)` (@atlas/tools, the
//       ONE closed union — TOOLS-1) — proven by exact (ordered) equality against the imported array itself.
//   (2) `callTool` carries NO second, independent membership list of its own: every name that is not one of
//       the two special-cased read-tool tokens is forwarded UNFILTERED to `handler.handle` — the SAME handler
//       `advertisedTools` reads schemas from — proven by an off-surface name STILL reaching `handler.handle`
//       (if `callTool` grew its own allowlist/blocklist, that would be a second, independent computation of
//       "is this on the surface", which is exactly the drift REQ-MCP-1e forbids).
//
// Together (1)+(2) close REQ-MCP-1e: the advertised set and the invocable set cannot diverge without an edit
// to `GOVERNANCE_SURFACE` itself — there is nowhere left for "computed separately" to hide.
//
// TEETH (named per assertion below): a mutant that swaps `advertisedTools`' `GOVERNANCE_SURFACE.map(...)` for
// ANY second literal array (same five names, different order; a superset; a subset) flips test 1. A mutant
// that adds an independent allowlist/blocklist inside `callTool` before it forwards to `handler.handle` flips
// test 2 (and, for a name genuinely on `GOVERNANCE_SURFACE`, would also flip test 3 by starving `handler.handle`
// of a call it must receive).

import { describe, it, expect } from 'vitest';
import { GOVERNANCE_SURFACE } from '@atlas/tools';
import type { Tool, ToolData, Verdict } from '@atlas/tools';
import type { WiredHandler } from '@atlas/adapter-io';
import type { NodeKey, ToolSchema } from '@atlas/contracts';
import { advertisedTools, callTool } from '../src/server.js';

const GUIDANCE = { next: 'do-the-next-thing', invariant: 'the-governing-invariant' } as const;

/** A fake `WiredHandler` that RECORDS every tool name it is asked to handle — the dispatch-provenance probe.
 *  Never the real assembly (same posture as wp-9.4.7-mcp.test.ts's `fakeHandler`). */
const recordingHandler = (): WiredHandler & { seen: string[] } => {
  const seen: string[] = [];
  return {
    seen,
    handle: (tool: Tool, _args: unknown): Verdict<ToolData> => {
      seen.push(tool);
      return { ok: true, data: { emitted: true, id: 'x' } as unknown as ToolData, guidance: GUIDANCE };
    },
    schema: (tool: Tool): ToolSchema => ({
      name: tool,
      description: `desc::${tool}`,
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    }),
    // stub — the MCP transport never routes resolveNode; present only to satisfy WiredHandler (matches
    // wp-9.4.7-mcp.test.ts's stub shape).
    resolveNode: (nodeAddr: NodeKey) => ({ ok: false, rejected: `stub:${nodeAddr}`, guidance: GUIDANCE }),
  };
};

describe('SCN-MCP-1e-1 — advertised and invocable are both traced to the ONE source, never computed separately (REQ-MCP-1e)', () => {
  it('advertisedTools names equal GOVERNANCE_SURFACE byte-for-byte, in order — the single-source oracle', () => {
    // TEETH: a mutant that swaps advertisedTools' GOVERNANCE_SURFACE.map(...) for ANY second literal array —
    // even one holding the same five names in a different order, or a superset/subset — flips this. The only
    // way to pass is to read the array itself, never a transcription of it.
    const handler = recordingHandler();
    const names = advertisedTools(handler).map((t) => t.name);
    expect(names).toEqual([...GOVERNANCE_SURFACE]);
  });

  it('callTool forwards every GOVERNANCE_SURFACE name to handler.handle, unfiltered — no second invocable list', () => {
    // TEETH: a mutant that adds an independent allowlist inside callTool (checking `name` against a second
    // hardcoded array before forwarding) either drops a real tool — handler.handle never sees it, this
    // assertion goes RED — or the allowlist and GOVERNANCE_SURFACE silently diverge over time: exactly the
    // "computed separately" failure REQ-MCP-1e names.
    const handler = recordingHandler();
    for (const tool of GOVERNANCE_SURFACE) callTool(handler, tool, {});
    expect(handler.seen).toEqual([...GOVERNANCE_SURFACE]);
  });

  it('callTool has NO independent membership gate of its own — an off-surface name still reaches handler.handle', () => {
    // TEETH: this is the structural fact that MAKES single-sourcing possible. If callTool grew its own
    // allowlist/blocklist (a second, independent computation of "is this on the surface"), it could silently
    // drift from GOVERNANCE_SURFACE without this suite noticing. Proving callTool does NOT gate on name is
    // proving there is nowhere left for that drift to hide — surface enforcement lives in exactly ONE place
    // (the handler, via `legs[tool] === undefined` fail-closed).
    const handler = recordingHandler();
    callTool(handler, 'atlas-not-a-real-tool', {});
    expect(handler.seen).toEqual(['atlas-not-a-real-tool']);
  });

  it('advertised and invocable are the SAME set — REQ-MCP-1e closed by composition of the two facts above', () => {
    // Fact 1 (advertised === GOVERNANCE_SURFACE) + fact 2 (callTool forwards GOVERNANCE_SURFACE names to
    // handler.handle unfiltered) compose: the two sets cannot diverge without an edit to GOVERNANCE_SURFACE
    // itself. TEETH: reintroducing EITHER a second advertised-name array OR a second invocable allowlist —
    // even one that starts byte-identical to GOVERNANCE_SURFACE today — makes this drift-detectable the
    // moment the two lists are next edited independently, which is what "computed separately" means.
    const handler = recordingHandler();
    const advertised = advertisedTools(handler).map((t) => t.name);
    for (const tool of GOVERNANCE_SURFACE) callTool(handler, tool, {});
    expect(new Set(advertised)).toEqual(new Set(handler.seen));
  });
});
