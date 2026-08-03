// harness/gates/command-doc-guard.test.mjs — the gate's OWN teeth.
//
// Every defect class the gate claims to catch is PLANTED in a throwaway fixture tree, and the gate must
// exit non-zero AND NAME the thing that is wrong — the name is the whole product of a gate like this, since
// "some page is missing" sends nobody anywhere. The clean tree must PASS, so the gate cannot be satisfied
// by firing on everything.
//
// The ANTI-VACUITY case is the one that matters most and is easiest to forget: if the extraction ever comes
// back empty, "zero commands, zero missing pages" reads as success while the entire surface is unchecked.
// That case is planted here explicitly (a fixture whose `COMMANDS` is `[]`), alongside the three other ways
// the read can break, because a gate whose oracle silently evaporates is worse than no gate at all.
//
// The fixture is a miniature Atlas: `packages/cli/src/map.ts` carrying a `COMMANDS` array, and a
// `docs/reference/commands/` tree. Never the real docs tree.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const GATE = fileURLToPath(new URL('./command-doc-guard.mjs', import.meta.url));

let root;

/** Run the gate against the fixture. Returns `{ code, out }` — never throws on a non-zero exit. */
function runGate() {
  try {
    const out = execFileSync(process.execPath, [GATE], {
      env: { ...process.env, COMMAND_DOC_GUARD_ROOT: root },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

/** Write the command oracle. `body` is the full initializer text, so malformed shapes can be planted. */
function map(body) {
  const p = join(root, 'packages', 'cli', 'src', 'map.ts');
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `import type { Tool } from '@atlas/tools';\n\nexport const COMMANDS = ${body};\nexport type Command = (typeof COMMANDS)[number];\n`);
}

/** Write a reference page. `rel` may be nested. Content is irrelevant BY DESIGN — the gate never reads it. */
function page(rel) {
  const p = join(root, 'docs', 'reference', 'commands', rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, '# a page\n');
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'command-doc-guard-'));
  map("['init', 'query', 'emit'] as const");
  page('init.md');
  page('query.md');
  page('emit.md');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('command-doc-guard — the gate can be falsified', () => {
  it('PASSES when every command has a page and every page has a command', () => {
    const { code, out } = runGate();
    expect(out).not.toContain('✗');
    expect(out).toMatch(/command-doc-guard: OK — 3 shipped command\(s\)/);
    expect(code).toBe(0);
  });

  it('FAILS a command with NO page, and NAMES the command', () => {
    map("['init', 'query', 'emit', 'reconcile'] as const"); // `reconcile` ships; nobody wrote its page
    const { code, out } = runGate();
    expect(out).toMatch(/UNDOCUMENTED COMMAND — `atlas reconcile`/);
    expect(out).toContain('docs/reference/commands');
    expect(out).not.toMatch(/UNDOCUMENTED COMMAND — `atlas init`/); // and only that one
    expect(code).toBe(1);
  });

  it('names EVERY undocumented command, not just the first', () => {
    map("['init', 'query', 'emit', 'node', 'link'] as const");
    const { out } = runGate();
    expect(out).toMatch(/UNDOCUMENTED COMMAND — `atlas node`/);
    expect(out).toMatch(/UNDOCUMENTED COMMAND — `atlas link`/);
  });

  it('FAILS a page with NO command, and NAMES the page', () => {
    page('promote.md'); // a command that was renamed away, or never shipped
    const { code, out } = runGate();
    expect(out).toMatch(/ORPHAN PAGE — docs\/reference\/commands\/promote\.md/);
    expect(code).toBe(1);
  });

  it('FAILS a page hidden in a SUBDIRECTORY (nesting is not an escape hatch)', () => {
    page(join('draft', 'emit.md'));
    const { code, out } = runGate();
    expect(out).toMatch(/ORPHAN PAGE — docs\/reference\/commands\/draft\/emit\.md/);
    expect(code).toBe(1);
  });

  it('ANTI-VACUITY: an EMPTY command list FAILS instead of reporting everything documented', () => {
    map('[] as const');
    const { code, out } = runGate();
    expect(out).toMatch(/EXTRACTION BROKEN/);
    expect(out).toMatch(/extracted EMPTY/);
    expect(out).not.toMatch(/command-doc-guard: OK/);
    expect(code).toBe(1);
  });

  it('ANTI-VACUITY: a RENAMED oracle FAILS (it does not read as a zero-command surface)', () => {
    const p = join(root, 'packages', 'cli', 'src', 'map.ts');
    writeFileSync(p, "export const CLI_COMMANDS = ['init'] as const;\n");
    const { code, out } = runGate();
    expect(out).toMatch(/EXTRACTION BROKEN/);
    expect(out).toMatch(/no `COMMANDS` variable declaration found/);
    expect(code).toBe(1);
  });

  it('ANTI-VACUITY: a NON-LITERAL surface FAILS rather than enumerating nothing', () => {
    map('buildCommands()');
    const { code, out } = runGate();
    expect(out).toMatch(/EXTRACTION BROKEN/);
    expect(out).toMatch(/no longer initialised with an ARRAY LITERAL/);
    expect(code).toBe(1);
  });

  it('ANTI-VACUITY: a SPREAD element FAILS rather than under-counting the surface', () => {
    map("['init', ...EXTRA] as const");
    const { code, out } = runGate();
    expect(out).toMatch(/EXTRACTION BROKEN/);
    expect(out).toMatch(/non-literal element/);
    expect(code).toBe(1);
  });

  it('ANTI-VACUITY: a MISSING map.ts FAILS', () => {
    rmSync(join(root, 'packages'), { recursive: true, force: true });
    const { code, out } = runGate();
    expect(out).toMatch(/EXTRACTION BROKEN/);
    expect(code).toBe(1);
  });

  it('reports EVERY command as undocumented when the docs directory does not exist (the state on master)', () => {
    rmSync(join(root, 'docs'), { recursive: true, force: true });
    const { code, out } = runGate();
    for (const c of ['init', 'query', 'emit']) expect(out).toMatch(new RegExp(`UNDOCUMENTED COMMAND — \`atlas ${c}\``));
    expect(code).toBe(1);
  });

  it('does NOT judge page CONTENT (an empty page satisfies the correspondence)', () => {
    writeFileSync(join(root, 'docs', 'reference', 'commands', 'emit.md'), '');
    const { code } = runGate();
    expect(code).toBe(0);
  });
});
