// @atlas/adapter-io — src/git-drift.ts  (ADAPT-GIT-2: drift)
//
// The GROUND `DriftSource` (@atlas/tools) — the drifted-anchor set across a git merge-base, feeding
// `atlas-reconcile`'s mechanical-vs-semantic classification (TOOLS-8 exitCode law unchanged). This facet
// owns ONLY the merge-base(param)-vs-topic(HEAD) diff logic; anchor RESOLUTION is INJECTED (owned by
// GROUND — `resolveAnchorAt`), never an index built here (reconcile.ts:28-32).

import { execFileSync } from 'node:child_process';
import type { DriftPair, DriftSource } from '@atlas/tools';
import type { Hash, StructRef } from '@atlas/contracts';
import type { GroundedFact } from '@atlas/knowledge';

/**
 * Construct the GROUND `DriftSource` — the drifted set at a merge base (ADAPT-GIT-2).
 *
 * `driftAt(mergeBase)` diffs the injected anchors between the merge-base (the param) and HEAD (the topic
 * tip the reconcile runs on) — NEVER `main`, NEVER a fixed `HEAD~1..HEAD` window (those are the 9a/9b
 * mutants). Anchor resolution is handed in via `resolveAnchorAt` (GROUND-owned); this facet only presents
 * what it is handed. Input order is preserved; a fact whose anchor did not drift, or resolves undefined at
 * either end, contributes nothing (never all-or-nothing).
 *
 * N10 — PURE-RENAME widening. The path-keyed diff above only fires when the recorded qualifiedPath still
 * resolves at HEAD (`now` defined). A pure rename DELETES the old path at HEAD ⇒ `now` is undefined ⇒ NO
 * pair ⇒ the moved-but-alive fact is silently dropped before the classifier ever sees it. When a CONTENT
 * resolver (`resolveBySubtreeAt`, GROUND-owned) is wired, `driftAt` additionally surfaces such a fact: if
 * the path-keyed diff produced no in-place drift BUT the fact's RECORDED content re-located to a DIFFERENT
 * qualifiedPath at HEAD, emit a drift pair whose `anchorNow` is that new location (mirrors doctor surfacing
 * a moved anchor). Deterministic + TOTAL: no content resolver / content gone / content unmoved ⇒ no pair.
 */
export function createDriftSource(deps: {
  repoPath: string;
  resolveAnchorAt: (rev: string, qualifiedPath: string) => StructRef | undefined;
  resolveBySubtreeAt?: (rev: string, subtreeHash: string) => StructRef | undefined;
  facts: readonly GroundedFact[];
}): DriftSource {
  return {
    driftAt(mergeBase: Hash): readonly DriftPair[] {
      // HEAD is the topic tip — the branch reconcile runs on. The two revs diffed are `mergeBase`
      // (the param) vs HEAD (topic); this adapter owns that choice.
      const topicSha = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: deps.repoPath,
        encoding: 'utf8',
      }).trim();

      const pairs: DriftPair[] = [];
      for (const f of deps.facts) {
        const first = f.grounding.entries[0];
        if (first === undefined) continue;
        const qp = first.anchor.qualifiedPath;
        const was = deps.resolveAnchorAt(String(mergeBase), qp);
        if (was === undefined) continue; // no baseline anchor to diff — nothing to say (never a throw)
        const now = deps.resolveAnchorAt(topicSha, qp);
        if (now !== undefined && was.subtreeHash !== now.subtreeHash) {
          // In-place drift: the SAME qualifiedPath now carries different content at HEAD.
          pairs.push({
            drifted: { fact: f, newSha: topicSha as Hash },
            anchorWas: was,
            anchorNow: now,
          });
          continue;
        }
        // The recorded qualifiedPath STILL resolves at HEAD (and did not drift in place) ⇒ the fact is intact
        // at its own path ⇒ NEVER a rename. Skip BEFORE the content lookup — otherwise a byte-identical
        // DUPLICATE of the content at some other path would let `findBySubtree` (first-preorder) hand back the
        // duplicate and fabricate a PHANTOM move, diverging from doctor (whose `reDerives` reads FRESH here).
        // The pure-rename widening below fires ONLY when the recorded path is truly GONE at HEAD.
        if (now !== undefined) continue;
        // PURE-RENAME widening (N10): the recorded qualifiedPath is GONE at HEAD. If the fact's RECORDED
        // content re-located to a DIFFERENT qualifiedPath at HEAD, the claim MOVED but survives ⇒ emit a pair
        // anchored at that new location (mirrors doctor surfacing a moved anchor). The `!== qp` guard is a
        // belt-and-braces totality check (the content cannot resolve at the now-absent qp, but never assume).
        const relocated = deps.resolveBySubtreeAt?.(topicSha, String(first.anchor.subtreeHash));
        if (relocated !== undefined && relocated.qualifiedPath !== qp) {
          pairs.push({
            drifted: { fact: f, newSha: topicSha as Hash },
            anchorWas: was,
            anchorNow: relocated,
          });
        }
      }
      return pairs;
    },
  };
}
