// @atlas/cli — src/mine-staging.ts  (the STAGING commit's refusal vocabulary + its thrown discriminant)
//
// EXTRACTED FROM `mine.ts` at the 400-LOC ceiling, along a real seam: everything here is what the driver says
// when the STAGING sidecar refuses to accept a pass, while `mine.ts` is the pass itself. The split was forced
// by wiring the PROVENANCE seam into the driver's own store — and that is the point worth recording, because
// the `untrusted` text below was written, shipped, and then UNREACHABLE: `mine` built its `createDiskStore`
// with the freshness watermark and WITHOUT the provenance seam, so `commitStaging` could never return
// `untrusted` and this branch could never fire. The vocabulary existed; the wire did not.

import type { CommitRefusal } from '@atlas/adapter-io';

/** Why a staging commit did not settle, in the operator's words. Surfaced, never swallowed: `settled: false`
 *  means NOTHING was written, and reporting that as a successful pass would be a fresh instance of the exact
 *  silent-loss defect the commit protocol exists to remove. */
export const STAGING_REFUSAL_TEXT: Readonly<Record<CommitRefusal, string>> = {
  contended: 'the staging sidecar advanced under this pass more times than the protocol retries, so its candidates were NOT written. The store is alive; this write is not. Re-run the pass',
  unreadable: 'a staging sidecar EXISTS but no generation of it parses, so this pass refused rather than rebuild staging from empty and erase every candidate already there. Repair or remove `.atlas/staging*.json`',
  untrusted: 'the durable store is TRACKED BY GIT, so it arrived by commit rather than through a door and nothing in it can be trusted as mined output. Nothing was written, and the committed file was NOT overwritten, so the evidence survives. Run `git rm --cached -r .atlas` and add `.atlas/*` to `.gitignore`',
};

/** The refusal, THROWN, carrying a machine-readable {@link CommitRefusal} discriminant. A throw and not a return:
 *  `ControllerDeps.upsert` returns the grounded set, so "an unchanged set" is indistinguishable from a site that
 *  abstained. `run-controller` catches it (GEN-8c) ⇒ partial + non-zero, and `runMine` names the cause on stdout. */
export class StagingCommitError extends Error {
  constructor(readonly refusal: CommitRefusal) {
    super(`atlas mine: staging commit refused (${refusal}) — ${STAGING_REFUSAL_TEXT[refusal]}`);
    this.name = 'StagingCommitError';
  }
}
