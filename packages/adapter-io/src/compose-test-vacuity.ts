// @atlas/adapter-io — src/compose-test-vacuity.ts  (the #95 D5 test-vacuity leg TRIPLE, split from the composition root)
//
// The composition-root construction of the THREE test-vacuity legs `composeRuntime` (compose.ts) rides — split
// to its own file at the LOC ceiling (godfile-guard), the SAME discipline `test-vacuity-source.ts` itself was
// split out of the ring under. It is here, not inlined, because all three legs must share ONE HEAD units feed:
//   - `testVacuities` — the READ leg off the durable store (`atlas test-vacuities <unit>`), read-only;
//   - `testVacuity`   — the reachable PRODUCER (`atlas test-vacuity <path>`) that walks HEAD's `*.test.ts`/
//                       `*.spec.ts` units, runs `scanTestVacuity`, and routes every proven fact THROUGH the
//                       governed emit door (KNOW-11 authz + ARCH-9 anchor + the HEAD truth gate);
//   - `replay`        — the Wave-3 REVERIFY leg `reverifyTestVacuity` (reverify-store.ts) calls to re-prove a
//                       committed `seal:'proven'` test-vacuity against HEAD (`atlas verify-store`).
//
// WHY THEY SHARE ONE FEED: `testUnitsOf(rawTree, axes)` is the ONE HEAD-view of the repo's test units. The
// producer proves over it and the replay re-proves over it, so building both from the SAME thunk means the
// write-side proof and the read-side re-proof can never diverge in WHICH units (or which bytes) they scanned —
// exactly the "second copy of one question, free to diverge" failure class this repo keeps closing (#186/N10).
// Pure + total over its deps (the walk + build already happened upstream); the only effect is the producer's /
// replay's WASM parse, disposed on every path inside `test-vacuity-source.ts`.

import type { Hash } from '@atlas/contracts';
import type { Axes, FileTree } from '@atlas/index';
import {
  createTestVacuityLeg,
  createTestVacuityProducer,
  buildTestVacuityReplay,
  testUnitsOf,
  type TestVacuityEmit,
  type TestVacuityLeg,
  type TestVacuityProducer,
} from './test-vacuity-source.js';
import type { TestVacuityReplay } from './reverify-store.js';
import type { DiskStore } from './store.js';

// Re-export the leg types so the composition root imports the whole test-vacuity surface from ONE place (its
// `ComposedRuntime` interface names `TestVacuityLeg`/`TestVacuityProducer`), keeping compose.ts's import list flat.
export type { TestVacuityLeg, TestVacuityProducer } from './test-vacuity-source.js';

/** The three composition-root test-vacuity legs, built from ONE shared HEAD units feed (see the file header). */
export interface TestVacuityLegs {
  /** `atlas test-vacuities <unit>` — the read leg off the durable store the query leg reads. */
  readonly testVacuities: TestVacuityLeg;
  /** `atlas test-vacuity <path>` — the reachable HEAD producer, routing through the governed emit door. */
  readonly testVacuity: TestVacuityProducer;
  /** `atlas verify-store` — the reverify replay `reverifyTestVacuity` re-proves a proven fact against HEAD with. */
  readonly replay: TestVacuityReplay;
}

/**
 * Build all THREE test-vacuity legs from the composition root's primitives — `store` (the read/reverify store,
 * `readAccess.store`), the HEAD `rawTree` + `axes` the units feed derives from, the governed `emit` door, and the
 * anchor rev `at` the producer stamps writes at. The producer and the replay share ONE `testUnitsOf` thunk so the
 * write-side proof and the read-side re-proof scan the SAME units — see the file header for why that matters.
 */
export function buildTestVacuityLegs(store: DiskStore, rawTree: FileTree, axes: Axes, emit: TestVacuityEmit, at: Hash): TestVacuityLegs {
  const units = () => testUnitsOf(rawTree, axes);
  return {
    testVacuities: createTestVacuityLeg(store),
    testVacuity: createTestVacuityProducer(units, emit, at),
    replay: buildTestVacuityReplay(units),
  };
}
