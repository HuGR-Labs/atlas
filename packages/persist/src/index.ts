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

// WP-1.3-b.PERSIST runtime surface: the git merge-driver over the SEALED kernel merge/fold/head seam —
// content-keyed union-fold, self-install, and the lossless safe-degrade path (PERSIST-11).
export {
  mergeAtlas, mergeDriver, degradeMerge,
  gitattributesEntry, mergeDriverRegistration, setupHook,
  ATLAS_LOG_PATH, MERGE_DRIVER_NAME,
} from './merge.js';
export type { DriverRegistration, SetupResult } from './merge.js';

// Campaign-3 runtime surface (provenance trailer + host-forge projection + scrubbed transcript + re-spawn):
//   WP-3.4-a: provenance / attach / metering · WP-3.4-b: host-adapter / placement
//   WP-3.5-a: transcript-store / scrub       · WP-3.5-b: reinvoke
export * from './provenance.js';
export * from './attach.js';
export * from './metering.js';
export * from './host-adapter.js';
export * from './placement.js';
export * from './transcript-store.js';
export * from './scrub.js';
export * from './reinvoke.js';

// WP-7.32.PERSIST runtime surface (EPIC-32): version-delta = deterministic read-only fold-diff over the
// sealed kernel fold/head/canonicalForm seam (added/edited/superseded/decayed, each with persist-local provenance).
export * from './diff.js';
