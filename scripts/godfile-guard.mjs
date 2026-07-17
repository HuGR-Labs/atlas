#!/usr/bin/env node
// godfile-guard — the standing LOC ceiling. A source file over CAP lines is a "godfile": it hides
// coupling, defeats review, and is the #1 correlate of drift. The bar Orchestra enforces on seats is
// enforced on Orchestra itself (same doctrine as ci.yml). Fails the build with the offending list.
//
// Scope: tracked TypeScript under packages/** and seats/** (product code). Docs (docs/**, *.md) and
// generated output (dist/, *.d.ts) are exempt — long specs are legitimate; long modules are not.
// CAP is intentionally a single tunable constant.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const CAP = 400; // max lines per source file. One-line change to retune the whole fleet bar.

const tracked = execSync('git ls-files packages seats', { encoding: 'utf8' })
  .split('\n')
  .filter((p) => /\.ts$/.test(p) && !/\.d\.ts$/.test(p));

const offenders = [];
for (const path of tracked) {
  let lines;
  try {
    lines = readFileSync(path, 'utf8').split('\n').length;
  } catch {
    continue; // deleted-but-staged edge; skip
  }
  if (lines > CAP) offenders.push({ path, lines });
}

if (offenders.length > 0) {
  offenders.sort((a, b) => b.lines - a.lines);
  console.error(`godfile-guard: ${offenders.length} file(s) over the ${CAP}-LOC ceiling:`);
  for (const { path, lines } of offenders) console.error(`  ${lines}\t${path}`);
  console.error(`\nSplit each into cohesive units ≤${CAP} lines. No #[allow], no bypass — fix at the root.`);
  process.exit(1);
}

console.log(`godfile-guard: OK — ${tracked.length} source file(s), all ≤${CAP} LOC.`);
