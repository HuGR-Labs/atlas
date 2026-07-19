// @atlas/tools — src/handler.ts   (WP-7.26-a.TOOLS — TOOLS-1 / TOOLS-2 / TOOLS-4, INV-TOOLS-1 / -2 / -4)
//
// THE ONE handler behind EVERY transport — the spine facet, created HEAD of the sequential handler chain
// (WP-7.26-b / -c / -7.32 extend this file downstream). This slice lands the EPIC-26-a obligations:
//   • the CLOSED four-tool governance surface (`GOVERNANCE_SURFACE`, count == 4) and the single write path
//     (`WRITE_PATHS`, `writePaths == 1` → `atlas-emit`) — TOOLS-1;
//   • `handle(tool, args)` PURE + TOTAL — a malformed argument fails CLOSED to a structured rejected
//     `Verdict`, NEVER a throw (TOOLS-2), with `next + invariant` guidance stamped on EVERY path (TOOLS-4).
// The per-tool legs (init / query / emit / reconcile) are INJECTED — the wrapper adds totality + guidance
// around them; it reads no wall-clock and holds no mutable cache, so it is pure whenever its legs are.
// Transcribed against the FROZEN oracle `../ref/handler.ts` (`HandlerApi`) + `../ref/types.ts`
// (`Tool` / `Verdict` / `Guidance`); goldens SCN-TOOLS-1a-1 / 1b-1 / 2a-1 / 2b-1.
//
// SCOPE (this facet, 7.26-a): the surface constants + the pure/total wrapper. WP-7.26-b (this landing)
// ADDITIVELY fills the published-schema body below (`SCHEMAS`, one byte-identical schema per tool, CLI ≡
// MCP — TOOLS-3) alongside src/query.ts + src/doctor.ts. STILL EXCLUDED — the tri-transport node read
// `resolveNode` (EPIC-26-c, WP-7.26-c) ships here as an HONEST read-only minimal seam for the successor WP.

import type { NodeKey, ToolSchema } from '@atlas/contracts';
import type { GroundedFact } from '@atlas/knowledge';
import type { ToolData, Transport, HandlerApi } from '../ref/handler.js';
import type { Guidance, Tool, Verdict } from '../ref/types.js';

/** The CLOSED governance surface — EXACTLY four tools, no more (TOOLS-1). The order is fixed; membership is
 *  the load-bearing fact (surface count == 4). */
export const GOVERNANCE_SURFACE: readonly Tool[] = [
  'atlas-init',
  'atlas-query',
  'atlas-emit',
  'atlas-reconcile',
];

/** The write surface — EXACTLY one entry (`writePaths == 1`): `atlas-emit` is the ONLY write path (TOOLS-1).
 *  The other three governance tools read/derive; the read projections (diff / doctor / node) carry no write
 *  authority (guarded structurally in `./guard.ts`). */
export const WRITE_PATHS: readonly Tool[] = ['atlas-emit'];

/** A per-tool leg — the concrete tool computation the handler wraps. It MAY throw on a malformed argument;
 *  the wrapper converts that to a structured rejected `Verdict` (TOOLS-2 totality). */
export type ToolLeg = (args: unknown) => ToolData;

/** The injected legs, keyed by tool. Partial: a leg not wired at this seam fails closed to a rejected
 *  verdict (never a throw), so the handler is total over the whole surface. */
export type ToolLegs = Partial<Record<Tool, ToolLeg>>;

/** The READ-ONLY per-node projection port — the pack-grained node oracle (TOOLS-10, X1 drill-down). It
 *  resolves a node by its CONTENT ADDRESS reached AS A DRILL-DOWN WITHIN its pack (never a top-level node
 *  swarm — wave-plan §X1). Read/subscribe ONLY: it exposes NO store-mutating method (writes still funnel
 *  through `atlas-emit`, TOOLS-1). @atlas/tools CONSUMES this port; the concrete pack/CAS resolution is the
 *  @atlas/index / @atlas/knowledge axis, injected here, never computed in this facet. */
export interface NodeSource {
  /** Resolve a node by content address; `undefined` ⇒ no such grounded node. READ-ONLY. */
  resolve(nodeAddr: NodeKey): GroundedFact | undefined;
}

/** The `next + invariant` guidance every per-node read ships (TOOLS-4) — non-empty on hit AND miss paths. */
const NODE_GUIDANCE: Guidance = {
  next: 'a node is reached as a drill-down within its pack; the same address resolves byte-identically over MCP | poke | CLI',
  invariant: 'TOOLS-10: one read-only oracle, no divergence across transports, no write path',
};

/** The `next + invariant` guidance stamped on every result (TOOLS-4) — non-empty on ok AND reject paths. */
const GUIDANCE: Record<Tool, Guidance> = {
  'atlas-init': {
    next: 'review the T2/advisory move-in skeleton, then promote territories via atlas-emit',
    invariant: 'TOOLS-5: $0-LLM structural move-in, no auto-promotion above T2',
  },
  'atlas-query': {
    next: 're-ground stale packs before trusting; scope must be a path string',
    invariant: 'TOOLS-6: bounded read projection (tier>=T1)',
  },
  'atlas-emit': {
    next: 'a rejected write did not re-derive at source@sha — fix the citation and re-emit',
    invariant: 'TOOLS-1/7: atlas-emit is the single fail-closed write door',
  },
  'atlas-reconcile': {
    next: 'a semantic flip blocks the merge (exit 2) — re-author before merging',
    invariant: 'TOOLS-8: reviewable drift, block on any semantic flip',
  },
};

/** Fallback guidance for an off-surface tool token — still non-empty (TOOLS-4 totality). */
const GUIDANCE_OFF_SURFACE: Guidance = {
  next: 'invoke one of the four governance tools: atlas-init | atlas-query | atlas-emit | atlas-reconcile',
  invariant: 'TOOLS-1: the governance surface is exactly four tools',
};

const guidanceFor = (tool: Tool): Guidance => GUIDANCE[tool] ?? GUIDANCE_OFF_SURFACE;

const reason = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** THE one published input schema per governance tool (TOOLS-3) — CLI and MCP share it byte-for-byte; the
 *  schema carries NO transport parameter, so the same bytes back every surface (the divergence this seam
 *  prevents). Each `inputSchema` is a JSON-Schema object (the external MCP schema DSL, kept structural). The
 *  arg names mirror the frozen per-tool signatures: `init(path)` / `query(scope)` / `emit(node,at)` /
 *  `reconcile(mergeBase, {acceptReground})`. */
const SCHEMAS: Record<Tool, ToolSchema> = {
  'atlas-init': {
    name: 'atlas-init',
    description: '$0-LLM structural move-in — returns the T2/advisory territory skeleton, blast radius, and T0-candidate flags (TOOLS-5)',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'repo/subtree path to walk structurally' } },
      required: ['path'],
      additionalProperties: false,
    },
  },
  'atlas-query': {
    name: 'atlas-query',
    description: 'bounded read projection — resolves a scope to the merged covering pack of tier>=T1 invariants, stale-flagged (TOOLS-6)',
    inputSchema: {
      type: 'object',
      properties: { scope: { type: 'string', description: 'file/folder/module/crate scope to resolve' } },
      required: ['scope'],
      additionalProperties: false,
    },
  },
  'atlas-emit': {
    name: 'atlas-emit',
    description: 'the single fail-closed write door — re-derives the citation at source@sha, rejects a node that does not re-derive (TOOLS-1/7)',
    inputSchema: {
      type: 'object',
      properties: {
        node: { type: 'object', description: 'the templated grounded candidate fact to admit' },
        at: { type: 'string', description: 'the source@sha anchor the citation must re-derive at' },
      },
      required: ['node', 'at'],
      additionalProperties: false,
    },
  },
  'atlas-reconcile': {
    name: 'atlas-reconcile',
    description: 'the merge gate — classifies drift into a reviewable set, exits 2 on any semantic flip (TOOLS-8)',
    inputSchema: {
      type: 'object',
      properties: {
        mergeBase: { type: 'string', description: 'the merge-base sha to classify drift against' },
        acceptReground: { type: 'boolean', description: 'auto-re-ground the mechanical subset in one pass (TOOLS-13)' },
      },
      required: ['mergeBase'],
      additionalProperties: false,
    },
  },
};

/** Fallback schema for an off-surface tool token — still a well-formed `ToolSchema` (totality). */
const SCHEMA_OFF_SURFACE = (tool: Tool): ToolSchema => ({
  name: tool,
  description: 'not one of the four governance tools (TOOLS-1)',
  inputSchema: { type: 'object', additionalProperties: false },
});

/**
 * Build THE one handler over the injected per-tool `legs` and (optionally) a read-only per-node projection
 * `nodes`. The returned object conforms EXACTLY to the frozen `HandlerApi`. `handle` is pure + total: it
 * reads no clock and holds no cache, and it converts a missing leg OR a leg throw into a structured rejected
 * `Verdict` — never a throw (TOOLS-2) — with guidance stamped on every path (TOOLS-4). When `nodes` is
 * omitted, `resolveNode` fails closed to a rejected verdict (no source wired) — still total, never a throw.
 */
export function createHandler(legs: ToolLegs, nodes?: NodeSource): HandlerApi {
  const handle = (tool: Tool, args: unknown): Verdict<ToolData> => {
    const guidance = guidanceFor(tool);
    const leg = legs[tool];
    if (leg === undefined) {
      return { ok: false, rejected: `tool '${tool}' not wired at this seam`, guidance };
    }
    try {
      const data = leg(args);
      return { ok: true, data, guidance };
    } catch (e) {
      // TOOLS-2: fail CLOSED on a malformed argument — a structured rejected verdict, never a throw.
      return { ok: false, rejected: `malformed args — fail-closed: ${reason(e)}`, guidance };
    }
  };

  // resolveNode — THE tri-transport per-node read (TOOLS-10, EPIC-26-c). READ-ONLY: it opens NO write path
  // (writes still funnel through `atlas-emit`, TOOLS-1). `transport` records the ROUTE only — the resolved
  // node content is byte-identical over MCP | poke | CLI (the one handler is the single oracle), so it never
  // changes the result. Per wave-plan §X1 a node is reached as a DRILL-DOWN WITHIN its pack. Total: a missing
  // source or an unknown address fails closed to a rejected verdict, never a throw; guidance rides every path.
  const resolveNode = (nodeAddr: NodeKey, _transport: Transport): Verdict => {
    if (nodes === undefined) {
      return { ok: false, rejected: 'no per-node projection source wired at this seam', guidance: NODE_GUIDANCE };
    }
    const node = nodes.resolve(nodeAddr);
    if (node === undefined) {
      return { ok: false, rejected: `no grounded node at content address '${nodeAddr}'`, guidance: NODE_GUIDANCE };
    }
    return { ok: true, data: node, guidance: NODE_GUIDANCE };
  };

  // schema — THE one published input schema (TOOLS-3): CLI ≡ MCP, byte-identical (no transport parameter).
  const schema = (tool: Tool): ToolSchema => SCHEMAS[tool] ?? SCHEMA_OFF_SURFACE(tool);

  return { handle, resolveNode, schema };
}

// differential-vs-oracle (compile-time): the handler conforms to the frozen `HandlerApi` (../ref/handler.ts).
const _handlerConforms: HandlerApi = createHandler({});
void _handlerConforms;
