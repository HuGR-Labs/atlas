// @atlas/e2e-blackbox — test/s8-doctor.blackbox.test.ts  (S8 — the `atlas doctor` advisory surface + totality)
//
// NARRATIVE: a lead emits a grounded, ratified fact, then commits a code change that MOVES its grounding.
// `atlas doctor` then diagnoses the store READ-ONLY across ALL FOUR advisory legs — `archive` (supersede
// lineage, optionally scoped), `why` (drift classification), `hotset` (hot-set size vs a budget), and
// `reground` (a re-ground/retire PROPOSAL). Every leg runs through the REAL `atlas` bin as a subprocess,
// against a real git history (the fixture `commit()` advances HEAD). No in-process shortcut.
//
// SOTA invariants pinned:
//   - DOCTOR IS ADVISORY-ONLY (TOOLS-12) — the diagnostic port mutates NOTHING: `.atlas/cas` is BYTE-IDENTICAL
//     across every doctor call, and `reground` (the only leg that even proposes a write) leaves both the CAS
//     AND the durable `projection.json` sidecar byte- and mtime-unchanged. Doctor carries no write authority.
//   - CLI TOTALITY (CLI-1b/CLI-1c) — an unknown subcommand, a missing required arg, and a bare `doctor` all
//     fail CLOSED to a STRUCTURED error (`status: error`) + guidance + non-zero exit — never a throw / crash.
//
// FINDING (flagged, not a crash/write): the composed real `DoctorSource` classifies a detected drift as
// `semantic` ⇒ a `retire` plan — `class=mechanical` / `action=reground` are STRUCTURALLY UNREACHABLE through
// `atlas doctor`. `drift()` (adapter-io/doctor-source.ts) flags a drift iff the primary anchor's current
// subtreeHash ≠ the recorded one, and then classifies mechanical iff `reDerives` is FRESH; but `reDerives`
// (driftDetect) re-compares the SAME recorded hash on the SAME primary anchor — so a detected drift ALWAYS
// makes driftDetect DRIFTED ⇒ never FRESH ⇒ never mechanical. The two verdicts can never disagree on the
// primary anchor. These cells assert against the REACHABLE reality (semantic / retire), not a hoped shape.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixtureRepo, runAtlas } from '../src/harness.js';
import type { FixtureRepo } from '../src/harness.js';
import { groundedAdvisoryFact } from './author.js';
import type { GroundedFact } from '@atlas/knowledge';
import { ACTOR, RATIFIER, emitFact, scopedPolicy } from './support.js';

/** A stable, order-independent snapshot of every byte under `.atlas/cas` (proves doctor mutates nothing). */
function casSnapshot(repoPath: string): string {
  const dir = join(repoPath, '.atlas', 'cas');
  let names: string[];
  try {
    names = (readdirSync(dir, { recursive: true }) as string[]).filter((n) => typeof n === 'string');
  } catch {
    return 'NONE';
  }
  return names
    .map((n) => {
      try {
        return `${n}=${readFileSync(join(dir, n), 'utf8')}`;
      } catch {
        return `${n}=<dir>`;
      }
    })
    .sort()
    .join('\n');
}

/** The durable projection sidecar's `{ bytes, mtimeMs }` — `.atlas/projection.json` lives OUTSIDE the CAS
 *  root (store.ts), so a doctor call that persisted anything would move EITHER. `NONE` if absent. */
function projectionStamp(repoPath: string): string {
  const path = join(repoPath, '.atlas', 'projection.json');
  try {
    return `${readFileSync(path, 'utf8')}@${statSync(path).mtimeMs}`;
  } catch {
    return 'NONE';
  }
}

/** The single rendered payload line of a doctor verdict (the `archive:`/`whyBroken:`/`hotSet:`/`plan:` row). */
function payloadLine(stdout: string, prefix: string): string {
  return stdout.split('\n').find((l) => l.startsWith(prefix)) ?? '';
}

let repo: FixtureRepo;
let fact: GroundedFact;
let priorActor: string | undefined;
let priorRatify: string | undefined;

beforeAll(() => {
  priorActor = process.env.ATLAS_ACTOR;
  priorRatify = process.env.ATLAS_RATIFY_TOKEN;
  process.env.ATLAS_ACTOR = ACTOR;
  process.env.ATLAS_RATIFY_TOKEN = RATIFIER; // KNOW-8 ratifier — the emitted T1 fact routes to full-ratify (N7)
  repo = makeFixtureRepo({ files: { 'src/foo.ts': 'export const foo = 1;\n' }, policy: scopedPolicy('src') });
  fact = groundedAdvisoryFact({ repoPath: repo.repoPath, filePath: 'src/foo.ts', slot: 'invariant', claim: 'foo is 1' });
  const emit = emitFact(repo, fact);
  if (emit.exitCode !== 0) throw new Error(`S8 setup: grounded emit failed:\n${emit.stdout}`);
  // A code change that MOVES the grounding: the file body changes ⇒ its subtreeHash changes ⇒ the anchor
  // drifts, so `doctor why`/`doctor reground` have a real drift to report (HEAD advances).
  repo.commit({ 'src/foo.ts': 'export const foo = 99;\n// semantic change\n' });
});

afterAll(() => {
  repo?.cleanup();
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR;
  else process.env.ATLAS_ACTOR = priorActor;
  if (priorRatify === undefined) delete process.env.ATLAS_RATIFY_TOKEN;
  else process.env.ATLAS_RATIFY_TOKEN = priorRatify;
});

describe('S8 — atlas doctor: four read/advisory legs + CLI totality (read-only)', () => {
  it('1. `doctor archive [scope]` renders the scope-filtered supersede lineage (exit 0, read-only)', () => {
    // No scope: the whole current-node CAS chain. Exactly one fact is on disk ⇒ a single, well-formed entry.
    const all = runAtlas(repo.repoPath, ['doctor', 'archive']);
    expect(all.exitCode).toBe(0);
    expect(all.stdout).toContain('status: ok');
    expect(all.stdout).toContain('doctor: archive');
    expect(all.stdout).toContain('invariant: TOOLS-12'); // the advisory guidance always ships (INV-TOOLS-4)
    expect(payloadLine(all.stdout, 'archive:')).toMatch(/^archive: \[[0-9a-f]+\]$/); // one CAS hash, bracketed

    // Scoped to `src` (the fact's scope): still the same non-empty lineage.
    const scoped = runAtlas(repo.repoPath, ['doctor', 'archive', 'src']);
    expect(scoped.exitCode).toBe(0);
    expect(payloadLine(scoped.stdout, 'archive:')).toMatch(/^archive: \[[0-9a-f]+\]$/);

    // A scope NO fact lives under filters the chain to empty — an empty-BUT-STRUCTURED result (never a throw).
    const empty = runAtlas(repo.repoPath, ['doctor', 'archive', 'no-such-scope']);
    expect(empty.exitCode).toBe(0);
    expect(payloadLine(empty.stdout, 'archive:')).toBe('archive: []');
  });

  it('2. `doctor why <fact>` renders the drift CLASSIFICATION for the drifted fact (exit 0, read-only)', () => {
    const r = runAtlas(repo.repoPath, ['doctor', 'why', String(fact.id)]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('doctor: why');
    // The moved-and-edited grounding no longer re-derives ⇒ a SEMANTIC drift, surfaced for THIS fact with
    // both the recorded and the HEAD-resolved anchors named (mechanical is structurally unreachable — header).
    expect(r.stdout).toContain(`whyBroken: fact=${fact.id}`);
    expect(r.stdout).toContain('class=semantic');
    expect(r.stdout).toMatch(/anchorWas=\S+ anchorNow=\S+/);
  });

  it('3. `doctor hotset <budget>` renders hot-set size vs budget with the over-budget flag (exit 0)', () => {
    // Exactly one current node ⇒ size=1. A budget above it is NOT over; a zero budget IS over (advisory flag).
    const under = runAtlas(repo.repoPath, ['doctor', 'hotset', '5']);
    expect(under.exitCode).toBe(0);
    expect(under.stdout).toContain('doctor: hotset');
    expect(payloadLine(under.stdout, 'hotSet:')).toBe('hotSet: size=1 budget=5 over=false');

    const over = runAtlas(repo.repoPath, ['doctor', 'hotset', '0']);
    expect(over.exitCode).toBe(0);
    expect(payloadLine(over.stdout, 'hotSet:')).toBe('hotSet: size=1 budget=0 over=true');
  });

  it('4. `doctor reground <fact>` renders an advisory PROPOSAL and PERSISTS NOTHING (CAS+projection frozen)', () => {
    const casBefore = casSnapshot(repo.repoPath);
    const projBefore = projectionStamp(repo.repoPath);
    expect(casBefore).not.toBe('NONE'); //   the emitted fact really is on disk (non-vacuous baseline)
    expect(projBefore).not.toBe('NONE'); //  the durable sidecar exists (governed-emit persisted it)

    const r = runAtlas(repo.repoPath, ['doctor', 'reground', String(fact.id)]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('doctor: reground');
    // A drifted fact carries a plan. The change flipped the claim ⇒ a SEMANTIC drift ⇒ a `retire` proposal
    // (mechanical/reground unreachable — header). Either way it is a PROPOSAL: it opens no write door.
    expect(payloadLine(r.stdout, 'plan:')).toBe(
      `plan: action=retire fact=${fact.id} — PROPOSAL only; persists nothing. Run through atlas-emit to persist.`,
    );

    // The single write door stays shut: doctor carries no write authority (TOOLS-12).
    expect(casSnapshot(repo.repoPath)).toBe(casBefore); //     CAS byte-identical
    expect(projectionStamp(repo.repoPath)).toBe(projBefore); // projection bytes AND mtime unchanged
  });

  it('5. doctor is READ-ONLY overall: `.atlas/cas` is BYTE-IDENTICAL across ALL FOUR legs', () => {
    const before = casSnapshot(repo.repoPath);
    expect(before).not.toBe('NONE'); // non-vacuous
    const runs = [
      runAtlas(repo.repoPath, ['doctor', 'archive', 'src']),
      runAtlas(repo.repoPath, ['doctor', 'why', String(fact.id)]),
      runAtlas(repo.repoPath, ['doctor', 'hotset', '3']),
      runAtlas(repo.repoPath, ['doctor', 'reground', String(fact.id)]),
    ];
    for (const run of runs) expect(run.exitCode).toBe(0); // every advisory leg actually ran
    expect(casSnapshot(repo.repoPath)).toBe(before); // persisted NOTHING across the whole surface
  });

  it('6. CLI totality: an unknown sub / a missing arg / a bare `doctor` all fail CLOSED (structured, no crash)', () => {
    // Unknown subcommand ⇒ structured error + the enumerated surface as guidance (never a throw).
    const bogus = runAtlas(repo.repoPath, ['doctor', 'bogus-sub']);
    expect(bogus.exitCode).not.toBe(0);
    expect(bogus.exitCode).toBe(1);
    expect(bogus.stdout).toContain('status: error');
    expect(bogus.stdout).toContain("unknown doctor subcommand 'bogus-sub'");
    expect(bogus.stdout).toContain('archive|why|hotset|reground'); // the finite surface is named
    expect(bogus.stderr).toBe(''); // no thrown stack leaked to stderr

    // A missing required numeric arg ⇒ structured error (arity is met by `hotset`, so runDoctor guards it).
    const noBudget = runAtlas(repo.repoPath, ['doctor', 'hotset']);
    expect(noBudget.exitCode).toBe(1);
    expect(noBudget.stdout).toContain('status: error');
    expect(noBudget.stdout).toContain('doctor hotset requires a numeric <budget>');
    expect(noBudget.stderr).toBe('');

    // A bare `doctor` (no sub) trips the parser's arity floor FIRST — still a structured non-zero error.
    const bare = runAtlas(repo.repoPath, ['doctor']);
    expect(bare.exitCode).toBe(1);
    expect(bare.stdout).toContain('status: error');
    expect(bare.stdout).toMatch(/requires 1 positional argument/);
    expect(bare.stderr).toBe('');
  });
});
