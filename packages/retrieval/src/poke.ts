// @atlas/retrieval — src/poke.ts  (WP-6.21.RETR · poke debounce automaton + scope-tool projection — RETR-4 + RETR-5)
//
// Two frozen reference-models bound as ONE facet (they share the navigator's scope stream):
//   • RETR-4 (ref/poke.ts)    — a debounced, once-per-scope poke on scope-entry. A poke fires iff a
//     single-file navigation signal SETTLES as the current scope across `N = 2` consecutive tool calls
//     AND that scope was not already poked this session (≤1 poke / scope / session). Transient in-and-out
//     crossings fire 0 pokes. The event source is the harness tool-call hook (the push tier of TOOLS-11);
//     scope is inferred from the paths in the navigator's tool calls — never from an explicit query.
//   • RETR-5 (ref/project.ts) — location-scoped tool projection: only nodes covering the CURRENT scope may
//     be exposed at once; on leaving the scope they retract; the whole graph is never projected. The live
//     set follows the navigator with 0 cross-scope accumulation (A-15).
//
// This facet is a SEAM CONSUMER. It does NOT assemble the injected pack (RETR-2, EPIC-19 — supplied via
// `sources.pack`), does NOT reimplement the TOOLS-11 push transport (consumed frozen upstream), and does
// NOT compose covering-node schemas (index-supplied via `sources.covering`). It owns only the AUTOMATON
// (when a poke fires) and the PROJECTION law (which tools are live, retracting on leave). NO hashing
// happens here (identity stays behind the sealed @atlas/kernel seam); `NodeKey`s arrive already minted.
// Total (RETR-9): a malformed call / missing covering knowledge yields `null` / an empty set, never a throw.
//
// EXECUTION NOTE (OWNER DECISION X1, wave-plan §X1): the announce unit is the logical PACK, NOT the
// individual node — and the pack IS `own_<unit>`. On a settled scope-entry, only the pack(s) governing the
// current scope announce (a handful, scope-local — never every crate, never a per-node swarm). Per-node
// access is drill-down WITHIN the pack (`announce().drill`), reached through it, never a top-level swarm.
// The RETR-4 `Poke` is already pack-grain (it carries one `Pack`). The RETR-5 covering-node set is reshaped
// here into the pack's IN-PACK DRILL surface via `announce()`; `projectTools()` remains the frozen pure
// covering-set law the goldens assert on (scope-local, retracting, never whole-graph).

import type { Pack } from '@atlas/contracts';
import type { NodeTool, Path, Poke } from '../ref/types.js';
import type { PokeApi } from '../ref/poke.js';
import type { ProjectApi } from '../ref/project.js';

// ── frozen constants ────────────────────────────────────────────────────────────────────────────────────
/** The settle window (RETR-4g): a scope must remain current across `N = 2` consecutive tool calls before its
 *  poke fires (atlas-retrieval:89; method-tags-ret:46). A COUNT of calls — not wall-clock, nothing real-time. */
export const SETTLE_WINDOW = 2;
/** The poke sweet-spot cap (RETR-7): the compact push notice is `≤ ~150` tokens under the pinned cap measure.
 *  Enforcement of the measure is the RETR-7 seam; this facet carries a SUPPLIED notice and never tokenizes. */
export const POKE_CAP = 150;

// ── the tool-call vocabulary (the harness hook event; the scope-signal classifier partitions it) ──────────
/** The navigation-relevant tool names observed on the tool-call hook (RETR-4b/4c/4d). */
export type ToolName = 'Read' | 'Edit' | 'Write' | 'Grep' | 'Glob' | 'Bash';

/** One observed tool call. `paths` are the RESOLVED scope keys the harness hook extracted from the call's
 *  path args (the index resolves a raw file path → its node scope; this facet consumes the resolved keys). */
export interface ToolCall {
  readonly tool: ToolName;
  readonly paths: readonly Path[];
}

/** The scope-signal classification (RETR-4): a single-file Read/Edit/Write navigates; everything else
 *  (multi-file Grep/Glob, a Bash command's path-shaped arg, any multi-path call) is suppressed. */
export type Signal =
  | { readonly kind: 'navigate'; readonly scope: Path }
  | { readonly kind: 'suppress' };

/** The result of feeding one tool call through the automaton (RETR-4 + RETR-5). */
export interface PokeStep {
  readonly signal: Signal;
  readonly poke: Poke | null; // fired iff the current scope just settled (N=2) unpoked; else null
  readonly tools: readonly NodeTool[]; // the LIVE projection after this call (retract-on-leave, RETR-5)
}

/** The X1 pack-grain announce (OWNER DECISION): the single top-level unit is the pack `own_<leaf>`; the
 *  covering nodes are its IN-PACK drill surface — reached through the pack, never a top-level node swarm. */
export interface PackAnnounce {
  readonly scope: Path;
  readonly pack: string; // the `own_<leaf>` pack tool — the one unit that announces (never N node-tools)
  readonly drill: readonly NodeTool[]; // covering nodes as in-pack drill-down (RETR-5 covering set)
}

/** The index-read seam this facet consumes. It owns none of these — it decides WHEN to fire + WHICH is live. */
export interface PokeSources {
  /** The scope's injected pack (RETR-2, EPIC-19) — SUPPLIED; this WP triggers its injection, never builds it. */
  readonly pack: (scope: Path) => Pack;
  /** The compact `≤ POKE_CAP` push notice for a settled scope — SUPPLIED (rendering is a seam, not this WP). */
  readonly notice: (scope: Path, pack: Pack) => string;
  /** The nodes covering a scope, already minted as MCP tools (index-supplied — no hashing here, RETR-5). */
  readonly covering: (scope: Path) => readonly NodeTool[];
}

/** The facet surface. `poke` narrows the frozen `PokeApi.poke`; `projectTools` binds the frozen `ProjectApi`. */
export interface PokeFacet extends PokeApi, ProjectApi {
  poke(scope: Path): Poke | null;
  projectTools(scope: Path): readonly NodeTool[];
  /** Feed one tool call through the debounce automaton (RETR-4) + projection law (RETR-5). */
  feed(call: ToolCall): PokeStep;
  /** X1 pack-grain exposure: the `own_<leaf>` pack + its covering nodes as in-pack drill. */
  announce(scope: Path): PackAnnounce;
  /** The current live tool set (RETR-5: the covering set of the current scope, retracting on leave). */
  live(): readonly NodeTool[];
}

// ── pure helpers ────────────────────────────────────────────────────────────────────────────────────────
/** Scope-signal classifier (RETR-4b/4c/4d): a single-file Read/Edit/Write IS navigation (scope = that
 *  file's node); a multi-file Grep/Glob has no single scope; a Bash path-arg is a command, not a location.
 *  Total — never throws (RETR-9). */
export function classify(call: ToolCall): Signal {
  const isNav = call.tool === 'Read' || call.tool === 'Edit' || call.tool === 'Write';
  const [only] = call.paths;
  if (isNav && call.paths.length === 1 && only !== undefined) return { kind: 'navigate', scope: only };
  return { kind: 'suppress' }; // multi-file span / Bash command / multi-path — no single scope
}

/** The `own_<leaf>` pack tool name (X1): `own_` + the scope's leaf segment (after the last `/` or `:`). */
export function packToolName(scope: Path): string {
  const parts = scope.split(/[/:]/).filter((s) => s.length > 0);
  const leaf = parts.length > 0 ? parts[parts.length - 1] : scope;
  return `own_${leaf}`;
}

// ── the automaton ───────────────────────────────────────────────────────────────────────────────────────
export function createPoke(sources: PokeSources): PokeFacet {
  let currentScope: Path | null = null; // the scope the navigator is in RIGHT NOW
  let runLen = 0; // consecutive tool calls the current scope has stayed current (the settle counter)
  const poked = new Set<Path>(); // per-session once-per-scope guard (RETR-4i)
  let liveSet: readonly NodeTool[] = []; // the current projection (RETR-5: retracts on scope-change)

  /** RETR-5 covering-set projection — PURE + total (miss ⇒ empty set, never a throw). */
  function projectTools(scope: Path): readonly NodeTool[] {
    try {
      return sources.covering(scope);
    } catch {
      return []; // RETR-9: total — a malformed scope yields an empty tool set, never a throw
    }
  }

  /** X1 pack-grain announce: the one `own_<leaf>` pack + its covering nodes as in-pack drill. */
  function announce(scope: Path): PackAnnounce {
    return { scope, pack: packToolName(scope), drill: projectTools(scope) };
  }

  /** RETR-4 fire primitive: the scope's `Poke` iff it is the CURRENT settled scope (`runLen ≥ N`) AND was
   *  not already poked this session; else `null`. Total (RETR-9). The `N = 2` debounce is enforced by the
   *  automaton (`feed` advances `runLen`); this method is the once-per-scope gate + pack build. */
  function poke(scope: Path): Poke | null {
    try {
      if (scope !== currentScope) return null; // not the current scope — a stale / off-navigator request
      if (runLen < SETTLE_WINDOW) return null; // not yet settled across N=2 consecutive calls (debounce)
      if (poked.has(scope)) return null; // ≤1 poke / scope / session (RETR-4i)
      poked.add(scope);
      const pack = sources.pack(scope);
      return { scope, pack, notice: sources.notice(scope, pack) }; // unasked push: notice + that scope's pack
    } catch {
      return null; // RETR-9: total — never propagate a throw
    }
  }

  /** The debounce automaton (RETR-4) + projection law (RETR-5): consume one tool call, advance the settle
   *  counter, retract/re-project on a scope-change, and fire at most one poke on a fresh settle. */
  function feed(call: ToolCall): PokeStep {
    const signal = classify(call);
    if (signal.kind === 'navigate') {
      if (signal.scope === currentScope) {
        runLen += 1; // the scope remains current — advance toward the settle window
      } else {
        currentScope = signal.scope; // scope-change: the navigator moved
        runLen = 1;
        liveSet = projectTools(signal.scope); // RETR-5b: retract the old covering set, project the new one
      }
    } else if (currentScope !== null) {
      runLen += 1; // a suppressed call moves nothing — the current scope stays current across this call
    }
    const fired = currentScope === null ? null : poke(currentScope);
    return { signal, poke: fired, tools: liveSet };
  }

  function live(): readonly NodeTool[] {
    return liveSet;
  }

  return { poke, projectTools, feed, announce, live };
}
