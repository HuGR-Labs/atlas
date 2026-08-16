#!/usr/bin/env node
// harness/probes/baseline-lister.mjs — the UPPER-PRESSURE pool member for A4 recall.
//
// The floor (`comment-extractor.mjs`) asks nothing of a model. This asks the opposite question: what does a
// raw LLM say if it is simply told "list every durable, non-obvious fact about this file" — with NO
// grounding door, NO anchor-per-fact discipline, NO admission gate. That is the SOTA baseline the #95
// rubric's "grounding is not truth" finding is measured against (`docs/design/95a-recall-a4-methodology.md`
// §3 step 2): if Atlas cannot beat an ungated raw-LLM lister on recall, the grounding door is bought at a
// recall cost that has to be named, not assumed away.
//
// COMMAND SHAPE. Exactly the `roles.propose` contract (ADR-0011 D1): prompt on stdin, answer text on
// stdout, non-zero exit means the call failed. The model is a PARAMETER (`LISTER_CMD` / `LISTER_ARGS`),
// never hardcoded — pointing it at `fake-model.mjs` is how this miner is exercised with zero real tokens.
//
// Harness invariant (harness/README.md): no `@atlas/*` import.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { classifyShape } from './comment-extractor.mjs';

const DEFAULT_CMD = process.env.LISTER_CMD || 'claude';
const DEFAULT_TIMEOUT_MS = Number(process.env.LISTER_TIMEOUT_MS || 180_000);

function defaultArgs() {
  try {
    return process.env.LISTER_ARGS ? JSON.parse(process.env.LISTER_ARGS) : ['-p'];
  } catch {
    throw new Error('baseline-lister: LISTER_ARGS must be a JSON array of strings');
  }
}

/**
 * Render the no-grounding-door listing prompt. Deliberately asks for durable, non-obvious facts — the same
 * bar the design doc's human-gold instructions use (§4) — so the baseline is compared on the same target,
 * not padded out with trivia the door would have refused anyway.
 * @param {string} filePath
 * @param {string} code
 * @returns {string}
 */
export function renderListerPrompt(filePath, code) {
  return `List every durable, non-obvious fact about the file below that a newcomer should know before touching it.

Do not restate obvious syntax. Do not editorialize. One fact per line, plain text, no numbering, no markdown, nothing before or after the list.

FILE: ${filePath}

CODE:
${code}`;
}

/** Split the raw answer into candidate fact lines: non-empty, trimmed, with numbering/bullet prefixes stripped. */
export function parseListerOutput(raw) {
  return String(raw ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^[-*•\d.)]+\s*/, ''))
    .filter((l) => l.length > 0);
}

/**
 * Run the baseline lister over one file.
 * @param {string} filePath
 * @param {string} code
 * @param {{cmd:string, args:string[]}} [judge]  the model command (default: env-configured / `claude`).
 * @param {number} [timeoutMs]
 * @returns {{facts: Array<{id:string, anchor:string, text:string, shape:string, source:'baseline-lister'}>, raw:string, status:number|null, err:string}}
 */
export function listFacts(filePath, code, cmd = { cmd: DEFAULT_CMD, args: defaultArgs() }, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const prompt = renderListerPrompt(filePath, code);
  const r = spawnSync(cmd.cmd, cmd.args, {
    input: prompt,
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    encoding: 'utf8',
  });
  const status = r.status ?? null;
  if (status !== 0) {
    return { facts: [], raw: r.stdout ?? '', status, err: String(r.error?.message ?? r.stderr ?? '') };
  }
  const lines = parseListerOutput(r.stdout);
  const facts = lines.map((text, i) => ({
    id: `LISTER-${i + 1}`,
    anchor: filePath,
    text,
    shape: classifyShape(text),
    source: /** @type {const} */ ('baseline-lister'),
  }));
  return { facts, raw: r.stdout ?? '', status: 0, err: '' };
}

function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    process.stderr.write('usage: LISTER_CMD=... LISTER_ARGS=... node baseline-lister.mjs <file> [<file> ...]\n');
    process.exit(2);
  }
  const all = [];
  for (const f of files) {
    let text;
    try {
      text = readFileSync(f, 'utf8');
    } catch (e) {
      process.stderr.write(`baseline-lister: cannot read ${f}: ${String(e?.message ?? e)}\n`);
      process.exit(1);
    }
    const { facts, err, status } = listFacts(f, text);
    if (status !== 0) {
      process.stderr.write(`baseline-lister: model call failed for ${f}: ${err}\n`);
      process.exit(1);
    }
    all.push(...facts);
  }
  process.stdout.write(`${JSON.stringify(all, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
