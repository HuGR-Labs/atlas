// @atlas/tools — src/transport.ts   (WP-7.26-c.TOOLS — TOOLS-11 / TOOLS-11a / TOOLS-14, INV-TOOLS-11 / -11a)
//
// The push/pull SPAWN LADDER — the tri-transport addressability seam that keeps ONE handler contract
// byte-identical across MCP / poke / CLI, with the CLI as the FLOOR (not a fallback). Delivery splits by
// DIRECTION:
//   • PUSH (poke / pack / RelationSet) is the ORCHESTRATOR's job and reaches a `Read`-only seat with NO
//     tool grant (`PUSH_GRANTS_REQUIRED == 0`) — materialized as a file/brief the seat consumes. This is
//     the always-works spine (TOOLS-14: re-grounding is PUSHED at every phase boundary, no seat decision).
//   • PULL (an ad-hoc mid-task query) walks the fixed NATIVE-FIRST ladder `PULL_LADDER` and returns the
//     first AVAILABLE tier — never a silent fall-through, and it REPORTS the tier it actually started on.
// Every tier is backed by the ONE injected `handler` (TOOLS-10): `resolveAt` maps a tier to its transport
// and delegates to `handler.resolveNode`, so a node resolved at any tier is byte-identical — and the SAME
// handler serves knowledge ∧ memory ∧ tools (one transport contract, wave-plan §X1 / the CLI-floor note).
// Transcribed against the FROZEN oracle `../ref/transport.ts` (`TransportApi` / `PullTier` / `Resolution` /
// `HarnessCapability`); goldens SCN-TOOLS-11-a-1 / -b-1 / -c-1 / -d-1 + SCN-TOOLS-11a-a-1 / -b-1 / -c-1 / -d-1.
//
// This facet adds NO write path and NO fifth governance tool — resolve/spawn/push are read/subscribe only;
// writes still funnel through `atlas-emit`. Identity/hashing stays behind the sealed @atlas/kernel seam.

import type { Pack } from '@atlas/contracts';
import type { NodeKey } from '@atlas/contracts';
import type { Poke } from '@atlas/retrieval';
import type { HandlerApi, Transport } from '../ref/handler.js';
import type { Verdict } from '../ref/types.js';
import type {
  Direction,
  HarnessCapability,
  PullNeed,
  PullTier,
  Resolution,
  TierStatus,
  TransportApi,
} from '../ref/transport.js';

/** The pull ladder, native-first (TOOLS-11) — the fixed ordered tier vocabulary. Transcribed EXACTLY from
 *  `../ref/transport.ts` `PullTier`: SDK-MCP → registered-MCP+grant → poke-as-file → relay → CLI (floor). */
export const PULL_LADDER: readonly PullTier[] = [
  'sdk-mcp', // pull 1 — in-process SDK MCP (native ONLY on the SDK path)
  'registered-mcp', // pull 2 — registered MCP + per-seat grant (native ONLY on the SDK path)
  'poke-as-file', // pull 3 — poke-as-file / brief-injection; the PUSH tier, `Read`-only, trivially true
  'relay', // pull 4 — orchestrator relay (proxies the native call)
  'cli', // pull 5 — CLI (`atlas node <addr>`); the FLOOR
];

/** The MCP-propagation tiers (pull 1-2) — native ONLY where the harness can propagate MCP (TOOLS-11a). */
const MCP_TIERS: readonly PullTier[] = ['sdk-mcp', 'registered-mcp'];

/** The PUSH tier — poke-as-file / brief-injection, reached with NO tool grant (the orchestrator's job). It
 *  is the tier a Read-only seat starts on when native pull is unavailable (TOOLS-11 / TOOLS-11a). */
export const PUSH_TIER: PullTier = 'poke-as-file';

/** Push reaches a seat with ZERO tool grant (TOOLS-11-b) — push is delivered by injection, never a grant. */
export const PUSH_GRANTS_REQUIRED = 0;

/** How each pull tier maps to the node handler's transport (TOOLS-10). The pull-tier vocabulary is a delivery
 *  refinement of the three node transports: SDK/registered/relay ride `mcp`, poke-as-file rides `poke`, CLI
 *  rides `cli`. Every mapping lands on the ONE handler, so tier choice never changes the resolved contract. */
const TIER_TRANSPORT: Record<PullTier, Transport> = {
  'sdk-mcp': 'mcp',
  'registered-mcp': 'mcp',
  'poke-as-file': 'poke',
  relay: 'mcp',
  cli: 'cli',
};

/** The source that materializes the phase-boundary PUSH surface (TOOLS-14) — a fresh pack / poke the seat
 *  consumes by `Read` with no grant. @atlas/tools CONSUMES this port; the concrete pack assembly is the
 *  @atlas/retrieval `own_<unit>` / `atlas-query` axis, injected here, never computed in this facet. */
export type PhasePushSource = (seat: string, scope: string) => Pack | Poke;

/** A seat spawned on the native tier-1 SDK in-process path (TOOLS-11a-a). `transport` is pinned to the
 *  `create_sdk_mcp_server` in-process contract (never a registered external MCP server); `allowedTools` is
 *  the per-seat grant. Read/subscribe only — spawning opens NO write path. */
export interface SpawnSeat {
  readonly seat: string;
  readonly transport: 'sdk-in-process'; // create_sdk_mcp_server in-process — the native tier-1 spawn contract
  readonly allowedTools: readonly string[]; // the per-seat `allowed_tools` grant
}

/** The spawn ladder — the frozen `TransportApi` PLUS the tier-backed one-handler bridge (`resolveAt`) and
 *  the native tier-1 SDK spawn (`spawn`). Extends, never forks, the frozen contract. */
export interface SpawnLadder extends TransportApi {
  /** Resolve a node at a specific pull tier through the ONE handler (TOOLS-11-d). Maps the tier to its
   *  transport and delegates to `handler.resolveNode`, so any two tiers return a byte-identical `Verdict`. */
  resolveAt(nodeAddr: NodeKey, tier: PullTier): Verdict;
  /** Spawn a governed seat on the native tier-1 SDK in-process path with a per-seat grant (TOOLS-11a-a). */
  spawn(seat: string, allowedTools: readonly string[]): SpawnSeat;
}

/** The injected dependencies: the ONE handler every tier is backed by, and the phase-boundary push source. */
export interface TransportDeps {
  readonly handler: HandlerApi; // the single node oracle behind every tier (TOOLS-10 / TOOLS-11-d)
  readonly push: PhasePushSource; // the phase-boundary PUSH materializer (TOOLS-14)
}

/** Is this tier natively reachable on the given harness? A tier that needs MCP propagation (pull 1-2) is
 *  `unavailable` on a harness that cannot propagate MCP (TOOLS-11a); every other tier is `native`. */
const tierStatus = (tier: PullTier, harness: HarnessCapability): TierStatus =>
  !harness.canPropagateMcp && MCP_TIERS.includes(tier) ? 'unavailable' : 'native';

/**
 * Build the push/pull spawn ladder over the injected `handler` + `push` source. The returned object conforms
 * EXACTLY to the frozen `TransportApi` (resolve / prePhasePush) and adds the tier↔handler bridge + SDK spawn.
 * Pure + total: no clock, no IO, no store mutation — it decides ROUTING only; every actual node read lands on
 * the one handler.
 */
export function createTransport(deps: TransportDeps): SpawnLadder {
  const { handler, push } = deps;

  const resolve = (_seat: string, _need: PullNeed, harness: HarnessCapability): Resolution => {
    // The per-tier availability ledger — EVERY ladder tier is present (never silently dropped, TOOLS-11a-c);
    // a down-ranked native tier is surfaced as `unavailable`, not omitted.
    const tiers = PULL_LADDER.map((tier) => ({ tier, status: tierStatus(tier, harness) }));
    // native-first: the first AVAILABLE tier is the one the ladder actually starts on (reported, TOOLS-11a-d).
    const startedTier = (tiers.find((t) => t.status === 'native') ?? tiers[tiers.length - 1]!).tier;
    // the push tier (poke-as-file) is the orchestrator's PUSH; every other start is a seat-side PULL.
    const direction: Direction = startedTier === PUSH_TIER ? 'push' : 'pull';
    return { direction, startedTier, tiers };
  };

  const prePhasePush = (seat: string, scope: string): Pack | Poke => push(seat, scope);

  const resolveAt = (nodeAddr: NodeKey, tier: PullTier): Verdict =>
    handler.resolveNode(nodeAddr, TIER_TRANSPORT[tier]);

  const spawn = (seat: string, allowedTools: readonly string[]): SpawnSeat => ({
    seat,
    transport: 'sdk-in-process', // the native tier-1 contract (create_sdk_mcp_server in-process)
    allowedTools,
  });

  return { resolve, prePhasePush, resolveAt, spawn };
}

// differential-vs-oracle (compile-time): the ladder conforms to the frozen `TransportApi` (../ref/transport.ts).
const _transportConforms: TransportApi = createTransport({
  handler: createHandlerStub(),
  push: () => ({ scope: '', pack: emptyPack, notice: '' }),
});
void _transportConforms;

/** A minimal type-level handler stub for the compile-time conformance witness only (never exported). */
function createHandlerStub(): HandlerApi {
  return {
    handle: () => ({ ok: false, guidance: { next: '.', invariant: '.' } }),
    resolveNode: () => ({ ok: false, guidance: { next: '.', invariant: '.' } }),
    schema: (tool) => ({ name: tool, description: '', inputSchema: {} }),
  };
}

const emptyPack: Pack = {
  territory: '',
  axisHash: '' as Pack['axisHash'],
  invariants: [],
  tokenEstimate: 0,
  stale: false,
};
