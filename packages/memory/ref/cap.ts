// @atlas/memory — ref/cap.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The injected-cap gate (MEM-3). A member's injected `project` memory MUST be `≤` its token cap
// (member `~500`, orchestrator `~800`); a would-exceed write is a STRUCTURED rejection, never a silent
// overflow (0 overflow). `capGate(entries, cap) = Σ tok(e) ≤ cap ? accept : reject`. The `~`-caps are
// RATIFIED PINNED BOUNDS and the tokenizer is a trusted primitive (Refuse-to-model) — the GATE WIRING is
// what is modeled. Transcribed from method-tags-mem:35-40 (INV-MEM-3 down-model) + atlas-memory:82.
//
// The per-injection-kind cap + hits ledger — `Budget` — lives in @atlas/contracts; it is IMPORTED and
// re-exported (ref/types.ts), NEVER redefined.
//
// Cap numbers are ratified bounds, left as PROSE not code (per the freeze discipline):
//   member project cap ≈ 500 tok · orchestrator ≈ 800 tok · Orientation ≈ 250 tok · Awareness ≈ 400 tok.

import type { Budget } from '@atlas/contracts';
import type { ProjectMemoryEntry } from './types.js';

/**
 * The structured gate verdict (MEM-3) — an honest receipt (`tokens` vs `cap`), never a silent boolean
 * overflow. A would-exceed write yields `accepted:false` and is rejected fail-closed.
 *
 * [SIG-TBD — rejection payload not frozen] The reference freezes "a structured rejection", not a concrete
 * shape; the honest receipt (summed `tokens` + the `cap`) is transcribed — no invented error record.
 */
export interface CapVerdict {
  readonly accepted: boolean;
  readonly tokens: number; // Σ tok(e) over the injected set (pinned tokenizer — a trusted primitive)
  readonly cap: number; // the ratified per-member bound (~500 member / ~800 orchestrator)
}

export interface CapApi {
  /** The cap gate: sums the pinned tokenizer over the injected `project` set and ACCEPTS iff `≤ cap`,
   *  else a structured REJECT (never a silent overflow — MEM-3). Pure + total. (method-tags-mem:39)
   *
   *  [FLAG — the per-MEMBER total cap is a scalar, not a `Budget` field] contracts `Budget` is per
   *  `InjectionKind` (`capTokens` per surface); the MEM-3 cap is a per-MEMBER TOTAL over the whole
   *  injected `project` set. It is transcribed as the `cap: number` argument here (NOT a `Budget` leg);
   *  `Budget` remains the per-surface ledger. Flagged if a per-member-total field is later added. */
  capGate(entries: readonly ProjectMemoryEntry[], cap: number): CapVerdict;

  /** The per-surface budget ledger for a memory injection surface (reuses contracts `Budget` unchanged —
   *  no extra memory field needed at this seam). Reads the cap + observed hit-rate for the drop-order.
   *
   *  [SIG-TBD — `surface` key] transcribed as the `Budget.kind` (`InjectionKind`) it wraps; the concrete
   *  read is a WP concern. */
  surfaceBudget(surface: Budget['kind']): Budget;
}
