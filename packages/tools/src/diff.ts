// @atlas/tools — src/diff.ts   (WP-7.32.TOOLS — EPIC-32 — TOOLS-16, INV-TOOLS-16)
//
// `atlas-diff` — the READ-ONLY version-delta projection. It surfaces the frozen @atlas/persist PERSIST-14
// delta (`{added, edited, superseded, decayed}`, each entry carrying its provenance) as a read-only VIEW:
//   • it READS a version-delta from the injected @atlas/persist `DiffApi` (`persist/ref/diff.ts`) — it does
//     NOT compute the fold-diff itself (that is @atlas/persist / WP-7.32.PERSIST);
//   • CLI ≡ MCP: the projection is BYTE-IDENTICAL across transports — `render(transport, …)` ignores the
//     `transport` (it records the ROUTE only), so the two adapters cannot diverge (TOOLS-16, like TOOLS-3);
//   • 0 WRITE PATH: the handle exposes NO store-mutating method (read/subscribe only) and carries NO write
//     authority. atlas-diff is a read projection like the per-node handler (TOOLS-10) and `atlas doctor`
//     (TOOLS-12) — NOT a fifth governance tool: the governance write surface stays EXACTLY four and the
//     single write path stays `atlas-emit` (`GOVERNANCE_SURFACE` / `WRITE_PATHS` in src/handler.js, TOOLS-1).
// A malformed sha fails CLOSED to the SAME structured rejected `Verdict` on every transport (never a throw,
// never a coercion). Transcribed against the FROZEN oracle `../ref/diff.ts` (`DiffApi`) + `../ref/types.ts`
// (`DiffOut` / `Verdict` / `Guidance`); goldens SCN-TOOLS-16a-1 / 16b-1 / 16c-1 / 16d-1 / 16e-1.
//
// SCOPE (this facet): the read-only projection surface — the faithful delta render, the CLI≡MCP parity, the
// fail-closed identical rejection, and the no-write-authority shape. The ∀-input CLI≡MCP determinism arm is
// DELEGATED to the TOOLS-3 cross-transport PBT over the one handler. EXCLUDED — computing the fold-diff
// (@atlas/persist), and identity/hashing (the sealed @atlas/kernel seam).

import type { Hash } from '@atlas/contracts';
import type { DiffApi } from '../ref/diff.js';
import type { Transport } from '../ref/handler.js';
import type { DiffOut, Guidance, Verdict } from '../ref/types.js';

/** The read-only version-delta source atlas-diff projects — the @atlas/persist `DiffApi`
 *  (`persist/ref/diff.ts`), injected. atlas-diff READS this delta; it does NOT compute the fold-diff (that
 *  is @atlas/persist / WP-7.32.PERSIST). Read-only: it surfaces no store-mutating method. */
export type DiffSource = DiffApi;

/** The `next + invariant` guidance every atlas-diff result ships (TOOLS-4) — non-empty on the ok AND the
 *  fail-closed reject paths. The follow-up for any change is ALWAYS the single write door. */
export const DIFF_GUIDANCE: Guidance = {
  next: 'atlas-diff is a read-only version-delta projection — to change a version, emit through atlas-emit',
  invariant: 'TOOLS-16: read-only projection of the PERSIST-14 delta, no write path, write surface stays four',
};

/** The fail-closed rejection reason for a malformed sha — identical on every transport (no divergence). */
const REJECT_BAD_SHA =
  'malformed sha — atlas-diff requires two content-address strings (fail-closed, TOOLS-16)';

/** A sha argument is well-formed iff it is a string (the `Hash` carrier). A number/array/object fails
 *  CLOSED — never coerced (the coercion-vs-reject divergence is exactly what TOOLS-16c forbids). */
const isHash = (v: unknown): v is Hash => typeof v === 'string';

/**
 * The `atlas-diff` read-only projection handle. Conforms EXACTLY to the frozen `DiffApi` (`diff`) and adds
 * the transport-parametrized `render` — the byte-identical read across CLI ≡ MCP. It exposes ONLY read
 * methods (`diff` / `render`); it grows NO `write` / `apply` / `applyInto`, so it is structurally incapable
 * of mutating the store (TOOLS-16d) and is NOT a fifth write tool (TOOLS-16e / TOOLS-1).
 */
export interface AtlasDiff extends DiffApi {
  /** The read-only fold-diff between two commit states — surfaces the PERSIST-14 delta faithfully (frozen
   *  `DiffApi`). 0 mutation, 0 write path — it READS the @atlas/persist `VersionDelta`. */
  diff(shaA: Hash, shaB: Hash): DiffOut;
  /** Render the delta as a byte-identical read-only `Verdict` over a transport (CLI ≡ MCP, TOOLS-16). The
   *  `transport` records the ROUTE only — it NEVER changes the result. A malformed sha fails CLOSED to the
   *  SAME structured rejected `Verdict` on every transport; a well-formed pair surfaces the raw delta with
   *  NO per-transport envelope (the divergence this seam forbids). */
  render(transport: Transport, shaA: unknown, shaB: unknown): Verdict<DiffOut>;
}

/**
 * Build the `atlas-diff` read-only projection over an injected @atlas/persist version-delta `source`. The
 * returned handle conforms EXACTLY to the frozen `DiffApi` and adds the CLI≡MCP `render`. Pure + total and
 * read-only: no clock, no IO, no store mutation, no throw. `render` delegates to the ONE projection core
 * regardless of transport, so the two adapters return a byte-identical `Verdict` — they cannot diverge.
 */
export function createAtlasDiff(source: DiffSource): AtlasDiff {
  const diff = (shaA: Hash, shaB: Hash): DiffOut => source.diff(shaA, shaB);

  const render = (_transport: Transport, shaA: unknown, shaB: unknown): Verdict<DiffOut> => {
    // fail-closed on a malformed sha — the SAME structured rejection on every transport (no coercion).
    if (!isHash(shaA) || !isHash(shaB)) {
      return { ok: false, rejected: REJECT_BAD_SHA, guidance: DIFF_GUIDANCE };
    }
    // read-only: surface the PERSIST-14 delta faithfully — no envelope, no per-transport wrapping.
    return { ok: true, data: source.diff(shaA, shaB), guidance: DIFF_GUIDANCE };
  };

  return { diff, render };
}

// differential-vs-oracle (compile-time): the projection conforms to the frozen `DiffApi` (../ref/diff.ts) —
// a read-only handle with NO write-returning method (the write surface stays exactly four, TOOLS-1/16).
const _diffConforms: DiffApi = createAtlasDiff({
  diff: () => ({ added: [], edited: [], superseded: [], decayed: [] }),
});
void _diffConforms;
