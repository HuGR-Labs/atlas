// @atlas/cli — test/wp-9.1.1-a-cli.test.ts  (WP-9.1.1-a.CLI)
//
// RED→GREEN transcription of the frozen goldens SCN-CLI-1a/1b/1c · 2a/2b/2c · 3a/3b/3c/3d
// (docs/requirements/goldens-adapters.md). The oracles under test are PURE data + pure functions:
//   - the command→leg map (CLI-1a) and the read/write authority partition (CLI-2), enumerated;
//   - the hand-rolled TOTAL parser (CLI-1b/1c), fuzzed with fast-check — 0 throws, 0 process.exit;
//   - the deterministic `renderVerdict` (CLI-3), byte-exact + exitCode == f(status).
// The `WiredHandler` is FAKE (canned `Verdict`s) — the WIRE assembly is a separate WP and never runs here.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { createHandler, WRITE_PATHS } from '@atlas/tools';
import type { Guidance, Tool, Verdict } from '@atlas/tools';
import type { WiredHandler } from '@atlas/adapter-io';
import { main } from '../src/cli.js';
import { renderVerdict } from '../src/render.js';
import { COMMAND_LEG, COMMANDS, authorityOf, deriveStatus } from '../src/map.js';

// ── fixtures ────────────────────────────────────────────────────────────────────────────────────────

const G = (next: string, invariant = 'INV-CLI-3: deterministic render'): Guidance => ({ next, invariant });

/** The three frozen fixtures (goldens §entrypoint fixtures) as REAL `Verdict`s over the real shape. */
const V_ok: Verdict = { ok: true, data: { territories: [], blastRadius: [], t0Candidates: [] }, guidance: G('index built') };
const V_rej: Verdict = { ok: true, data: { exitCode: 2 }, guidance: G('drift needs review') };
const V_err: Verdict = { ok: false, rejected: 'malformed input', guidance: G('malformed input: expected a repo path') };

/** A real handler whose legs produce genuine `ok/emitted:false/exitCode:2` verdicts (+ one unwired leg). */
const realHandler = createHandler({
  'atlas-init': () => ({ territories: [], blastRadius: [], t0Candidates: [] }), // ok
  'atlas-emit': () => ({ emitted: false, rejected: 'did not re-derive at source@sha' }), // ok:true, emitted:false → rejected
  'atlas-reconcile': () => ({ drift: [], mechanical: [], semantic: ['x'], regroundedCount: 0, reauthorCount: 1, exitCode: 2 }), // rejected
  // 'atlas-query' deliberately UNWIRED → handle returns ok:false → error
});

/** A total FAKE `WiredHandler` for the parser tests — never throws; returns a canned ok verdict. */
function fakeHandler(): WiredHandler {
  const handle = (): Verdict => ({ ok: true, data: {}, guidance: G('canned') });
  return { handle, resolveNode: () => ({ ok: false, guidance: G('n/a') }), schema: () => ({ name: 'x', description: '', inputSchema: {} }) } as unknown as WiredHandler;
}

// capture process.stdout so we can assert the render bytes reach the console (and silence fuzz noise).
let writes: string[];
beforeEach(() => {
  writes = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => { writes.push(String(chunk)); return true; });
});
afterEach(() => vi.restoreAllMocks());

// ── REQ-CLI-1 — total command surface ─────────────────────────────────────────────────────────────

describe('SCN-CLI-1a — every command maps to exactly one leg', () => {
  it('is total (14 keys) and mutually-exclusive over the ratified table', () => {
    // totality: every command in the finite surface has exactly one leg.
    expect(COMMANDS).toEqual(['init', 'query', 'emit', 'reconcile', 'doctor', 'mine', 'node', 'link', 'promote', 'own', 'relations', 'negations', 'verify-fact', 'verify-store']);
    expect(Object.keys(COMMAND_LEG).sort()).toEqual([...COMMANDS].sort());
    expect(COMMAND_LEG).toEqual({
      init: 'atlas-init',
      query: 'atlas-query',
      emit: 'atlas-emit',
      reconcile: 'atlas-reconcile',
      doctor: 'atlas-query',
      mine: 'genesis run-controller',
      node: 'atlas-query', // READ authority oracle (like doctor) — intercepted before the handler, no write authority
      link: 'atlas-link', // WRITE authority oracle (WP-SAMEAS governed sameAs door)
      promote: 'atlas-emit', // WRITE authority oracle (KNOW-8 governed promotion) — publishes THROUGH atlas-emit
      own: 'atlas-query', // READ authority oracle (RETR-12 `own_<scope>` briefing) — a second projection of the
      //                     query readback over the SAME durable store; carries no write authority
      relations: 'atlas-query', // READ authority oracle (#99a grounded-relation fold) — intercepted before the
      //                           handler, a projection of the same durable store; carries no write authority
      negations: 'atlas-query', // READ authority oracle (#99b grounded-negation + abstention folds) — intercepted
      //                           before the handler, a projection of the same durable store; no write authority
      'verify-fact': 'atlas-query', // READ authority oracle (sound-genesis PROVEN family) — intercepted before the
      //                               handler, a program oracle over the code index; carries no write authority
      'verify-store': 'atlas-query', // READ authority oracle (REVERIFY-GATE whole-store pass) — intercepted
      //                                before the handler, re-proves every stored witness; no write authority
    });
    // teeth: a command bound to zero legs (totality) or two legs (uniqueness) — each key resolves to one string.
    for (const c of COMMANDS) {
      expect(typeof COMMAND_LEG[c]).toBe('string');
      expect(COMMAND_LEG[c].length).toBeGreaterThan(0);
    }
  });
});

describe('SCN-CLI-1b — a malformed invocation yields a structured error', () => {
  it('atlas query (missing scope positional) → non-zero exit + guidance, no throw', async () => {
    const code = await main(['query'], { handler: fakeHandler() });
    expect(code).not.toBe(0);
    // teeth: a missing positional fails CLOSED to a structured error — guidance is present, not a stack trace.
    const out = writes.join('');
    expect(out).toMatch(/next:/);
    expect(out).toMatch(/invariant:/);
    expect(out.length).toBeGreaterThan(0);
  });
});

describe('SCN-CLI-1c — no malformed input crashes the parser', () => {
  const ALL = new Set<string>(COMMANDS);

  it('fully-random argv always resolves to a number — never throws / never process.exit', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((c?: number) => {
      throw new Error(`process.exit called (${c})`);
    }) as never);
    await fc.assert(
      fc.asyncProperty(fc.array(fc.string()), async (argv) => {
        const code = await main(argv, { handler: fakeHandler() });
        expect(typeof code).toBe('number');
      }),
      { numRuns: 300 },
    );
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('malformed streams (empty · flag-first · garbage · missing-positional) → non-zero, no throw', async () => {
    const garbageWord = fc.string().filter((s) => !s.startsWith('-') && !ALL.has(s));
    const malformed = fc.oneof(
      fc.constant<string[]>([]), // empty
      fc.array(fc.string(), { minLength: 1 }).map((xs) => xs.map((s) => `--${s}`)), // flag-first → no command
      garbageWord.map((w) => [w]), // unknown command
      fc.constantFrom('init', 'query', 'emit', 'reconcile', 'doctor').map((c) => [c]), // valid cmd, missing positional
    );
    await fc.assert(
      fc.asyncProperty(malformed, async (argv) => {
        const code = await main(argv, { handler: fakeHandler() });
        expect(code).not.toBe(0);
      }),
      { numRuns: 300 },
    );
  });
});

// ── REQ-CLI-2 — the CLI is the floor (read/write authority) ─────────────────────────────────────────

describe('SCN-CLI-2a/2b/2c — command × authority partition', () => {
  it('2a: reads {query, reconcile, doctor} (+init) carry no write authority', () => {
    for (const c of ['query', 'reconcile', 'doctor', 'init'] as const) {
      expect(authorityOf(c)).toBe('read');
    }
  });

  it('2b: three write COMMANDS funnel into the TWO governed write doors (asserted vs WRITE_PATHS)', () => {
    expect([...WRITE_PATHS].sort()).toEqual(['atlas-emit', 'atlas-link']); // the two governed write doors (WP-SAMEAS)
    const writers = COMMANDS.filter((c) => authorityOf(c) === 'write');
    expect([...writers].sort()).toEqual(['emit', 'link', 'promote']); // exactly the three write commands
    expect(COMMAND_LEG.emit).toBe('atlas-emit');
    expect(COMMAND_LEG.link).toBe('atlas-link');
    expect(COMMAND_LEG.promote).toBe('atlas-emit'); // KNOW-8 promotion publishes through the EXISTING emit door
    // THE PROPERTY, not the count: the doors the write commands funnel into ARE `WRITE_PATHS`, exactly — no
    // more (a command reaching a door nobody ratified) and no fewer (a ratified door nothing can reach). A
    // third write COMMAND is not a third write DOOR, and this is the assertion that keeps those two apart.
    // teeth: bind `promote` to a leg outside WRITE_PATHS (or mint a sixth tool for it) and the set diverges.
    expect([...new Set(writers.map((c) => COMMAND_LEG[c]))].sort()).toEqual([...WRITE_PATHS].sort());
  });

  it('2c: read XOR write is total over the surface (every command classified, exactly one)', () => {
    for (const c of COMMANDS) {
      const a = authorityOf(c);
      expect(a === 'read' || a === 'write').toBe(true);
      // teeth: query granted write would break the partition — query is a read only.
      if (c === 'query') expect(a).toBe('read');
    }
  });
});

// ── REQ-CLI-3 — deterministic render ────────────────────────────────────────────────────────────────

describe('SCN-CLI-3a/3b/3c/3d — deterministic render + exit-from-status', () => {
  it('3a: renderVerdict(V_ok) matches the reference byte-for-byte (no timestamp/duration)', () => {
    const reference = 'status: ok\nnext: index built\ninvariant: INV-CLI-3: deterministic render\n';
    expect(renderVerdict(V_ok).stdout).toBe(reference);
  });

  it('3b: exitCode == f(status) — 0/2/1 over real handler outputs (teeth: not a hardcoded exit 0)', () => {
    // hand-built fixtures
    expect(renderVerdict(V_ok).exitCode).toBe(0);
    expect(renderVerdict(V_rej).exitCode).toBe(2);
    expect(renderVerdict(V_err).exitCode).toBe(1);
    // real handler outputs — the derivation over genuine Verdicts
    expect(deriveStatus(realHandler.handle('atlas-init', {}))).toBe('ok');
    expect(renderVerdict(realHandler.handle('atlas-init', {})).exitCode).toBe(0); // ok
    expect(renderVerdict(realHandler.handle('atlas-reconcile', {})).exitCode).toBe(2); // semantic flip → exit 2
    expect(renderVerdict(realHandler.handle('atlas-emit', {})).exitCode).toBe(2); // emitted:false → rejected
    expect(renderVerdict(realHandler.handle('atlas-query', {})).exitCode).toBe(1); // unwired leg → error
  });

  it('3c: the same verdict renders byte-identically twice', () => {
    expect(renderVerdict(V_rej).stdout).toBe(renderVerdict(V_rej).stdout);
  });

  it('3d: the render carries the tool guidance text (TOOLS-4)', () => {
    const out = renderVerdict(V_err).stdout;
    expect(out).toContain('malformed input: expected a repo path'); // guidance.next present
    expect(out).toContain('status: error');
  });
});
