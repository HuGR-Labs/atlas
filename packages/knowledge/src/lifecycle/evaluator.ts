// @atlas/knowledge — src/evaluator.ts  (WP-5.16.KNOW · EPIC-16 predicate check-engine)
//
// The pure predicate-check evaluator (KNOW-16). A `PredicateNode.check` evaluates to HOLDS/BROKEN/NA
// from Atlas-INDEX state ALONE — a deterministic query over one structural/dependency axis, or a pinned
// declarative assertion — with NO arbitrary code execution, NO sandbox, NO clock/IO (same index state ⇒
// same verdict, REQ-KNOW-16a/16b/16d). A check needing runtime/behavioral execution is OUT OF SCOPE for
// v0 and is REFUSED at admission so the fact stays advisory (REQ-KNOW-16c); the verdict is packaged to
// feed `atlas-reconcile` (REQ-KNOW-16e). Both node families are live day-one — the predicate family is
// not deferred (REQ-KNOW-9a) — and the evaluator is an OPTIONAL, standalone module: with none wired the
// store operates on advisory nodes alone (REQ-KNOW-9b, the frozen `StoreApi.evaluator?` seam).
//
// SEAM: implements the FROZEN `EvaluatorApi` (types.ts, ≥2-consumer: here + StoreApi) over the pinned
// `Check` union (types.ts); types-only imports of the sealed lower layers; NO raw hashing, NO code-exec path.
//
// [FLAG — indexState granularity] The frozen `EvaluatorApi.evaluate` pins `indexState` to a single
// lower-layer `@atlas/index` `IndexNode` (DAG-safe). The reference prose says "over the Atlas index
// (structural/dependency AXES)" — plural — which may be the multi-axis root set (`Axes`). Honored as the
// pinned single `IndexNode` (the caller selects the axis root); re-flagged for the reference to confirm.
//
// [FLAG — v0 query grammar not frozen] KNOW-16 names the two legs ("a deterministic index-query" / "a
// pinned declarative assertion") but freezes NO concrete query grammar. The minimal, pipe-delimited,
// declarative surface below (`exists|absent|has-object` and `child-count|subtree-hash`) is the honest v0
// interpreter — purely a function of the passed `IndexNode`, with no code-exec fallback (an unrecognized
// query yields NA, never a shell-out). Flagged as a build-ahead choice, NOT a frozen contract.

import type { Status } from '@atlas/contracts';
import type { NodeKey } from '@atlas/contracts';
import type { IndexNode } from '@atlas/index';
import type { Check, EvaluatorApi } from '../types.js';

/**
 * The evaluator verdict — the 3-state subset of `Status` the evaluator can yield. The `'advisory'`
 * member of `Status` is NOT an evaluator verdict: a runtime-requiring check is refused to advisory
 * UPSTREAM (see `admit`), never returned here. `Verdict` is assignable to `Status`, so an
 * `(check, indexState) => Verdict` function satisfies the frozen `EvaluatorApi.evaluate` signature.
 */
export type Verdict = Extract<Status, 'HOLDS' | 'BROKEN' | 'NA'>;

// ── admission gate (REQ-KNOW-16b / 16c) ──────────────────────────────────────
//
// A proposed check the gate classifies. The evaluable legs mirror the frozen `Check` union; the
// non-evaluable legs are the runtime / arbitrary-code-execution proposals the gate REFUSES — those never
// become a `Check`, so the fact stays `advisory` and `evaluate` is never reached (no code executes).

/** A raw proposed check fed to the admission gate — evaluable (`Check`) or runtime-requiring. */
export type ProposedCheck =
  | Check
  | { readonly kind: 'code-exec'; readonly script: string }
  | { readonly kind: 'runtime'; readonly behavior: string };

/** The admission verdict: an evaluable `Check` (→ predicate) or a refusal reason (→ stays advisory). */
export type Admission =
  | { readonly evaluable: true; readonly check: Check }
  | { readonly evaluable: false; readonly reason: 'code-exec' | 'runtime' };

/**
 * Classify a proposed check (KNOW-16). A deterministic index-query or a pinned declarative assertion is
 * EVALUABLE; a proposal requiring arbitrary code execution / a sandbox (REQ-KNOW-16b) or runtime /
 * behavioral execution (REQ-KNOW-16c) is REFUSED — the fact stays advisory and never reaches `evaluate`.
 * Pure + total over `ProposedCheck`.
 */
export function admit(proposed: ProposedCheck): Admission {
  switch (proposed.kind) {
    case 'index-query':
    case 'assertion':
      return { evaluable: true, check: proposed };
    case 'code-exec':
      return { evaluable: false, reason: 'code-exec' };
    case 'runtime':
      return { evaluable: false, reason: 'runtime' };
    default: {
      const _exhaustive: never = proposed;
      return _exhaustive;
    }
  }
}

// ── the pure interpreter (REQ-KNOW-16a / 16d) ─────────────────────────────────

/** DFS lookup by `key` over the index subtree — pure, deterministic, no IO. First match wins (keys are
 *  unique per axis; the walk order is fixed by `children`, so the result is index-state-determined). */
function findNode(root: IndexNode, key: string): IndexNode | undefined {
  if (root.key === key) return root;
  for (const child of root.children) {
    const hit = findNode(child, key);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/** True iff any node in the subtree carries `hash` in its `objects` — pure, deterministic. */
function hasObject(root: IndexNode, hash: string): boolean {
  if (root.objects.some((o) => String(o) === hash)) return true;
  return root.children.some((c) => hasObject(c, hash));
}

/** Interpret a deterministic index-query leg. Unrecognized ⇒ `NA` (never a code-exec fallback). */
function evalQuery(query: string, root: IndexNode): Verdict {
  const bar = query.indexOf('|');
  const op = (bar === -1 ? query : query.slice(0, bar)).trim();
  const arg = bar === -1 ? '' : query.slice(bar + 1).trim();
  switch (op) {
    case 'exists':
      return findNode(root, arg) !== undefined ? 'HOLDS' : 'BROKEN';
    case 'absent':
      return findNode(root, arg) === undefined ? 'HOLDS' : 'BROKEN';
    case 'has-object':
      return hasObject(root, arg) ? 'HOLDS' : 'BROKEN';
    default:
      return 'NA';
  }
}

/** Interpret a pinned declarative assertion leg over index-derived quantities. A missing subject ⇒ `NA`
 *  (the assertion does not apply to this index state); unrecognized form ⇒ `NA`. */
function evalAssertion(expr: string, root: IndexNode): Verdict {
  const [op, key, value] = expr.split('|').map((p) => p.trim());
  if (op === 'child-count' && key !== undefined && value !== undefined) {
    const node = findNode(root, key);
    if (node === undefined) return 'NA';
    return node.children.length === Number(value) ? 'HOLDS' : 'BROKEN';
  }
  if (op === 'subtree-hash' && key !== undefined && value !== undefined) {
    const node = findNode(root, key);
    if (node === undefined) return 'NA';
    return String(node.subtreeHash) === value ? 'HOLDS' : 'BROKEN';
  }
  return 'NA';
}

/**
 * Evaluate a `Check` against index state (KNOW-16). Deterministic + pure — no code-exec, no clock, no
 * IO; same `(check, indexState)` ⇒ same `Verdict`. Yields exactly one of `HOLDS | BROKEN | NA`.
 */
export function evaluate(check: Check, indexState: IndexNode): Verdict {
  return check.kind === 'index-query'
    ? evalQuery(check.query, indexState)
    : evalAssertion(check.expr, indexState);
}

/** The FROZEN `EvaluatorApi` implementation (types.ts). Standalone + OPTIONAL — the store wires
 *  it only for the predicate family; with none wired, advisory nodes operate alone (REQ-KNOW-9b). */
export function makeEvaluator(): EvaluatorApi {
  return { evaluate };
}

// ── feed the verdict to atlas-reconcile (REQ-KNOW-16e) ────────────────────────
//
// The evaluator does NOT run the reconcile (excluded — frozen in CAMPAIGN-4). It packages the verdict so
// the reconcile input CARRIES it: a `BROKEN` predicate verdict reaches the merge gate, never dropped.

/** A packaged evaluator verdict keyed by the predicate node — the carrier the reconcile input consumes. */
export interface VerdictFeed {
  readonly node: NodeKey;
  readonly verdict: Verdict;
}

/** Evaluate a predicate's check and package the verdict for the `atlas-reconcile` feed (REQ-KNOW-16e). */
export function verdictFor(node: NodeKey, check: Check, indexState: IndexNode): VerdictFeed {
  return { node, verdict: evaluate(check, indexState) };
}
