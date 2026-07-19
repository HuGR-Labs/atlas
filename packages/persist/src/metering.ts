// @atlas/persist — src/metering.ts  (full per-agent metering constructor — PERSIST-6)
//
// Every ephemeral agent's WP MUST record `model`, tokens (input/output/cache), tool-uses, wall-time,
// retries/reworks, gates, verdict, and `transcriptSha` in the event log + dossier (PERSIST-6,
// atlas-persist:55-57). The oracle (ref/metering.ts) pins `meter(wp) → Metering` where `wp` is a
// higher-layer (orchestrator) work-package kept `unknown` here [upward-type] — never imported upward. The
// constructor is TOTAL over the pinned `Metering` schema (types.ts): every one of the eleven required
// fields is populated, so NO required field can read back `undefined` even for an opaque/partial `wp`
// (SCN-PERSIST-6-1). The `transcriptSha` pointer is minted through the SEALED @atlas/kernel `asHash` seam
// — no raw hashing here.

import type { Hash } from '@atlas/contracts';
import { asHash } from '@atlas/kernel';
import type { Metering } from '../ref/types.js';
import type { MeteringApi } from '../ref/metering.js';

/** Narrow the deliberately-`unknown` work-package to the fields the metering schema reads. */
type WpShape = Partial<Metering>;

/**
 * Build the COMPLETE accounting record for a WP (SCN-PERSIST-6-1). Every required field is populated from
 * the `wp` when present and a schema-typed default otherwise, so the returned `Metering` is total — 0
 * missing field, including `retries`/`reworks` and `tokensCache`. Numeric counters default to `0`, string
 * fields to `''`, `gates` to an empty list, and `transcriptSha` to the sealed empty `Hash`.
 */
export function meter(wp: unknown): Metering {
  const w: WpShape = typeof wp === 'object' && wp !== null ? (wp as WpShape) : {};
  return {
    model: typeof w.model === 'string' ? w.model : '',
    tokensIn: typeof w.tokensIn === 'number' ? w.tokensIn : 0,
    tokensOut: typeof w.tokensOut === 'number' ? w.tokensOut : 0,
    tokensCache: typeof w.tokensCache === 'number' ? w.tokensCache : 0,
    toolUses: typeof w.toolUses === 'number' ? w.toolUses : 0,
    wallTime: typeof w.wallTime === 'number' ? w.wallTime : 0,
    retries: typeof w.retries === 'number' ? w.retries : 0,
    reworks: typeof w.reworks === 'number' ? w.reworks : 0,
    gates: Array.isArray(w.gates) ? (w.gates as readonly string[]) : [],
    verdict: typeof w.verdict === 'string' ? w.verdict : '',
    transcriptSha: typeof w.transcriptSha === 'string' ? (w.transcriptSha as Hash) : asHash(''),
  };
}

// differential-vs-oracle (compile-time): the facet conforms to the frozen MeteringApi (ref/metering.ts).
const _apiCheck: MeteringApi = { meter };
void _apiCheck;
