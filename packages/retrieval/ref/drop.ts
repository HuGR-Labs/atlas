// @atlas/retrieval — ref/drop.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Bounded deterministic DROP under capacity (RETR-6). The SUM of everything auto-injected in a turn MUST
// respect the pinned `~5K` ceiling (~3-5% of context). On overflow, droppable kinds drop by OBSERVED
// per-kind `hitRate` — least-used first (the RETR-8 ledger) — never an undefined / purely-hardcoded
// order: the drop order is a deterministic TOTAL order over kinds `(pinned-desc, hitRate-asc)`. Two
// kinds are exempt and MUST NOT drop ever: `Awareness.constitution` (T0) and `protocols.safetyCritical`
// (T0-adjacent). The documented cold-start default applies until the ledger has data. The reference
// drop-policy IS the oracle. Reuses the `ref/ledger.ts` `hitRate` + the `ref/caps.ts` ceiling.
// Transcribed from atlas-retrieval:96-106 / method-tags-ret:57-61.

import type { Budget, InjectionKind } from '@atlas/contracts';

export interface DropApi {
  /** The drop order under capacity (RETR-6): orders kinds by `(pinned-desc, hitRate-asc)` — the two
   *  pins never drop — and drops from the bottom until `sum ≤ ~5K` ceiling; cold-start default order
   *  applies until the ledger has data. A deterministic total order. Pure + total.
   *
   *  [PINNED — `items` / return shapes] The honest minimum, per the oracle-pin map: the per-kind
   *  `Budget[]` ledger in (carrying `kind` + `hitRate` — the drop oracle, both contracts-frozen) and the
   *  ordered drop sequence `InjectionKind[]` out. Both records are @atlas/contracts-frozen.
   *  (method-tags-ret:60) */
  dropOrder(items: readonly Budget[]): readonly InjectionKind[];
}
