// @atlas/cli — test/mine-claim-scrub-fitness.test.ts  (T0 · #121-sibling — SCRUB DOMINATES the claim's CAS bytes)
//
// SIBLING of `mine-answer-scrub-fitness.test.ts` (#121), same law, DIFFERENT shape. `mine-answer.ts` returns a
// receipt object; the claim-scrub site instead sits inline in `decideStaging` (`mine-decide.ts`), where the
// object `f` — spread from a `factScrubbed` local, itself a `kind === 'advisory'` ternary — is what `id(f)`
// hashes into CAS. This is a STRUCTURAL, fail-closed AST audit proving the `claimNorm` property that ternary
// stamps onto an advisory fact provably flows from `scrubClaimNorm(...)` — the property billy cares about is
// "no path skips the scrub", not "scrub runs once for a happy-path input". Fail-closed: an unresolved/unproven
// origin is a VIOLATION, so this analyser's failure mode is a false ALARM on a refactor, never a false CLEAR.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

const SCRUB_CALL = 'scrubClaimNorm';

interface ClaimScrubViolation {
  readonly rule: 'NO-SCRUB' | 'NO-ADVISORY-SITE' | 'CLAIM-NOT-SCRUBBED';
  readonly detail: string;
}

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  node.forEachChild((c) => walk(c, visit));
}

/** Does `expr` provably flow from a bare `scrubClaimNorm(...)` call — directly, or through a chain of
 *  resolvable const initializers? Fail-closed on a parameter / import / unresolvable identifier, same shape
 *  as the #121 original. */
function flowsFromScrub(expr: ts.Expression, inits: ReadonlyMap<string, ts.Expression>, depth = 0): boolean {
  if (depth > 8) return false;
  let direct = false;
  walk(expr, (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === SCRUB_CALL) direct = true;
  });
  if (direct) return true;
  let proven = false;
  walk(expr, (n) => {
    if (proven || !ts.isIdentifier(n)) return;
    if (ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) return; // skip `.member`
    const init = inits.get(n.text);
    if (init !== undefined && flowsFromScrub(init, inits, depth + 1)) proven = true;
  });
  return proven;
}

/** Find the object-literal `claimNorm:` (or shorthand) property assignment inside an expression, if any. */
function claimNormProperty(expr: ts.Expression): ts.Expression | undefined {
  let found: ts.Expression | undefined;
  walk(expr, (n) => {
    if (found !== undefined || !ts.isObjectLiteralExpression(n)) return;
    for (const p of n.properties) {
      if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'claimNorm') found = p.initializer;
      else if (ts.isShorthandPropertyAssignment(p) && p.name.text === 'claimNorm') found = p.name;
    }
  });
  return found;
}

/** Does `expr` contain a `.kind === 'advisory'` guarded ternary, and if so, does ITS `whenTrue` branch's
 *  `claimNorm` property flow from scrub? Fail-closed: no advisory-guarded ternary found at all ⇒ NO-ADVISORY-SITE
 *  (the control is entirely gone, not merely unresolved). */
function auditAdvisoryBranch(expr: ts.Expression, inits: ReadonlyMap<string, ts.Expression>): ClaimScrubViolation[] {
  const violations: ClaimScrubViolation[] = [];
  let sawAdvisoryTernary = false;
  walk(expr, (n) => {
    if (!ts.isConditionalExpression(n)) return;
    const cond = n.condition;
    const guardsAdvisory =
      ts.isBinaryExpression(cond) &&
      cond.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
      ((ts.isPropertyAccessExpression(cond.left) && cond.left.name.text === 'kind') ||
        (ts.isPropertyAccessExpression(cond.right) && cond.right.name.text === 'kind')) &&
      (cond.getText().includes("'advisory'") || cond.getText().includes('"advisory"'));
    if (!guardsAdvisory) return;
    sawAdvisoryTernary = true;
    const claim = claimNormProperty(n.whenTrue);
    if (claim === undefined) {
      violations.push({ rule: 'CLAIM-NOT-SCRUBBED', detail: `advisory branch ${n.whenTrue.getText()} stamps no resolvable \`claimNorm\` property` });
    } else if (!flowsFromScrub(claim, inits)) {
      violations.push({ rule: 'CLAIM-NOT-SCRUBBED', detail: `advisory claimNorm = ${claim.getText()} does not provably flow from \`${SCRUB_CALL}(...)\`` });
    }
  });
  if (!sawAdvisoryTernary) violations.push({ rule: 'NO-ADVISORY-SITE', detail: 'no `kind === \'advisory\'` guarded ternary found — the per-kind scrub gate is gone' });
  return violations;
}

/**
 * Audit `mine-decide.ts`: (1) it calls `scrubClaimNorm`; (2) the object `id(f)` hashes into CAS — traced from
 * the `const f = { ...X, ... }` declaration back to whatever `X` resolves to — has an advisory `claimNorm`
 * that provably flows from `scrubClaimNorm(...)`. Pure: source in, violations out.
 */
export function auditClaimScrub(source: string, fileName = 'mine-decide.ts'): readonly ClaimScrubViolation[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const violations: ClaimScrubViolation[] = [];
  const inits = new Map<string, ts.Expression>();
  walk(sf, (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer !== undefined) inits.set(n.name.text, n.initializer);
  });

  let hasScrub = false;
  walk(sf, (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === SCRUB_CALL) hasScrub = true;
  });
  if (!hasScrub) violations.push({ rule: 'NO-SCRUB', detail: `no bare \`${SCRUB_CALL}(...)\` call — the credential control on the claim is gone` });

  // Find `const f = <expr> as Fact;` and walk its spread sources back to their initializers.
  let fInit: ts.Expression | undefined;
  walk(sf, (n) => {
    if (fInit !== undefined) return;
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === 'f' && n.initializer !== undefined) fInit = n.initializer;
  });
  if (fInit === undefined) {
    violations.push({ rule: 'NO-ADVISORY-SITE', detail: 'no `const f = ...` found — the fact object `id(f)` hashes into CAS could not be located' });
    return violations;
  }

  // Resolve every spread identifier inside `f`'s initializer (e.g. `{ ...factScrubbed, scope: ... }`) and
  // audit each resolved expression for the advisory-guarded claimNorm scrub.
  const spreadSources: ts.Expression[] = [];
  walk(fInit, (n) => {
    if (ts.isSpreadAssignment(n) && ts.isIdentifier(n.expression)) {
      const init = inits.get(n.expression.text);
      if (init !== undefined) spreadSources.push(init);
    }
  });
  if (spreadSources.length === 0) {
    violations.push({ rule: 'NO-ADVISORY-SITE', detail: '`f`\'s initializer spreads no resolvable identifier — could not trace back to the claim-scrub site' });
    return violations;
  }
  for (const src of spreadSources) violations.push(...auditAdvisoryBranch(src, inits));
  return violations;
}

const REAL = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/mine-decide.ts'), 'utf8');

describe('mine-decide.ts — SCRUB DOMINATES the claim before it enters CAS (#121 sibling, claim leg)', () => {
  it('the SHIPPED file is clean — the advisory claimNorm provably flows from scrubClaimNorm', () => {
    expect(auditClaimScrub(REAL)).toStrictEqual([]);
  });

  it('TEETH: a variant that stamps the RAW claim (no scrub call at all) is caught', () => {
    const mutant = `
      const claimNormOf = (f) => f.kind === 'advisory' ? f.claimNorm : '';
      export function decideStaging(staged, incoming, grounded) {
        for (const raw of incoming) {
          const { rawAnswer, ...factNoAnswer } = raw;
          const factScrubbed = factNoAnswer.kind === 'advisory' ? { ...factNoAnswer, claimNorm: factNoAnswer.claimNorm } : factNoAnswer;
          const f = { ...factScrubbed, scope: 'atlas:mined' };
          const req = { claimNorm: claimNormOf(f) };
        }
      }`;
    const rules = auditClaimScrub(mutant).map((v) => v.rule).sort();
    expect(rules).toStrictEqual(['CLAIM-NOT-SCRUBBED', 'NO-SCRUB']);
  });

  it('TEETH: a variant where the advisory branch was silently deleted (falls through to the raw fact) is caught', () => {
    const mutant = `
      import { scrubClaimNorm } from './mine-claim-scrub.js';
      const claimNormOf = (f) => f.kind === 'advisory' ? f.claimNorm : '';
      export function decideStaging(staged, incoming, grounded) {
        for (const raw of incoming) {
          const { rawAnswer, ...factNoAnswer } = raw;
          const factScrubbed = factNoAnswer; // BUG: the advisory scrub branch is gone
          const f = { ...factScrubbed, scope: 'atlas:mined' };
          const req = { claimNorm: claimNormOf(f) };
        }
      }`;
    const rules = auditClaimScrub(mutant).map((v) => v.rule).sort();
    expect(rules).toStrictEqual(['NO-ADVISORY-SITE', 'NO-SCRUB']);
  });

  it('TEETH: a variant that scrubs but assigns the result to a DIFFERENT (unused) field is caught', () => {
    const mutant = `
      import { scrubClaimNorm } from './mine-claim-scrub.js';
      const claimNormOf = (f) => f.kind === 'advisory' ? f.claimNorm : '';
      export function decideStaging(staged, incoming, grounded) {
        for (const raw of incoming) {
          const { rawAnswer, ...factNoAnswer } = raw;
          const scrubbedButUnused = scrubClaimNorm(factNoAnswer.claimNorm);
          const factScrubbed = factNoAnswer.kind === 'advisory' ? { ...factNoAnswer, claimNorm: factNoAnswer.claimNorm } : factNoAnswer;
          const f = { ...factScrubbed, scope: 'atlas:mined' };
          const req = { claimNorm: claimNormOf(f) };
        }
      }`;
    const rules = auditClaimScrub(mutant).map((v) => v.rule).sort();
    expect(rules).toStrictEqual(['CLAIM-NOT-SCRUBBED']);
  });
});
