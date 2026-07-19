// @atlas/cli — src/render.ts  (CLI-3: render a handler Verdict to a process outcome)
//
// Render the frozen `Verdict` (@atlas/tools) to the CLI's process-level outcome (exit code + stdout).
// SKELETON — signature frozen, body deferred to the CLI WP.

import type { Verdict } from '@atlas/tools';

/** The CLI's process-level projection of one handler verdict (ring shape). */
export interface CliVerdict {
  readonly exitCode: number;
  readonly stdout: string;
}

/** Render a frozen handler `Verdict` to an exit code + stdout (CLI-3). */
export function renderVerdict(v: Verdict): CliVerdict {
  void v;
  throw new Error('unimplemented: CLI-3 — render a Verdict to exit code + stdout');
}
