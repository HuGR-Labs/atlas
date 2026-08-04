// harness/gates/doc-transcript-guard.test.mjs — the TEETH of doc-transcript-guard.
//
// `gate-directory.test.mjs` already proves this file's subject exits non-zero on an EMPTY tree. That proves
// a reachable failure path and nothing else — a gate can fail on a missing directory and be vacuous on the
// real corpus. This file covers the rest: every refusal branch, and the two properties a cold review found
// the gate shipping WITHOUT.
//
// ── THE TWO DEFECTS THIS FILE EXISTS TO STOP RETURNING ───────────────────────────────────────────────
//   A-F5  The comparison normalised blank lines away on BOTH sides, so three blank lines could be inserted
//         into a verified transcript and the gate still printed "matches the built binary line for line".
//         A comparison too lenient to notice re-opens the hole it closes. Pinned by `blank lines are output`.
//   A-F3  THREE blocks were declared "not mechanically reproducible" that reproduce byte-exactly, so they
//         had silently stopped being checked — the gate's own I4 hole, one level up, wearing a stated
//         reason. Pinned by `every declaration is EARNED`, which force-verifies the whole declared set.
//         That case runs the real corpus (~70 subprocesses, ~70s) and is the price of the property: a
//         cheaper sample is the disease, not the cure.
//
// Fixtures are built in a temp tree and the gate is pointed at them with `DOC_TRANSCRIPT_GUARD_ROOT`. The
// tree needs `docs/` (mutated per case) plus the BUILT `packages/cli/dist` the gate spawns, so `packages`
// and `node_modules` are symlinked back at the real repo rather than copied. Exit codes come from
// `execFileSync`'s thrown `status` — never from a shell pipeline, which reports the LAST command's status
// and has already bought this repo two false greens.

import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GATES = dirname(fileURLToPath(import.meta.url));
const REPO = join(GATES, '..', '..');
const GATE = join(GATES, 'doc-transcript-guard.mjs');

const temps = [];
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

/** A scratch root holding a COPY of `docs/`, with `packages` + `node_modules` symlinked to the real repo. */
function scratchRoot() {
  const d = mkdtempSync(join(tmpdir(), 'atlas-doctrans-'));
  temps.push(d);
  cpSync(join(REPO, 'docs'), join(d, 'docs'), { recursive: true });
  symlinkSync(join(REPO, 'packages'), join(d, 'packages'));
  symlinkSync(join(REPO, 'node_modules'), join(d, 'node_modules'));
  return d;
}

/** Run the gate against `root`. The code is read directly, never through a pipe. */
function run(root) {
  try {
    const stdout = execFileSync(process.execPath, [GATE], {
      env: { ...process.env, DOC_TRANSCRIPT_GUARD_ROOT: root },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out: stdout };
  } catch (e) {
    return { code: e.status ?? -1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

const edit = (root, rel, fn) => {
  const abs = join(root, 'docs', rel);
  writeFileSync(abs, fn(readFileSync(abs, 'utf8')));
};

/** `{ verified, frozen, unverifiable }` as the gate reported them in its header line. */
function counts(out) {
  const m = /— (\d+) re-run against the built binary, (\d+) frozen, (\d+) not mechanically reproducible/.exec(out);
  return m === null ? null : { verified: +m[1], frozen: +m[2], unverifiable: +m[3] };
}

/** Every block key the gate named, by class marker. */
const named = (out, marker) =>
  out.split('\n').map((l) => new RegExp(`^\\s*${marker} (\\S+#\\d+)`).exec(l)).filter((m) => m !== null).map((m) => m[1]);

/** The real-corpus run, computed ONCE and shared: each call costs a full 12-subprocess sweep. */
let realRun;
const real = () => (realRun ??= run(REPO));

// A VERIFIED transcript with a stable, short body — the empty-pack read on the move-in how-to.
const VERIFIED_FILE = 'how-to/move-a-repo-in.md';
const VERIFIED_ROW = '     tokenEstimate: 0';

describe('doc-transcript-guard — the real corpus', () => {
  it('passes on the repository as it stands, and reports a classification that covers every block', () => {
    const { code, out } = real();
    expect(code, out).toBe(0);
    const c = counts(out);
    expect(c, out).not.toBeNull();
    const total = /(\d+) output transcript\(s\)/.exec(out);
    expect(+total[1]).toBe(c.verified + c.frozen + c.unverifiable);
    expect(out).toMatch(/doc-transcript-guard: OK —/);
  });

  it('NAMES every unverifiable transcript on a PASSING run (I4 — zero silent skips)', () => {
    const { code, out } = real();
    expect(code, out).toBe(0);
    const c = counts(out);
    const skipped = named(out, '!');
    expect(skipped.length).toBe(c.unverifiable);
    // each carries a stated reason on its own line, not a bare key
    for (const k of skipped) expect(out).toMatch(new RegExp(`${k.replace(/[.*+?^${}()|[\]\\#]/g, '\\$&')}[^\\n]*\\n\\s+\\S`));
  });

  it('NAMES every unverifiable transcript on a FAILING run too (the pass path is not the only path)', () => {
    const root = scratchRoot();
    edit(root, VERIFIED_FILE, (s) => s.replace(VERIFIED_ROW, '     tokenEstimate: 9'));
    const { code, out } = run(root);
    expect(code, out).toBe(1);
    expect(named(out, '!').length).toBe(counts(out).unverifiable);
  });
});

describe('doc-transcript-guard — the gate can be falsified', () => {
  it('FAILS on a ONE-CHARACTER divergence, naming file, line, command and BOTH sides', () => {
    const root = scratchRoot();
    edit(root, VERIFIED_FILE, (s) => s.replace('     stale: false', '     stale: falsE'));
    const { code, out } = run(root);
    expect(code, out).toBe(1);
    expect(out).toMatch(/how-to\/move-a-repo-in\.md#\d+ \(docs\/how-to\/move-a-repo-in\.md:\d+\) — output diverged/);
    expect(out).toMatch(/ran: {2}atlas query src/);
    expect(out).toMatch(/doc: {2}" {2}stale: falsE"/);
    expect(out).toMatch(/real: " {2}stale: false"/);
  });

  it('FAILS on a wrong EXIT CODE even when every output line matches', () => {
    const root = scratchRoot();
    edit(root, VERIFIED_FILE, (s) => s.replace(`${VERIFIED_ROW}\n   # exit 0`, `${VERIFIED_ROW}\n   # exit 2`));
    const { code, out } = run(root);
    expect(code, out).toBe(1);
    expect(out).toMatch(/exit code diverged/);
  });

  // A-F5. The gate claims "line for line"; blank lines are lines.
  it('BLANK LINES ARE OUTPUT — inserting them into a verified block FAILS', () => {
    const root = scratchRoot();
    edit(root, VERIFIED_FILE, (s) => s.replace('     advisoryDropped: 0', '\n\n     advisoryDropped: 0'));
    const { code, out } = run(root);
    expect(code, out).toBe(1);
    expect(out).toMatch(/output diverged/);
  });

  it('FAILS on a STALE DECLARATION — an exemption whose block no longer exists', () => {
    const root = scratchRoot();
    // Remove a whole page that carries declared transcripts; every declaration keyed to it goes stale.
    rmSync(join(root, 'docs', 'reference', 'commands', 'mine.md'));
    const { code, out } = run(root);
    expect(code, out).toBe(1);
    expect(out).toMatch(/STALE DECLARATION — reference\/commands\/mine\.md#\d+ is exempted here/);
  });

  // The anti-regression leg: VERIFIED is the DEFAULT, so an undeclared transcript is RUN, not skipped.
  it('RUNS a brand-new undeclared transcript rather than ignoring it', () => {
    const root = scratchRoot();
    const before = counts(run(root).out);
    edit(root, 'reference/commands/query.md', (s) =>
      `${s}\n\`\`\`\n$ atlas query src\nstatus: ok\nnext: whatever a page felt like claiming\n# exit 0\n\`\`\`\n`);
    const { code, out } = run(root);
    expect(code, out).toBe(1);
    expect(counts(out).verified).toBe(before.verified + 1);
    expect(out).toMatch(/whatever a page felt like claiming/);
  });

  it('ANTI-VACUITY: a docs tree with NO transcripts FAILS rather than reporting everything checked', () => {
    const root = scratchRoot();
    rmSync(join(root, 'docs'), { recursive: true, force: true });
    cpSync(join(REPO, 'docs', 'README.md'), join(root, 'docs', 'README.md'), { recursive: true });
    const { code, out } = run(root);
    expect(code, out).toBe(1);
    expect(out).toMatch(/ZERO output transcripts found|no docs\/ tree/);
  });

  it('ANTI-VACUITY: no built CLI FAILS — the gate refuses to agree with a page it cannot test against', () => {
    const root = mkdtempSync(join(tmpdir(), 'atlas-doctrans-'));
    temps.push(root);
    cpSync(join(REPO, 'docs'), join(root, 'docs'), { recursive: true });
    const { code, out } = run(root); // no `packages` symlink ⇒ no dist
    expect(code, out).toBe(1);
    expect(out).toMatch(/no built CLI at/);
  });
});

// A-F3. An exemption must be EARNED: a declared block that reproduces byte-exactly is a transcript that
// silently stopped being checked. Proven by promoting every declaration to VERIFIED — one at a time, by
// deleting it from a COPY of the gate — and requiring the gate to go red. If it stays green, that block
// belonged in VERIFIED all along.
describe('doc-transcript-guard — every declaration is EARNED', () => {
  it('no FROZEN/UNVERIFIABLE block reproduces byte-exactly against the real fixture', () => {
    const src = readFileSync(GATE, 'utf8');
    // Every SINGLE-QUOTED block key in the gate: the FROZEN map's `'key':` and the UNVERIFIABLE groups'
    // `'key',`. The header names keys in BACKTICKS, so prose is not swept in.
    const declared = [...new Set([...src.matchAll(/'([^']+\.md#\d+)'/g)].map((m) => m[1]))];
    expect(declared.length, 'the declaration list was not extracted — this test would be vacuous').toBeGreaterThan(10);

    const dir = mkdtempSync(join(tmpdir(), 'atlas-doctrans-earned-'));
    temps.push(dir);
    symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'));
    // One gate copy with EVERY declaration emptied: whatever still passes was never unverifiable.
    const stripped = join(dir, 'all-verified.mjs');
    const empty = src
      .replace(/const FROZEN = \{[\s\S]*?\n\};/, 'const FROZEN = {};')
      .replace(/const UNVERIFIABLE = \{[\s\S]*?\n\};/, 'const UNVERIFIABLE = {};');
    expect(empty, 'the declaration maps were not emptied — this test would be vacuous').toMatch(
      /const FROZEN = \{\};[\s\S]*const UNVERIFIABLE = \{\};/,
    );
    writeFileSync(stripped, empty);

    let out;
    try {
      out = execFileSync(process.execPath, [stripped], {
        env: { ...process.env, DOC_TRANSCRIPT_GUARD_ROOT: REPO },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    }
    const failed = new Set([...out.matchAll(/^ {2}✗ (\S+#\d+)/gm)].map((m) => m[1]));
    const unearned = declared.filter((k) => !failed.has(k));
    expect(
      unearned,
      `these blocks are declared FROZEN/UNVERIFIABLE but reproduce byte-exactly against the fixture, so they ` +
        `are silently unchecked. Delete their declarations and let them be VERIFIED:\n  ${unearned.join('\n  ')}`,
    ).toEqual([]);
  }, 180_000);
});
