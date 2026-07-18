// @atlas/genesis — ref/scan.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// S0 — the structural skeleton (GEN-1: `$0`, NO LLM, DETERMINISTIC). Transcribed from atlas-genesis §S0
// (lines 31-40) + §Surface (line 186) + INV-GEN-1 (method-tags-gen:16-21). `scan` is a PURE FUNCTION of
// (repo, rev): AST + def/ref tags via tree-sitter (spatial axis), precise cross-file resolution via
// SCIP / stack-graphs (dependency axis), content-address every node into the BLAKE3 CAS. Ships ZERO
// facts — territories at `T2/advisory`, T0 only FLAGGED (KNOW-6/7). Re-running on the same rev MUST
// reproduce a BYTE-IDENTICAL skeleton (GEN-1). No LLM client symbol is reachable from this path.

import type { Axes, Manifest } from '@atlas/index';

/**
 * The S0 output — the addressable substrate, nothing more (GEN-1). GENESIS-HOME (`Skeleton` is frozen
 * nowhere below). "3 axes + content-address every node (= atlas-init)" (atlas-genesis:24, :186).
 *   - `axes`     — the ≥3 content-addressed axis hierarchies (spatial / territory / dependency), reused
 *     verbatim from the @atlas/index `Axes` (each object stored once in the CAS, INDEX-10).
 *   - `manifest` — the territories manifest, every territory at `T2/advisory` with ZERO invariants; T0
 *     only flagged, never promoted (KNOW-6/7). Reused from the @atlas/index `Manifest`.
 *
 * [SIG-TBD — record beyond axes+manifest not frozen] atlas-genesis frames S0 as "= atlas-init" (the
 * TOOLS-5 move-in) but freezes no `Skeleton` field list. `axes` + `manifest` are the reference-attributed
 * minimum (the built axis-views + the T2 territory overlay); the unresolved-edge ledger (INDEX-13) and
 * per-node CAS ids ride inside `Axes`. NOT invented beyond this. Flagged for the owning WP.
 */
export interface Skeleton {
  readonly axes: Axes; // the ≥3 content-addressed axis hierarchies (INDEX-10)
  readonly manifest: Manifest; // territories at T2/advisory, ZERO invariants, T0 flagged (KNOW-6/7)
}

export interface ScanApi {
  /** S0 structural skeleton (GEN-1). DETERMINISTIC `$0`-LLM pure function of (repo, rev): tree-sitter +
   *  SCIP / stack-graphs + BLAKE3 content-address. Re-running on the same rev ⇒ byte-identical skeleton;
   *  no LLM handle reachable. Ships zero facts (territories at T2, T0 flagged only).
   *
   *  [FLAG — arg types] the surface `scan(repo, rev)` (atlas-genesis:186) leaves both untyped. `repo`
   *  transcribed as `string` (a repo path/handle); `rev` transcribed as `string` (a free-form git rev —
   *  deliberately NOT `Hash`, since GEN-8 requires a MALFORMED rev yield a partial skeleton, never a
   *  throw — a malformable input is a raw string, not a branded digest). Flagged for the WP. */
  scan(repo: string, rev: string): Skeleton;
}
