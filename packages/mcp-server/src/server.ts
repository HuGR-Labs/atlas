// @atlas/mcp-server — src/server.ts  (MCP-1/2: the stdio MCP server over the one wired handler)
//
// Stand up a stdio MCP server whose every tool call routes through the one wired handler (@atlas/wire),
// returning the frozen `Verdict` (@atlas/tools) shape. SKELETON — the MCP SDK is NOT a dependency here
// (the MCP WP adds it); the transport is a plain factory stub. Signature frozen, body deferred.

import type { WiredHandler } from '@atlas/wire';
import type { Verdict } from '@atlas/tools';

/** The stdio MCP server handle (ring shape stub — the MCP WP swaps in the real SDK transport). */
export interface McpServer {
  start(): Promise<void>;
}

/** The frozen verdict shape every tool call returns over the transport (referenced to pin the edge). */
type _Verdict = Verdict;

/** Construct the stdio MCP server over the one wired handler (MCP-1). */
export function createMcpServer(handler: WiredHandler): McpServer {
  void handler;
  return {
    start(): Promise<void> {
      throw new Error('unimplemented: MCP-1 — stdio MCP transport over the one wired handler');
    },
  };
}
