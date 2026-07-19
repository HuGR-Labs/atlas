// @atlas/persist — barrel
//
// Layer 2: git-native durability / provenance / re-spawn. The implementation surface WPs fill in at
// execution (incl. the `mergeAtlas(ours, theirs, base): EventLog` free function — PERSIST-11 — whose
// oracle is the kernel `fold`, so it lives here in `src/`, NOT in `ref/`). For the skeleton, everything
// lives frozen in `ref/*.ts`.
//
// The barrel re-exports the package's FULL public type surface so consumers can import from the bare
// package root (`import type { VersionDelta } from '@atlas/persist'`). ref/*.ts is type-only, hence
// `export type *`.

export type * from '../ref/types.js';
export type * from '../ref/attach.js';
export type * from '../ref/diff.js';
export type * from '../ref/host-adapter.js';
export type * from '../ref/metering.js';
export type * from '../ref/placement.js';
export type * from '../ref/provenance.js';
export type * from '../ref/reinvoke.js';
export type * from '../ref/scrub.js';
export type * from '../ref/source.js';
export type * from '../ref/transcript-store.js';

// WP-1.1-b.PERSIST runtime surface: store+trailers portable-source assembly + full-store OKF export.
export { clone, soleHomeViolations, exportStore, importStore } from './source.js';

// WP-1.2-b.PERSIST runtime surface: set-fold reconstruction over git history + archive/forget + rewind.
export {
  collect, reconstruct, replay, replayFromExport, serializeState, rewind,
  archive, del, mergeArchive, respawn, forget,
} from './reconstruct.js';
