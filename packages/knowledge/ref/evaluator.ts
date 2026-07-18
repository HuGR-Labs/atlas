// @atlas/knowledge — ref/evaluator.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The pure predicate-check evaluator (KNOW-16, spec §3.2). A `PredicateNode.check` evaluates to
// `HOLDS/BROKEN/NA` from Atlas-INDEX state ALONE — a deterministic query over the structural/dependency
// axes or a pinned declarative assertion — with NO arbitrary code execution, NO sandbox, NO clock/IO
// (same index state ⇒ same verdict). A check needing runtime/behavioral execution is OUT OF SCOPE for v0
// and MUST stay advisory; the verdict feeds `atlas-reconcile`. Transcribed from atlas-knowledge:66, 221-
// 223 and method-tags-knw:124-129.

import type { Status } from '@atlas/contracts';
import type { IndexNode } from '@atlas/index';

export interface EvaluatorApi {
  /** Evaluate a check against index state (KNOW-16). Deterministic + pure — no code-exec, no clock, no
   *  IO; same `indexState` ⇒ same verdict. Yields `HOLDS | BROKEN | NA` (a subset of `Status`; the
   *  `'advisory'` member is not an evaluator verdict — a runtime-requiring check is refused to advisory
   *  UPSTREAM, not returned here).
   *
   *  [SIG-TBD — `check` arg] KNOW-16 defines a check as "a deterministic index-query or a pinned
   *  declarative assertion" with NO concrete record shape frozen (see `PredicateNode.check`,
   *  ref/types.ts). Transcribed as `unknown` rather than invented. Flagged.
   *
   *  [FLAG — `indexState` arg] Typed as the LOWER-layer `@atlas/index` `IndexNode` (the task's reserved
   *  index-query import — DAG-safe, index is below knowledge). The reference says "over the Atlas index
   *  (structural/dependency AXES)", which may be the multi-axis root set (`Axes`) rather than a single
   *  `IndexNode`; transcribed to the pinned `IndexNode` per the task, flagged for the WP to confirm the
   *  index-state granularity. */
  evaluate(check: unknown, indexState: IndexNode): Status;
}
