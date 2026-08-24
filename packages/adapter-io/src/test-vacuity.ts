// ── REFERENCE MODEL — NO PRODUCTION CALLERS (yet) ─────────────────────────────────────────────────────
// This is the #95 `test-vacuity` PROVEN-shape ORACLE. It is measured and unit-tested (0-false-admit on 14
// planted soundness rails; 32 real assertion-only-in-catch tests proven on zod v3.23.8, hand-verified) but
// NOT yet wired to a product path — its fact type / governed write-door / compose+CLI wiring / e2e bench are
// the follow-up increments of the test-vacuity shape build. Until then it is a DECLARED reference model, in
// the LEDGER in `harness/gates/reference-model-guard.mjs` (`shipped: null` — the pending oracle, not dead code).
//
// @atlas/adapter-io — src/test-vacuity.ts  (#95 — the `test-vacuity` structural PROVEN shape, oracle)
//
// A PURE, TOTAL AST oracle: PROVE / ABSTAIN on the SYNTACTIC property "in this test, every assertion-shaped
// call is lexically inside a `catch` clause, and there is no assertion-count guard" — the fragile
// assertion-only-in-catch pattern (`try { …can-reject… } catch (e) { expect(e)… }`): if the `try` body
// completes WITHOUT throwing, the `catch` never runs and the test passes with no visible assertion executed.
// This is the exact vacuous-test smell Atlas's own #114 audit found in five of its tests, and the highest-
// leverage `NEW_SHAPE` the #95 zod shape-census surfaced (~9 of 21 structural advisory claims).
//
// WHAT THIS FACT IS (and is NOT). The proven fact is SYNTACTIC and re-derivable from the unit's AST alone:
// "the ONLY assertion-shaped calls in test T's body sit inside `catch` clauses, and T carries no
// `expect.assertions(...)` / `expect.hasAssertions()` guard." It is NOT a runtime claim that a vacuous
// execution is reachable (that would need to know whether the `try` body can complete normally — a semantic,
// cross-procedural question no AST oracle can settle). The fact flags the fragile SHAPE; it does not assert
// the bug fires. Framed this way it is 0-false-admit by construction — see the soundness rails.
//
// SOUNDNESS RAILS (violating any is a false-admit — the whole point):
//   · OVER-DETECT assertions. Missing an assertion that sits on the success path (in the `try` body, or at
//     top level outside any try) would FALSELY prove the property. So `isAssertionShaped` is deliberately
//     BROAD (any `expect`/`assert*` callee, any `.toX`/`.rejects`/`.resolves`/`.should`/`.throw*` matcher
//     chain). Over-detection only ever moves a test from PROVEN to ABSTAIN — the safe direction.
//   · ANY assertion-shaped call OUTSIDE a `catch` (in the try body, in a `finally`, or bare) ⇒ ABSTAIN. A
//     `finally` runs on the success path too, so an assertion there is NOT catch-only.
//   · An `expect.assertions(n)` / `expect.hasAssertions()` guard anywhere in the body ⇒ ABSTAIN (the test
//     DOES defend against the non-throwing path; the shape is not fragile).
//   · A `try` block that itself GUARDS the success path — a trailing `throw` or a `fail()`-shaped call after
//     the can-reject operation — is NOT fragile: if the operation does not throw, the manual `throw`/`fail`
//     re-enters the `catch`, so the assertion always runs. ANY `throw_statement` or `fail()`-shaped call
//     inside a `try` block ⇒ ABSTAIN. (Missing this is a false-admit — the `try { op(); throw new Error() }
//     catch { expect… }` idiom is a correctly-guarded test, not a vacuous one.)
//   · No `catch` clause holding an assertion, or no assertion at all ⇒ ABSTAIN (a different shape).
//   · A parameterised / modified test call (`test.each`, `it.skip`, computed callee) or a callback that is
//     not a plain function/arrow with a statement-block body ⇒ ABSTAIN (unknown body semantics).
//   · The caller must FAIL CLOSED on a doc it cannot parse (an error tree / non-TS path): pass `undefined`
//     and this module emits nothing. An un-parseable unit yields no proven fact, never a false one.
//
// PURE + TOTAL: no IO, no clock, never throws. The parse + the fail-closed-on-unparseable decision belong to
// the caller (the leg), exactly as `verify-negation.ts` takes an injected `SymbolReverseApi` rather than
// reading the index itself.

import type Parser from 'web-tree-sitter';

type SyntaxNode = Parser.SyntaxNode;

/** One proven `test-vacuity` fact: test `name` in the scanned unit has all its assertion-shaped calls inside
 *  `catch` clauses and no assertion-count guard. `row`/`col` are the 0-based start position of the `test(`/
 *  `it(` call — the witness span into the content-addressed bytes. */
export interface TestVacuityFact {
  readonly testName: string;
  readonly shape: 'assertion-only-in-catch';
  readonly row: number;
  readonly col: number;
}

const kids = (n: SyntaxNode): SyntaxNode[] => {
  const out: SyntaxNode[] = [];
  for (let i = 0; i < n.childCount; i++) {
    const c = n.child(i);
    if (c !== null) out.push(c);
  }
  return out;
};

const walk = (n: SyntaxNode, f: (n: SyntaxNode) => void): void => {
  f(n);
  for (const c of kids(n)) walk(c, f);
};

/** BROAD by design (soundness rail: over-detect). `expect(...)`, `assert(...)`, `assertEqual(...)`,
 *  `chai.assert.equal(...)`, `expect(x).toBe(...)`, `await expect(p).rejects...`, `x.should.equal(...)`. The
 *  callee text of a `call_expression`. Over-matching only ever forces ABSTAIN. */
function isAssertionShaped(callExpr: SyntaxNode): boolean {
  const callee = callExpr.child(0);
  if (callee === null) return false;
  const t = callee.text;
  return (
    /(^|[.\s])expect\b/.test(t) ||
    /(^|[.\s])assert\w*\b/.test(t) ||
    /\.(toBe|toEqual|toThrow|toMatch|toContain|toHaveLength|toBeTruthy|toBeFalsy|toBeNull|toBeUndefined|toBeDefined|toBeInstanceOf|toStrictEqual|rejects|resolves)\b/.test(
      t,
    ) ||
    /\.(should|must)\b/.test(t)
  );
}

/** An assertion-count guard that DEFENDS the fragile shape: `expect.assertions(n)` / `expect.hasAssertions()`. */
function isAssertionGuard(callExpr: SyntaxNode): boolean {
  const callee = callExpr.child(0);
  if (callee === null) return false;
  return /^expect\s*\.\s*(assertions|hasAssertions)$/.test(callee.text.replace(/\s+/g, ''));
}

/** Is `node` lexically inside a `catch_clause` that is itself within `stop` (the test body)? */
function insideCatch(node: SyntaxNode, stop: SyntaxNode): boolean {
  let p = node.parent;
  while (p !== null) {
    if (p.type === 'catch_clause') return true;
    if (p.id === stop.id) return false;
    p = p.parent;
  }
  return false;
}

/** The plain callback of a `test(name, fn)` / `it(name, fn)` call — a 2-arg call whose callee is the bare
 *  identifier `test` or `it` and whose 2nd arg is an arrow/function with a `statement_block` body. Anything
 *  else (member callee like `test.each`/`it.skip`, arg count ≠ 2, expression-bodied arrow) ⇒ `undefined`
 *  ⇒ ABSTAIN. */
function plainTestBody(callExpr: SyntaxNode): { name: string; body: SyntaxNode } | undefined {
  const callee = callExpr.child(0);
  if (callee === null || callee.type !== 'identifier') return undefined;
  if (callee.text !== 'test' && callee.text !== 'it') return undefined;
  const args = kids(callExpr).find((c) => c.type === 'arguments');
  if (args === undefined) return undefined;
  const argNodes = kids(args).filter((c) => c.type !== '(' && c.type !== ')' && c.type !== ',');
  if (argNodes.length !== 2) return undefined;
  const nameNode = argNodes[0]!;
  if (nameNode.type !== 'string' && nameNode.type !== 'template_string') return undefined;
  const fn = argNodes[1]!;
  if (fn.type !== 'arrow_function' && fn.type !== 'function' && fn.type !== 'function_expression') {
    return undefined;
  }
  const body = kids(fn).find((c) => c.type === 'statement_block');
  if (body === undefined) return undefined;
  return { name: nameNode.text.replace(/^['"`]|['"`]$/g, ''), body };
}

/** A `fail()`-shaped call: bare `fail(...)` or a `.fail(...)` member call (the manual-fail guard idiom). */
function isFailCall(callExpr: SyntaxNode): boolean {
  const callee = callExpr.child(0);
  if (callee === null) return false;
  return /(^|\.)fail$/.test(callee.text.replace(/\s+/g, ''));
}

/** Does any `try` BLOCK (not its `catch`) contain a `throw_statement` or a `fail()`-shaped call? Such a
 *  statement GUARDS the success path: if the operation does not throw, the manual throw/fail re-enters the
 *  `catch`, so the assertion always runs and the test is NOT vacuous. */
function anyTryBlockGuards(body: SyntaxNode): boolean {
  let guarded = false;
  walk(body, (n) => {
    if (n.type !== 'try_statement') return;
    // the try block is the first `statement_block` child; `catch_clause`/`finally_clause` are siblings.
    const tryBlock = kids(n).find((c) => c.type === 'statement_block');
    if (tryBlock === undefined) return;
    walk(tryBlock, (m) => {
      if (m.type === 'throw_statement') guarded = true;
      if (m.type === 'call_expression' && isFailCall(m)) guarded = true;
    });
  });
  return guarded;
}

/** PROVE / ABSTAIN the assertion-only-in-catch shape for ONE test body. Returns `true` only when EVERY
 *  assertion-shaped call is inside a `catch`, at least one such catch-assertion exists, no assertion guard is
 *  present, at least one `catch_clause` is present, AND no `try` block guards its own success path with a
 *  `throw`/`fail()`. Every other outcome ⇒ ABSTAIN (`false`). */
function bodyIsCatchOnly(body: SyntaxNode): boolean {
  let hasCatch = false;
  let catchAssertions = 0;
  let assertionOutsideCatch = false;
  let hasGuard = false;
  walk(body, (n) => {
    if (n.type === 'catch_clause') hasCatch = true;
    if (n.type !== 'call_expression') return;
    if (isAssertionGuard(n)) {
      hasGuard = true;
      return;
    }
    if (isAssertionShaped(n)) {
      if (insideCatch(n, body)) catchAssertions += 1;
      else assertionOutsideCatch = true;
    }
  });
  if (hasGuard) return false;
  if (!hasCatch) return false;
  if (assertionOutsideCatch) return false;
  if (anyTryBlockGuards(body)) return false;
  return catchAssertions > 0;
}

/**
 * Scan a parsed test-unit's AST `root` and return one `TestVacuityFact` per test PROVEN to hold the
 * assertion-only-in-catch shape. PURE + TOTAL. Abstentions are simply absent from the result. Pass the root
 * of a successfully-parsed TS doc; a doc the caller could not parse yields no facts (fail-closed at the leg).
 */
export function scanTestVacuity(root: SyntaxNode): TestVacuityFact[] {
  const facts: TestVacuityFact[] = [];
  walk(root, (n) => {
    if (n.type !== 'call_expression') return;
    const t = plainTestBody(n);
    if (t === undefined) return;
    if (!bodyIsCatchOnly(t.body)) return;
    facts.push({
      testName: t.name,
      shape: 'assertion-only-in-catch',
      row: n.startPosition.row,
      col: n.startPosition.column,
    });
  });
  return facts;
}
