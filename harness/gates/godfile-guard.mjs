#!/usr/bin/env node
// godfile-guard — the standing LOC ceiling. A source file over CAP lines is a "godfile": it hides
// coupling, defeats review, and is the #1 correlate of drift. The bar Orchestra enforces on seats is
// enforced on Orchestra itself (same doctrine as ci.yml). Fails the build with the offending list.
//
// ── SCOPE, AND THE TWO HOLES THAT USED TO BE IN IT ───────────────────────────────────────────────────
// Product code under `packages/**` (`.ts`, excluding `.d.ts`) AND the harness itself under `harness/**`
// (`.mjs`). Docs (`docs/**`, `*.md`) and generated output (`dist/`, `*.d.ts`) are exempt — long specs are
// legitimate, long modules are not. CAP is intentionally a single tunable constant.
//
//   UNTRACKED. The file list was `git ls-files packages`, which lists only what git has ALREADY RECORDED.
//   A brand-new 900-line module, written and never `git add`ed, was invisible: the guard printed OK, and
//   the author saw a green gate for a file the gate had not read. That is the worst direction for this
//   check to fail in, because the moment a file is most likely to be oversized is the moment it is first
//   written. `--others --exclude-standard` adds exactly the untracked-and-not-ignored set (so `dist/` and
//   `node_modules/` stay out, by .gitignore, rather than by a denylist here that would drift from it).
//
//   HARNESS. The guard walked `packages` only, so every gate in this directory — the files that enforce
//   the repo's standing bars — was itself unbarred. `layer-guard.mjs` sat at exactly 400 of 400 the day
//   this was widened. The bar the harness enforces on the product is now enforced on the harness.
//
// Both holes are one walk, and both are pinned by fixture in `godfile-guard.test.mjs`.
//
// ── WHAT IT STILL CANNOT SEE (stated so it is not mistaken for coverage) ─────────────────────────────
// Files ignored by `.gitignore` are out of scope by construction: that is how `dist/` is excluded, and it
// means an oversized module parked behind an ignore rule is not read. `scripts/`, `.github/` and `ref/`
// are outside both scope roots. And a "line" here is a `\n` split, so a file of 400 lines with a trailing
// newline measures 401 characters' worth of nothing as its 401st element — the count is INCLUSIVE of that
// empty tail, which is why a `wc -l` of 399 is a guard count of 400. That is the pre-existing convention
// and it is left alone: retuning the measurement and widening the walk in one change would make it
// impossible to say which one moved a file across the line.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CAP = 400; // max lines per source file. One-line change to retune the whole fleet bar.

// Repo root, OVERRIDABLE so the gate's own test can point it at a fixture repo. Without this the untracked
// and harness legs could only be checked by hand against the live tree — precisely the "trust me" the gate
// exists to abolish. It also makes the root independent of CWD, which the `git ls-files` form was not.
const ROOT = process.env.GODFILE_GUARD_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Scope roots and what counts as a source file in each. */
const SCOPES = [
  { dir: 'packages', include: (p) => /\.ts$/.test(p) && !/\.d\.ts$/.test(p) },
  { dir: 'harness', include: (p) => /\.mjs$/.test(p) },
];

let listed;
try {
  // `--cached` (tracked) ∪ `--others --exclude-standard` (untracked, not ignored). `-z` so a newline in a
  // path cannot split one entry into two.
  listed = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...SCOPES.map((s) => s.dir)],
    { cwd: ROOT, encoding: 'utf8' },
  )
    .split('\0')
    .filter((p) => p !== '');
} catch (e) {
  // A gate that cannot build its file list has checked NOTHING, and must say so rather than exit 0.
  console.error(`godfile-guard: FAIL\n\n  ✗ could not list files under ${ROOT}: ${e.message.split('\n')[0]}`);
  process.exit(1);
}

const files = [...new Set(listed)].filter((p) => SCOPES.some((s) => p.startsWith(`${s.dir}/`) && s.include(p))).sort();

const offenders = [];
for (const path of files) {
  let lines;
  try {
    lines = readFileSync(join(ROOT, path), 'utf8').split('\n').length;
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

const per = SCOPES.map((s) => `${files.filter((p) => p.startsWith(`${s.dir}/`)).length} ${s.dir}`).join(' + ');
console.log(`godfile-guard: OK — ${files.length} source file(s) (${per}), tracked AND untracked, all ≤${CAP} LOC.`);
