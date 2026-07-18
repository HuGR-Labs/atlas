// @atlas/tools — ref/transport.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The push/pull ladder (TOOLS-11 / TOOLS-11a / TOOLS-14). Delivery splits by DIRECTION: PUSH (the poke /
// pack / `RelationSet`) is the ORCHESTRATOR's job and reaches a seat with NO tool grant — delivered by
// brief-injection or as a materialized file a `Read`-only seat consumes. Only PULL (an ad-hoc mid-task
// query) MAY require the seat to reach the store, down a fixed NATIVE-FIRST ladder: in-process SDK MCP →
// registered MCP + grant → poke-as-file → orchestrator relay → CLI (the FLOOR, not the fallback). Every
// tier is backed by the ONE handler (TOOLS-10) — tiers differ only in transport, never in contract or
// result. TOOLS-11a: native pull (tiers 1-2) is pinned to the SDK in-process spawn path; a harness that
// cannot propagate MCP down-ranks pull 1 AND pull 2 to `unavailable` and resolves straight to push /
// pull 3-4 — never a silent fall-through — and REPORTS the tier it actually started on. TOOLS-14:
// re-grounding is PUSHED at every phase boundary (no seat decision, no grant), unaffected by TOOLS-11a.
// Transcribed from atlas-tools:79-104, 155-176 + method-tags-tls:89-101, 117-122.

import type { Pack } from '@atlas/contracts';
import type { Poke } from '@atlas/retrieval';

/** The delivery direction (TOOLS-11). `push` = orchestrator-driven, no grant; `pull` = ad-hoc seat query. */
export type Direction = 'push' | 'pull';

/** The pull ladder, native-first (atlas-tools:161-168 / method-tags-tls:92). Transcribed EXACTLY as the
 *  ordered tier vocabulary — `sdk-mcp` (pull 1) → `registered-mcp` (pull 2) → `poke-as-file` (pull 3) →
 *  `relay` (pull 4) → `cli` (pull 5, the floor). */
export type PullTier =
  | 'sdk-mcp' // pull 1 — in-process SDK MCP (zero-IPC, shared live state); native ONLY on the SDK path
  | 'registered-mcp' // pull 2 — registered MCP + per-seat grant; native ONLY on the SDK path
  | 'poke-as-file' // pull 3 — poke-as-file / brief-injection; `Read` only, trivially true
  | 'relay' // pull 4 — orchestrator relay (proxies the native call); proven
  | 'cli'; // pull 5 — CLI (`atlas node <addr>`); the floor

/** Per-tier availability on a running harness (TOOLS-11a). `native` iff the harness can deliver that tier;
 *  a harness that cannot propagate MCP marks pull 1-2 `unavailable` (never silently fallen through). */
export type TierStatus = 'native' | 'unavailable';

/** The harness capability the ladder is honest about (TOOLS-11a, method-tags-tls:100). `canPropagateMcp`
 *  false (e.g. the Claude Code `.claude/agents` path — a reproduced defect) ⇒ pull 1-2 `unavailable`. */
export interface HarnessCapability {
  readonly canPropagateMcp: boolean;
}

/** The resolved delivery (TOOLS-11/11a). `startedTier` is the tier the ladder ACTUALLY started on for the
 *  running harness (honesty about where native reach begins — never a fixed assumption). `tiers` is the
 *  per-tier availability ledger (down-ranked per `HarnessCapability`). */
export interface Resolution {
  readonly direction: Direction;
  readonly startedTier: PullTier; // the tier actually started on (TOOLS-11a) — reported, not assumed
  readonly tiers: readonly { readonly tier: PullTier; readonly status: TierStatus }[];
}

export interface TransportApi {
  /** Split by direction and resolve reach for a seat's need (TOOLS-11). PUSH materializes a file/brief a
   *  `Read`-only seat consumes with NO grant; PULL walks the native-first ladder returning the first
   *  AVAILABLE tier. On a harness with `canPropagateMcp:false`, pull 1-2 are `unavailable` and the ladder
   *  starts at push / pull 3 — never a silent fall-through (TOOLS-11a). Every tier is the one handler, so
   *  the result is byte-identical across tiers (method-tags-tls:93, 100).
   *
   *  [SIG-TBD — `seat` / `need` shapes] no `MemberId`/`need` record is frozen at this seam (@atlas/memory
   *  is NOT a dep of tools). `seat` is transcribed as `string`, `need` as `unknown` — NOT invented. */
  resolve(seat: string, need: unknown, harness: HarnessCapability): Resolution;

  /** The TOOLS-14 pre-phase discovery hook: at EVERY phase boundary auto-inject a fresh `atlas-query` /
   *  `own_<unit>` pack into the seat's context — a PUSH (no tool grant), so a `Read`-only seat on an
   *  MCP-`unavailable` harness is still correctly re-grounded purely by push (method-tags-tls:120-121).
   *  Ad-hoc mid-task pull stays available but is an optimization, never the mechanism.
   *
   *  [SIG-TBD — return] the pushed surface is a fresh pack / poke (`Pack` | `Poke`); `scope` transcribed
   *  as `string` (cf retrieval `Path = string`). */
  prePhasePush(seat: string, scope: string): Pack | Poke;
}
