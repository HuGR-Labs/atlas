// @atlas/persist — ref/types.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The persistence layer's shared data model, transcribed EXACTLY from
// `docs/reference/atlas-persist.md` §Data model (lines 16-28) and the prose (lines 31-36) that grounds
// the composite `Dossier`. Shared identity types (`Hash`) come from @atlas/contracts; the log/state
// types (`Event`, `EventLog`, `AtlasState`, `CasObject`, `Cas`) come from @atlas/kernel — NEVER
// redefined here.

import type { Hash } from '@atlas/contracts';
import type { EventLog } from '@atlas/kernel';

/**
 * The CANONICAL per-commit provenance block. RFC-822-ish `Key: value` block committed INTO the commit
 * object, so it travels in any clone/fork by construction and survives a history rewrite onto the new
 * SHA (PERSIST-3, PERSIST-13). (atlas-persist:16)
 *
 * Field NAMES transcribed exactly (`WP / Model / Gates / Verdict / TranscriptSha`). VALUE types: the
 * trailer is a text `Key: value` block, so the values are serialized strings — typed `string` here on
 * that grounding. `TranscriptSha` is the content-hash POINTER to the large-object transcript
 * (PERSIST-10 / `TranscriptRef.sha`), so it is typed `Hash`.
 * [SIG-TBD] the reference does not freeze richer value types for `Gates`/`Verdict` (cf. the structured
 * `Metering.gates`/`Metering.verdict` below) — the trailer text form is transcribed.
 */
export interface Trailer {
  readonly WP: string;
  readonly Model: string;
  readonly Gates: string;
  readonly Verdict: string;
  readonly TranscriptSha: Hash;
}

/**
 * The MUTABLE OVERLAY: a JSON dossier stored under `refs/notes/orchestra`. Notes do not fetch/push by
 * default and are orphaned by rebase/squash/cherry-pick (PERSIST-13), so a note carries only data that
 * may change after commit and is perimeter-conditional. The note's payload IS the JSON `Dossier`.
 * (atlas-persist:17)
 */
export type Note = Dossier;

/**
 * The per-commit provenance dossier round-tripped by `attachToCommit` / `readCommit` through
 * {trailer, note} (PERSIST-3, method-tags-pst:34-36).
 *
 * [SIG-TBD — partial] The data-model block (atlas-persist:16-28) never freezes `Dossier`'s OWN record
 * shape. The CONSTITUENTS below are grounded in prose (atlas-persist:33-35): notes + trailers carry the
 * per-commit "provenance/metering and the knowledge-delta". Field names / which are optional are NOT
 * frozen — transcribed as the honest composite of the named constituents and flagged. `knowledgeDelta`
 * is owned by a HIGHER layer (knowledge) so it is kept opaque here [upward-type → unknown].
 */
export interface Dossier {
  readonly trailer: Trailer;
  readonly metering?: Metering;
  readonly knowledgeDelta?: unknown;
}

/**
 * A POINTER in git to the content-addressed large-object transcript; the body is fetched on demand
 * (PERSIST-10). `sha` is the content hash of the object. (atlas-persist:18)
 */
export interface TranscriptRef {
  readonly sha: Hash;
  readonly store: 'lfs' | 'partial-clone' | 'cas';
}

/**
 * The re-invoke substrate = redispatch + replay; DISTINCT from the raw transcript (PERSIST-10b).
 * (atlas-persist:19)
 *
 * [SIG-TBD] the element shapes of `seatBrief` / `llmOutputs[]` / `toolIO[]` are not frozen in the
 * reference — the array/field NAMES are transcribed exactly; element types are kept `unknown`.
 * `seatBrief` describes an orchestrator-owned seat brief [upward-type → unknown].
 */
export interface Checkpoint {
  readonly seatBrief: unknown;
  readonly llmOutputs: readonly unknown[];
  readonly toolIO: readonly unknown[];
}

/**
 * The per-agent accounting record for a WP — every field required (PERSIST-6, 0 missing field).
 * (atlas-persist:20-21)
 *
 * Field NAMES transcribed exactly. Numeric counters (tokens/toolUses/wallTime/retries/reworks) typed
 * `number`; `model` typed `string`; `transcriptSha` typed `Hash` (the transcript pointer).
 * [SIG-TBD] `gates` / `verdict` have no frozen value shape — kept `unknown` (the structured form, vs.
 * the `Trailer` text form above).
 */
export interface Metering {
  readonly model: string;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly tokensCache: number;
  readonly toolUses: number;
  readonly wallTime: number;
  readonly retries: number;
  readonly reworks: number;
  readonly gates: unknown;
  readonly verdict: unknown;
  readonly transcriptSha: Hash;
}

/**
 * The projection rendered onto the host PR via the adapter (PERSIST-8). (atlas-persist:22)
 *
 * [SIG-TBD] Only the field NAMES are frozen. `prId` is the host PR identifier (typed `string`);
 * `prMemory` / `logbookEntry` shapes are not frozen (`unknown`); `knowledgeDelta` is knowledge-layer
 * owned [upward-type → unknown].
 */
export interface PrAttach {
  readonly prId: string;
  readonly prMemory: unknown;
  readonly logbookEntry: unknown;
  readonly knowledgeDelta: unknown;
}

/**
 * The forge abstraction, one impl per host (PERSIST-8). This is the data-model record shape
 * (atlas-persist:23-26); the frozen callable surface is `HostAdapterApi` in `ref/host-adapter.ts`
 * (identical four methods). `sha` is a git commit SHA (a git object id — NOT the branded CAS `Hash`),
 * so it is typed `string`.
 */
export interface HostAdapter {
  attachToCommit(sha: string, dossier: Dossier): void;
  readCommit(sha: string): Dossier | null;
  attachToPR(prId: string, prAttach: PrAttach): void;
  readPR(prId: string): PrAttach | null;
}

/**
 * The registered git merge driver (`.gitattributes: <atlas-log> merge=orchestra-atlas`): set-union the
 * two event logs by content-hash and re-fold (PERSIST-11). `merge` returns an `EventLog` (kernel type).
 * (atlas-persist:27-28) The `mergeAtlas` free function (PERSIST-11) has NO ref file — its oracle is the
 * kernel `fold` — it lives in `src/`, not here.
 */
export interface MergeDriver {
  readonly name: 'orchestra-atlas';
  merge(ours: EventLog, theirs: EventLog, base: EventLog): EventLog;
}
