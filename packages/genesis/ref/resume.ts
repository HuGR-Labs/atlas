// @atlas/genesis — ref/resume.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// GEN-8 — total & resumable (method-tags-gen:65-70). Transcribed from atlas-genesis §Surface (lines
// 184, 195-200) + GEN-8 (lines 132-133) + acceptance 8. The composition-root top entry `atlas-genesis
// <repo> --at <rev> [--budget N] [--scope <path>]` is TOTAL BY CONSTRUCTION: it returns a partial
// `GenesisReport` + `resumeToken`, NEVER throws (0 exceptions, PBT-fuzzed over malformed repos/revs). An
// interrupted run RESUMES from the last completed ranked site (sites are visited in the deterministic
// GEN-2/11 rank order). `--scope` seeds a SUBTREE, not the whole repo (GEN-13 scopable).

import type { GenesisReport, ResumeToken } from './types.js';
import type { GenesisBudget } from './budget.js';

export interface GenesisApi {
  /** The TOTAL composition-root entry (GEN-8): `atlas-genesis <repo> --at <rev> [--budget N]
   *  [--scope <path>]` → `GenesisReport`. Runs S0→S4. TOTAL — a malformed repo/rev yields an honest
   *  empty/partial report carrying a `resumeToken`, NEVER a throw (GEN-8). `--scope` seeds a subtree, not
   *  the whole repo (GEN-13). With all deepening loops off (`budget`) cost == the single-pass baseline
   *  (GEN-14).
   *
   *  [FLAG — arg carriers] the surface line (atlas-genesis:184) types none of the args; `repo`/`rev`
   *  transcribed as `string` (mirroring `scan`/`mine`; `rev` deliberately a malformable raw string, not a
   *  branded `Hash`), `budget?` as the `GenesisBudget` policy (`ref/budget.ts`), `scope?` as a subtree
   *  path `string`. */
  genesis(repo: string, rev: string, budget?: GenesisBudget, scope?: string): GenesisReport;

  /** Resume an interrupted run from the last completed ranked site (GEN-8). Consumes the `resumeToken`
   *  from a prior partial report and continues the deterministic rank-ordered spend. TOTAL — never throws. */
  resume(token: ResumeToken): GenesisReport;
}
