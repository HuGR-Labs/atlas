// @atlas/retrieval — ref/ledger.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Calibration from observed use, not guesswork (RETR-8). Caps AND the drop order derive from the
// ledger's observed `hits` / `hitRate`, never a static constant divorced from usage. The `hits` counter
// is the calibration oracle; its per-kind `hitRate` also drives the RETR-6 drop order (least-used
// dropped first). `hits` measure PRECISION (served facts used), never COVERAGE (that is RETR-13's
// MISS-oracle). The reference ledger is a per-kind `hits` / `hitRate` accumulator that the cap-table
// (`ref/caps.ts`) and drop-policy (`ref/drop.ts`) READ. Transcribed from atlas-retrieval:113-117 /
// method-tags-ret:70-75.

import type { Budget } from '@atlas/contracts';

export interface LedgerApi {
  /** The per-kind budget ledger (RETR-6/8): each kind's cap + live `hits` + observed `hitRate`, for
   *  calibration. Pure. (atlas-retrieval:173) */
  budget(): readonly Budget[];
}
