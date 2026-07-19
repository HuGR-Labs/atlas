// @atlas/contracts — tool.ts
//
// The MCP tool-schema record — the ONE shared shape a callable advertises over the transport
// (the JSON-Schema subset MCP itself uses). Declared here in layer-0 because it is consumed by BOTH
// @atlas/tools (the governance handler surface) and @atlas/retrieval (per-node tool projection), and
// those two must expose byte-identical schemas — a divergent shape is exactly the drift this seam
// prevents. Owner DEFINE 2026-07-18 (oracle-pin theme #2): decide once, share.

/** A callable's advertised schema, as surfaced over MCP / poke / CLI (one handler, TOOLS-10). The
 *  `inputSchema` is a JSON-Schema object (kept structural — the schema DSL is the external MCP
 *  standard, not an atlas-owned shape). */
export interface ToolSchema {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}
