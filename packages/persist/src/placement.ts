// @atlas/persist — src/placement.ts  (trailer-vs-note placement oracle — PERSIST-13)
//
// Trailers are CANONICAL: a trailer block travels INSIDE the commit object, so it is present in any clone
// by construction and survives a history rewrite onto the new SHA (REQ-PERSIST-13-a / -13-b). Notes are the
// MUTABLE OVERLAY: `refs/notes/*` do not fetch/push by default (present only once the adapter configures the
// refspec, REQ-PERSIST-13-c) and rebase/squash/cherry-pick ORPHAN them — a note keys on the commit SHA, so
// a rewrite that mints a new SHA leaves the note behind (REQ-PERSIST-13-d). Therefore any datum that MUST be
// present in any clone lives in a trailer, never solely a note. Identity types come from @atlas/contracts.

import type { Hash } from '@atlas/contracts';
import type { Placement, PlacementApi } from '../ref/placement.js';

/**
 * The PERSIST-13 placement decision: a clone-required datum homes to the TRAILER (canonical — travels in the
 * commit object, survives a rewrite); everything else homes to a NOTE (mutable overlay, perimeter-conditional).
 */
export function place(cloneRequired: boolean): Placement {
  return cloneRequired ? 'trailer' : 'note';
}

/**
 * The frozen oracle (`ref/placement.ts` `PlacementApi.home`): name the sole grounded home of a datum from the
 * clone-required registry. A clone-required datum homes to `trailer`; a note-only datum that MUST be in a
 * clone would fail the sole-home assertion (SCN-PERSIST-1b-1 / -13a-1).
 */
export function makePlacement(cloneRequired: ReadonlySet<Hash>): PlacementApi {
  return { home: (datum: Hash): Placement => place(cloneRequired.has(datum)) };
}

/**
 * A commit as the placement model sees it: a trailer block INSIDE the commit object (keyed by the commit's
 * own SHA) + a `refs/notes/orchestra` note that keys on a SHA. When `noteKey !== sha` the note is orphaned.
 */
export interface Commit {
  readonly sha: string;
  readonly trailer: Readonly<Record<string, string>>;
  readonly noteKey: string;
  readonly note: Readonly<Record<string, string>>;
}

/** Build a fresh commit whose note keys on the commit's own SHA (not yet orphaned). */
export function commit(
  sha: string,
  trailer: Readonly<Record<string, string>>,
  note: Readonly<Record<string, string>> = {},
): Commit {
  return { sha, trailer, noteKey: sha, note };
}

/** REQ-PERSIST-13-d: the note is orphaned once it no longer keys on the commit's current SHA (a rewrite
 *  mints a new SHA and does NOT carry the note). */
export function noteOrphaned(c: Commit): boolean {
  return c.noteKey !== c.sha;
}

/**
 * REQ-PERSIST-13-a/-13-c/-13-d: read a datum after a BARE clone (no note refspec unless configured).
 *   - trailer data travels inside the commit object ⇒ present in any clone, UNCONDITIONALLY;
 *   - note data is present ONLY when the note is not orphaned (keys on the current SHA) AND the refspec is
 *     configured — otherwise it is absent (a perimeter-conditional mutable overlay).
 */
export function readAfterBareClone(
  c: Commit,
  key: string,
  refspecConfigured: boolean,
): { readonly from: Placement; readonly value: string } | null {
  if (Object.prototype.hasOwnProperty.call(c.trailer, key)) {
    return { from: 'trailer', value: c.trailer[key] as string };
  }
  if (!noteOrphaned(c) && refspecConfigured && Object.prototype.hasOwnProperty.call(c.note, key)) {
    return { from: 'note', value: c.note[key] as string };
  }
  return null;
}

/**
 * REQ-PERSIST-13-b/-13-d: a history rewrite (rebase/squash/cherry-pick) mints a new SHA. The trailer block
 * is part of the commit object, so it travels onto `newSha` verbatim; the note keeps its OLD `noteKey`, so
 * it is left orphaned (`noteOrphaned` is now true against the new SHA).
 */
export function rewrite(c: Commit, newSha: string): Commit {
  return { sha: newSha, trailer: { ...c.trailer }, noteKey: c.noteKey, note: { ...c.note } };
}
