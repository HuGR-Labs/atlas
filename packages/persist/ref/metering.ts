// @atlas/persist — ref/metering.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The per-agent metering constructor (PERSIST-6). `meter(wp)` populates a full `Metering` record — no
// required field left `undefined` (method-tags-pst:55-56). (atlas-persist:104)
//
// `wp` is a work-package; its shape is owned by a HIGHER (orchestrator) layer, so it is kept `unknown`
// here [upward-type → unknown] — never imported upward.

import type { Metering } from './types.js';

export interface MeteringApi {
  /** Build the complete accounting record for a WP. (atlas-persist:104) */
  meter(wp: unknown): Metering;
}
