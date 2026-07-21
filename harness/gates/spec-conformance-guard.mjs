#!/usr/bin/env node
// spec-conformance-guard — mechanically ties the SHIPPED code to what the SPECS claim, so a future
// edit that drifts one from the other fails CI instead of surviving on human review alone.
//
// Three checks:
//   (1) CODE-SURFACE PIN — the shipped `GOVERNANCE_SURFACE` / `WRITE_PATHS` (the single source of truth)
//       must equal the ratified canonical set. Changing the surface is a deliberate edit to THIS pin,
//       reviewable in one place (INV-TOOLS-1 / ADR-0003).
//   (2) DOC ANTI-DRIFT — no canonical doc or source/test comment may reintroduce the pre-amendment
//       "single write door / four tools / four-leg / cardinality==4 / no fifth" governance-count forms.
//       (Excludes the ADR-narrative, the TOOLS-15 store-row-medium term-of-art, and doctor's four READ legs.)
//   (3) DIGEST TRIPWIRE — every `@sha256:` pin in properties-tls.md must equal the current whole-file
//       digest of method-tags-tls.md, so an upstream method-tag edit that isn't re-frozen fails here.
//
// Run: `npm run spec-conformance-guard` (needs `npm run build` first — check 1 imports the built dist).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const problems = [];

// ── (1) CODE-SURFACE PIN ────────────────────────────────────────────────────────────────────────
const EXPECTED_SURFACE = ['atlas-init', 'atlas-query', 'atlas-emit', 'atlas-reconcile', 'atlas-link'];
const EXPECTED_WRITE_PATHS = ['atlas-emit', 'atlas-link'];
try {
  const mod = await import(pathToFileURL(join(REPO, 'packages/tools/dist/src/index.js')).href);
  const eq = (a, b) => Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]);
  if (!eq(mod.GOVERNANCE_SURFACE, EXPECTED_SURFACE)) {
    problems.push(`CODE-SURFACE: GOVERNANCE_SURFACE = [${mod.GOVERNANCE_SURFACE}] ≠ canonical [${EXPECTED_SURFACE}]. ` +
      `If the surface changed by ratified amendment, update EXPECTED_SURFACE here AND the specs (INV-TOOLS-1, ADR).`);
  }
  if (!eq(mod.WRITE_PATHS, EXPECTED_WRITE_PATHS)) {
    problems.push(`CODE-SURFACE: WRITE_PATHS = [${mod.WRITE_PATHS}] ≠ canonical [${EXPECTED_WRITE_PATHS}].`);
  }
} catch (e) {
  problems.push(`CODE-SURFACE: could not import built constants (run \`npm run build\` first): ${e.message}`);
}

// ── (2) DOC ANTI-DRIFT ──────────────────────────────────────────────────────────────────────────
const STALE = [
  /\b(4|four)[ -]?(governance|governed|legs?|tools?|write)\b/i,
  /\bfour-leg\b/i, /\b4-leg\b/i, /\b4-tool\b/i,
  /\bno fifth\b/i, /\bfifth (governance|write) tool\b/i,
  /writePaths ?== ?1\b/i, /write-?[sS]urface ?== ?4\b/i, /cardinality ?== ?4\b/i,
  /\bthe closed four\b/i, /\bthe four governed tools\b/i, /\bexactly four\b/i,
];
// A line matching any of these is a LEGITIMATE use, not drift.
const ALLOW = [
  /ADR-0003/, /\bformer\b/i, /\bamend/i, /\baccidental\b/i, /\bevolves\b/i, /\bwording\b/i, // amendment narrative
  /single-write-door structural/i,            // INV-TOOLS-15 term-of-art (store-row medium)
  /four read legs?/i, /ALL FOUR legs/i, /the four legs, no more/i, /exactly the four legs/i, // doctor read legs
  /GATE's four legs/i, /the four legs route/i, /DOCTOR_SUBCOMMANDS/,
];
function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}
const files = [
  // ADRs are historical decision records — they legitimately narrate the pre-amendment state, so they
  // are excluded from the current-state drift sweep.
  ...walk(join(REPO, 'docs'), ['.md']).filter((f) => !f.includes('/docs/adr/')),
  ...walk(join(REPO, 'packages'), ['.ts']),
];
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (STALE.some((r) => r.test(line)) && !ALLOW.some((r) => r.test(line))) {
      problems.push(`DOC-DRIFT: ${f.replace(REPO + '/', '')}:${i + 1} — stale governance-count claim: ${line.trim().slice(0, 120)}`);
    }
  });
}

// ── (3) DIGEST TRIPWIRE (whole-file scheme: properties-<m> ↔ method-tags-<m>) ─────────────────────
// Only WHOLE-FILE-pinned modules are gated here (short 8-hex digest of the entire method-tags file, as the
// TLS + MEM headers document). Both were verified consistent before wiring (pins == current whole-file digest).
// NOT covered, on purpose:
//   • IDX pins are per-`### INV-INDEX-n`-BLOCK digests (`sha256(block)[:12]`). The recipe is reconstructable to
//     16/16 ONLY with a non-uniform last-block boundary — i.e. reverse-FITTED, not the true generator. Gating
//     on a fitted hash recipe would disagree with the real S2→S3 render on a future edit (false failures), so
//     IDX must be gated by its ORIGINAL generator, not by this guess. Left out honestly.
//   • gen/grd/knw/krn/pst/ret carry NO @sha256 pins — nothing to check.
const WHOLE_FILE_PINNED = ['tls', 'mem'];
for (const mod of WHOLE_FILE_PINNED) {
  const mt = join(REPO, `docs/requirements/method-tags-${mod}.md`);
  const props = join(REPO, `docs/requirements/properties-${mod}.md`);
  const digest8 = createHash('sha256').update(readFileSync(mt)).digest('hex').slice(0, 8);
  const pins = [...readFileSync(props, 'utf8').matchAll(/@sha256:([0-9a-f]{8})\b/g)].map((m) => m[1]);
  const stalePins = [...new Set(pins)].filter((p) => p !== digest8);
  if (pins.length === 0) {
    problems.push(`DIGEST: no 8-hex @sha256 pins found in properties-${mod}.md (expected the frozen source pins).`);
  } else if (stalePins.length) {
    problems.push(`DIGEST: properties-${mod}.md pins [${stalePins}] ≠ current method-tags-${mod}.md digest ${digest8}. ` +
      `Re-freeze the pins (reconcile the properties against the amended method-tags) or revert the method-tags edit.`);
  }
}

// ── report ────────────────────────────────────────────────────────────────────────────────────────
if (problems.length) {
  console.error(`spec-conformance-guard: FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.error('  ✗ ' + p);
  process.exit(1);
}
console.log(`spec-conformance-guard: OK — surface pinned (5 tools / 2 governed doors), ${files.length} files drift-free, whole-file digest pins fresh (${WHOLE_FILE_PINNED.join(', ')}).`);
