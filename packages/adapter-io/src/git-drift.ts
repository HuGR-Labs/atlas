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
 */
export function createDriftSource(deps: {
  repoPath: string;
  resolveAnchorAt: (rev: string, qualifiedPath: string) => StructRef | undefined;
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
        const now = deps.resolveAnchorAt(topicSha, qp);
        if (was && now && was.subtreeHash !== now.subtreeHash) {
          pairs.push({
            drifted: { fact: f, newSha: topicSha as Hash },
            anchorWas: was,
            anchorNow: now,
          });
        }
      }
      return pairs;
    },
  };
}
