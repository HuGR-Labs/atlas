// @atlas/kernel — ref/portable.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Portability / no lock-in (KERNEL-6): the CAS exports to open JSON that replays 1:1 into a fresh
// store — no proprietary encoding, no host dependency. (atlas-kernel:104-105, 59-60)

import type { Cas } from './types.js';

export interface PortableApi {
  /** Open-JSON CAS dump (A-8). (atlas-kernel:104) */
  export(): string;
  /** Replays 1:1 into a fresh store. (atlas-kernel:105) */
  import(json: string): Cas;
}
