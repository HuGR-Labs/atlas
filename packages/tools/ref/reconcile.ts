// @atlas/tools — ref/reconcile.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// `atlas-reconcile` — the merge gate (TOOLS-8 / TOOLS-13, spec A-3/A-4). One of the EXACTLY-FOUR
// governance tools (TOOLS-1). At merge-time it classifies the `DRIFTED` subset by the @atlas-knowledge
// KNOW-5 mechanical/semantic split (referenced, NOT redefined) into a REVIEWABLE `DriftItem[]` set —
// never all-or-nothing. It exits `2` ONLY on `semantic` drift (block; never a silent green there), exits
// `0` when drift is entirely `mechanical`, and re-authors `== |semantic|` (never the whole store).
// `--accept-reground` auto-re-grounds the `mechanical` subset in ONE pass — no human, no block,
// `regroundedCount == |mechanical|` — while any semantic item still surfaces and still exits `2`; each
// re-ground write still passes the `atlas-emit` fail-closed check (TOOLS-7). Pure + total. Transcribed
// from atlas-tools:51-55, 73-78, 127-128, 148-150 + method-tags-tls:68-73, 110-115.

import type { Hash } from '@atlas/contracts';
import type { ReconcileOut } from './types.js';

/** Reconcile options (atlas-tools:128). `acceptReground` = the `--accept-reground` flag: auto-re-ground
 *  the `mechanical` subset in one pass (TOOLS-13). Absent ⇒ classify-and-report only (TOOLS-8). */
export interface ReconcileOptions {
  readonly acceptReground?: boolean;
}

export interface ReconcileApi {
  /** Classify drift at `mergeBase` via the KNOW-5 split; exit-gate `exitCode = |semantic|>0 ? 2 : 0`,
   *  `reauthorCount == |semantic|` (TOOLS-8). Under `{acceptReground:true}`, auto-re-ground the
   *  `mechanical` subset in one pass (`regroundedCount == |mechanical|`), never touching `semantic`
   *  (TOOLS-13). Pure + total (method-tags-tls:72).
   *
   *  [FLAG — `mergeBase` = `Hash`] atlas-tools:127 names `atlas-reconcile <mergeBase>`; the merge-base sha
   *  is transcribed as `Hash` (mirrors @atlas/persist `diff` typing a commit sha as `Hash`). */
  reconcile(mergeBase: Hash, options?: ReconcileOptions): ReconcileOut;
}
