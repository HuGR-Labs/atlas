// @atlas/mcp-server — src/server.ts  (MCP-1/2: the stdio MCP server over the one wired handler)
//
// Stand up a stdio MCP server whose every tool call routes through the one wired handler (@atlas/adapter-io),
// returning the frozen `Verdict` (@atlas/tools) shape. The advertised surface is `GOVERNANCE_SURFACE ∪
// READ_SURFACE` (ADR-0006 superseded the older "publishes exactly five" rule); it enumerates to the five
// governance tools TODAY only because `READ_SURFACE` is still empty — the constant has NO export site
// anywhere in `packages/**` (CAMPAIGN-10.3 / WP-10.A5.TOOLS is not built), which `npm run layer-guard`
// reports as DECLARED UNCOVERED on every run.
//
// PARITY — precisely which one holds. SCHEMA + VERDICT parity HOLDS: `inputSchema`/`description` are read
// from `handler.schema(tool)` verbatim and every call routes through the ONE wired handler, so identical
// input yields a byte-identical `Verdict` on CLI and MCP (TOOLS-3). SURFACE parity does NOT hold: the CLI
// exposes NINE commands (`@atlas/cli` `COMMANDS`), and `doctor`, `mine`, `node` and `promote` are absent from
// `GOVERNANCE_SURFACE`, so they are CLI-only and unreachable over MCP. `promote` is the newest of them and it
// is the one worth stating explicitly, because it WRITES: the KNOW-8 curator door publishes through
// `atlas-emit` (ADR-0008 — an ordinary use of the existing door, not new surface), so no tool token exists
// for it and an MCP client cannot promote staged candidates. Do not read "CLI ≡ MCP" below as a
// claim that the two transports reach the same set of operations — it is a claim about the schema bytes.
// A CallTool routes through
// `handler.handle(tool, args)` and maps the total `Verdict` → `CallToolResult`: a rejected (fail-closed)
// verdict is rendered as an `isError` result whose text CARRIES `rejected` + `guidance` (never an empty
// error — the known past bug). Pure + total: no clock, no random, and the transport never throws to the SDK.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type {
  CallToolResult,
  ListToolsResult,
  Tool as SdkTool,
} from '@modelcontextprotocol/sdk/types.js';
import type { WiredHandler } from '@atlas/adapter-io';
import { faultOf, GOVERNANCE_SURFACE } from '@atlas/tools';
import type { Tool, Verdict } from '@atlas/tools';

/** The stdio MCP server handle (frozen ring shape — `start()` connects the SDK stdio transport). */
export interface McpServer {
  start(): Promise<void>;
}

/** The frozen verdict shape every tool call returns over the transport (referenced to pin the edge). */
type _Verdict = Verdict;

/** This server's advertised identity (constant — no clock/random in the mapping). */
const SERVER_INFO = { name: '@atlas/mcp-server', version: '0.0.0' } as const;

/**
 * The advertised tool list (ListTools) — EXACTLY the `GOVERNANCE_SURFACE` tools, no more, no less (TOOLS-1;
 * WP-SAMEAS extended the surface to five with the governed `atlas-link` write door). The MCP tool `name` is
 * the `Tool` string; `description` + `inputSchema` are read from
 * `handler.schema(tool)` (the handler owns the published schema — CLI ≡ MCP in SCHEMA and VERDICT bytes,
 * TOOLS-3; NOT in exposed surface — see the file header for the three CLI-only commands). The
 * `inputSchema` is a JSON-Schema object structurally (`{type:'object',…}`), narrowed to the SDK's schema
 * shape at the transport boundary — the bytes are the handler's, unaltered.
 */
export function advertisedTools(handler: WiredHandler): SdkTool[] {
  return GOVERNANCE_SURFACE.map((tool): SdkTool => {
    const s = handler.schema(tool);
    return {
      name: tool,
      description: s.description,
      inputSchema: s.inputSchema as SdkTool['inputSchema'],
    };
  });
}

/** The ListTools response — the closed governance surface (TOOLS-1). */
export function listTools(handler: WiredHandler): ListToolsResult {
  return { tools: advertisedTools(handler) };
}

/**
 * Map a total `Verdict` → `CallToolResult` (MCP-2). An `ok:true` verdict renders as a normal result whose
 * text is the JSON of `data` + `guidance` (`isError` absent). An `ok:false` (rejected / fail-closed) verdict
 * renders with `isError:true` and text that CARRIES `fault` + `rejected` + `guidance` (next + invariant) —
 * the fail-closed reason is ALWAYS visible, never an empty error (the known past bug). Pure + deterministic.
 *
 * `fault` is the ERROR CLASS as a machine value (`@atlas/tools` `faultOf`): `malformed-args` (the caller's
 * arguments did not parse against the published schema), `refused` (a door deliberately declined), or
 * `internal-fault` (Atlas itself threw). An MCP client is an AGENT, and the whole point of the attribution
 * fix is that an agent must not be left to infer from prose whether to retry with different arguments, stop
 * and report a governance refusal, or file a defect. It rides an ADDITIVE field: `rejected` and `guidance`
 * are byte-unchanged, so every existing consumer of this envelope keeps reading what it read.
 */
export function verdictToResult(verdict: Verdict): CallToolResult {
  if (verdict.ok) {
    const text = JSON.stringify({ data: verdict.data, guidance: verdict.guidance });
    return { content: [{ type: 'text', text }] };
  }
  const text = JSON.stringify({ fault: faultOf(verdict), rejected: verdict.rejected, guidance: verdict.guidance });
  return { content: [{ type: 'text', text }], isError: true };
}

/**
 * Handle a CallTool request: route through the one wired handler and map its total `Verdict`. The handler is
 * TOTAL (an off-surface / malformed token fails CLOSED to a rejected verdict, never a throw), so a malformed
 * request maps to a well-formed `isError` result — the transport never throws to the SDK. The `name` is
 * passed as the `Tool` token; an off-surface token routes to the handler's fail-closed path.
 */
export function callTool(handler: WiredHandler, name: string, args: unknown): CallToolResult {
  const verdict = handler.handle(name as Tool, args);
  return verdictToResult(verdict);
}

/** Wire the SDK `Server` over the one handler: advertise the closed surface + route every CallTool. */
function configureServer(handler: WiredHandler): Server {
  const server = new Server(SERVER_INFO, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, () => listTools(handler));
  server.setRequestHandler(CallToolRequestSchema, (request) =>
    callTool(handler, request.params.name, request.params.arguments),
  );
  return server;
}

/** Construct the stdio MCP server over the one wired handler (MCP-1). */
export function createMcpServer(handler: WiredHandler): McpServer {
  return {
    async start(): Promise<void> {
      const server = configureServer(handler);
      const transport = new StdioServerTransport();
      await server.connect(transport);
    },
  };
}
