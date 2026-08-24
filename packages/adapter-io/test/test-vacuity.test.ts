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
});
