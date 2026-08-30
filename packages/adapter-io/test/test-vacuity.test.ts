// @atlas/adapter-io — test/test-vacuity.test.ts  (#95 test-vacuity structural PROVEN shape)
//
// Acceptance suite for `scanTestVacuity`. Pins the 0-false-admit soundness rails one by one: a test is
// PROVEN assertion-only-in-catch ONLY when every assertion-shaped call sits inside a `catch`, at least one
// catch-assertion exists, and there is no `expect.assertions` guard. Every escape hatch (assertion outside
// catch, assertion in `finally`, guard present, no catch, no assertion, parameterised test call) must move
// the verdict to ABSTAIN — i.e. NOT appear in the result. Grammar is loaded directly via web-tree-sitter +
// `tree-sitter-typescript.wasm`, the same way `escape-classifier.test.ts` does.

import { createRequire } from 'node:module';
import Parser from 'web-tree-sitter';
import { describe, it, expect, beforeAll } from 'vitest';
import { scanTestVacuity } from '../src/test-vacuity.js';

const require = createRequire(import.meta.url);
let parser: Parser;

beforeAll(async () => {
  await Parser.init();
  parser = new Parser();
  const wasm = require.resolve('tree-sitter-typescript/tree-sitter-typescript.wasm');
  const lang = await Parser.Language.load(wasm);
  parser.setLanguage(lang);
});

const names = (src: string): string[] => scanTestVacuity(parser.parse(src).rootNode).map((f) => f.testName);
const shapes = (src: string): string[] =>
  scanTestVacuity(parser.parse(src).rootNode).map((f) => `${f.testName}:${f.shape}`);

describe('scanTestVacuity — PROVEN assertion-only-in-catch', () => {
  it('proves a single try/catch whose only assertion is in the catch', () => {
    const src = `
      test("array min", async () => {
        try {
          await z.array(z.string()).min(4).parseAsync([]);
        } catch (err) {
          expect((err).issues[0].message).toEqual("Array must contain at least 4 element(s)");
        }
      });`;
    expect(names(src)).toEqual(['array min']);
  });

  it('proves a test with SEVERAL try/catch blocks, all assertions in catch', () => {
    const src = `
      test("url error overrides", () => {
        try { z.string().url().parse("https"); } catch (err) { expect(err.msg).toEqual("Invalid url"); }
        try { z.string().url("badurl").parse("https"); } catch (err) { expect(err.msg).toEqual("badurl"); }
      });`;
    expect(names(src)).toEqual(['url error overrides']);
  });

  it('reports the witness position of the test( call', () => {
    const src = `test("t", () => { try { f(); } catch (e) { expect(e).toBe(1); } });`;
    const facts = scanTestVacuity(parser.parse(src).rootNode);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ testName: 't', shape: 'assertion-only-in-catch', row: 0, col: 0 });
  });
});

describe('scanTestVacuity — ABSTAIN (soundness rails, no false-admit)', () => {
  it('abstains when an assertion is ALSO on the success path (outside catch)', () => {
    const src = `
      test("guarded", () => {
        try { f(); } catch (e) { expect(e).toBe(1); }
        expect(true).toBe(true);
      });`;
    expect(names(src)).toEqual([]);
  });

  it('abstains when the only assertion is in a finally (runs on success path)', () => {
    const src = `
      test("finally", () => {
        try { f(); } finally { expect(1).toBe(1); }
      });`;
    expect(names(src)).toEqual([]);
  });

  it('abstains when expect.assertions(n) guards the test', () => {
    const src = `
      test("counted", () => {
        expect.assertions(1);
        try { f(); } catch (e) { expect(e).toBe(1); }
      });`;
    expect(names(src)).toEqual([]);
  });

  it('abstains when expect.hasAssertions() guards the test', () => {
    const src = `
      test("has", () => {
        expect.hasAssertions();
        try { f(); } catch (e) { expect(e).toBe(1); }
      });`;
    expect(names(src)).toEqual([]);
  });

  it('abstains on a plain test with a normal success-path assertion (no try/catch)', () => {
    const src = `test("normal", () => { expect(z.string().parse("x")).toBe("x"); });`;
    expect(names(src)).toEqual([]);
  });

  it('abstains when a catch has NO assertion (a different shape)', () => {
    const src = `test("swallow", () => { try { f(); } catch (e) { log(e); } });`;
    expect(names(src)).toEqual([]);
  });

  it('over-detects: a matcher-chain assertion outside catch still forces abstain', () => {
    const src = `
      test("rejects-outside", async () => {
        await expect(p()).rejects.toThrow();
        try { f(); } catch (e) { expect(e).toBe(1); }
      });`;
    expect(names(src)).toEqual([]);
  });

  it('abstains on a parameterised test.each call (unknown body semantics)', () => {
    const src = `
      test.each([1,2])("each %s", (n) => {
        try { f(n); } catch (e) { expect(e).toBe(1); }
      });`;
    expect(names(src)).toEqual([]);
  });

  it('abstains on it.skip (modified callee)', () => {
    const src = `it.skip("skipped", () => { try { f(); } catch (e) { expect(e).toBe(1); } });`;
    expect(names(src)).toEqual([]);
  });

  // Regression: a REAL false-admit caught by hand-verification on zod's discriminated-unions.test.ts. The try
  // body ends with `throw new Error()` — if the operation does NOT throw, that manual throw re-enters the
  // catch, so the assertion always runs. This is a correctly-GUARDED test, NOT vacuous. Must abstain.
  it('abstains when the try block ends with a manual throw (guarded success path)', () => {
    const src = `
      test("invalid - null", () => {
        try {
          z.discriminatedUnion("type", []).parse(null);
          throw new Error();
        } catch (e) {
          expect(JSON.parse(e.message)).toEqual([{ code: "x" }]);
        }
      });`;
    expect(names(src)).toEqual([]);
  });

  it('abstains when the try block calls fail() to guard the success path', () => {
    const src = `
      test("guarded by fail", () => {
        try { op(); fail("should have thrown"); } catch (e) { expect(e).toBe(1); }
      });`;
    expect(names(src)).toEqual([]);
  });

  // Regression class (lucy cold-review, PR #234): a REAL success-path assertion whose callee carries no
  // `expect`/`assert` token — the node:assert / ava / node:test vocabulary — must still count as an assertion
  // OUTSIDE catch, or a genuinely non-vacuous test is falsely proven. Each of these has an assertion that runs
  // on the non-exceptional path; all must ABSTAIN.
  it('abstains: node:assert strictEqual on the success path', () => {
    const src = `test("t1", () => { strictEqual(f(), 1); try { g(); } catch (e) { expect(e).toBe(1); } });`;
    expect(names(src)).toEqual([]);
  });

  it('abstains: destructured node:assert ok() on the success path', () => {
    const src = `test("t3", () => { ok(f()); try { g(); } catch (e) { expect(e).toBe(1); } });`;
    expect(names(src)).toEqual([]);
  });

  it('abstains: bare equal() on the success path', () => {
    const src = `test("t6", () => { equal(f(), 1); try { g(); } catch (e) { expect(e).toBe(1); } });`;
    expect(names(src)).toEqual([]);
  });

  it('abstains: ava/tap t.throws on the success path', () => {
    const src = `test("t4", () => { t.throws(() => g()); try { h(); } catch (e) { expect(e).toBe(1); } });`;
    expect(names(src)).toEqual([]);
  });

  it('abstains: deepStrictEqual on the success path', () => {
    const src = `test("t2", () => { deepStrictEqual(f(), {}); try { g(); } catch (e) { expect(e).toBe(1); } });`;
    expect(names(src)).toEqual([]);
  });
});

describe('scanTestVacuity — PROVEN no-assertion-in-test', () => {
  it('proves a body that discards work and asserts nothing', () => {
    const src = `
      test("parses a date", () => {
        const schema = z.string();
        schema.parse("2020-01-01");
      });`;
    expect(shapes(src)).toEqual(['parses a date:no-assertion-in-test']);
  });

  it('proves the census idiom: bare discarded expression with the assertions commented out', () => {
    const src = `
      test("getter access", () => {
        obj.someGetter;
        // expect(obj.someGetter).toBe(3);
      });`;
    expect(shapes(src)).toEqual(['getter access:no-assertion-in-test']);
  });

  // ── the soundness rails: each must move the verdict to ABSTAIN ──────────────────────────────────────
  it('ABSTAINS when any assertion-shaped call is present', () => {
    const src = `
      test("has one", () => {
        const r = f();
        expect(r).toBe(1);
      });`;
    expect(names(src)).toEqual([]);
  });

  it('ABSTAINS on an assert*-named helper (the BROAD matcher catches these)', () => {
    const src = `
      test("delegates", () => {
        assertValid(subject);
      });`;
    expect(names(src)).toEqual([]);
  });

  it('ABSTAINS on an expect*-prefixed helper — the shape-local widening, measured against real hits', () => {
    // Scanning this repo's own tests WITHOUT `isCheckShaped` produced 4 hits, all of them
    // `expectNoCollateral(...)` in sameas-pairkey-forgery.test.ts — correct tests asserting inside a helper.
    // Precision was 0/4, which is why absence is judged against the broader check-shaped vocabulary.
    const src = `
      test("delegates", () => {
        expectNoCollateral(a, b);
      });`;
    expect(names(src)).toEqual([]);
  });

  it('ABSTAINS on check/verify/ensure/should-prefixed helpers too', () => {
    for (const call of ['checkValid(x)', 'verifyShape(x)', 'ensureSorted(x)', 'shouldReject(x)']) {
      expect(names(`test("t", () => { ${call}; });`)).toEqual([]);
    }
  });

  // CHARACTERIZATION of the RESIDUAL limit, pinned so it stays visible rather than becoming folklore: a
  // helper named outside the check-shaped vocabulary still yields a proven fact. Sound (no check-shaped call
  // appears in THIS body) but imprecise. If the vocabulary is ever widened again, THIS test flips — which is
  // the point: the change becomes deliberate instead of silent.
  it('PROVES a helper named outside the vocabulary — the residual limit, pinned', () => {
    const src = `
      test("delegates", () => {
        hasNoCollateral(a, b);
      });`;
    expect(shapes(src)).toEqual(['delegates:no-assertion-in-test']);
  });

  it('ABSTAINS when an assertion guard is present (the body DOES defend)', () => {
    const src = `
      test("guarded", () => {
        expect.assertions(1);
        doWork();
      });`;
    expect(names(src)).toEqual([]);
  });

  it('ABSTAINS on a body that throws — a throw IS a check', () => {
    const src = `
      test("throws on purpose", () => {
        doWork();
        throw new Error("boom");
      });`;
    expect(names(src)).toEqual([]);
  });

  it('ABSTAINS on a fail()-shaped call', () => {
    const src = `
      test("fails", () => {
        doWork();
        fail("nope");
      });`;
    expect(names(src)).toEqual([]);
  });

  it('ABSTAINS on a valued return — a returned promise is an implicit check', () => {
    const src = `
      test("returns a promise", () => {
        return doWork();
      });`;
    expect(names(src)).toEqual([]);
  });

  it('ABSTAINS on an empty body (a different smell, not this shape)', () => {
    const src = `test("empty", () => {});`;
    expect(names(src)).toEqual([]);
  });

  it('ABSTAINS on a declaration-only body (setup, nothing discarded)', () => {
    const src = `
      test("setup only", () => {
        const a = 1;
        const b = compute(a);
      });`;
    expect(names(src)).toEqual([]);
  });

  it('ABSTAINS when a catch clause is present (that is the sibling shape territory)', () => {
    const src = `
      test("try no assert", () => {
        try {
          doWork();
        } catch (e) {
          log(e);
        }
      });`;
    expect(names(src)).toEqual([]);
  });

  it('the two shapes are MUTUALLY EXCLUSIVE — no test yields two facts', () => {
    const src = `
      test("catch only", async () => {
        try {
          await risky();
        } catch (e) {
          expect(e).toBeDefined();
        }
      });
      test("no assertion", () => {
        risky();
      });`;
    expect(shapes(src)).toEqual(['catch only:assertion-only-in-catch', 'no assertion:no-assertion-in-test']);
  });
});
