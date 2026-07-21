// @atlas/mcp-server — src/server.ts  (MCP-1/2: the stdio MCP server over the one wired handler)
//
// Stand up a stdio MCP server whose every tool call routes through the one wired handler (@atlas/adapter-io),
// returning the frozen `Verdict` (@atlas/tools) shape. The surface is the CLOSED four-tool
// `GOVERNANCE_SURFACE`; each tool's `inputSchema` + `description` come from `handler.schema(tool)` (the
// handler OWNS the published schema, TOOLS-3 — never hand-authored here). A CallTool routes through
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
import { GOVERNANCE_SURFACE } from '@atlas/tools';
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
 * `handler.schema(tool)` (the handler owns the published schema — CLI ≡ MCP, byte-identical, TOOLS-3). The
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
 * renders with `isError:true` and text that CARRIES `rejected` + `guidance` (next + invariant) — the
 * fail-closed reason is ALWAYS visible, never an empty error (the known past bug). Pure + deterministic.
 */
export function verdictToResult(verdict: Verdict): CallToolResult {
  if (verdict.ok) {
    const text = JSON.stringify({ data: verdict.data, guidance: verdict.guidance });
    return { content: [{ type: 'text', text }] };
  }
  const text = JSON.stringify({ rejected: verdict.rejected, guidance: verdict.guidance });
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
