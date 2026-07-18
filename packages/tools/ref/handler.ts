// @atlas/tools — ref/handler.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// THE ONE handler behind EVERY transport (TOOLS-2/3/4/10) — the spine facet. `handle(tool, args)` is
// PURE + TOTAL: a malformed argument fails CLOSED to a structured rejected `Verdict`, NEVER a throw
// (TOOLS-2). It is the single published input SCHEMA (TOOLS-3): a tool invoked over the CLI and over MCP
// against that one schema returns a BYTE-IDENTICAL result — the two transports never diverge. Every
// result carries `next + invariant` guidance (TOOLS-4). The SAME handler is the content-addressed node
// oracle behind the tri-transport node reads (TOOLS-10, see ref/node.ts) — tiers differ only in
// transport, never in contract or result. Transcribed from atlas-tools:6-11, 187-190 +
// method-tags-tls:26-45, 82-87.

import type { NodeKey } from '@atlas/contracts';
import type { Tool, Verdict } from './types.js';

/** The transport a call arrived on (TOOLS-3/10). Transcribed from the reference's "one contract, two
 *  transports" (CLI≡MCP) plus the tri-transport node reads (MCP tool | poke | CLI). Behaviour MUST NOT
 *  diverge across these — the handler is the single oracle. */
export type Transport = 'cli' | 'mcp' | 'poke';

export interface HandlerApi {
  /** THE one handler. Pure + total (TOOLS-2): malformed `args` ⇒ a structured rejected `Verdict`, never a
   *  throw. Byte-identical over CLI and MCP against the one published schema (TOOLS-3). Carries
   *  `next+invariant` guidance on EVERY path (TOOLS-4). (method-tags-tls:30, 37, 44)
   *
   *  [SIG-TBD — `args` / `data` shapes] the reference frames one PUBLISHED schema per tool but freezes no
   *  concrete per-tool arg record here; `args` is `unknown` (fails closed if malformed) and the `Verdict`
   *  payload is `unknown` (the per-tool `InitOut`/`QueryOut`/… record). NOT invented — flagged. */
  handle(tool: Tool, args: unknown): Verdict;

  /** Resolve a node by CONTENT ADDRESS through the same one handler (TOOLS-10) — the oracle behind the
   *  tri-transport reads (MCP tool | poke | CLI), byte-identical across all three. READ-ONLY: this opens
   *  NO write path (writes still funnel through `atlas-emit`, TOOLS-1). (method-tags-tls:86) */
  resolveNode(nodeAddr: NodeKey, transport: Transport): Verdict;

  /** The one PUBLISHED input schema for a tool (TOOLS-3) — CLI and MCP share it; the two transports MUST
   *  NOT diverge. [SIG-TBD — schema shape] no concrete schema record is frozen here; `unknown`, NOT
   *  invented (cf retrieval `NodeTool.schema: unknown`). */
  schema(tool: Tool): unknown;
}
