#!/usr/bin/env node
// harness/probes/cost-sum.mjs — the A3 COST reducer: reads a metering sidecar (the JSONL that
// `metered-claude.mjs` appends one line per call to) and prints the run's total dollar and token spend.
//
// WHY: the #95 benchmark's A3 axis reports what a mine run COST. `metered-claude.mjs` records each call
// (llm.ts is deliberately price-blind, #210 — see that file's header); this rolls the sidecar up into the
// single number the axis needs, plus the token breakdown that explains it (cache reads are the cheap part).
//
// USAGE: node harness/probes/cost-sum.mjs <sidecar.jsonl>
//
// Harness invariant (harness/README.md): no `@atlas/*` import, node built-ins only.

import { readFileSync } from 'node:fs';

const path = process.argv[2];
if (!path) {
  process.stderr.write('usage: node cost-sum.mjs <sidecar.jsonl>\n');
  process.exit(2);
}

const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim() !== '');

let calls = 0;
let abstained = 0;
let errors = 0;
let cost = 0;
let inTok = 0;
let outTok = 0;
let cacheRead = 0;
let cacheCreate = 0;

for (const line of lines) {
  let rec;
  try {
    rec = JSON.parse(line);
  } catch {
    process.stderr.write(`cost-sum: skipping unparseable line: ${line.slice(0, 80)}\n`);
    continue;
  }
  calls += 1;
  if (rec.abstained === true) abstained += 1;
  if (rec.is_error === true) errors += 1;
  cost += Number(rec.total_cost_usd) || 0;
  inTok += Number(rec.input_tokens) || 0;
  outTok += Number(rec.output_tokens) || 0;
  cacheRead += Number(rec.cache_read_input_tokens) || 0;
  cacheCreate += Number(rec.cache_creation_input_tokens) || 0;
}

const meanCost = calls > 0 ? cost / calls : 0;

process.stdout.write(
  [
    `sidecar:            ${path}`,
    `calls:              ${calls}`,
    `abstained:          ${abstained}`,
    `errors:             ${errors}`,
    `total_cost_usd:     ${cost.toFixed(6)}`,
    `input_tokens:       ${inTok}`,
    `output_tokens:      ${outTok}`,
    `cache_read_tokens:  ${cacheRead}`,
    `cache_create_tokens:${cacheCreate}`,
    `mean_cost_per_call: ${meanCost.toFixed(6)}`,
    '',
  ].join('\n'),
);
