#!/usr/bin/env node
// command-doc-guard — the SHIPPED SURFACE ≡ REFERENCE PAGES correspondence. One page per command, both ways.
//
// Prose rots because nothing fails when it does. The proof is in the file this gate reads: the comment on
// `COMMAND_LEG` (packages/cli/src/map.ts) records that the map "said 'all six' until `node` and `link` were
// added". That was a hand-maintained sentence sitting three lines from the array it described, and it still
// drifted. A hand-maintained docs INDEX — further away, edited by different people, in a different tree —
// drifts the same way and faster. So the reference tree is not indexed by hand here: it is CHECKED against
// the surface, and a missing page breaks the build.
//
// ── WHAT IT CHECKS — exactly this, in BOTH directions ────────────────────────────────────────────────
//   (1) UNDOCUMENTED COMMAND — an entry in `COMMANDS` with no `docs/reference/commands/<command>.md`.
//   (2) ORPHAN PAGE         — a `.md` under that directory naming something `COMMANDS` does not contain.
//                             A page for a deleted command is not harmless: it is a documented door that
//                             does not open, which is how a docs tree accumulates lies about a surface
//                             that moved. Both legs, or the ledger only ever grows.
//
// ── WHAT IT DELIBERATELY DOES NOT CHECK ──────────────────────────────────────────────────────────────
// The CONTENT of a page. No word count, no required heading, no "must show an example". Existence and
// correspondence only. A gate that grades prose becomes an editor, and an editor nobody elected is worked
// around rather than satisfied. Whether a page is any GOOD is a human review job and is not claimed here.
//
// ── WHERE THE LIST COMES FROM, AND WHY NOT FROM HERE ─────────────────────────────────────────────────
// `COMMANDS` in packages/cli/src/map.ts is the oracle, and this gate carries NO copy of it. A gate holding
// its own list of the eight names would be a second source of truth with exactly the failure mode above:
// it would have said "all six" too, and agreed with itself, forever.
//
// The list is read from SOURCE via the TypeScript parser (already a dependency; reference-model-guard reads
// source the same way) rather than by importing `packages/cli/dist/**` — so the gate runs with no build,
// in the same position as godfile-guard, and its own fixtures are three lines of TypeScript instead of a
// compiled workspace. It is a PARSE, not a regex: an earlier gate in this tree was fooled by a marker in a
// string literal, and a pattern that quietly matches nothing is the specific disease this gate must not have.
//
// ── FAIL-CLOSED EXTRACTION ───────────────────────────────────────────────────────────────────────────
// The worst possible outcome here is not a false alarm — it is a gate that finds ZERO commands, checks zero
// of them, and prints OK. "Everything is documented" and "the extraction broke" would look identical. So
// every way of not getting a list is an explicit, named FAILURE: the file missing, the declaration missing,
// an initializer that is not an array literal, an element that is not a string literal, and an array that
// comes back EMPTY. The empty case fails even though an empty surface would be vacuously documented,
// because a real CLI shipping zero commands is not a state this repo can reach by accident.
//
// Run: `node harness/gates/command-doc-guard.mjs` (no build needed — it reads source only).

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = process.env.COMMAND_DOC_GUARD_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The oracle. Its PATH is the one thing this gate hardcodes — moving the file must fail loudly, not silently. */
const MAP_REL = join('packages', 'cli', 'src', 'map.ts');
/** One page per command lives here. Its PATH is a convention this gate defines; nothing else reads it. */
const DOCS_REL = join('docs', 'reference', 'commands');

const MAP = join(ROOT, MAP_REL);
const DOCS = join(ROOT, DOCS_REL);

/** The exported identifier that enumerates the shipped surface. */
const ORACLE = 'COMMANDS';

/**
 * Extract the string members of the exported `COMMANDS` array from map.ts SOURCE.
 *
 * Returns `{ names }` on success, or `{ broken }` naming precisely how the extraction failed. It never
 * returns an empty `names` and it never returns both — a caller cannot mistake "broke" for "nothing to do".
 */
function extractCommands(text) {
  const sf = ts.createSourceFile(MAP_REL, text, ts.ScriptTarget.Latest, /* setParentNodes */ false, ts.ScriptKind.TS);

  let init;
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const d of stmt.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.name.text === ORACLE) init = d.initializer;
    }
  }
  if (init === undefined) {
    return { broken: `no \`${ORACLE}\` variable declaration found in ${MAP_REL}. The oracle was renamed, moved, or deleted.` };
  }

  // `COMMANDS = [...] as const` / `satisfies …` — unwrap the assertions the declaration is written with.
  while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init) || ts.isParenthesizedExpression(init)) init = init.expression;

  if (!ts.isArrayLiteralExpression(init)) {
    return { broken: `\`${ORACLE}\` in ${MAP_REL} is no longer initialised with an ARRAY LITERAL (found ${ts.SyntaxKind[init.kind]}). This gate can only enumerate a literal surface — a computed one cannot be checked statically.` };
  }

  const names = [];
  for (const el of init.elements) {
    if (!ts.isStringLiteralLike(el)) {
      return { broken: `\`${ORACLE}\` in ${MAP_REL} contains a non-literal element (${ts.SyntaxKind[el.kind]}) — a spread or an expression. Every command must be a literal string, or the shipped surface cannot be enumerated.` };
    }
    names.push(el.text);
  }
  if (names.length === 0) {
    return { broken: `\`${ORACLE}\` in ${MAP_REL} extracted EMPTY. Either the CLI ships no commands, or this gate's reading of the file broke — and a gate that checks zero commands would print OK for a completely undocumented product. Failing instead.` };
  }
  return { names };
}

/** Every `.md` under DOCS, as slash-joined paths relative to it (recursive: a nested page is not a hiding place). */
function pages(dir, prefix = '') {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.isDirectory()) out.push(...pages(join(dir, e.name), `${prefix}${e.name}/`));
    else if (e.name.endsWith('.md')) out.push(`${prefix}${e.name}`);
  }
  return out;
}

const fail = [];

if (!existsSync(MAP)) {
  console.error('command-doc-guard: FAIL\n');
  console.error(`  ✗ EXTRACTION BROKEN — ${MAP_REL} does not exist. The command oracle moved; point this gate at it.\n`);
  process.exit(1);
}

const { names, broken } = extractCommands(readFileSync(MAP, 'utf8'));

if (broken !== undefined) {
  console.error('command-doc-guard: FAIL\n');
  console.error(`  ✗ EXTRACTION BROKEN — ${broken}\n`);
  console.error('The gate refuses to report on a surface it could not read. Fix the extraction, not the docs.');
  process.exit(1);
}

const documented = new Set(pages(DOCS));
const shipped = new Set(names);

// (1) a shipped command nobody wrote a page for.
for (const c of names) {
  if (!documented.has(`${c}.md`)) {
    fail.push(
      `UNDOCUMENTED COMMAND — \`atlas ${c}\`\n` +
        `      Shipped (it is in \`${ORACLE}\`, ${MAP_REL}) with no page at ${DOCS_REL}${sep}${c}.md.\n` +
        `      Write the page. A stub added to clear this gate is the exact lie the gate exists to prevent.`,
    );
  }
}

// (2) a page describing a door that is not there.
for (const p of documented) {
  if (!shipped.has(p.replace(/\.md$/, ''))) {
    fail.push(
      `ORPHAN PAGE — ${DOCS_REL}${sep}${p}\n` +
        `      Names something \`${ORACLE}\` (${MAP_REL}) does not contain, so it documents a door that does\n` +
        `      not open. Delete it, or rename it to the command it actually describes. One page per command,\n` +
        `      flat, named exactly \`<command>.md\` — a nested or extra file cannot be told apart from a stale one.`,
    );
  }
}

if (fail.length > 0) {
  console.error('command-doc-guard: FAIL\n');
  for (const f of fail) console.error(`  ✗ ${f}\n`);
  console.error(
    `${fail.length} violation(s) across a surface of ${names.length} command(s): ${names.join(', ')}.\n` +
      'The surface is the oracle. Move the docs to it — do not weaken this gate to the docs.',
  );
  process.exit(1);
}

console.log(
  `command-doc-guard: OK — ${names.length} shipped command(s) (${names.join(', ')}), ` +
    `${documented.size} reference page(s) under ${DOCS_REL}. Correspondence holds in both directions. ` +
    'Existence only — whether a page is worth reading is a human job and is not claimed here.',
);
