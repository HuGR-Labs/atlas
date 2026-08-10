#!/usr/bin/env node
// doc-transcript-guard — a documented TRANSCRIPT is re-run against the BUILT BINARY, or it is named as
// unverifiable. Every block, every run. There is no third outcome and there is no silent skip.
//
// ── THE DEFECT THIS EXISTS TO STOP RETURNING ─────────────────────────────────────────────────────────
// #107 changed the shape of `atlas query` output: two guidance strings rewritten, an `advisoryDropped` row
// added to the `data:` block, a `[<freshness>]` field added to every `inv` row. Eight documented transcripts
// across five pages went on showing the old shape, in a PUBLIC repo, and nothing went red — because
// `command-doc-guard` checks that each shipped command IS documented and deliberately never reads what the
// page CLAIMS it prints. A page can be present, correspond to a real command, and describe output the
// product stopped producing a commit ago.
//
// ── WHAT IT CHECKS ───────────────────────────────────────────────────────────────────────────────────
//   (1) EVERY fenced block under `docs/**` that purports to be `atlas` output is ENUMERATED and CLASSIFIED.
//       The set, not a sample. Three classes, and a block is in exactly one:
//         VERIFIED     — re-run against a fixture repo built here, diffed line by line against the page.
//         FROZEN       — deliberately quotes output the product no longer produces, with a stated reason.
//         UNVERIFIABLE — cannot be mechanically reproduced; the reason is printed BY NAME on every run.
//   (2) A VERIFIED block's every line — BLANK LINES INCLUDED — and its exit code match the real run. First
//       divergence is reported with the file, line, command, and both sides.
//       VERIFIED IS A CLAIM ABOUT BYTES, NOT NARRATIVE STATE: the page shows what the binary prints for that
//       invocation against this fixture, NOT that the page's story produced it. A block can be byte-true and
//       still contradict its own page — it happened here, a promotion transcript regenerated from the wrong
//       fixture carrying a nodeKey the page never uses — and no byte comparison sees that. Page-level
//       consistency stays a human job and is not claimed.
//   (3) VERIFIED is the DEFAULT, and that is the anti-regression leg. A block reaches the other two classes
//       only by being NAMED below; a transcript nobody declared is RUN, so a new page cannot arrive
//       unchecked — the way it arrives is red. (This default is also why there is no separate "an undeclared
//       `query` transcript fails" check: it could never fire.)
//   (4) Every FROZEN / UNVERIFIABLE declaration must still RESOLVE to a real block. One whose block moved or
//       was deleted is a stale exemption and fails, so the list cannot outlive what it exempts.
//
// ── WHY THE COMMAND IS READ FROM THE TRANSCRIPT, NOT TRANSCRIBED HERE ────────────────────────────────
// The `$ …` line IS the command. This gate parses it (leading `KEY=VALUE` env, then a literal `atlas`, then
// argv) and runs exactly that, carrying no second copy of any invocation — a gate holding its own list would
// be a second source of truth with the failure mode of the prose it guards: agreeing with itself.
//
// ── WHAT IT CANNOT DO, MEASURED RATHER THAN GLOSSED ──────────────────────────────────────────────────
// `harness/` may not import `@atlas/*` (`gate-directory.test.mjs`, the one-way dependency). A grounded fact
// can only be authored by computing the `subtreeHash` the index computes, and NO SHIPPED COMMAND PRINTS IT —
// the repo's own how-to says so, re-measured four ways: `emit`'s refusal names the gate (`ungrounded: …`)
// not the hash, `doctor why` on an unknown key says `whyBroken: none`, `doctor index` prints the indexer
// plan, `mine` abstains. So this gate cannot put a fact in a pack, and every transcript showing a POPULATED
// pack is UNVERIFIABLE and named as such. That is the product's authoring gap (campaign 10) reaching the
// harness, not a shortcut taken here.
//
// COVERAGE, by intersecting the EIGHT transcripts #107 rotted (the set differing between master `e4882a3`
// and this branch) with the set re-run here: THREE — `how-to/move-a-repo-in.md#2`, `query.md#2`,
// `query.md#4`. 3/8 = 37.5%. The five out of reach (`emit-a-grounded-fact.md#2`, `find-and-fix-drift.md#1`,
// `link.md#2`, `promote.md#6`, `query.md#1`) all show a POPULATED pack. Three still turns this red the day
// #107 lands.
//
// Run: `node harness/gates/doc-transcript-guard.mjs` (requires a BUILT `packages/cli/dist` — it runs the
// product, it does not read it).

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.DOC_TRANSCRIPT_GUARD_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOCS = join(ROOT, 'docs');
const CLI = join(ROOT, 'packages', 'cli', 'dist', 'src', 'bin.js');

/** The fixture actor. Synthetic, and it is not a credential: `.atlas/policy.json` is a self-asserted
 *  anti-accident guardrail (policy.ts says so in its own header), so this is a name, not a secret. */
const ACTOR = 'dev@example.com';
/** The fixture tree — the repository the reference pages describe (`README.md` and `src/{greet,math}.ts`). */
const FILES = {
  'README.md': '# demo\n',
  'src/greet.ts': 'export function greet(name: string): string {\n  return `hi ${name}`;\n}\n',
  'src/math.ts': 'export function add(a: number, b: number): number {\n  return a + b;\n}\n',
};

// ── the declarations ────────────────────────────────────────────────────────────────────────────────────
// Keyed `<docs-relative file>#<ordinal within that file, 1-based>`. NOT by line number: a line key breaks on
// any edit ABOVE the block, and an exemption list that breaks constantly gets RE-KEYED rather than
// re-examined. An ordinal moves only when a transcript is added, removed or reordered — exactly when the
// exemption deserves a second look. Checked for staleness by leg (4), and for TIGHTNESS by the twin: a
// declared block that reproduces byte-exactly is one that silently stopped being checked.

/** Blocks that quote output the product no longer produces, ON PURPOSE. Each states why. */
const FROZEN = {
  'adr/ADR-0013-the-pack-has-two-bands-governing-and-advisory.md#1':
    'ADR-0013 quotes the PRE-#107 output as its own "before" evidence. Regenerating it would delete the ' +
    'record of the change the ADR exists to justify.',
};

/** A stored grounded fact — unreachable from the binary alone (see the header). */
const NEEDS_FACT = 'needs a stored grounded fact; authoring one requires the subtreeHash the index computes, and no shipped command prints it';
/** A staged candidate — `mine` abstains at every site with no operator model wired (ADR-0011). */
const NEEDS_STAGED = 'needs a staged/promoted candidate; `mine` abstains with no operator model wired';
/** The page DECLARES a transformation, so the block is deliberately not a verbatim run. */
const EDITED = 'the page states the block is edited (path shortened / trimmed / long line reflowed) — good documentation, not drift';
/** An argument this gate\'s fixture cannot hold. */
const FOREIGN_REV = 'an argument names a revision or nodeKey from the authoring repository, absent here';

/** `{key: reason}` for keys sharing one obstruction. */
const each = (reason, ...keys) => Object.fromEntries(keys.map((k) => [k, reason]));

/** Blocks that cannot be reproduced mechanically. Each states the precise obstruction. Grouped by reason,
 *  every key still listed individually — the LIST is the evidence, so it is never summarised to a count. */
const UNVERIFIABLE = {
  ...each(NEEDS_FACT,
    'how-to/emit-a-grounded-fact.md#1', 'how-to/emit-a-grounded-fact.md#2', 'how-to/emit-a-grounded-fact.md#3',
    'how-to/find-and-fix-drift.md#1', 'how-to/find-and-fix-drift.md#2', 'how-to/find-and-fix-drift.md#3',
    'reference/commands/doctor.md#1', 'reference/commands/doctor.md#2', 'reference/commands/doctor.md#3',
    'reference/commands/doctor.md#4', 'reference/commands/emit.md#1', 'reference/commands/emit.md#2',
    'reference/commands/emit.md#3', 'reference/commands/emit.md#4', 'reference/commands/link.md#1',
    'reference/commands/link.md#2', 'reference/commands/node.md#1', 'reference/commands/own.md#1',
    'reference/commands/own.md#2', 'reference/commands/own.md#3', 'reference/commands/own.md#4',
    'reference/commands/own.md#5', 'reference/commands/own.md#6', 'reference/commands/query.md#1'
  ),
  ...each('an annotated composite of three runs with margin notes; it has no `status:` header and is not one run',
    'how-to/find-and-fix-drift.md#4'
  ),
  ...each(FOREIGN_REV,
    'how-to/find-and-fix-drift.md#5', 'reference/commands/link.md#3', 'reference/commands/link.md#4',
    'reference/commands/link.md#5', 'reference/commands/link.md#6', 'reference/commands/link.md#7',
    'reference/commands/link.md#8', 'reference/commands/reconcile.md#1', 'reference/commands/reconcile.md#2'
  ),
  ...each(EDITED,
    'how-to/move-a-repo-in.md#1', 'how-to/move-a-repo-in.md#3', 'reference/commands/init.md#1',
    'reference/commands/init.md#2', 'reference/commands/init.md#3', 'reference/commands/init.md#4',
    'reference/commands/query.md#5'
  ),
  ...each('shows a SCIP-indexed repository and a pinned external indexer version',
    'reference/commands/doctor.md#5', 'reference/commands/doctor.md#6'
  ),
  ...each(NEEDS_STAGED,
    'reference/commands/mine.md#2', 'reference/commands/mine.md#3', 'reference/commands/mine.md#4',
    'reference/commands/mine.md#5', 'reference/commands/promote.md#1', 'reference/commands/promote.md#2',
    'reference/commands/promote.md#3', 'reference/commands/promote.md#4', 'reference/commands/promote.md#5',
    'reference/commands/promote.md#6', 'reference/commands/promote.md#7', 'reference/commands/promote.md#8',
    'reference/commands/promote.md#9', 'reference/commands/promote.md#11'
  ),
  // #99a — `atlas relations` worked examples are ILLUSTRATIVE: they show fabricated unit keys
  // (`pkg/order.ts::placeOrder`) and abbreviated relation nodeKeys (`rel:abc…`), so no clean checkout
  // reproduces them byte-exactly — a store first has to be seeded with those exact grounded relations
  // (`atlas emit` a `family:relation` fact per edge). The BEHAVIOUR they illustrate is mechanically pinned
  // by `packages/cli/test/relations-cli.test.ts` (real composed store) — this page is the human narration of it.
  ...each('an illustrative worked example over fabricated units + abbreviated relation nodeKeys; the behaviour is pinned by relations-cli.test.ts over a real composed store, not reproducible from a clean checkout',
    'reference/commands/relations.md#1', 'reference/commands/relations.md#2'
  ),
};

// ── enumeration ─────────────────────────────────────────────────────────────────────────────────────────

/** Every `.md` under `docs/`, sorted, recursive. */
function markdown(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = join(dir, e.name);
    if (e.isDirectory()) markdown(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

/**
 * Every fenced block under `docs/**` that purports to be `atlas` output: a `$ …atlas …` invocation line, or
 * a bare `status:` verdict header. Returns `{ key, file, ord, line, body }` — `key` is the stable
 * `file#ordinal` the declarations above use, and `line` is carried for the REPORT only, never for lookup.
 */
function transcripts() {
  const out = [];
  for (const abs of markdown(DOCS)) {
    const file = abs.slice(DOCS.length + 1).split(/[\\/]/).join('/');
    let ord = 0;
    const lines = readFileSync(abs, 'utf8').split('\n');
    let open = null;
    for (let i = 0; i < lines.length; i++) {
      const m = /^(\s*)(```+|~~~+)(.*)$/.exec(lines[i]);
      if (m === null) continue;
      if (open === null) {
        open = { line: i + 1, indent: m[1], info: m[3].trim() };
        continue;
      }
      if (m[3].trim() !== '') continue; // an opener for a new block cannot close the current one
      const body = lines.slice(open.line, i).map((l) => (l.startsWith(open.indent) ? l.slice(open.indent.length) : l));
      if (body.some((l) => /^\$ .*\batlas\b/.test(l) || /^status: (ok|error|rejected)$/.test(l))) {
        ord += 1;
        out.push({ key: `${file}#${ord}`, file, ord, line: open.line, body });
      }
      open = null;
    }
  }
  return out;
}

// ── the run ─────────────────────────────────────────────────────────────────────────────────────────────

/** A fresh on-disk git fixture: the tree above, a policy authorizing {@link ACTOR} over `src`, one commit. */
function fixture() {
  const repo = mkdtempSync(join(tmpdir(), 'atlas-doc-transcript-'));
  for (const [rel, body] of Object.entries(FILES)) {
    mkdirSync(join(repo, dirname(rel)), { recursive: true });
    writeFileSync(join(repo, rel), body);
  }
  mkdirSync(join(repo, '.atlas'), { recursive: true });
  writeFileSync(
    join(repo, '.atlas', 'policy.json'),
    JSON.stringify({ nearDup: { claimNormThreshold: 1 }, t0Heuristic: { keywords: [] }, authz: { scopes: { src: [ACTOR] } } }),
  );
  const git = (...a) => execFileSync('git', a, { cwd: repo, stdio: 'ignore' });
  git('init', '-q');
  git('config', 'user.email', ACTOR);
  git('config', 'user.name', 'demo');
  git('add', '-A');
  git('commit', '-q', '-m', 'genesis');
  return repo;
}

/**
 * Parse a transcript's `$ …` line into `{ env, argv }`, or `null` when it is not a literal invocation this
 * gate can run (an elided argument, a shell construct, a binary that is not `atlas`). `null` is never
 * treated as "nothing to check" — the caller turns it into a NAMED unverifiable.
 */
function invocation(dollarLine) {
  const toks = dollarLine.slice(2).trim().split(/\s+/);
  const env = {};
  let i = 0;
  for (; i < toks.length && /^[A-Z][A-Z0-9_]*=[^\s]*$/.test(toks[i]); i++) {
    const eq = toks[i].indexOf('=');
    env[toks[i].slice(0, eq)] = toks[i].slice(eq + 1);
  }
  if (toks[i] !== 'atlas') return null;
  const argv = toks.slice(i + 1);
  if (argv.some((a) => a.includes('…') || a.includes('<') || a.includes('$'))) return null;
  return { env, argv };
}

/**
 * Split a transcript body into `[{ dollar, expected }]` segments, one per `$ …` line. A blank line INSIDE a
 * run is OUTPUT and is compared; only the trailing blanks a page uses to separate one run from the next are
 * dropped. An earlier revision dropped every blank on both sides, so three could be inserted into a verified
 * block and the gate still claimed it matched "line for line" — a comparison too lenient to notice re-opens
 * the hole it closes.
 */
function segments(body) {
  const segs = [];
  for (const raw of body) {
    if (raw.startsWith('$ ')) segs.push({ dollar: raw, expected: [] });
    else if (segs.length > 0) segs.at(-1).expected.push(raw);
  }
  for (const s of segs) while (s.expected.length > 0 && s.expected.at(-1) === '') s.expected.pop();
  return segs;
}

/**
 * Compare documented lines against real ones. A documented line that is exactly `[…]` is an ELISION and
 * matches ZERO OR MORE real lines (the quality standard sanctions eliding long output with an explicit
 * marker; a gate that did not understand the marker would push pages toward dumping instead). Returns
 * `null` on a match, or `{ at, want, got }` naming the FIRST divergence.
 */
function diff(expected, actual) {
  let e = 0;
  let a = 0;
  while (e < expected.length) {
    if (expected[e].trim() === '[…]') {
      const next = expected[e + 1];
      if (next === undefined) return null; // a trailing elision swallows whatever remains
      while (a < actual.length && actual[a] !== next) a++;
      e++;
      continue;
    }
    if (a >= actual.length) return { at: e, want: expected[e], got: '<end of output>' };
    if (actual[a] !== expected[e]) return { at: e, want: expected[e], got: actual[a] };
    e++;
    a++;
  }
  if (a < actual.length) return { at: expected.length, want: '<end of block>', got: actual[a] };
  return null;
}

/** Run one transcript's segments against a fresh fixture. Returns a list of human-readable failures. */
function verify(t) {
  const segs = segments(t.body);
  if (segs.length === 0) return [`${t.key} (docs/${t.file}:${t.line}) — VERIFIED block has no \`$ \` line to run`];
  const bad = [];
  const repo = fixture();
  try {
    for (const seg of segs) {
      const inv = invocation(seg.dollar);
      if (inv === null) {
        bad.push(`${t.key} (docs/${t.file}:${t.line}) — cannot parse \`${seg.dollar}\`; declare it UNVERIFIABLE instead`);
        continue;
      }
      const res = spawnSync(process.execPath, [CLI, ...inv.argv], {
        cwd: repo,
        encoding: 'utf8',
        env: { ...process.env, ATLAS_ACTOR: ACTOR, ...inv.env },
      });
      // Only TRAILING empties are dropped (the final-newline artifact); interior blanks are real output.
      const actual = (res.stdout ?? '').split('\n');
      while (actual.length > 0 && actual.at(-1) === '') actual.pop();
      const want = seg.expected.filter((l) => !/^# exit \d+$/.test(l));
      const wantExit = seg.expected.find((l) => /^# exit \d+$/.test(l));
      const d = diff(want, actual);
      if (d !== null) {
        bad.push(
          `${t.key} (docs/${t.file}:${t.line}) — output diverged\n      ran:  atlas ${inv.argv.join(' ')}  (cwd = a fresh fixture repo)\n` +
            `      doc:  ${JSON.stringify(d.want)}\n      real: ${JSON.stringify(d.got)}`,
        );
      } else if (wantExit !== undefined && wantExit !== `# exit ${res.status}`) {
        bad.push(
          `${t.key} (docs/${t.file}:${t.line}) — exit code diverged\n      ran:  atlas ${inv.argv.join(' ')}\n` +
            `      doc:  ${wantExit}\n      real: # exit ${res.status}`,
        );
      }
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
  return bad;
}

// ── the sweep ───────────────────────────────────────────────────────────────────────────────────────────

const fail = [];

if (!existsSync(DOCS)) {
  console.error(`doc-transcript-guard: FAIL\n\n  ✗ no docs/ tree at ${DOCS}. There is nothing to check, and a gate that reports OK on an unreadable corpus is the defect it exists to stop.\n`);
  process.exit(1);
}
if (!existsSync(CLI)) {
  console.error(`doc-transcript-guard: FAIL\n\n  ✗ no built CLI at ${CLI}. This gate RUNS the product; without a build it could only ever agree with the page. Run \`npm run build\` first.\n`);
  process.exit(1);
}

const blocks = transcripts();
if (blocks.length === 0) {
  console.error('doc-transcript-guard: FAIL\n\n  ✗ ZERO output transcripts found under docs/. Either every page lost its worked example, or this gate\'s block extraction broke — and a gate that checks zero transcripts prints OK for a fully rotted docs tree. Failing instead.\n');
  process.exit(1);
}

const verified = [];
const frozen = [];
const unverifiable = [];
const seen = new Set();

/** `docs/<file>:<line>  <the command>` — how a block is NAMED to a human, derived, never used for lookup. */
const where = (t) => {
  const cmd = t.body.find((l) => l.startsWith('$ '));
  return `${t.key}  (docs/${t.file}:${t.line}${cmd === undefined ? '' : `, \`${cmd}\``})`;
};

for (const t of blocks) {
  seen.add(t.key);
  if (FROZEN[t.key] !== undefined) {
    frozen.push(`${where(t)}\n        ${FROZEN[t.key]}`);
  } else if (UNVERIFIABLE[t.key] !== undefined) {
    unverifiable.push(`${where(t)}\n        ${UNVERIFIABLE[t.key]}`);
  } else {
    verified.push(where(t));
    fail.push(...verify(t));
  }
}

// (4) a declaration that no longer resolves to a block is a stale exemption.
for (const [key, why] of [...Object.entries(FROZEN), ...Object.entries(UNVERIFIABLE)]) {
  if (!seen.has(key)) {
    fail.push(
      `STALE DECLARATION — ${key} is exempted here ("${why}") and names no transcript in docs/.\n` +
        '      The block moved or was deleted. Re-key the declaration or drop it: an exemption that outlives\n' +
        '      what it exempts is a hole with a comment in front of it.',
    );
  }
}

// I4 — the unverifiable set is named on EVERY run, pass or fail. It is printed BEFORE the verdict branch so
// there is no path through this file that reports a result without it.
console.log(
  `doc-transcript-guard: ${blocks.length} output transcript(s) under docs/ — ` +
    `${verified.length} re-run against the built binary, ${frozen.length} frozen, ${unverifiable.length} not mechanically reproducible.\n`,
);
console.log(`  VERIFIED (${verified.length}) — re-run and diffed:`);
for (const v of verified) console.log(`    ✓ ${v}`);
console.log(`\n  FROZEN (${frozen.length}) — quotes superseded output on purpose:`);
for (const f of frozen) console.log(`    ○ ${f}`);
console.log(`\n  NOT MECHANICALLY REPRODUCIBLE (${unverifiable.length}) — NOT checked, and this is why:`);
for (const u of unverifiable) console.log(`    ! ${u}`);
console.log('');

if (fail.length > 0) {
  console.error('doc-transcript-guard: FAIL\n');
  for (const f of fail) console.error(`  ✗ ${f}\n`);
  console.error(
    `${fail.length} violation(s). The BINARY is the oracle: regenerate the block from a real run — never hand-edit\n` +
      'it to match what the output is believed to be, which is how this drift entered in the first place.',
  );
  process.exit(1);
}

console.log('doc-transcript-guard: OK — every re-runnable transcript matches the built binary line for line.');
