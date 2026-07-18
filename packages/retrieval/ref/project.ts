// @atlas/retrieval — ref/project.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Location-scoped tool projection (RETR-5). Only nodes covering the CURRENT scope MAY be exposed as MCP
// tools at once; on leaving the scope they MUST retract. The whole graph MUST NOT be projected
// simultaneously — the tool surface is dynamic, following the navigator (A-15); 0 cross-scope
// accumulation. Total: a malformed scope yields an empty tool set, never a throw (RETR-9). Transcribed
// from atlas-retrieval:172 + method-tags-ret:49-54.

import type { NodeTool, Path } from './types.js';

export interface ProjectApi {
  /** Current scope → the covering nodes as MCP tools (RETR-5). MUST be called on scope-entry and its
   *  result retracted on scope-exit; MUST NOT accumulate across scopes / project the whole graph. Pure
   *  + total (miss ⇒ empty set, no throw — RETR-9). (atlas-retrieval:172) */
  projectTools(scope: Path): readonly NodeTool[];
}
