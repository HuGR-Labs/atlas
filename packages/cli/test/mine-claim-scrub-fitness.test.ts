// @atlas/cli — test/mine-claim-scrub-fitness.test.ts  (T0 · #121-sibling — SCRUB DOMINATES the claim's CAS bytes)
//
// SIBLING of `mine-answer-scrub-fitness.test.ts` (#121), same law, DIFFERENT shape. `mine-answer.ts` returns a
// receipt object; the claim-scrub site instead sits inline in `decideStaging` (`mine-decide.ts`), where the
// object `f` — spread from a `factScrubbed` local, itself a per-kind ternary — is what `id(f)` hashes into CAS.
// This is a STRUCTURAL, fail-closed AST audit proving the identity-bearing claim body each ternary branch
// stamps provably flows from the matching scrub — the property billy cares about is "no path skips the scrub",
// not "scrub runs once for a happy-path input". Fail-closed: an unresolved/unproven origin is a VIOLATION, so
// this analyser's failure mode is a false ALARM on a refactor, never a false CLEAR.
//
// TWO LEGS, TWO CLAIM BODIES: an ADVISORY fact's claim body is `claimNorm` (scrubbed by `scrubClaimNorm`); a
// PREDICATE fact's claim body is `normalizeCheck(f.check)` (scrubbed by `scrubCheck`, WP-219). The predicate
// leg carries an EXTRA teeth the advisory one does not need: `check` folds into the `nodeKey` preimage
// (KNOW-15c), so this audit ALSO proves the `nodeKey(...)` argument provably spreads `f` — i.e. the SAME
// scrubbed check bytes feed CAS (`id(f)`) AND node identity, with no scrub-CAS-but-raw-identity split.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

const CLAIM_SCRUB = 'scrubClaimNorm';
const CHECK_SCRUB = 'scrubCheck';

interface ClaimScrubViolation {
  readonly rule:
    | 'NO-SCRUB'
    | 'NO-ADVISORY-SITE'
    | 'CLAIM-NOT-SCRUBBED'
    | 'NO-SCRUB-CHECK'
    | 'NO-PREDICATE-SITE'
    | 'CHECK-NOT-SCRUBBED'
    | 'NODEKEY-NOT-FROM-SCRUBBED-FACT';
  readonly detail: string;
}

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  node.forEachChild((c) => walk(c, visit));
}

/** Does `expr` provably flow from a bare `<scrubName>(...)` call — directly, or through a chain of resolvable
 *  const initializers? Fail-closed on a parameter / import / unresolvable identifier, same shape as the #121
 *  original.
 *
 *  DELIBERATELY TEXTUAL, and NOT the load-bearing control (billy WP-219 review #1). This audit walks for a
 *  `scrubName(...)` call in the initializer; a sequence expression `(scrubCheck(x), x)` computes the scrub and
 *  then discards it, and this walk reports GREEN on that mutant. The REAL teeth are the runtime
 *  stored-CAS-byte assertions in `mine-predicate-check-scrub.test.ts` (`stored.check.expr`/`dec.put`/`row.claims`
 *  `.not.toContain(SECRET)`), which go RED on exactly that mutant. The AST audit and the runtime test are
 *  COMPLEMENTARY: the leak escapes only if BOTH are removed. Do not over-trust this audit in isolation. */
function flowsFromScrub(expr: ts.Expression, inits: ReadonlyMap<string, ts.Expression>, scrubName: string, depth = 0): boolean {
  if (depth > 8) return false;
  let direct = false;
  walk(expr, (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === scrubName) direct = true;
  });
  if (direct) return true;
  let proven = false;
  walk(expr, (n) => {
    if (proven || !ts.isIdentifier(n)) return;
    if (ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) return; // skip `.member`
    const init = inits.get(n.text);
    if (init !== undefined && flowsFromScrub(init, inits, scrubName, depth + 1)) proven = true;
  });
  return proven;
}

/** Does `expr` provably SPREAD identifier `name` — directly (`{ ...name }`) or through a chain of resolvable
 *  const initializers that themselves spread it? The nodeKey-preimage teeth: the object handed to `nodeKey`
 *  must trace back to the scrubbed `f`, never to a raw pre-scrub source. Fail-closed. */
function spreadsIdentifier(expr: ts.Expression, name: string, inits: ReadonlyMap<string, ts.Expression>, depth = 0): boolean {
  if (depth > 8) return false;
  let found = false;
  walk(expr, (n) => {
    if (found || !ts.isSpreadAssignment(n) || !ts.isIdentifier(n.expression)) return;
    if (n.expression.text === name) found = true;
    else {
      const init = inits.get(n.expression.text);
      if (init !== undefined && spreadsIdentifier(init, name, inits, depth + 1)) found = true;
    }
  });
  return found;
}

/** Find the object-literal `<propName>:` (or shorthand) property assignment inside an expression, if any. */
function namedProperty(expr: ts.Expression, propName: string): ts.Expression | undefined {
  let found: ts.Expression | undefined;
  walk(expr, (n) => {
    if (found !== undefined || !ts.isObjectLiteralExpression(n)) return;
    for (const p of n.properties) {
      if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === propName) found = p.initializer;
      else if (ts.isShorthandPropertyAssignment(p) && p.name.text === propName) found = p.name;
    }
  });
  return found;
}

interface BranchSpec {
  readonly kind: string; // the discriminant value, e.g. 'advisory' / 'predicate'
  readonly property: string; // the claim-body property, e.g. 'claimNorm' / 'check'
  readonly scrubName: string; // the scrub the property must flow from
  readonly notScrubbedRule: 'CLAIM-NOT-SCRUBBED' | 'CHECK-NOT-SCRUBBED';
  readonly noSiteRule: 'NO-ADVISORY-SITE' | 'NO-PREDICATE-SITE';
}

/** Does `expr` contain a `.kind === '<kind>'` guarded ternary, and if so, does ITS `whenTrue` branch's
 *  `<property>` flow from `<scrubName>(...)`? Fail-closed: no such guarded ternary at all ⇒ `noSiteRule`
 *  (the per-kind scrub gate is entirely gone, not merely unresolved). */
function auditKindBranch(expr: ts.Expression, inits: ReadonlyMap<string, ts.Expression>, spec: BranchSpec): ClaimScrubViolation[] {
  const violations: ClaimScrubViolation[] = [];
  let sawKindTernary = false;
  walk(expr, (n) => {
    if (!ts.isConditionalExpression(n)) return;
    const cond = n.condition;
    const guardsKind =
      ts.isBinaryExpression(cond) &&
      cond.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
      ((ts.isPropertyAccessExpression(cond.left) && cond.left.name.text === 'kind') ||
        (ts.isPropertyAccessExpression(cond.right) && cond.right.name.text === 'kind')) &&
      (cond.getText().includes(`'${spec.kind}'`) || cond.getText().includes(`"${spec.kind}"`));
    if (!guardsKind) return;
    sawKindTernary = true;
    const body = namedProperty(n.whenTrue, spec.property);
    if (body === undefined) {
      violations.push({ rule: spec.notScrubbedRule, detail: `${spec.kind} branch ${n.whenTrue.getText()} stamps no resolvable \`${spec.property}\` property` });
    } else if (!flowsFromScrub(body, inits, spec.scrubName)) {
      violations.push({ rule: spec.notScrubbedRule, detail: `${spec.kind} ${spec.property} = ${body.getText()} does not provably flow from \`${spec.scrubName}(...)\`` });
    }
  });
  if (!sawKindTernary) violations.push({ rule: spec.noSiteRule, detail: `no \`kind === '${spec.kind}'\` guarded ternary found — the per-kind scrub gate is gone` });
  return violations;
}

/** Collect the initializers of every `const <id> = <expr>` in the file (the resolution table). */
function collectInits(sf: ts.SourceFile): Map<string, ts.Expression> {
  const inits = new Map<string, ts.Expression>();
  walk(sf, (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer !== undefined) inits.set(n.name.text, n.initializer);
  });
  return inits;
}

/** The spread sources of `const f = { ...X, ... } as Fact` — the expressions `id(f)` transitively hashes. */
function factSpreadSources(sf: ts.SourceFile, inits: ReadonlyMap<string, ts.Expression>): ts.Expression[] | undefined {
  let fInit: ts.Expression | undefined;
  walk(sf, (n) => {
    if (fInit !== undefined) return;
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === 'f' && n.initializer !== undefined) fInit = n.initializer;
  });
  if (fInit === undefined) return undefined;
  const spreadSources: ts.Expression[] = [];
  walk(fInit, (n) => {
    if (ts.isSpreadAssignment(n) && ts.isIdentifier(n.expression)) {
      const init = inits.get(n.expression.text);
      if (init !== undefined) spreadSources.push(init);
    }
  });
  return spreadSources;
}

function hasScrubCall(sf: ts.SourceFile, scrubName: string): boolean {
  let has = false;
  walk(sf, (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === scrubName) has = true;
  });
  return has;
}

/**
 * Audit the ADVISORY claim leg of `mine-decide.ts`: (1) it calls `scrubClaimNorm`; (2) the fact object `id(f)`
 * hashes into CAS has an advisory `claimNorm` that provably flows from `scrubClaimNorm(...)`.
 */
export function auditClaimScrub(source: string, fileName = 'mine-decide.ts'): readonly ClaimScrubViolation[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const violations: ClaimScrubViolation[] = [];
  const inits = collectInits(sf);

  if (!hasScrubCall(sf, CLAIM_SCRUB)) violations.push({ rule: 'NO-SCRUB', detail: `no bare \`${CLAIM_SCRUB}(...)\` call — the credential control on the claim is gone` });

  const spreadSources = factSpreadSources(sf, inits);
  if (spreadSources === undefined) {
    violations.push({ rule: 'NO-ADVISORY-SITE', detail: 'no `const f = ...` found — the fact object `id(f)` hashes into CAS could not be located' });
    return violations;
  }
  if (spreadSources.length === 0) {
    violations.push({ rule: 'NO-ADVISORY-SITE', detail: '`f`\'s initializer spreads no resolvable identifier — could not trace back to the claim-scrub site' });
    return violations;
  }
  const spec: BranchSpec = { kind: 'advisory', property: 'claimNorm', scrubName: CLAIM_SCRUB, notScrubbedRule: 'CLAIM-NOT-SCRUBBED', noSiteRule: 'NO-ADVISORY-SITE' };
  for (const src of spreadSources) violations.push(...auditKindBranch(src, inits, spec));
  return violations;
}

/**
 * Audit the PREDICATE check leg (WP-219): (1) it calls `scrubCheck`; (2) the fact `id(f)` hashes has a
 * predicate `check` that provably flows from `scrubCheck(...)`; (3) the object handed to `nodeKey(...)`
 * provably spreads `f` — so the SAME scrubbed check feeds BOTH CAS and the node-identity preimage. Pure.
 */
export function auditCheckScrub(source: string, fileName = 'mine-decide.ts'): readonly ClaimScrubViolation[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const violations: ClaimScrubViolation[] = [];
  const inits = collectInits(sf);

  if (!hasScrubCall(sf, CHECK_SCRUB)) violations.push({ rule: 'NO-SCRUB-CHECK', detail: `no bare \`${CHECK_SCRUB}(...)\` call — the credential control on the predicate check is gone` });

  const spreadSources = factSpreadSources(sf, inits);
  if (spreadSources === undefined) {
    violations.push({ rule: 'NO-PREDICATE-SITE', detail: 'no `const f = ...` found — the fact object `id(f)` hashes into CAS could not be located' });
    return violations;
  }
  if (spreadSources.length === 0) {
    violations.push({ rule: 'NO-PREDICATE-SITE', detail: '`f`\'s initializer spreads no resolvable identifier — could not trace back to the check-scrub site' });
    return violations;
  }
  const spec: BranchSpec = { kind: 'predicate', property: 'check', scrubName: CHECK_SCRUB, notScrubbedRule: 'CHECK-NOT-SCRUBBED', noSiteRule: 'NO-PREDICATE-SITE' };
  for (const src of spreadSources) violations.push(...auditKindBranch(src, inits, spec));

  // The identity leg: EVERY `nodeKey(arg)` argument must provably spread `f` (the scrubbed fact), so the
  // check that feeds node identity is the SAME scrubbed bytes CAS sees — never a raw pre-scrub source.
  let sawNodeKey = false;
  let nodeKeyFromF = false;
  walk(sf, (n) => {
    if (!ts.isCallExpression(n) || !ts.isIdentifier(n.expression) || n.expression.text !== 'nodeKey' || n.arguments.length === 0) return;
    sawNodeKey = true;
    const arg = n.arguments[0]!;
    const argExpr = ts.isIdentifier(arg) ? (inits.get(arg.text) ?? arg) : arg;
    if (spreadsIdentifier(argExpr, 'f', inits)) nodeKeyFromF = true;
  });
  if (!sawNodeKey) violations.push({ rule: 'NODEKEY-NOT-FROM-SCRUBBED-FACT', detail: 'no `nodeKey(...)` call found — the predicate identity leg could not be located' });
  else if (!nodeKeyFromF) violations.push({ rule: 'NODEKEY-NOT-FROM-SCRUBBED-FACT', detail: 'the `nodeKey(...)` argument does not provably spread `f` — the check feeding node identity may be a raw, un-scrubbed source' });
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

describe('mine-decide.ts — SCRUB DOMINATES the predicate check before it enters CAS *and* node identity (WP-219)', () => {
  it('the SHIPPED file is clean — the predicate check provably flows from scrubCheck AND nodeKey spreads f', () => {
    expect(auditCheckScrub(REAL)).toStrictEqual([]);
  });

  it('TEETH (no-scrub): a variant that stamps the RAW check (no scrubCheck call at all) is caught', () => {
    const mutant = `
      export function decideStaging(staged, incoming, grounded) {
        for (const raw of incoming) {
          const { rawAnswer, ...factNoAnswer } = raw;
          const factScrubbed = factNoAnswer.kind === 'predicate' ? { ...factNoAnswer, check: factNoAnswer.check } : factNoAnswer;
          const f = { ...factScrubbed, scope: 'atlas:mined' };
          const view = { ...f, slot: 'invariant' };
          const key = nodeKey(view);
        }
      }`;
    const rules = auditCheckScrub(mutant).map((v) => v.rule).sort();
    expect(rules).toStrictEqual(['CHECK-NOT-SCRUBBED', 'NO-SCRUB-CHECK']);
  });

  it('TEETH (scrub-computed-but-unused): scrubCheck runs but the check field keeps the RAW value', () => {
    const mutant = `
      import { scrubCheck } from './mine-claim-scrub.js';
      export function decideStaging(staged, incoming, grounded) {
        for (const raw of incoming) {
          const { rawAnswer, ...factNoAnswer } = raw;
          const scrubbedButUnused = scrubCheck(factNoAnswer.check);
          const factScrubbed = factNoAnswer.kind === 'predicate' ? { ...factNoAnswer, check: factNoAnswer.check } : factNoAnswer;
          const f = { ...factScrubbed, scope: 'atlas:mined' };
          const view = { ...f, slot: 'invariant' };
          const key = nodeKey(view);
        }
      }`;
    const rules = auditCheckScrub(mutant).map((v) => v.rule).sort();
    expect(rules).toStrictEqual(['CHECK-NOT-SCRUBBED']);
  });

  it('TEETH (scrub-CAS-but-not-nodeKey): f carries the scrubbed check but nodeKey routes a RAW pre-scrub source', () => {
    const mutant = `
      import { scrubCheck } from './mine-claim-scrub.js';
      export function decideStaging(staged, incoming, grounded) {
        for (const raw of incoming) {
          const { rawAnswer, ...factNoAnswer } = raw;
          const factScrubbed = factNoAnswer.kind === 'predicate' ? { ...factNoAnswer, check: scrubCheck(factNoAnswer.check) } : factNoAnswer;
          const f = { ...factScrubbed, scope: 'atlas:mined' };
          const view = { ...factNoAnswer, slot: 'invariant' }; // BUG: raw source feeds node identity
          const key = nodeKey(view);
        }
      }`;
    const rules = auditCheckScrub(mutant).map((v) => v.rule).sort();
    expect(rules).toStrictEqual(['NODEKEY-NOT-FROM-SCRUBBED-FACT']);
  });

  it('TEETH (predicate branch deleted): the per-kind scrub gate for predicate is gone', () => {
    const mutant = `
      import { scrubClaimNorm } from './mine-claim-scrub.js';
      export function decideStaging(staged, incoming, grounded) {
        for (const raw of incoming) {
          const { rawAnswer, ...factNoAnswer } = raw;
          const factScrubbed = factNoAnswer.kind === 'advisory' ? { ...factNoAnswer, claimNorm: scrubClaimNorm(factNoAnswer.claimNorm) } : factNoAnswer;
          const f = { ...factScrubbed, scope: 'atlas:mined' };
          const view = { ...f, slot: 'invariant' };
          const key = nodeKey(view);
        }
      }`;
    const rules = auditCheckScrub(mutant).map((v) => v.rule).sort();
    expect(rules).toStrictEqual(['NO-PREDICATE-SITE', 'NO-SCRUB-CHECK']);
  });
});
