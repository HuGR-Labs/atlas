// @atlas/mcp-server — src/server.ts  (MCP-1/2: the stdio MCP server over the one wired handler)
//
// Stand up a stdio MCP server whose every GOVERNED tool call routes through the one wired handler
// (@atlas/adapter-io), returning the frozen `Verdict` (@atlas/tools) shape. The advertised surface is
// `GOVERNANCE_SURFACE` (exactly five, TOOLS-1, pinned) PLUS any injected READ leg — today the one read tool
// `atlas-relations` (#99a / ADR-0015 D2), advertised via `advertisedReadTools(relations)` when a relation
// leg is composed, so production advertises SIX tools. HONEST DIVERGENCE, stated so it is not mistaken for the
// designed seam: the constitution's extension point is `GOVERNANCE_SURFACE ∪ READ_SURFACE` (ADR-0006), but
// `READ_SURFACE` has NO export site anywhere in `packages/**` (CAMPAIGN-10.3 / WP-10.A5.TOOLS is not built —
// `npm run layer-guard` reports it DECLARED UNCOVERED). Rather than block a read tool on that unbuilt seam,
// `atlas-relations` is advertised through a NARROW parallel path that leaves `GOVERNANCE_SURFACE` byte-for-byte
// closed at five (SCN-MCP-1 holds) and is served DIRECTLY from the injected leg, never through `handler.handle`
// — it opens no governed token and no write path. Folding this into the formal `READ_SURFACE` seam remains
// owed to CAMPAIGN-10.3.
//
// PARITY — precisely which one holds. SCHEMA + VERDICT parity HOLDS: `inputSchema`/`description` are read
// from `handler.schema(tool)` verbatim and every call routes through the ONE wired handler, so identical
// input yields a byte-identical `Verdict` on CLI and MCP (TOOLS-3). SURFACE parity does NOT hold: the CLI
// command surface (`@atlas/cli` `COMMANDS` — the oracle; a count transcribed here would be a second one, and
// this line carried a stale "NINE" for exactly that reason) includes `doctor`, `mine`, `node`, `promote` and
// `own`, none of which are in `GOVERNANCE_SURFACE`, so all five are CLI-only and unreachable over MCP.
// `promote` is the one worth stating explicitly, because it WRITES: the KNOW-8 curator door publishes through
// `atlas-emit` (ADR-0008 — an ordinary use of the existing door, not new surface), so no tool token exists
// for it and an MCP client cannot promote staged candidates. `own` is the newest, and it READS: the RETR-12
// briefing is a second projection of the query readback over the same store, so an MCP client that wants it
// composes it from `atlas-query` — it, too, adds no tool token. Do not read "CLI ≡ MCP" below as a
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
import type { RelationLeg, WiredHandler } from '@atlas/adapter-io';
import { relationsVerdict } from '@atlas/adapter-io';
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

/**
 * The `atlas relations` MCP tool (#99a). It is a READ tool served DIRECTLY from an injected `RelationLeg`,
 * NOT through `GOVERNANCE_SURFACE` — so `GOVERNANCE_SURFACE` stays 5 and the closed-surface pin is untouched.
 * This is the honest mirror of the CLI, where `relations` (like `node`/`own`) is intercepted BEFORE the
 * handler: it opens no governed surface and has no `Tool` token, so `handler.schema` cannot own its schema.
 * The schema is therefore DOCUMENTED here and advertised verbatim — the one place it lives.
 */
export const RELATIONS_TOOL = 'atlas-relations';

/**
 * The DOCUMENTED input schema for `atlas-relations` (JSON-Schema). `unit` is the required nodeKey the
 * relations touch; `direction` is optional (`out` = the unit is the SUBJECT, `in` = the OBJECT, `both` = the
 * union; default `both`).
 *
 * WHAT IS ENFORCED, stated honestly (the schema is advertised to clients, but the transport does not run a
 * JSON-Schema validator): `required:['unit']` IS enforced — a missing/non-string `unit` fails CLOSED at the
 * shared `relationsVerdict` body (isError), so the required-unit contract holds identically on CLI and MCP.
 * `additionalProperties:false` is ADVERTISED but not machine-enforced here — an extra key is ignored, not
 * rejected. That matches the wider MCP schema-enforcement limitation this repo already tracks (task #166);
 * it is a documentation-honesty note, not a hole (the tool is strictly read-only and every arg is coerced
 * totally). Do not read the advertised schema as a validator this server runs.
 */
export const RELATIONS_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    unit: { type: 'string', description: 'the nodeKey the grounded relations touch' },
    direction: {
      type: 'string',
      enum: ['out', 'in', 'both'],
      description: 'out = unit is the subject, in = the object, both = the union (default both)',
    },
  },
  required: ['unit'],
  additionalProperties: false,
} as const;

/** The read tools advertised beside the governance surface — the `relations` tool when a leg is injected,
 *  else none (so the closed-governance pin holds byte-for-byte when no read leg is composed). */
export function advertisedReadTools(relations?: RelationLeg): SdkTool[] {
  if (relations === undefined) return [];
  return [
    {
      name: RELATIONS_TOOL,
      description:
        'Read the GROUNDED relation facts (family:relation) touching a unit, both directions (#99a / ADR-0015 D2). Read-only; opens no governed surface.',
      inputSchema: RELATIONS_INPUT_SCHEMA as unknown as SdkTool['inputSchema'],
    },
  ];
}

/** The ListTools response — the closed governance surface (TOOLS-1), PLUS the `relations` read tool when a
 *  read leg is injected. With no leg the response is byte-for-byte the closed governance surface. */
export function listTools(handler: WiredHandler, relations?: RelationLeg): ListToolsResult {
  return { tools: [...advertisedTools(handler), ...advertisedReadTools(relations)] };
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
export function callTool(handler: WiredHandler, name: string, args: unknown, relations?: RelationLeg): CallToolResult {
  // `atlas-relations` (#99a) is served DIRECTLY from the injected read leg through the SHARED verdict builder
  // (`relationsVerdict`, @atlas/adapter-io) — the SAME body the CLI drives, so identical input yields a
  // byte-identical `Verdict` on both transports (the SCHEMA + VERDICT parity invariant). It never reaches
  // `handler.handle`: it is not a `Tool` and has no governed token. TOTAL — a non-string `unit` coerces to
  // `''` and a non-string `direction` to `undefined`, then `relationsVerdict` ENFORCES `required:['unit']`
  // (a missing/empty unit fails CLOSED to `isError`, matching the CLI) and rejects a bad `direction` — never a throw.
  if (relations !== undefined && name === RELATIONS_TOOL) {
    const a = (typeof args === 'object' && args !== null ? args : {}) as { unit?: unknown; direction?: unknown };
    const unit = typeof a.unit === 'string' ? a.unit : '';
    const direction = typeof a.direction === 'string' ? a.direction : undefined;
    return verdictToResult(relationsVerdict(relations, unit, direction));
  }
  const verdict = handler.handle(name as Tool, args);
  return verdictToResult(verdict);
}

/** Wire the SDK `Server` over the one handler: advertise the closed surface (+ the `relations` read tool when
 *  a read leg is injected) and route every CallTool. */
function configureServer(handler: WiredHandler, relations?: RelationLeg): Server {
  const server = new Server(SERVER_INFO, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, () => listTools(handler, relations));
  server.setRequestHandler(CallToolRequestSchema, (request) =>
    callTool(handler, request.params.name, request.params.arguments, relations),
  );
  return server;
}

/** Construct the stdio MCP server over the one wired handler (MCP-1), optionally exposing the `relations`
 *  read tool when the composition root injects its leg. */
export function createMcpServer(handler: WiredHandler, relations?: RelationLeg): McpServer {
  return {
    async start(): Promise<void> {
      const server = configureServer(handler, relations);
      const transport = new StdioServerTransport();
      await server.connect(transport);
    },
  };
}
