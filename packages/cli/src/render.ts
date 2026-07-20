// @atlas/cli — src/render.ts  (CLI-3: render a handler Verdict to a process outcome)
//
// Render the frozen `Verdict` (@atlas/tools) to the CLI's process-level outcome (exit code + stdout).
// SKELETON — signature frozen, body deferred to the CLI WP.

import type { Verdict } from '@atlas/tools';
import { deriveStatus, EXIT } from './map.js';

/** The CLI's process-level projection of one handler verdict (ring shape). */
export interface CliVerdict {
  readonly exitCode: number;
  readonly stdout: string;
}

/**
 * Render a frozen handler `Verdict` to an exit code + stdout (CLI-3). DETERMINISTIC: a PURE function of the
 * verdict — NO clock, NO nonce, NO duration — so the same verdict renders byte-identically every time
 * (CLI-3c). The exit code is `f(status)` (CLI-3b, `deriveStatus`), and the stdout block carries `status`
 * plus BOTH guidance fields (`next`, `invariant`) in a fixed order (CLI-3d — guidance always present).
 */
export function renderVerdict(v: Verdict): CliVerdict {
  const status = deriveStatus(v);
  const stdout =
    `status: ${status}\n` +
    `next: ${v.guidance.next}\n` +
    `invariant: ${v.guidance.invariant}\n`;
  return { exitCode: EXIT[status], stdout };
}
