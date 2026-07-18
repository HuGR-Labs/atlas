// @atlas/index — ref/build.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The mechanical, `$0`-LLM axis build (INDEX-3). Every axis (structural, territory, depends-on + blast
// radius) is derived from the real file tree + a per-language SCIP indexer's recorded output — a pure
// function of its inputs, 0 model calls, idempotent on re-run; an edge it cannot statically resolve
// (incl. every cross-language edge) is declared `unresolved`, never guessed. (method-tags-idx:34-39;
// atlas-index:57-58, 108-113, 157-163)

import type { Axes, FileTree, ScipOutput } from './types.js';

export interface BuildApi {
  /** Derive all axis-views from the file tree + recorded SCIP output; deterministic, `$0`-LLM,
   *  idempotent (rebuild twice ⇒ identical trees). The SCIP binary is a black-box input (fixtures),
   *  NOT modeled here (method-tags-idx:38-39). (method-tags-idx:38; atlas-index:157-159) */
  build(tree: FileTree, scipOutput: ScipOutput): Axes;
}
