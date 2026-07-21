// @atlas/cli — src/render.ts  (CLI-3: render a handler Verdict to a process outcome)
//
// Render the frozen `Verdict` (@atlas/tools) to the CLI's process-level outcome (exit code + stdout).
// DETERMINISTIC: a PURE function of the verdict — NO clock/nonce/paths — so the same verdict renders
// byte-identically every time (CLI-3c). WIRE-LOOP Seam-2 adds the `data:` block that closes GAP-B (the CLI
// used to DROP `verdict.data`, so an emitted fact was invisible at the user surface). The block is appended
// AFTER the status/next/invariant lines and ONLY for a known `ok` data shape — an unknown/absent `data`
// yields NO block, so every pre-existing rendering stays byte-unchanged (back-compat).

import type { Verdict } from '@atlas/tools';
import { deriveStatus, EXIT } from './map.js';

/** The CLI's process-level projection of one handler verdict (ring shape). */
export interface CliVerdict {
  readonly exitCode: number;
  readonly stdout: string;
}

/** A `PackInvariant`-shaped row inside a query pack (structural — never a prose blob). */
interface InvRow {
  readonly nodeId: string;
  readonly tier: string;
  readonly claim: string;
}

/** A `broader ⊃ narrower` coverage edge inside the query envelope (Seam-3). */
interface SubRow {
  readonly broader: string;
  readonly narrower: string;
}

/** A `a ≡ b` human equivalence edge inside the query envelope (WP-SAMEAS). */
interface SameRow {
  readonly a: string;
  readonly b: string;
}

/**
 * Render the DETERMINISTIC `data:` block for a known `ok` verdict data shape, or `''` when the shape is
 * unknown/absent (back-compat: no block ⇒ existing output byte-unchanged). PURE — every byte is a function
 * of `data` alone, in a fixed field order (CLI-3c). The recognised shapes, in guard order:
 *   - query envelope `{ pack, subsumes }` → `  inv <tier> <nodeId>: <claim>` per (pre-sorted) invariant,
 *     `  stale: <bool>`, then `  subsumes <broader> ⊃ <narrower>` per (pre-sorted) edge.
 *   - emit `{ id }` (a Hash) → `  id: <hash>`.
 *   - init `{ territories }` → `  territory: <name>` per territory, sorted by name.
 */
function renderData(data: unknown): string {
  if (typeof data !== 'object' || data === null) return '';
  const d = data as Record<string, unknown>;

  // query envelope { pack, subsumes } — the observability readback (Seam-1+3).
  const pack = d.pack as { invariants?: unknown; stale?: unknown; tokenEstimate?: unknown } | undefined;
  if (pack && typeof pack === 'object' && Array.isArray(pack.invariants)) {
    const invs = pack.invariants as readonly InvRow[];
    const subs = Array.isArray(d.subsumes) ? (d.subsumes as readonly SubRow[]) : [];
    const sames = Array.isArray(d.sameAs) ? (d.sameAs as readonly SameRow[]) : [];
    // N12 CLI/MCP parity: surface `tokenEstimate` (the advisory pack size) on the CLI too — MCP already ships
    // it in the pack JSON, so dropping it here was a real CLI-vs-MCP asymmetry. Deterministic (a number field).
    const tokenEstimate = typeof pack.tokenEstimate === 'number' ? pack.tokenEstimate : 0;
    const lines = [
      ...invs.map((i) => `  inv ${i.tier} ${i.nodeId}: ${i.claim}`),
      `  stale: ${pack.stale === true}`,
      `  tokenEstimate: ${tokenEstimate}`,
      ...subs.map((s) => `  subsumes ${s.broader} ⊃ ${s.narrower}`),
      // WP-SAMEAS: one line per (pre-sorted) human equivalence edge — surfaced like subsumes, never a merge.
      ...sames.map((s) => `  sameAs ${s.a} ≡ ${s.b}`),
    ];
    return `data:\n${lines.join('\n')}\n`;
  }

  // link { linked, a, b } — the governed sameAs write door result (WP-SAMEAS). A SUCCESSFUL link renders a
  // single `  linked: <a> ≡ <b>` line; a REJECTED link (linked:false) carries its `rejected` string through
  // the handler's ok:false path → the `reason:` block (mirrors emit), so it is never shadowed here. Guarded
  // on `linked === true` BEFORE the `{id}` shape below (a LinkOut has no `id`, so no cross-shadowing).
  if (d.linked === true && typeof d.a === 'string' && typeof d.b === 'string') {
    return `data:\n  linked: ${d.a} ≡ ${d.b}\n`;
  }

  // node — a resolved `GroundedFact` (the `atlas node <addr>` read door, N6). Recognised by its `kind`
  // (advisory|predicate) + a `grounding` object — the emit `{ id }` shape below has NEITHER, so it is never
  // shadowed. Renders the node's identity + tier + claim (advisory `claimNorm`, else the `claims` set-union).
  if ((d.kind === 'advisory' || d.kind === 'predicate') && typeof d.grounding === 'object' && d.grounding !== null) {
    const claim =
      typeof d.claimNorm === 'string' && d.claimNorm.length > 0
        ? d.claimNorm
        : Array.isArray(d.claims)
          ? (d.claims as readonly string[]).join('; ')
          : '';
    return `data:\n  node: ${String(d.id)}\n  tier: ${String(d.tier)}\n  kind: ${d.kind}\n  claim: ${claim}\n`;
  }

  // emit { id } — the CAS id of the persisted fact.
  if (typeof d.id === 'string') {
    return `data:\n  id: ${d.id}\n`;
  }

  // init { territories } — the structural move-in. An EMPTY territory set renders NO block (there are no
  // lines to show) so a zero-territory init stays byte-identical to its pre-Seam-2 output (back-compat).
  if (Array.isArray(d.territories)) {
    const names = (d.territories as readonly { name: string }[])
      .map((t) => t.name)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    if (names.length === 0) return '';
    return `data:\n${names.map((n) => `  territory: ${n}`).join('\n')}\n`;
  }

  return '';
}

/**
 * Render a frozen handler `Verdict` to an exit code + stdout (CLI-3). DETERMINISTIC: a PURE function of the
 * verdict — NO clock, NO nonce, NO duration — so the same verdict renders byte-identically every time
 * (CLI-3c). The exit code is `f(status)` (CLI-3b, `deriveStatus`), and the stdout block carries `status`
 * plus BOTH guidance fields (`next`, `invariant`) in a fixed order (CLI-3d — guidance always present), then
 * the Seam-2 `data:` block when the verdict is `ok` and carries a known data shape (else nothing appended).
 */
export function renderVerdict(v: Verdict): CliVerdict {
  const status = deriveStatus(v);
  const dataBlock = v.ok && v.data !== undefined ? renderData(v.data) : '';
  // F5: on a fail-closed / rejected verdict (`ok:false` with a reason), render the REASON so the CLI door is
  // as legible as the MCP `isError` door — the governed refusal is never silent. DETERMINISTIC: a pure
  // function of `v.rejected`, appended after the status/guidance lines (mutually exclusive with `dataBlock`,
  // which renders only on `ok`). An `ok` verdict carries no reason ⇒ pre-existing output stays byte-identical.
  const reasonBlock = !v.ok && v.rejected ? `reason: ${v.rejected}\n` : '';
  const stdout =
    `status: ${status}\n` +
    `next: ${v.guidance.next}\n` +
    `invariant: ${v.guidance.invariant}\n` +
    reasonBlock +
    dataBlock;
  return { exitCode: EXIT[status], stdout };
}
