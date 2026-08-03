// @atlas/cli — barrel
//
// The `atlas` entrypoint (constitution CLI-1/2/3/4): argv → wired handler → rendered verdict.

export { main } from './cli.js';
export { renderVerdict } from './render.js';
export type { CliVerdict } from './render.js';
export { runMine, MINED_SCOPE } from './mine.js';
// CLI-5 — the `atlas promote` curator door (KNOW-8). `MINED_SCOPE` rides out beside it because a caller that
// stages or promotes has to name the SAME governance scope the mine driver stamps, and a second copy of that
// string is exactly the drift the constant exists to prevent.
export { runPromote, promoteVerdict } from './promote.js';
