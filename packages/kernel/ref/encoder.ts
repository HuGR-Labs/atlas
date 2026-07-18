// @atlas/kernel — ref/encoder.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The digest seam. The `Encoder` interface already lives in @atlas/contracts (`hash(bytes): Hash`,
// the swappable BLAKE3 seam, KERNEL-2). The kernel adds NOTHING to that interface's shape — it only
// PROVIDES the concrete default instance (BLAKE3) behind the seam (atlas-kernel:16, 46-50, 98). So we
// re-export the contract type and declare a minimal `EncoderApi` naming the kernel-provided instance.

import type { Encoder } from '@atlas/contracts';

/** Re-export of the seam contract (defined in @atlas/contracts). Kernel is the only site that mints
 *  `Hash` values through this seam; the interface shape is owned upstream. (atlas-kernel:16, 98) */
export type { Encoder };

/**
 * What the kernel adds beyond the contract `Encoder` interface: the default encoder INSTANCE. Per
 * KERNEL-2 the default MUST resolve to BLAKE3 and correctness MUST NOT depend on the chosen function
 * (swapping it changes only digest bytes). No new methods are added to `Encoder`; the kernel only
 * supplies a concrete implementation of it.
 */
export interface EncoderApi {
  /** The kernel's default encoder (BLAKE3). (atlas-kernel:16, KERNEL-2 lines 46-50) */
  readonly encoder: Encoder;
}
