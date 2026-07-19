// @atlas/cli — barrel
//
// The `atlas` entrypoint (constitution CLI-1/2/3/4): argv → wired handler → rendered verdict.

export { main } from './cli.js';
export { renderVerdict } from './render.js';
export type { CliVerdict } from './render.js';
export { runMine } from './mine.js';
