#!/usr/bin/env node
// harness/probes/m1-memory-ring.mjs — THE M-AXIS: the memory ring, measured on the SHIPPED BINARY.
//
// ── WHAT THIS MEASURES, AND WHY IT IS NOT THE UNIT SUITE ────────────────────────────────────────────────
// `packages/*/test` proves each memory piece in isolation against injected fakes. That is exactly how the
// scanner shipped BROKEN in #290: every memory-emit test injected a fake scanner, so the one argv the
// product actually runs was never executed by anything. This probe runs `packages/cli/dist/src/bin.js` as
// a child process in a THROWAWAY git repo, with the real store on real disk and the real gitleaks on PATH,
// and reads only what a user reads: the process exit code and the rendered verdict text.
//
// ── THE CONTROLS, STATED BEFORE THE NUMBERS ─────────────────────────────────────────────────────────────
// Every axis here carries a control that fails the axis if the door is trivially degenerate:
//   M1 recall-before-write must answer EMPTY  — else "the fact came back" proves nothing about the write.
//   M2 a CLEAN record must be ADMITTED        — else a door that refuses everything scores a perfect 100%,
//                                               which is the #290 defect scoring perfectly on its own bench.
//   M2 each refusal must name its OWN gate    — else a door that always answers `undetermined-kind` scores
//                                               a perfect 100% while being wrong on 8 of 9 cases.
//   M3 the two seats hold DIFFERENT counts    — else "no leak" is unfalsifiable (1 vs 1 leaks invisibly).
// A control that fails is reported as a FAILED AXIS, never as a footnote under a green number.
//
// ── THE MUTATION LEDGER — what this probe was PROVEN to catch, and what it was proven NOT to ────────────
// A bench nobody has broken on purpose is decoration. Three mutations were applied to the SHIPPED `dist`
// bytes and the probe re-run against each; the dist was restored and re-verified after every one.
//   1. MEM-1 owner scoping removed (`injectFor(store, seat)` → `store`)      KILLED — M3 3/3 → 0/3
//   2. MEM-9 scanner gate removed (`if (scanner.scan(record))` → `if(false)`) KILLED — M2 scanner-blocked red
//   3. MEM-4 kind filter removed (`filter(kind==='project')` → `filter(true)`) SURVIVED — see the STATED
//      LIMIT in axisM4: the frecency floor masks that filter, so nothing observable at the CLI moves. The
//      surviving mutant is reported as a finding rather than patched over with a stronger-sounding
//      assertion, because the assertion that would kill it does not exist on this surface.
//
// $0 — no model is in the loop. Deterministic: same repo, same binary, same verdicts.
// Usage: node harness/probes/m1-memory-ring.mjs [--keep]

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const BIN = join(ROOT, 'packages/cli/dist/src/bin.js');
const KEEP = process.argv.includes('--keep');

// ── the harness ─────────────────────────────────────────────────────────────────────────────────────────

/** Run the shipped binary. Returns {code, out} — NEVER throws, because a non-zero exit is a MEASUREMENT. */
function atlas(cwd, args, env = {}) {
  try {
    const out = execFileSync(process.execPath, [BIN, ...args], {
      cwd, encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (e) {
    // execFileSync throws on non-zero. `e.status` is the real exit code; ENOENT-style failures have none,
    // and those are reported as code -1 rather than silently folded into "a gate refused it".
    return { code: typeof e.status === 'number' ? e.status : -1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

function emitEntry(cwd, obj, actor, env = {}) {
  const p = join(cwd, `entry-${Math.abs(hash(JSON.stringify(obj) + actor))}.json`);
  writeFileSync(p, JSON.stringify(obj));
  return atlas(cwd, ['memory-emit', p], { ATLAS_ACTOR: actor, ...env });
}

function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }

/** A fresh git repo with an initialised Atlas. Each axis gets its own — cross-axis state would make the
 *  cap gate's count depend on what an earlier axis happened to write. */
function freshRepo(label) {
  const dir = mkdtempSync(join(tmpdir(), `m1-${label}-`));
  execFileSync('git', ['init', '-q', '.'], { cwd: dir });
  writeFileSync(join(dir, 'a.ts'), 'export const a = 1;\n');
  execFileSync('git', ['add', 'a.ts'], { cwd: dir });
  execFileSync('git', ['-c', 'user.email=m@1', '-c', 'user.name=m1', 'commit', '-qm', 'init'], { cwd: dir });
  const init = atlas(dir, ['init', '.']);
  if (init.code !== 0) throw new Error(`atlas init failed in ${dir}: ${init.out}`);
  return dir;
}

/**
 * The gate a refusal NAMED — parsed from the `reason:` line ONLY.
 *
 * [INSTRUMENT DEFECT, FIXED HERE] The first cut of this probe tested the whole stdout for the gate name.
 * Every refusal's `next:` line ENUMERATES all nine gate names as guidance, so the match was true for every
 * case including the ones that were ADMITTED — the oracle reported `named=true` on a write that exited 0.
 * A name-matching oracle must read the field that carries the fired name, never the help text beside it.
 */
function firedGate(out) {
  const m = /^reason: ([a-z-]+):/m.exec(out);
  return m ? m[1] : null;
}

const RESULTS = [];
const FINDINGS = [];
const record = (axis, name, pass, detail) => { RESULTS.push({ axis, name, pass, detail }); };

const PROJECT = (rule, frecency = 1) => ({ rule, scope: 'harness', frecency });

// ── M1 — DURABILITY ACROSS A PROCESS BOUNDARY ───────────────────────────────────────────────────────────
// The claim: a memory written by one process is read back by a DIFFERENT one. Node's module cache and any
// in-process array would both satisfy a same-process test; only a new child proves the bytes are on disk.
function axisM1() {
  const dir = freshRepo('m1');
  const seat = 'seat:charlie';

  // CONTROL — the instrument must be able to answer EMPTY. If recall answered non-empty here, every later
  // "the fact came back" would be uninterpretable.
  const before = atlas(dir, ['memory-recall', '--owner', seat]);
  const emptyBefore = /holds nothing that matches yet/.test(before.out);
  record('M1', 'control: recall before any write answers empty', emptyBefore, `exit=${before.code}`);

  const w = emitEntry(dir, PROJECT('never run the full vitest suite concurrently'), seat);
  record('M1', 'write admitted (exit 0)', w.code === 0, `exit=${w.code}`);

  // The read is a SEPARATE process — a new node, a cold module graph, nothing shared but the filesystem.
  const after = atlas(dir, ['memory-recall', '--owner', seat]);
  const got = /1 matching record\(s\)/.test(after.out);
  record('M1', 'read back in a NEW process', got, `exit=${after.code}`);

  if (!KEEP) rmSync(dir, { recursive: true, force: true });
  return emptyBefore; // the control gates the axis
}

// ── M2 — THE GATE CHAIN: planted violations, ZERO false-admit, each refusal NAMING ITS OWN GATE ──────────
// One planted record per refusal the door declares it can issue. The oracle is not "it refused" — it is
// "it refused with THIS name". A door that answers `undetermined-kind` to everything refuses 100% and is
// wrong 8 times out of 9; only the per-name check separates those.
function axisM2() {
  const dir = freshRepo('m2');
  const seat = 'seat:charlie';
  const RSA = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA7ZQ8Y2LxK1vN3pQrS4tUvWxYzA0B1C2D3E4F5G6H7I8J9K0L\n-----END RSA PRIVATE KEY-----';

  // NEGATIVE CONTROL, first and load-bearing: a clean, well-formed record must be ADMITTED. Without this
  // line the whole axis is satisfied by a door that refuses every write — the exact #290 defect.
  const clean = emitEntry(dir, PROJECT('a clean rule that violates nothing'), seat);
  const admits = clean.code === 0;
  record('M2', 'CONTROL: a clean record is ADMITTED (door is not refuse-everything)', admits, `exit=${clean.code}`);

  const cases = [
    // gate 1 — no template matches these keys at all.
    { gate: 'undetermined-kind', actor: seat, entry: { notAnyTemplate: true } },
    // gate 4a — MEM-8: only `orch` may append the logbook.
    { gate: 'logbook-unauthorized', actor: seat, entry: LOGBOOK('PR-1') },
    // gate 5 — MEM-3: one rule far over the 500-token member cap.
    { gate: 'over-cap', actor: seat, entry: PROJECT('x '.repeat(4000)) },
    // gate 6 — MEM-9: the real gitleaks, on a real private key, through the real argv.
    { gate: 'scanner-blocked', actor: seat, entry: PROJECT(`credentials rule: ${RSA}`) },
  ];

  let named = 0;
  for (const c of cases) {
    const r = emitEntry(dir, c.entry, c.actor);
    // Exit 2 is the CLI's governed-refusal code; exit 1 would mean it thought the invocation was malformed.
    const isRefusal = r.code === 2;
    const fired = firedGate(r.out);
    const pass = isRefusal && fired === c.gate;
    if (pass) named += 1;
    record('M2', `planted ${c.gate}`, pass, `exit=${r.code} fired=${fired}`);
  }

  // gate 2 — `template-invalid` is DECLARED but UNREACHABLE, and this is a proof, not a guess.
  //
  // `validate(kind, entry)` fails on exactly two conditions: a required key is `undefined`, or a key falls
  // outside the template. `memoryKindOf` selects a kind only from candidates for which NEITHER holds. So
  // any entry that would fail gate 2 has already failed gate 1 with `undetermined-kind`, and gate 2 fires
  // on nothing. It is redundant defence-in-depth, which is fine — what is NOT fine is that the door's own
  // guidance advertises `template-invalid` to users as an outcome they may receive.
  //
  // The probe does not take the argument's word for it: it plants BOTH of validate's failure modes and
  // records which gate actually fired. This is the [[reference-model-vs-shipped-path]] rule — a guard can be
  // fully tested and still guard nothing; reachability is a separate measurement from correctness.
  for (const [what, entry] of [
    ['a key outside the template', { taskId: 'T-1', attempted: [], failedWith: [], stoppedAt: 's', lesson: 'l', freeFormProse: 'x' }],
    ['a missing required key', { taskId: 'T-2', attempted: [], failedWith: [], stoppedAt: 's' }],
  ]) {
    const r = emitEntry(dir, entry, seat);
    FINDINGS.push(`M2  template-invalid UNREACHABLE — planting ${what} fired '${firedGate(r.out)}' (exit ${r.code})`);
  }

  // gate 4b — MEM-8 duplicate: only reachable AFTER an authorised logbook entry exists, so it is sequenced.
  const first = emitEntry(dir, LOGBOOK('PR-7'), 'orch');
  record('M2', 'logbook first append admitted for orch', first.code === 0, `exit=${first.code}`);
  const dup = emitEntry(dir, LOGBOOK('PR-7'), 'orch');
  const dupOk = dup.code === 2 && firedGate(dup.out) === 'logbook-duplicate';
  if (dupOk) named += 1;
  record('M2', 'planted logbook-duplicate', dupOk, `exit=${dup.code} fired=${firedGate(dup.out)}`);

  // gate 6b — MEM-9 ABSENCE: no scanner on PATH must refuse as `scanner-unavailable`, NEVER as
  // `scanner-blocked`. The door's own header calls the confusion of those two the worse failure; this is
  // the line that proves it did not regress. PATH is emptied for this child only.
  const noPath = emitEntry(dir, PROJECT('a rule written with no scanner installed'), seat, { PATH: '/nonexistent' });
  const firedNP = firedGate(noPath.out);
  const unavail = noPath.code === 2 && firedNP === 'scanner-unavailable';
  if (unavail) named += 1;
  record('M2', 'planted scanner-unavailable (empty PATH), NOT misnamed as blocked', unavail,
    `exit=${noPath.code} fired=${firedNP}`);

  if (!KEEP) rmSync(dir, { recursive: true, force: true });
  return { named, total: cases.length + 2, admits };
}

function LOGBOOK(prId) {
  return {
    prId, at: '2026-08-31', territories: ['harness'], shipped: 'the m-axis probe',
    decisions: 'measured the shipped binary, not the suite', tradeoffs: 'no model in the loop',
    risks: 'none', openThreads: 'none', links: [],
  };
}

// ── M3 — MEM-1 OWNER SCOPING: one seat's header never carries another seat's rules ──────────────────────
// The counts are deliberately ASYMMETRIC (3 vs 1). With one rule each, a door that returned the union of
// both seats' rules would still print "1" per seat under a same-count design and the leak would be
// invisible — the test would be unfalsifiable rather than passing.
function axisM3() {
  const dir = freshRepo('m3');
  for (let i = 0; i < 3; i += 1) emitEntry(dir, PROJECT(`charlie rule number ${i}`), 'seat:charlie');
  emitEntry(dir, PROJECT('the one lucy rule'), 'seat:lucy');

  const count = (out) => { const m = /(\d+) project rule\(s\) injected/.exec(out); return m ? Number(m[1]) : -1; };
  const c = count(atlas(dir, ['memory-header'], { ATLAS_ACTOR: 'seat:charlie' }).out);
  const l = count(atlas(dir, ['memory-header'], { ATLAS_ACTOR: 'seat:lucy' }).out);
  const asym = c !== l; // the control: if these are equal the axis proves nothing
  record('M3', 'CONTROL: the two seats hold different counts (leak is falsifiable)', asym, `charlie=${c} lucy=${l}`);
  record('M3', 'charlie sees exactly its own 3', c === 3, `count=${c}`);
  record('M3', 'lucy sees exactly its own 1 (no leak of charlie 3)', l === 1, `count=${l}`);

  if (!KEEP) rmSync(dir, { recursive: true, force: true });
  return asym;
}

// ── M4 — MEM-4 CONSULTABLE-NOT-INJECTED: task memory is readable but never rides the turn header ────────
//
// [VACUOUS ORACLE, FIXED HERE] The first cut asserted that the task's id (`T-42`) did not appear in the
// header's stdout. It passed — and it passed under a MUTATION that made the header inject EVERY kind,
// because the rendered header never prints entry text at all, only a count. An assertion that cannot fail
// is not evidence, and this one was reported as a green line for MEM-4 while MEM-4 was broken.
//
// The oracle here is the COUNT, which the render does emit and which the mutation does move: two project
// rules and one task record for the same seat must yield a header of exactly TWO. The mid-way reading
// after the project writes is the control — it proves the counter tracks writes at all, so "still 2" after
// the task write is a real negative rather than a stuck instrument.
function axisM4() {
  const dir = freshRepo('m4');
  const seat = 'seat:charlie';
  const count = (out) => { const m = /(\d+) project rule\(s\) injected/.exec(out); return m ? Number(m[1]) : -1; };

  emitEntry(dir, PROJECT('the first project rule'), seat);
  emitEntry(dir, PROJECT('the second project rule'), seat);
  const before = count(atlas(dir, ['memory-header'], { ATLAS_ACTOR: seat }).out);
  record('M4', 'CONTROL: the header counter tracks project writes (reads 2)', before === 2, `count=${before}`);

  const task = { taskId: 'T-42', attempted: ['the wrong argv'], failedWith: ['exit 1 on clean input'],
    stoppedAt: 'the scanner door', lesson: 'measure the binary, not the fake' };
  const w = emitEntry(dir, task, seat);
  record('M4', 'task memory admitted', w.code === 0, `exit=${w.code}`);

  const after = count(atlas(dir, ['memory-header'], { ATLAS_ACTOR: seat }).out);
  record('M4', 'the task write does NOT enter the turn header (still 2, not 3)', after === 2, `count=${after}`);
  // [STATED LIMIT — this assertion is TRUE but is NOT sensitive to the kind filter it looks like it tests.]
  // Deleting `.filter(r => r.kind === 'project')` in `memory-read.ts` leaves this line GREEN. Measured, not
  // reasoned: the mutation was applied to the shipped `dist` and the count stayed 2. The reason is in the
  // ranking path — a task entry has no `.rule`, so it collapses into the dedup map's `undefined` key, and it
  // has no `.frecency`, so `stored * DECAY^age` is NaN and `NaN >= NEAR_ZERO_FRECENCY` is false. It is
  // evicted by the frecency floor before the kind filter ever matters, and NO consultable kind (task / pr /
  // logbook) can carry a `frecency` — adding one puts a key outside its template and the write is refused at
  // gate 1. So MEM-4 is enforced twice over at this door, and the CLI surface exposes no discriminator that
  // can tell the two mechanisms apart. What this line proves is the INVARIANT a user depends on; what it
  // does not prove is that the kind filter is load-bearing. That distinction is the finding below.
  FINDINGS.push('M4  the `kind === project` filter in memory-read.ts is NOT observably load-bearing — ' +
    'deleting it in dist left every M4 assertion green; the frecency floor masks it (no consultable kind ' +
    'can carry a frecency, so none can ever rank). Redundant defence, but nothing would catch its removal.');

  const rec = atlas(dir, ['memory-recall', '--kind', 'task'], { ATLAS_ACTOR: seat });
  const found = /1 matching record\(s\)/.test(rec.out);
  record('M4', 'task memory IS returned by an explicit recall', found, `exit=${rec.code}`);

  if (!KEEP) rmSync(dir, { recursive: true, force: true });
}

// ── M5 — TYPE DISCIPLINE AT THE JSON BOUNDARY (a MEASUREMENT, reported as a FINDING) ────────────────────
// `atlas memory-emit <file.json>` reads arbitrary user JSON. TypeScript's `MemoryEntry` is a compile-time
// claim with nothing enforcing it at that door, and MEM-5's validator — by its own header — gates PRESENCE
// and KEY-MEMBERSHIP, never TYPE. So this axis asserts nothing about what SHOULD happen; it records what
// DOES, so the gap is a number in a report instead of a surprise in the durable log.
function axisM5() {
  const dir = freshRepo('m5');
  const seat = 'seat:charlie';
  const probes = [
    { name: 'frecency is a string', entry: { rule: 'string frecency', scope: 's', frecency: 'not-a-number' } },
    { name: 'frecency is null', entry: { rule: 'null frecency', scope: 's', frecency: null } },
    { name: 'frecency is a NUMERIC string', entry: { rule: 'ranked by a string', scope: 's', frecency: '999' } },
  ];
  for (const p of probes) {
    const r = emitEntry(dir, p.entry, seat);
    FINDINGS.push(`M5  ${p.name}: emit exit=${r.code} (${r.code === 0 ? 'ADMITTED — reached disk' : 'refused'})`);
  }
  // The consequence, measured rather than assumed. `'999' * 0.5 ** age` COERCES in JS, so a string-typed
  // frecency does not merely sit inert on disk — it competes for a slab slot. `'not-a-number'` and `null`
  // decay to NaN / 0, both of which fail the `>= NEAR_ZERO_FRECENCY` floor, so those two ARE inert.
  const hdr = atlas(dir, ['memory-header'], { ATLAS_ACTOR: seat });
  const m = /(\d+) project rule\(s\) injected/.exec(hdr.out);
  FINDINGS.push(`M5  after 3 untyped writes, the turn header injects ${m ? m[1] : '?'} of them ` +
    `(NaN and 0 fail the eviction floor; a numeric STRING coerces through the decay math and ranks)`);

  // The availability question, which is the one that would make this urgent: does one untyped record brick
  // the read doors for everyone afterwards? Measured — it does not.
  const recall = atlas(dir, ['memory-recall', '--owner', seat]);
  record('M5', 'the read doors SURVIVE untyped records (no bricking)', hdr.code === 0 && recall.code === 0,
    `header=${hdr.code} recall=${recall.code}`);

  if (!KEEP) rmSync(dir, { recursive: true, force: true });
}

// ── run ─────────────────────────────────────────────────────────────────────────────────────────────────

const m1ok = axisM1();
const m2 = axisM2();
const m3ok = axisM3();
axisM4();
axisM5();

const byAxis = {};
for (const r of RESULTS) {
  byAxis[r.axis] ??= { pass: 0, total: 0 };
  byAxis[r.axis].total += 1;
  if (r.pass) byAxis[r.axis].pass += 1;
}

console.log('\n── M-AXIS · the memory ring on the SHIPPED BINARY ─────────────────────────────────────────');
for (const r of RESULTS) console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.axis}  ${r.name}  [${r.detail}]`);
if (FINDINGS.length > 0) {
  console.log('\n── OPEN FINDINGS · measured, not asserted ─────────────────────────────────────────────────');
  for (const f of FINDINGS) console.log(`  ${f}`);
}
console.log('\n── derivation ────────────────────────────────────────────────────────────────────────────');
for (const [a, v] of Object.entries(byAxis)) console.log(`  ${a}: ${v.pass}/${v.total}`);
console.log(`  M2 gate-naming: ${m2.named}/${m2.total} planted violations refused BY NAME`);
console.log(`  controls: M1-empty-before=${m1ok} M2-admits-clean=${m2.admits} M3-asymmetric=${m3ok}`);

const failed = RESULTS.filter((r) => !r.pass);
if (failed.length > 0) {
  console.log(`\n  ${failed.length} FAILED — the number above is NOT a result until these are explained.`);
  process.exit(1);
}
console.log('\n  all axes green, every control satisfied.');
