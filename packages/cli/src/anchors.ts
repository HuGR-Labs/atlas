// @atlas/cli — src/anchors.ts  (WP-10.A1.CLI — the `atlas anchors <path>` read/planner verdict builder)
//
// `anchors` is a READ/DISCOVERY PLANNER (ADR-0004, AUTHOR-2/3/4), NOT a governed door: it lists the groundable
// units the built index carries under `path` — each with its `qualifiedPath`, `kind` and current `subtreeHash`
// — plus every declared language hole and the `rev` the set was computed at, persisting NOTHING. This module
// is the CLI-side verdict builder: it maps the parsed positional `path` onto the frozen `AnchorsApi.anchors`
// leg (composed over the ONE `GroundingComputer`, WP-10.A1.TOOLS/ADAPTER) and wraps the `AnchorsOut` in a
// `Verdict` the shared `renderVerdict` path renders. It lives HERE, not in @atlas/adapter-io, because the leg
// + the port are FROZEN this pass (consumed, not edited) and the CLI owns its own dispatch verdicts.
//
// TOTAL, mirroring the other read doors (`test-vacuities`, `relations`): a missing/empty `path` fails CLOSED to
// a structured `ok:false` verdict (exit 1 on the CLI), never a throw. The leg itself NEVER throws — an
// untracked / non-git / unreadable path returns the honest EMPTY set WITH a `reason` (AUTHOR-3), which renders
// as a legible empty result, not an error.

import type { AnchorsApi, AnchorsOut, Guidance, Verdict } from '@atlas/tools';

/** The one property a reader should check the rendered bytes against. */
const READ_INVARIANT =
  'AUTHOR-3/4: `atlas anchors <path>` is a READ-ONLY DISCOVERY PLANNER — it lists the groundable units the built index carries under `path` (each with qualifiedPath, kind, current subtreeHash) plus every declared language hole and the rev, off the SAME single grounding seam the emit truth-gate re-derives against, persisting NOTHING (AUTHOR-2); an empty listing carries an honest reason (untracked / non-git / unreadable), never a throw, no write path';

/** The one actionable sentence, derived from the result's OWN numbers — never a constant. */
function readNextLine(path: string, out: AnchorsOut): string {
  if (out.units.length === 0) {
    // AUTHOR-3 guarantees a reason accompanies every empty set; surface it verbatim so a caller reads WHY.
    const why = out.reason ?? 'no groundable units under path';
    return `no groundable units under '${path}' at rev ${out.rev} — ${why}`;
  }
  const holes = out.holes.length === 0 ? 'no language holes' : `${out.holes.length} declared language hole(s)`;
  return `${out.units.length} groundable unit(s) under '${path}' at rev ${out.rev}, ${holes} — draft a fact against one with \`atlas draft\``;
}

/**
 * The SHARED anchors read-verdict builder — identical `path` over the SAME `anchors` leg yields a byte-identical
 * `Verdict`, so the CLI and a future MCP transport cannot diverge (the `data` IS the frozen `AnchorsOut`, carried
 * through unwrapped so a partially-populated result — empty `holes`, absent `reason` — serializes identically on
 * both). TOTAL: a missing/empty `path` fails CLOSED to a structured `ok:false` verdict, never a throw.
 */
export function anchorsVerdict(leg: AnchorsApi['anchors'], path: string): Verdict<AnchorsOut> {
  if (typeof path !== 'string' || path.length === 0) {
    const guidance: Guidance = {
      next: '`atlas anchors <path>` requires the tree path whose groundable units to list',
      invariant: 'CLI-1b: a malformed invocation yields a structured error + guidance + non-zero exit, never a crash',
    };
    return { ok: false, rejected: 'missing path: `atlas anchors` requires a non-empty tree path', guidance };
  }
  const out = leg(path);
  const guidance: Guidance = { next: readNextLine(path, out), invariant: READ_INVARIANT };
  return { ok: true, guidance, data: out };
}
