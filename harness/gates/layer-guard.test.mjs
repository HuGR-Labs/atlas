// harness/gates/layer-guard.test.mjs — the gate's OWN teeth.
//
// A gate nobody can falsify is decoration. This file plants, in a throwaway fixture tree, each defect the
// gate claims to catch — including the three that two cold reviews PROVED an earlier revision let through
// green — and asserts the gate exits non-zero and NAMES the violation. It also asserts the clean tree
// passes, so the gate cannot be made to fire on everything (a gate that always fails is also decoration).
//
// The fixture is a miniature Atlas: an ARCHITECTURE.md carrying the canonical `L<n>` rows (the gate DERIVES
// its ranking from that file — it does not transcribe one), a few package manifests + sources, and a
// composition root with a `legs` literal.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const GATE = fileURLToPath(new URL('./layer-guard.mjs', import.meta.url));

let root;

/** Run the gate against the fixture. Returns `{ code, out }` — never throws on a non-zero exit. */
function runGate() {
  try {
    const out = execFileSync(process.execPath, [GATE], {
      env: { ...process.env, LAYER_GUARD_ROOT: root },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

function pkg(name, deps, sources = {}) {
  const dir = join(root, 'packages', name);
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: `@atlas/${name}`, dependencies: Object.fromEntries(deps.map((d) => [`@atlas/${d}`, '*'])) }, null, 2),
  );
  for (const [file, body] of Object.entries(sources)) writeFileSync(join(dir, 'src', file), body);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'layer-guard-'));
  // The canonical diagram the gate derives its ranking FROM.
  writeFileSync(
    join(root, 'ARCHITECTURE.md'),
    ['                contracts   L0  vocabulary', '                kernel      L1  identity', '                knowledge   L4  lifecycle', '                tools       L7  governed surface', ''].join('\n'),
  );
  pkg('contracts', []);
  pkg('kernel', ['contracts'], { 'a.ts': "import type { X } from '@atlas/contracts';\nexport type Y = X;\n" });
  pkg('knowledge', ['kernel']);
  pkg('tools', ['knowledge']);
  mkdirSync(join(root, 'packages', 'tools', 'dist', 'src'), { recursive: true });
  writeFileSync(
    join(root, 'packages', 'tools', 'dist', 'src', 'index.js'),
    "export const GOVERNANCE_SURFACE = ['atlas-init'];\nexport const WRITE_PATHS = [];\n",
  );
  pkg('adapter-io', ['tools'], {
    'wire.ts': ["export function assemble() {", "  const legs: ToolLegs = {", "    'atlas-init': () => ({}),", "  };", '  return legs;', '}', ''].join('\n'),
  });
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('layer-guard — the gate can be falsified', () => {
  it('PASSES the clean fixture (it does not fire on everything)', () => {
    const { code, out } = runGate();
    expect(out).not.toContain('✗');
    expect(code).toBe(0);
  });

  it('catches a layer INVERSION declared only in a manifest', () => {
    pkg('knowledge', ['kernel', 'tools']); // L4 → L7
    const { code, out } = runGate();
    expect(out).toMatch(/ARCH-1 layer inversion: @atlas\/knowledge \(L4\) depends on @atlas\/tools \(L7\)/);
    expect(code).toBe(1);
  });

  it('catches an inversion introduced ONLY by a source import — the hole a cold review proved', () => {
    // No manifest edit. npm workspaces resolves this; a manifest-only graph is blind to it.
    pkg('tools', ['knowledge'], { 'probe.ts': "import { x } from '@atlas/adapter-io';\nexport const y = x;\n" });
    const { code, out } = runGate();
    expect(out).toMatch(/ARCH-2 forbidden edge: @atlas\/tools MUST NOT depend on @atlas\/adapter-io/);
    expect(code).toBe(1);
  });

  it('NAMES a dependency cycle by its path', () => {
    pkg('contracts', ['kernel']); // contracts ↔ kernel
    const { code, out } = runGate();
    expect(out).toMatch(/ARCH-1 dependency CYCLE: .*@atlas\/contracts.*@atlas\/kernel/);
    expect(code).toBe(1);
  });

  it('refuses a package that is in NO layer (silent exemption is how memory/genesis went unchecked)', () => {
    pkg('brand-new', ['contracts']);
    const { code, out } = runGate();
    expect(out).toMatch(/ARCH-1 unranked package '@atlas\/brand-new'/);
    expect(code).toBe(1);
  });

  it('refuses a GHOST leg spread into the composition root — invisible to a key scan, invocable at runtime', () => {
    pkg('adapter-io', ['tools'], {
      'wire.ts': ["const ghost = { 'atlas-backdoor': () => ({}) };", 'export function assemble() {', '  const legs: ToolLegs = {', '    ...ghost,', "    'atlas-init': () => ({}),", '  };', '  return legs;', '}', ''].join('\n'),
    });
    const { code, out } = runGate();
    expect(out).toMatch(/ARCH-3 the leg binding block contains a top-level SPREAD/);
    expect(code).toBe(1);
  });

  it('does NOT fire on a spread inside a NESTED object (the false alarm a first attempt produced)', () => {
    pkg('adapter-io', ['tools'], {
      'wire.ts': ['export function assemble(cfg) {', '  const legs: ToolLegs = {', "    'atlas-init': () => ({ seams: { ...(cfg.extra ?? {}) } }),", '  };', '  return legs;', '}', ''].join('\n'),
    });
    const { out } = runGate();
    expect(out).not.toContain('SPREAD');
  });

  it('reports a source import the manifest does not declare', () => {
    pkg('knowledge', [], { 'u.ts': "import { k } from '@atlas/kernel';\nexport const v = k;\n" });
    const { code, out } = runGate();
    expect(out).toMatch(/ARCH-1 undeclared edge: @atlas\/knowledge imports @atlas\/kernel/);
    expect(code).toBe(1);
  });

  it('does NOT treat a package NAMED in a comment as an import (the 68-false-positive trap)', () => {
    pkg('kernel', ['contracts'], {
      'c.ts': ['// This must never import @atlas/tools — that would invert the DAG.', "/* @atlas/adapter-io is the outer ring. */", 'export const z = 1;', ''].join('\n'),
    });
    const { out } = runGate();
    expect(out).not.toContain('✗');
  });
});
