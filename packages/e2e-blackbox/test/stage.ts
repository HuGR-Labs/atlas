// @atlas/e2e-blackbox — test/stage.ts  (the candidate-STAGING helper — NOT the black-box execution harness)
//
// THE CRUX, and it is the same one `author.ts` records one door over. `atlas promote` reads the explorer's
// STAGING sidecar. The only thing that writes that sidecar is `atlas mine` — and `atlas mine` through the
// real binary stages ZERO candidates, always, for a reason that is structural rather than incidental:
// `mine.ts` `withDefaults` falls back to `defaultGate()`, which abstains at every site ("no admission seam
// wired"), and the CLI passes no deps, so `makeAdmitGate` — the gate that forwards the frozen `admit`
// verdict — has NO production caller at all. MEASURED on the built binary while writing this file: a repo
// with a real SCIP index visits its sites, spends its budget, and still stages nothing.
//
// So a story that needs a STAGED candidate must construct one, exactly as `author.ts` must construct a
// grounded fact. This helper does it the sanctioned way — through the PRODUCT'S OWN staging door
// (`DiskStore.commitStaging`) with the PRODUCT'S OWN write decision (`upsert`), the PRODUCT'S OWN identity
// formula (`nodeKey`, with the `predicateSlot → .slot` map applied), and the PRODUCT'S OWN `MINED_SCOPE`
// constant imported rather than retyped. Nothing about the sidecar FORMAT is written by hand here; if the
// format moves, this moves with it, because it is the same code path `cli/src/mine.ts` takes.
//
// Product LIBS are imported ONLY to place the input. Every EXECUTION and every ASSERTION in the story stays
// pure black-box (the spawned `atlas` binary), which is the same boundary `author.ts` draws.
//
// WHAT IT STANDS IN FOR, precisely: the row a wired mine gate would have staged. It is NOT a claim that
// `atlas mine` produces one today — it does not, and the story says so in its own prose.

import { join } from 'node:path';
import { createDiskStore, gitSidecarTrust, headSha } from '@atlas/adapter-io';
import { id } from '@atlas/kernel';
import type { CasObject } from '@atlas/kernel';
import { nodeKey, primaryAnchorId, upsert } from '@atlas/knowledge';
import type { Candidate, GroundedFact, WriteRequest } from '@atlas/knowledge';
// The governance scope `mine` stamps on every candidate — imported, never retyped: the promotion door
// authorizes against this exact string, and two copies of it is the drift the constant exists to stop.
import { MINED_SCOPE } from '@atlas/cli';

export { MINED_SCOPE };

/** The class a mined row lives under — `T2`, the candidate class, always (`mine.ts` `MINED_TIER`). */
const MINED_TIER = 'T2' as const;

/** What was staged: the minted identity and the CAS address of the fact's bytes. */
export interface StagedRow {
  readonly nodeKey: string;
  readonly contentHash: string;
}

/**
 * Stage one grounded fact as a CANDIDATE, through the product's own staging door — the write `atlas mine`
 * would make if its admission gate were wired. Re-stamps `scope`/`tier` from the mined constants (never
 * forwarded from the fact) exactly as `mine.ts` does, so a caller cannot stage a candidate declaring `T0`.
 */
export function stageCandidate(repoPath: string, fact: GroundedFact): StagedRow {
  const store = createDiskStore(join(repoPath, '.atlas', 'cas'), () => headSha(repoPath), gitSidecarTrust(repoPath));
  // Stamped BEFORE the content hash so the BYTES carry the scope — and onto the request below so the ROW
  // does too. A row and its bytes that disagree is the state the emit door's corroboration gate refuses.
  const f = { ...fact, scope: MINED_SCOPE, tier: MINED_TIER } as GroundedFact;
  // `predicateSlot → .slot` FIRST: the identity functions read `.slot`, so a view without the map computes a
  // slot-free key that diverges from stored identity (found by E2E, missed by four isolated reviews).
  const view = { ...f, slot: f.predicateSlot } as unknown as Candidate;
  const key = nodeKey(view) as unknown as string;
  const contentHash = id(f as unknown as CasObject) as unknown as string;
  const req: WriteRequest = {
    nodeKey: key,
    contentHash,
    family: 'advisory',
    claimNorm: (f as { claimNorm: string }).claimNorm,
    primaryAnchor: primaryAnchorId(view) as unknown as string,
    ...(f.predicateSlot !== undefined ? { slot: f.predicateSlot } : {}),
    scope: MINED_SCOPE,
    tier: MINED_TIER,
  };
  // BYTES BEFORE THE ROW: `put` rides the commit's own `put` list, which the protocol makes durable before it
  // publishes the generation naming them. A row referencing bytes absent from CAS is a candidate no curator
  // could ever promote — the exact state the promotion door has to refuse per row.
  const r = store.commitStaging<string>((staged) => ({
    out: key,
    next: upsert(staged, req).store,
    put: [f as unknown as CasObject],
  }));
  if (!r.settled) throw new Error(`stage: the staging sidecar refused (${r.refusal}) — nothing was staged`);
  return { nodeKey: key, contentHash };
}
