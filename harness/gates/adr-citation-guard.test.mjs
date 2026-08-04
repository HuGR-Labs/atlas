// harness/gates/adr-citation-guard.test.mjs — the TEETH of adr-citation-guard.
//
// `gate-directory.test.mjs` already proves this file's subject exits non-zero on an EMPTY tree. That proves
// a reachable failure path and nothing else: a gate can fail on a missing directory and still be vacuous on
// the real corpus, which is the exact shape of the two non-gates #172 removed. This file is what covers the
// rest — every refusal branch reached by its OWN fixture, and the dangling-citation report checked against
// a HAND-WRITTEN expected set rather than against a second copy of the gate's own regex.
//
// Fixtures are built in a temp tree and the gate is pointed at them with `ADR_CITATION_GUARD_ROOT`. Exit
// codes come from `execFileSync`'s thrown `status` — never from a shell pipeline, which reports the LAST
// command's status and has already bought this repo two false greens.

import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GATES = dirname(fileURLToPath(import.meta.url));
const REPO = join(GATES, '..', '..');
const GATE = join(GATES, 'adr-citation-guard.mjs');

const temps = [];
/** A fresh scratch root. Prefix is this file's own — nothing else in the tree is ever removed. */
function scratch() {
  const d = mkdtempSync(join(tmpdir(), 'atlas-adrcite-'));
  temps.push(d);
  return d;
}
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

/** Run the gate against `root`. Returns `{ code, out }` with the code read directly, never through a pipe. */
function run(root) {
  try {
    const stdout = execFileSync(process.execPath, [GATE], {
      env: { ...process.env, ADR_CITATION_GUARD_ROOT: root },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out: stdout };
  } catch (e) {
    return { code: e.status ?? -1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

/** The `citing file:line → ADR-NNNN` occurrences the gate reported, in order. */
const reported = (out) =>
  out
    .split('\n')
    .map((l) => /^\s*✗\s+(\S+)\s+→\s+(ADR-\d{4})\b/.exec(l))
    .filter((m) => m !== null)
    .map((m) => `${m[1]} → ${m[2]}`);

/** The refusal code (`A-0`…`A-3`) the gate printed, or `null` if it reported dangling citations instead. */
const refusal = (out) => (/^\s*✗\s+(A-\d)\s/m.exec(out) ?? [null, null])[1];

const adr = (root, n, slug) => {
  mkdirSync(join(root, 'docs', 'adr'), { recursive: true });
  writeFileSync(join(root, 'docs', 'adr', `ADR-${n}-${slug}.md`), `# ADR-${n} — ${slug}\n`);
};

describe('adr-citation-guard — the real corpus', () => {
  it('passes on the repository as it stands, and says what it checked', () => {
    const { code, out } = run(REPO);
    expect(code, out).toBe(0);
    expect(out).toMatch(/^adr-citation-guard: OK — \d+ `ADR-<NNNN>` citation\(s\) in \d+ docs/);
  });

  it('FAILS when a real, heavily-cited ADR is removed — and names EVERY occurrence, not the first', () => {
    const root = scratch();
    cpSync(join(REPO, 'docs'), join(root, 'docs'), { recursive: true });
    unlinkSync(join(root, 'docs', 'adr', 'ADR-0013-the-pack-has-two-bands-governing-and-advisory.md'));

    const { code, out } = run(root);
    expect(code).toBe(1);

    const hits = reported(out);
    // Every reported occurrence is the removed ADR, cited from more than one file and more than one line —
    // "names every occurrence" is a claim about MULTIPLICITY, so it is checked as one.
    expect(hits.length).toBeGreaterThan(1);
    expect([...new Set(hits.map((h) => h.split(' → ')[1]))]).toEqual(['ADR-0013']);
    expect(new Set(hits.map((h) => h.split(':')[0])).size).toBeGreaterThan(1);
    // The two RATIFIED invariant-register rows are the citations that make this a governance defect rather
    // than a broken link, so they are named explicitly instead of left to a count.
    expect(hits.filter((h) => h.startsWith('docs/requirements/invariant-register.md:')).length).toBe(2);
    expect(out).toMatch(/dangling citation\(s\) across \d+ file\(s\), naming 1 absent ADR\(s\): ADR-0013\./);
  });
});

describe('adr-citation-guard — the report is exact', () => {
  it('reports precisely the hand-written expected set: file:line → id, one line per OCCURRENCE', () => {
    const root = scratch();
    adr(root, '0001', 'the-one-that-exists');
    mkdirSync(join(root, 'docs', 'requirements'), { recursive: true });
    writeFileSync(
      join(root, 'docs', 'requirements', 'req-x.md'),
      [
        'line 1 cites ADR-0001, which exists.', // resolves
        'line 2 cites ADR-0042 and ADR-0043.', // TWO occurrences on ONE line
        'line 3 is quiet.',
        'line 4 cites ADR-0042 again — the same id, a second occurrence.', // not deduped by id
        'line 5 cites ADR-00421 and ADR-042 and xADR-0042, none of which is a citation.', // word boundaries
      ].join('\n'),
    );
    // A second file, so file-level ordering is exercised: the walk is sorted, `adr/` sorts before `requirements/`.
    writeFileSync(join(root, 'docs', 'adr', 'ADR-0001-the-one-that-exists.md'), '# ADR-0001\nsee ADR-0042 below\n');

    const { code, out } = run(root);
    expect(code).toBe(1);
    expect(reported(out)).toEqual([
      'docs/adr/ADR-0001-the-one-that-exists.md:2 → ADR-0042',
      'docs/requirements/req-x.md:2 → ADR-0042',
      'docs/requirements/req-x.md:2 → ADR-0043',
      'docs/requirements/req-x.md:4 → ADR-0042',
    ]);
  });

  it('a citation inside a fenced block is still a citation (a fence is not a hiding place)', () => {
    const root = scratch();
    adr(root, '0001', 'exists');
    writeFileSync(join(root, 'docs', 'note.md'), '```\nADR-0099\n```\n');
    const { code, out } = run(root);
    expect(code).toBe(1);
    expect(reported(out)).toEqual(['docs/note.md:2 → ADR-0099']);
  });

  it('passes — and is therefore not a gate that merely always fails — when every citation resolves', () => {
    const root = scratch();
    adr(root, '0001', 'alpha');
    adr(root, '0002', 'beta');
    writeFileSync(join(root, 'docs', 'note.md'), 'ADR-0001 amends ADR-0002.\n');
    const { code, out } = run(root);
    expect(code, out).toBe(0);
    expect(out).toContain('naming 2 distinct ADR(s)');
  });

  it('a nested file under docs/adr/ does NOT satisfy a citation (the index is flat by declaration)', () => {
    const root = scratch();
    adr(root, '0001', 'exists');
    mkdirSync(join(root, 'docs', 'adr', 'archive'), { recursive: true });
    writeFileSync(join(root, 'docs', 'adr', 'archive', 'ADR-0077-buried.md'), '# ADR-0077\n');
    writeFileSync(join(root, 'docs', 'note.md'), 'ADR-0077 is cited here.\n');
    const { code, out } = run(root);
    expect(code).toBe(1);
    expect(reported(out)).toContain('docs/note.md:1 → ADR-0077');
  });
});

describe('adr-citation-guard — anti-vacuity: every way of checking nothing is a NAMED refusal', () => {
  it('A-0 — docs/ missing', () => {
    const { code, out } = run(scratch());
    expect(code).toBe(1);
    expect(refusal(out)).toBe('A-0');
  });

  it('A-2 — docs/adr/ missing, with a populated corpus that cites ADRs', () => {
    const root = scratch();
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeFileSync(join(root, 'docs', 'note.md'), 'ADR-0001 is cited here.\n');
    const { code, out } = run(root);
    expect(code).toBe(1);
    expect(refusal(out)).toBe('A-2');
  });

  it('A-1 — the docs walk resolves EMPTY (reachable only because the walk is checked before the index)', () => {
    const root = scratch();
    mkdirSync(join(root, 'docs', 'adr'), { recursive: true });
    const { code, out } = run(root);
    expect(code).toBe(1);
    expect(refusal(out)).toBe('A-1');
  });

  it('A-3 — docs/adr/ exists and holds ZERO ADR files, over a corpus that has prose in it', () => {
    const root = scratch();
    mkdirSync(join(root, 'docs', 'adr'), { recursive: true });
    writeFileSync(join(root, 'docs', 'adr', 'README.md'), 'index of decisions\n');
    writeFileSync(join(root, 'docs', 'note.md'), 'no citations at all here.\n');
    const { code, out } = run(root);
    // Zero citations, so "all resolve" would be VACUOUSLY true. It refuses anyway — that is the point.
    expect(code).toBe(1);
    expect(refusal(out)).toBe('A-3');
  });

  it('all four refusal codes are distinct and reachable (no branch is dead)', () => {
    const roots = [];
    const a0 = scratch();
    roots.push(a0);
    const a2 = scratch();
    mkdirSync(join(a2, 'docs'), { recursive: true });
    writeFileSync(join(a2, 'docs', 'x.md'), 'x\n');
    roots.push(a2);
    const a1 = scratch();
    mkdirSync(join(a1, 'docs', 'adr'), { recursive: true });
    roots.push(a1);
    const a3 = scratch();
    mkdirSync(join(a3, 'docs', 'adr'), { recursive: true });
    writeFileSync(join(a3, 'docs', 'x.md'), 'x\n');
    roots.push(a3);

    expect(roots.map((r) => refusal(run(r).out))).toEqual(['A-0', 'A-2', 'A-1', 'A-3']);
  });
});
