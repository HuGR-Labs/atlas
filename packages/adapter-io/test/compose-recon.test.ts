// @atlas/adapter-io — test/compose-recon.test.ts  (RECON-SEAMS — the REAL reconcile drift seams, end-to-end)
//
// Proves `composeRuntime` now wires the REAL arbitrary-rev drift seams (COMPOSE-C) into the `atlas-reconcile`
// leg, so reconcile DETECTS real structural drift (the former v1-empty stubs detected none). A throwaway git
// repo is materialized with TWO commits — A authors `src/unit.ts`, B rewrites its body (a real structural
// change that re-keys the unit's `subtreeHash`). Two grounded advisory facts are seeded into the durable
// projection (the invariant-6 read-back path `driftFacts` consumes): `factA` grounded at A's structure,
// `factB` at B's. Driving reconcile at mergeBase=A vs topic=HEAD=B, the drift-source diffs the anchor across
// the two revs and the KNOW-5 classifier splits by re-derivation:
//   - factA (grounded @A) no longer re-derives at B  ⇒ SEMANTIC (blocks, exitCode 2)
//   - factB (grounded @B) still re-derives at B       ⇒ MECHANICAL (auto-re-groundable, no block)
// Control: mergeBase == HEAD ⇒ NO structural change ⇒ nothing drifts.
//
// TEETH — each names the seam it proves load-bearing, reconstructing the EXACT leg compose.ts wires
// (`createReconcile(createDriftSource({repoPath, resolveAnchorAt, facts}), {reconcile: bindReconcile(reDerives)})`)
// with one seam reverted to its v1-empty stub; the drift golden goes RED, proving the real seam carries it.

import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hash, NodeKey, StructRef } from '@atlas/contracts';
import { bindReconcile } from '@atlas/knowledge';
import type { AdvisoryNode, CurrentNode, GroundedFact, StoreProjection } from '@atlas/knowledge';
import { createReconcile } from '@atlas/tools';
import type { ReconcileOut, Tool } from '@atlas/tools';
import { composeRuntime } from '../src/compose.js';
import { createRevIndex } from '../src/rev-index.js';
import { createDiskStore } from '../src/store.js';
import { createDriftSource } from '../src/git-drift.js';
import { makeFixScip } from './harness/fix-scip.js';

const QP = 'src/unit.ts';
const UNIT_A = 'export function foo(name: string): string {\n  return `hi ${name}`;\n}\n';
const UNIT_B = 'export function foo(name: string): string {\n  return `hello there ${name}`;\n}\n'; // body changed
const RECONCILE = 'atlas-reconcile' as Tool;
const CAS_REL = join('.atlas', 'cas');

// N10 rename fixture — content-PRESERVING move: KEEP_BODY authored at src/keep.ts, `git mv`-d to
// src/moved.ts at HEAD with a byte-identical body (mirrors doctor-source.test.ts's KEEP_BODY pattern).
const KEEP_QP = 'src/keep.ts';
const MOVED_QP = 'src/moved.ts';
const KEEP_BODY = 'export function keep(x: number): number {\n  return x + 1;\n}\n';

const g = (repo: string, args: readonly string[]): string =>
  execFileSync('git', args as string[], { cwd: repo, encoding: 'utf8' }).trim();

// A minimal AdvisoryNode grounded at `qp`/`subtreeHash` — only required fields, none invented.
function advisoryAt(id: string, subtreeHash: StructRef['subtreeHash']): AdvisoryNode {
  return {
    kind: 'advisory',
    id: id as NodeKey,
    tier: 'T2',
    claimNorm: `claim anchored at ${QP} (${id})`,
    grounding: { entries: [{ anchor: { kind: 'file', qualifiedPath: QP, subtreeHash }, path: QP }] },
    freshness: 'FRESH',
    claims: [],
    authoring: 'ADVISORY',
  };
}

// ── throwaway A/B repo + a durable projection seeded with two grounded facts ──────────────────────────
interface Fix {
  readonly repoPath: string;
  readonly A: string; // full sha of commit A (unit structure v1)
  readonly B: string; // full sha of commit B (unit structure v2)
  readonly factA: GroundedFact; // grounded @A
  readonly factB: GroundedFact; // grounded @B
  cleanup(): void;
}

function makeFix(): Fix {
  const repoPath = mkdtempSync(join(tmpdir(), 'recon-seams-'));
  g(repoPath, ['init', '-q']);
  g(repoPath, ['config', 'user.email', 't@t.t']);
  g(repoPath, ['config', 'user.name', 'T']);
  g(repoPath, ['config', 'commit.gpgsign', 'false']);
  mkdirSync(join(repoPath, 'src'), { recursive: true });

  writeFileSync(join(repoPath, QP), UNIT_A);
  g(repoPath, ['add', '-A']);
  g(repoPath, ['commit', '-q', '-m', 'A: author foo']);
  const A = g(repoPath, ['rev-parse', 'HEAD']);

  writeFileSync(join(repoPath, QP), UNIT_B);
  g(repoPath, ['add', '-A']);
  g(repoPath, ['commit', '-q', '-m', 'B: rewrite foo body']);
  const B = g(repoPath, ['rev-parse', 'HEAD']);

  // A real `.atlas/index.scip` dump so the composition root's index build has one (wire.ts reads it).
  const scip = makeFixScip();
  mkdirSync(join(repoPath, '.atlas'), { recursive: true });
  copyFileSync(scip.scipPath, join(repoPath, '.atlas', 'index.scip'));
  scip.cleanup();

  // Ground each fact at the ACTUAL unit structure of its rev (resolved via the same COMPOSE-C index).
  const rev = createRevIndex(repoPath);
  const factA = advisoryAt('F_A', rev.resolveAnchorAt(A, QP)!.subtreeHash);
  const factB = advisoryAt('F_B', rev.resolveAnchorAt(B, QP)!.subtreeHash);

  // Seed the DURABLE projection the way governed-emit does (invariant 6): `store.put` the WHOLE fact under
  // its content-hash, then persist a projection whose CurrentNode.contentHash IS that CAS key — so
  // composeRuntime's `driftFacts` reads the facts straight back out of CAS.
  const store = createDiskStore(join(repoPath, CAS_REL));
  const hA = store.put(factA as never) as string;
  const hB = store.put(factB as never) as string;
  const mk = (f: GroundedFact, h: string): CurrentNode => ({
    nodeKey: f.id as unknown as string,
    family: 'advisory',
    contentHash: h,
    claims: [],
  });
  const projection: StoreProjection = {
    current: new Map([
      [factA.id as unknown as string, mk(factA, hA)],
      [factB.id as unknown as string, mk(factB, hB)],
    ]),
    cas: new Set([hA, hB]),
  };
  store.persistProjection(projection);

  return { repoPath, A, B, factA, factB, cleanup: () => rmSync(repoPath, { recursive: true, force: true }) };
}

// N10 — a content-PRESERVING rename fixture: commit A authors src/keep.ts (KEEP_BODY); commit B `git mv`s it
// to src/moved.ts with an IDENTICAL body (old path DELETED at HEAD). One advisory fact grounded at the
// keep.ts unit structure @A. At HEAD the recorded content lives ONLY at the new path — a moved-but-alive fact.
interface RenameFix {
  readonly repoPath: string;
  readonly A: string; // sha where the unit lives at src/keep.ts
  readonly B: string; // HEAD: the unit lives at src/moved.ts (same body)
  readonly factKeep: GroundedFact; // grounded at the keep.ts unit structure @A
  cleanup(): void;
}

function makeRenameFix(): RenameFix {
  const repoPath = mkdtempSync(join(tmpdir(), 'recon-rename-'));
  g(repoPath, ['init', '-q']);
  g(repoPath, ['config', 'user.email', 't@t.t']);
  g(repoPath, ['config', 'user.name', 'T']);
  g(repoPath, ['config', 'commit.gpgsign', 'false']);
  mkdirSync(join(repoPath, 'src'), { recursive: true });

  writeFileSync(join(repoPath, KEEP_QP), KEEP_BODY);
  g(repoPath, ['add', '-A']);
  g(repoPath, ['commit', '-q', '-m', 'A: author keep']);
  const A = g(repoPath, ['rev-parse', 'HEAD']);

  // Pure rename: move the file, body byte-identical. The old path is gone at HEAD; the content survives.
  g(repoPath, ['mv', KEEP_QP, MOVED_QP]);
  g(repoPath, ['commit', '-q', '-m', 'B: rename keep -> moved (identical body)']);
  const B = g(repoPath, ['rev-parse', 'HEAD']);

  const scip = makeFixScip();
  mkdirSync(join(repoPath, '.atlas'), { recursive: true });
  copyFileSync(scip.scipPath, join(repoPath, '.atlas', 'index.scip'));
  scip.cleanup();

  // Ground the fact at the ACTUAL keep.ts unit structure @A (content-addressed subtreeHash).
  const rev = createRevIndex(repoPath);
  const factKeep = advisoryAt('F_keep', rev.resolveAnchorAt(A, KEEP_QP)!.subtreeHash);
  // Re-anchor the recorded grounding at src/keep.ts (advisoryAt hard-codes QP=src/unit.ts).
  const grounded: GroundedFact = {
    ...factKeep,
    grounding: {
      entries: [
        { anchor: { kind: 'file', qualifiedPath: KEEP_QP, subtreeHash: factKeep.grounding.entries[0]!.anchor.subtreeHash }, path: KEEP_QP },
      ],
    },
  };

  const store = createDiskStore(join(repoPath, CAS_REL));
  const h = store.put(grounded as never) as string;
  const projection: StoreProjection = {
    current: new Map([
      [grounded.id as unknown as string, { nodeKey: grounded.id as unknown as string, family: 'advisory', contentHash: h, claims: [] } as CurrentNode],
    ]),
    cas: new Set([h]),
  };
  store.persistProjection(projection);

  return { repoPath, A, B, factKeep: grounded, cleanup: () => rmSync(repoPath, { recursive: true, force: true }) };
}

let fix: Fix | undefined;
let renameFix: RenameFix | undefined;
afterEach(() => {
  fix?.cleanup();
  fix = undefined;
  renameFix?.cleanup();
  renameFix = undefined;
});

// Reconstruct the EXACT leg compose.ts wires, with the two drift seams injectable (for TEETH).
function runLeg(
  fx: Fix,
  seams: {
    resolveAnchorAt: (rev: string, qp: string) => StructRef | undefined;
    reDerives: (fact: GroundedFact, newSha: Hash) => boolean;
  },
  mergeBase: string,
): ReconcileOut {
  const source = createDriftSource({
    repoPath: fx.repoPath,
    resolveAnchorAt: seams.resolveAnchorAt,
    facts: [fx.factA, fx.factB],
  });
  return createReconcile(source, { reconcile: bindReconcile(seams.reDerives) }).reconcile(mergeBase as Hash);
}

describe('RECON-SEAMS — composeRuntime wires the REAL reconcile drift seams (COMPOSE-C)', () => {
  it('SCN-RS-1 — reconcile DETECTS a real structural change as DRIFTED (mechanical + semantic split)', () => {
    fix = makeFix();
    const { handler } = composeRuntime(fix.repoPath);

    // Drive the reconcile leg through the assembled handler: mergeBase=A, topic=HEAD=B.
    const v = handler.handle(RECONCILE, { mergeBase: fix.A as Hash });
    expect(v.ok).toBe(true);
    const out = v.data as ReconcileOut;

    // DRIFT PROVEN — both facts' anchor moved A→B; the classifier splits by re-derivation at B.
    expect(out.drift).toHaveLength(2); // GOLDEN-drift-detected (teeth: resolveAnchorAt stub ⇒ 0)
    expect(out.semantic).toContain('F_A'); // grounded @A ⇒ no longer re-derives at B ⇒ BROKEN
    expect(out.mechanical).toContain('F_B'); // grounded @B ⇒ re-derives at B ⇒ auto-re-groundable
    expect(out.exitCode).toBe(2); // any semantic flip blocks (never a silent green)
    expect(out.reauthorCount).toBe(1); // == |semantic|
  });

  it('SCN-RS-2 (control) — NO structural change (mergeBase == topic) ⇒ nothing drifts', () => {
    fix = makeFix();
    const { handler } = composeRuntime(fix.repoPath);

    // mergeBase = HEAD (B) == topic ⇒ the anchor is identical at both ends ⇒ no drift pair.
    const out = handler.handle(RECONCILE, { mergeBase: fix.B as Hash }).data as ReconcileOut;
    expect(out.drift).toHaveLength(0);
    expect(out.semantic).toHaveLength(0);
    expect(out.mechanical).toHaveLength(0);
    expect(out.exitCode).toBe(0);
  });

  it('TEETH-resolveAnchorAt — revert resolveAnchorAt→()=>undefined ⇒ NO drift detected (golden RED)', () => {
    fix = makeFix();
    const rev = createRevIndex(fix.repoPath);

    // Real seams detect the drift...
    const real = runLeg(fix, { resolveAnchorAt: rev.resolveAnchorAt, reDerives: rev.reDerives }, fix.A);
    expect(real.drift).toHaveLength(2);
    expect(real.exitCode).toBe(2);

    // ...MUTANT: the v1-empty anchor resolver ⇒ no anchor resolves at either end ⇒ zero drift pairs ⇒
    // the drift-detected golden FLIPS (drift empty, exitCode 0). resolveAnchorAt is load-bearing.
    const mutant = runLeg(fix, { resolveAnchorAt: () => undefined, reDerives: rev.reDerives }, fix.A);
    expect(mutant.drift).toHaveLength(0);
    expect(mutant.exitCode).toBe(0);
  });

  it('TEETH-reDerives — revert reDerives→()=>false ⇒ the mechanical fact is misclassified (golden RED)', () => {
    fix = makeFix();
    const rev = createRevIndex(fix.repoPath);

    // Real seams classify factB (grounded @B, re-derives at B) as MECHANICAL...
    const real = runLeg(fix, { resolveAnchorAt: rev.resolveAnchorAt, reDerives: rev.reDerives }, fix.A);
    expect(real.mechanical).toContain('F_B');
    expect(real.exitCode).toBe(2); // factA is still semantic

    // ...MUTANT: the v1 fail-closed `()=>false` ⇒ EVERY drifted fact reads semantic ⇒ the mechanical arm
    // empties and factB flips into semantic. reDerives is load-bearing (mechanical/semantic split).
    const mutant = runLeg(fix, { resolveAnchorAt: rev.resolveAnchorAt, reDerives: () => false }, fix.A);
    expect(mutant.mechanical).toHaveLength(0);
    expect(mutant.semantic).toContain('F_B');
  });
});

describe('RECON-N10 — a content-preserving RENAME is MECHANICAL (content-addressed classifier + detection)', () => {
  it('SCN-N10-1 — moved-but-alive fact ⇒ mechanical, anchorNow=src/moved.ts, NOT semantic, exitCode 0', () => {
    renameFix = makeRenameFix();
    const { handler } = composeRuntime(renameFix.repoPath);

    // Drive reconcile at mergeBase=A (unit @ src/keep.ts) vs topic=HEAD=B (unit @ src/moved.ts, same body).
    const v = handler.handle(RECONCILE, { mergeBase: renameFix.A as Hash });
    expect(v.ok).toBe(true);
    const out = v.data as ReconcileOut;

    // The rename is DETECTED (secondary fix) and classified MECHANICAL (primary content-addressed fix).
    expect(out.drift).toHaveLength(1);
    expect(out.drift[0]!.anchorNow.qualifiedPath).toBe(MOVED_QP); // relocated to the new path
    expect(out.mechanical).toContain('F_keep'); // moved-but-alive ⇒ auto-re-groundable
    expect(out.semantic).not.toContain('F_keep'); // NOT a semantic rot
    expect(out.semantic).toHaveLength(0);
    expect(out.exitCode).toBe(0); // a rename must NOT block (exit 0), the sole drift is mechanical
    expect(out.reauthorCount).toBe(0);
  });

  it('TEETH-N10 — the PRE-FIX seams (path-keyed reDerives + no content resolver) DROP the moved fact (RED)', () => {
    renameFix = makeRenameFix();
    const rev = createRevIndex(renameFix.repoPath);

    // PRE-FIX detection: createDriftSource WITHOUT the content resolver — the old path is gone at HEAD, so
    // `now` is undefined and NO pair is emitted ⇒ the moved fact is silently dropped (drift empty, exit 0
    // but for the WRONG reason: it was never seen, never surfaced as mechanical or semantic).
    const preFixSource = createDriftSource({
      repoPath: renameFix.repoPath,
      resolveAnchorAt: rev.resolveAnchorAt,
      facts: [renameFix.factKeep],
    });
    const preFix = createReconcile(preFixSource, {
      reconcile: bindReconcile(rev.reDerives), // path-keyed predicate (the pre-fix classifier)
    }).reconcile(renameFix.A as Hash);
    expect(preFix.drift).toHaveLength(0); // DROPPED — the bug: a rename never even reaches the classifier
    expect(preFix.mechanical).toHaveLength(0);

    // POST-FIX detection: wire the content resolver ⇒ the rename IS surfaced with anchorNow=src/moved.ts,
    // and the content-addressed classifier (resolveBySubtreeAt) makes it MECHANICAL.
    const postFixSource = createDriftSource({
      repoPath: renameFix.repoPath,
      resolveAnchorAt: rev.resolveAnchorAt,
      resolveBySubtreeAt: rev.resolveBySubtreeAt,
      facts: [renameFix.factKeep],
    });
    const postFix = createReconcile(postFixSource, {
      reconcile: bindReconcile((fact, newSha) => {
        const a = fact.grounding.entries[0]?.anchor;
        return a !== undefined && rev.resolveBySubtreeAt(String(newSha), String(a.subtreeHash)) !== undefined;
      }),
    }).reconcile(renameFix.A as Hash);
    expect(postFix.drift).toHaveLength(1);
    expect(postFix.drift[0]!.anchorNow.qualifiedPath).toBe(MOVED_QP);
    expect(postFix.mechanical).toContain('F_keep');
    expect(postFix.exitCode).toBe(0);
  });
});
