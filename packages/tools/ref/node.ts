// @atlas/tools — ref/node.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The per-node READ projections / node-tools (TOOLS-10, RETR-5). Beyond the four governance tools, EVERY
// Atlas node is addressable by its CONTENT ADDRESS over THREE transports against ONE handler — an MCP
// tool, a proactive injection (the poke), and a CLI command — and the three MUST NOT diverge in contract
// (the content address is the stable handle and cannot lie). This adds NO write path: all three
// transports are read/subscribe; writes still funnel through `atlas-emit` (TOOLS-1). This facet exposes
// NO write-returning method. MCP/injection exposure is location-scoped (RETR-5) to protect context; the
// CLI is UNSCOPED — any node is addressable by address at any time. Transcribed from atlas-tools:59-66,
// 130-133, 175-176 + method-tags-tls:82-87.

import type { NodeKey } from '@atlas/contracts';
import type { GroundedFact } from '@atlas/knowledge';
import type { OwnPack, OwnUnit, RelationSet } from '@atlas/retrieval';

export interface NodeApi {
  /** Resolve a node by its CONTENT ADDRESS (TOOLS-10). READ-ONLY; resolves byte-identically over the MCP
   *  tool | poke | CLI (0 contract divergence, method-tags-tls:85). The CLI is unscoped.
   *
   *  [FLAG — `nodeAddr` = `NodeKey`] atlas-tools:131 names `atlas node <nodeAddr>`; the node identity leg
   *  is the `nodeKey` (mirrors retrieval `NodeTool.nodeId: NodeKey`). Transcribed as `NodeKey`. The return
   *  is the @atlas/knowledge `GroundedFact` (the node). */
  node(nodeAddr: NodeKey): GroundedFact;

  /** The deterministic related-node set for a scope (atlas-tools:132, RETR-10). READ-ONLY; owned by
   *  @atlas/retrieval (`RelationSet`), imported, NOT redefined.
   *
   *  [SIG-TBD — `scope` arg] transcribed as `string` (cf retrieval `Path = string`), NOT a brand. */
  relate(scope: string): RelationSet;

  /** The CURATED zero-assembly briefing for a scope-unit (atlas-tools:133, RETR-12). READ-ONLY; owned by
   *  @atlas/retrieval (`OwnPack` / `OwnUnit`), imported, NOT redefined. */
  own(unit: OwnUnit): OwnPack;
}
