// @atlas/persist — ref/host-adapter.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The forge-agnostic host adapter surface (PERSIST-8). One implementation per forge
// (GitHub/GitLab/Gitea/…). `readCommit`/`readPR` are TOTAL — a missing note/attachment returns `null`,
// never throws (atlas-persist:113-114). Transcribed from atlas-persist:23-26 + the surface at
// atlas-persist:100-103.
//
// `sha` is a git commit SHA (a git object id) — deliberately NOT the branded CAS `Hash` (KNOW-15: the
// CAS content-hash leg is orthogonal), so it is typed `string`.

import type { Dossier, PrAttach } from './types.js';

export interface HostAdapterApi {
  /** Write the trailer block + `refs/notes/orchestra` note carrying the dossier. (atlas-persist:100) */
  attachToCommit(sha: string, dossier: Dossier): void;
  /** Read back the note/trailer; absence ⇒ `null`, never throws. (atlas-persist:101) */
  readCommit(sha: string): Dossier | null;
  /** Render PR-memory/logbook/knowledge-delta onto the host PR. (atlas-persist:102) */
  attachToPR(prId: string, prAttach: PrAttach): void;
  /** Read back the projection; absence ⇒ `null`, never throws. (atlas-persist:103) */
  readPR(prId: string): PrAttach | null;
}
