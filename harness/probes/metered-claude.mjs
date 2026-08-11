#!/usr/bin/env node
// harness/probes/metered-claude.mjs — the METERING model wrapper: a drop-in `roles.propose.cmd` that
// behaves EXACTLY like `claude -p ... --output-format text` toward Atlas, while recording the real dollar
// and token cost of every call to a sidecar.
//
// ── WHY THIS FILE EXISTS (bench axis A3 — COST, issue #95) ──────────────────────────────────────────────
// Atlas's shipped model seam — `packages/adapter-io/src/llm.ts` — runs an operator-supplied command, pipes
// the prompt on stdin, and reads the claim on stdout. It DELIBERATELY reports no price: a subprocess is
// opaque by design (#210), so the seam cannot and must not know what a call cost. That is the right shape
// for the product, but the #95 benchmark's A3 axis needs a real $ number per mine run. The only honest
// place to price a call without touching the seam is IN the command the seam invokes. So this wrapper sits
// where `propose.cmd` points, runs `claude` with `--output-format json`, hands Atlas the model's answer
// text VERBATIM on stdout (indistinguishable from `--output-format text`), and appends the price+tokens to
// a sidecar JSONL. llm.ts is unchanged and stays price-blind; metering lives entirely here.
//
// ── STDOUT CONTRACT (must match `--output-format text` byte-for-byte as Atlas sees it) ──────────────────
//   • is_error===true OR empty/whitespace `result`  ⇒  write NOTHING to stdout. Empty stdout is how llm.ts
//     reads an ABSTENTION (GEN-12): no JSON, no parser on the product side, no parse-failure mode.
//   • otherwise                                     ⇒  write `result` VERBATIM (raw bytes, newlines and all;
//     Atlas's own sanity gate decides malformed-vs-ok — this wrapper does not collapse or rewrite).
//
// ── FAIL-LOUD vs FAIL-RECORDED ──────────────────────────────────────────────────────────────────────────
//   • missing ATLAS_COST_SIDECAR  ⇒  a metering run with nowhere to record is a silent-loss bug: print to
//     stderr and exit 3 (loud, kills the run).
//   • `claude` non-zero / not-found / timeout  ⇒  write nothing to stdout, STILL append a sidecar line with
//     is_error:true + an `error` field, then exit 0, so one bad call does not kill a whole mine run but IS
//     recorded.
//
// ── ENV KNOBS ───────────────────────────────────────────────────────────────────────────────────────────
//   METERED_MODEL          model id passed to `claude --model`, default `claude-sonnet-4-6`.
//   ATLAS_COST_SIDECAR     REQUIRED — JSONL file to append one record per call (created/appended, never
//                          truncated).
//   METERED_CLAUDE_BIN     the binary to invoke, default `claude`. Overridable so tests can inject a fake
//                          shim without hitting the real CLI (no real model call in the test suite).
//
// Harness invariant (harness/README.md): no `@atlas/*` import.

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeSync } from 'node:fs';

const MODEL = process.env.METERED_MODEL || 'claude-sonnet-4-6';
const SIDECAR = process.env.ATLAS_COST_SIDECAR;
const CLAUDE_BIN = process.env.METERED_CLAUDE_BIN || 'claude';
const TIMEOUT_MS = 180_000;

/** Fail loud: a metering run with nowhere to record is a silent-loss bug. */
if (!SIDECAR || SIDECAR.trim() === '') {
  writeSync(
    2,
    'metered-claude: ATLAS_COST_SIDECAR is required (nowhere to record cost = silent loss). Set it to a JSONL path.\n',
  );
  process.exit(3);
}

/** Read the WHOLE prompt from stdin as bytes (fd 0). Atlas pipes the prompt in; we pass it through unread. */
const prompt = readFileSync(0);

/** Append exactly one JSON line to the sidecar. Never truncates (appendFileSync = O_APPEND). */
function recordSidecar(fields) {
  appendFileSync(SIDECAR, JSON.stringify({ ts: new Date().toISOString(), model: MODEL, ...fields }) + '\n');
}

let stdoutBuf;
try {
  stdoutBuf = execFileSync(CLAUDE_BIN, ['-p', '--model', MODEL, '--output-format', 'json'], {
    input: prompt,
    timeout: TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
    // capture stdout as a Buffer; let stderr flow to our stderr for visibility
    stdio: ['pipe', 'pipe', 'inherit'],
  });
} catch (err) {
  // non-zero exit / ENOENT / timeout — record it, emit nothing, but do NOT kill the mine run.
  recordSidecar({
    input_tokens: null,
    output_tokens: null,
    cache_read_input_tokens: null,
    cache_creation_input_tokens: null,
    total_cost_usd: null,
    is_error: true,
    abstained: true,
    error: String((err && err.code) || (err && err.message) || err),
  });
  process.exit(0);
}

/** Parse the claude JSON envelope. A parse failure is itself a recorded error, not a crash. */
let env;
try {
  env = JSON.parse(stdoutBuf.toString('utf8'));
} catch (err) {
  recordSidecar({
    input_tokens: null,
    output_tokens: null,
    cache_read_input_tokens: null,
    cache_creation_input_tokens: null,
    total_cost_usd: null,
    is_error: true,
    abstained: true,
    error: 'unparseable-claude-json: ' + String((err && err.message) || err),
  });
  process.exit(0);
}

const isError = env.is_error === true;
const result = typeof env.result === 'string' ? env.result : '';
const usage = env.usage && typeof env.usage === 'object' ? env.usage : {};

// STDOUT contract: abstain (write nothing) on error or empty/whitespace result; else pass `result` VERBATIM.
const abstained = isError || result.trim() === '';
if (!abstained) {
  // write the exact bytes of `result` — no re-encode of newlines, Atlas's gate judges the shape.
  writeSync(1, Buffer.from(result, 'utf8'));
}

recordSidecar({
  input_tokens: usage.input_tokens ?? null,
  output_tokens: usage.output_tokens ?? null,
  cache_read_input_tokens: usage.cache_read_input_tokens ?? null,
  cache_creation_input_tokens: usage.cache_creation_input_tokens ?? null,
  total_cost_usd: typeof env.total_cost_usd === 'number' ? env.total_cost_usd : null,
  is_error: isError,
  abstained,
  ...(typeof env.duration_api_ms === 'number' ? { duration_api_ms: env.duration_api_ms } : {}),
});

process.exit(0);
