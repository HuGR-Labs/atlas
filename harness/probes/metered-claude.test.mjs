// harness/probes/metered-claude.test.mjs — calibration of the A3 metering wrapper.
//
// A metering instrument nobody watched succeed is worth nothing: it could pass the model's answer through
// perfectly and silently drop every cost line, or price the call and mangle the answer Atlas admits. So this
// drives `metered-claude.mjs` as a REAL subprocess in front of a FAKE `claude` (a tiny shim that echoes a
// canned JSON envelope, injected via METERED_CLAUDE_BIN — NO real model call, ever) and pins four things:
//   (a) on a normal envelope, stdout === the canned `result` VERBATIM (the `--output-format text` contract);
//   (b) the sidecar gains one line with the exact token numbers and cost;
//   (c) an is_error envelope ⇒ EMPTY stdout (abstention) + a sidecar line with abstained:true;
//   (d) a missing ATLAS_COST_SIDECAR exits 3 (fail-loud: nowhere to record = silent-loss bug).
//
// Harness invariant (harness/README.md): no `@atlas/*` import.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WRAPPER = join(HERE, 'metered-claude.mjs');

/** A fake `claude`: ignores args, drains stdin (so the parent never EPIPEs), echoes the JSON in FAKE_CLAUDE_JSON. */
const FAKE_SRC = `#!/usr/bin/env node
import { readFileSync } from 'node:fs';
readFileSync(0); // drain the prompt so the wrapper's pipe write completes
process.stdout.write(process.env.FAKE_CLAUDE_JSON || '{}');
`;

function makeFake(dir) {
  const p = join(dir, 'fake-claude.mjs');
  writeFileSync(p, FAKE_SRC);
  chmodSync(p, 0o755);
  return p;
}

/** Run the wrapper with a prompt, a fake claude, a canned JSON, and (optionally) a sidecar path. */
function runWrapper({ dir, sidecar, cannedJson, prompt = 'the prompt', fakeBin }) {
  return spawnSync(process.execPath, [WRAPPER], {
    input: prompt,
    encoding: 'utf8',
    env: {
      ...process.env,
      METERED_MODEL: 'claude-sonnet-4-6',
      METERED_CLAUDE_BIN: fakeBin ?? makeFake(dir),
      FAKE_CLAUDE_JSON: cannedJson,
      ...(sidecar ? { ATLAS_COST_SIDECAR: sidecar } : { ATLAS_COST_SIDECAR: '' }),
    },
  });
}

function readSidecar(path) {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l));
}

describe('metered-claude wrapper (A3 cost metering)', () => {
  it('(a)+(b) passes result verbatim to stdout and records tokens+cost to the sidecar', () => {
    const dir = mkdtempSync(join(tmpdir(), 'metered-ok-'));
    try {
      const sidecar = join(dir, 'cost.jsonl');
      const result = 'FACT: foo depends on bar.\nSECOND LINE.';
      const canned = JSON.stringify({
        is_error: false,
        result,
        total_cost_usd: 0.0123,
        duration_api_ms: 4321,
        usage: {
          input_tokens: 1500,
          output_tokens: 42,
          cache_read_input_tokens: 900,
          cache_creation_input_tokens: 10,
        },
      });
      const r = runWrapper({ dir, sidecar, cannedJson: canned });
      expect(r.status).toBe(0);
      // (a) verbatim, newline preserved, nothing trimmed
      expect(r.stdout).toBe(result);

      // (b) exactly one sidecar line with the exact numbers
      const rows = readSidecar(sidecar);
      expect(rows.length).toBe(1);
      const rec = rows[0];
      expect(rec.model).toBe('claude-sonnet-4-6');
      expect(rec.input_tokens).toBe(1500);
      expect(rec.output_tokens).toBe(42);
      expect(rec.cache_read_input_tokens).toBe(900);
      expect(rec.cache_creation_input_tokens).toBe(10);
      expect(rec.total_cost_usd).toBe(0.0123);
      expect(rec.duration_api_ms).toBe(4321);
      expect(rec.is_error).toBe(false);
      expect(rec.abstained).toBe(false);
      expect(typeof rec.ts).toBe('string');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('(b) appends — a second call never truncates the first', () => {
    const dir = mkdtempSync(join(tmpdir(), 'metered-append-'));
    try {
      const sidecar = join(dir, 'cost.jsonl');
      const fakeBin = makeFake(dir);
      const canned = JSON.stringify({
        is_error: false,
        result: 'x',
        total_cost_usd: 0.001,
        usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      });
      runWrapper({ dir, sidecar, cannedJson: canned, fakeBin });
      runWrapper({ dir, sidecar, cannedJson: canned, fakeBin });
      expect(readSidecar(sidecar).length).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('(c) is_error envelope ⇒ empty stdout (abstention) + sidecar line with abstained:true', () => {
    const dir = mkdtempSync(join(tmpdir(), 'metered-err-'));
    try {
      const sidecar = join(dir, 'cost.jsonl');
      const canned = JSON.stringify({
        is_error: true,
        result: 'should be ignored',
        total_cost_usd: 0.002,
        usage: { input_tokens: 100, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      });
      const r = runWrapper({ dir, sidecar, cannedJson: canned });
      expect(r.status).toBe(0);
      expect(r.stdout).toBe(''); // abstention: nothing on stdout
      const rows = readSidecar(sidecar);
      expect(rows.length).toBe(1);
      expect(rows[0].is_error).toBe(true);
      expect(rows[0].abstained).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('(c2) empty/whitespace result ⇒ abstention even when is_error is false', () => {
    const dir = mkdtempSync(join(tmpdir(), 'metered-empty-'));
    try {
      const sidecar = join(dir, 'cost.jsonl');
      const canned = JSON.stringify({
        is_error: false,
        result: '   \n  ',
        total_cost_usd: 0.0005,
        usage: { input_tokens: 50, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      });
      const r = runWrapper({ dir, sidecar, cannedJson: canned });
      expect(r.stdout).toBe('');
      expect(readSidecar(sidecar)[0].abstained).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('(d) missing ATLAS_COST_SIDECAR exits 3 (fail loud)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'metered-nosidecar-'));
    try {
      const canned = JSON.stringify({ is_error: false, result: 'x', usage: {} });
      const r = runWrapper({ dir, sidecar: null, cannedJson: canned });
      expect(r.status).toBe(3);
      expect(r.stderr).toMatch(/ATLAS_COST_SIDECAR/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
