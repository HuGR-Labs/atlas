// ── REFERENCE MODEL — NO PRODUCTION CALLERS (yet) ─────────────────────────────────────────────────────
// WP-TV-1a builds the producer + its seal + its governed door, but the COMPOSITION-ROOT wiring (the FileTree
// `*.test.ts`/`*.spec.ts` walk that feeds `units`, and the `atlas` CLI verb that drives it) is Wave 2 —
// scope-fenced OUT of this WP. Until Wave 2 value-imports `createTestVacuityProducer` from `compose.ts`, it has
// no production caller and is a DECLARED reference model in `harness/gates/reference-model-guard.mjs`
// (`shipped: null`). It is exercised end-to-end by `test/test-vacuity-producer.test.ts` (a real parse → seal →
// governed-door persist). This banner is dropped when Wave 2 wires the leg, exactly as the sibling oracle
// `test-vacuity.ts` shed its banner when THIS producer wired it.
//
// @atlas/adapter-io — src/test-vacuity-source.ts  (the reachable PRODUCER for the single-anchor test-vacuity family, #95 D5)
//
// The shipped edge that turns the reference-model oracle `scanTestVacuity` (test-vacuity.ts) into running code —
// the single-anchor HEAD analogue of the 2-rev transition producer (`transition-source.ts`). Given the repo's
// HEAD test units (`*.test.ts` / `*.spec.ts`, walked from the SAME FileTree the index folds — wired at the
// composition root, Wave 2), it PARSES each unit via the SAME tree-sitter machinery `ast.ts` uses (`parseTsDoc`),
// runs `scanTestVacuity` over the AST, and for every PROVEN fact builds a `TestVacuityProposal` + calls
// `trySoundTestVacuity` (@atlas/genesis) injecting a `scanTestVacuity`-backed verifier — genesis is the seal
// authority (D5), this module only supplies the closure. Each sealed node is routed THROUGH the governed emit
// door (`emit`, the `kind:'test-vacuity'` branch is `governed-emit-test-vacuity.ts`), NEVER a direct
// `commitProjection` — the #87/#234 gate-less-write fix, so KNOW-11 authz + ARCH-9 anchor + the HEAD truth gate
// all apply.
//
// FAIL-CLOSED on any unit it cannot parse: `parseTsDoc` returns `undefined` (error tree / non-TS / throw), the
// producer emits NOTHING for that unit (a MEASURED `admitted:false`), never a fabricated fact — exactly the
// caller-side fail-closed contract `scanTestVacuity`'s header requires.

import type { Hash, StructRef, Tier } from '@atlas/contracts';
import type { GroundingEntry } from '@atlas/grounding';
import { trySoundTestVacuity } from '@atlas/genesis';
import type { TestVacuityProposal } from '@atlas/genesis';
import type { TestVacuityNode, TestVacuityShape } from '@atlas/knowledge';
import type { EmitOut } from '@atlas/tools';
import { parseTsDoc } from './ast.js';
import { scanTestVacuity } from './test-vacuity.js';
import { unitScopeOf } from './llm.js';
import { MINED_TIER } from './reverify-store.js';

/** One HEAD test unit the producer scans — its LOCATION-FREE `unitKey` lineage, the repo-relative `path` (the
 *  grounding entry's human/nav leg), the unit's HEAD `anchor` (its `subtreeHash` the freshness leg), and the raw
 *  TS `content` to parse. INJECTED — the composition root (Wave 2) walks the FileTree for `*.test.ts`/`*.spec.ts`
 *  leaves and hands their bytes + anchors here; a test hands a literal list. */
export interface TestUnit {
  readonly unitKey: string;
  readonly path: string;
  readonly anchor: StructRef;
  readonly content: string;
}

/** The governed emit door leg the producer writes THROUGH — `createGovernedEmit(...).emit` (compose binds it).
 *  Its `kind:'test-vacuity'` branch (`governed-emit-test-vacuity.ts`) applies the HEAD truth gate + KNOW-11 authz
 *  + ARCH-9 anchor + produced-only. */
export type TestVacuityEmit = (node: TestVacuityNode, at: Hash) => EmitOut;

/** The outcome of producing ONE fact — a MEASURED record, never a manufactured fact. `admitted:false` carries the
 *  honest reason: the unit could not be parsed (fail-closed), or the injected oracle did not re-prove the shape.
 *  `persisted:false` on a governed refusal is the whole point of the write-through — a gate-less path would land it. */
export interface TestVacuityRun {
  readonly admitted: boolean;
  readonly unitKey: string;
  readonly testName?: string; // present once a proven fact was proposed (absent on an unparseable unit)
  readonly id?: string; // the durable content address the door returned, present iff persisted
  readonly persisted?: boolean; // whether the governed door COMMITTED (false ⇒ authz/anchor/ratify/ground refusal)
  readonly reason?: string; // the honest why-not / the governed door's refusal text, present iff NOT admitted-and-persisted
}

/** The composition-root PRODUCER leg: HEAD test units → produce + GOVERNED-emit every proven test-vacuity fact. */
export type TestVacuityProducer = () => readonly TestVacuityRun[];

/** One unit's HEAD anchor as a `GroundingEntry` — the `StructRef` (whose `subtreeHash` IS the unit's content hash
 *  at HEAD) wrapped with the file path. Mirrors `transition-source.ts`'s `entryOf`. */
function entryOf(ref: StructRef, path: string): GroundingEntry {
  return { anchor: ref, path };
}

/**
 * Build the REACHABLE producer over an injected `units` feed + the GOVERNED emit door `emit`. The returned leg
 * parses each HEAD test unit, runs `scanTestVacuity`, and for every proven fact admits a `proven`-sealed node
 * through genesis's seal authority (`trySoundTestVacuity`, injecting a `scanTestVacuity`-backed verifier) and
 * routes it THROUGH the door (KNOW-11 authz + ARCH-9 anchor + the HEAD truth gate). `at` is the anchor rev the
 * write is stamped at (the repo's live HEAD), threaded to the door's HEAD truth gate.
 *
 * FAIL-CLOSED / ABSTAIN, NEVER FABRICATE (all a MEASURED result, never a throw):
 *   - the unit could not be parsed (error tree / non-TS / throw) ⇒ one `admitted:false` run, nothing emitted;
 *   - `scanTestVacuity` proves nothing on a unit ⇒ that unit contributes no run (no fact to state);
 *   - the injected verifier does not re-prove a proposed fact ⇒ `admitted:false` (genesis withheld the seal);
 *   - the GOVERNED DOOR refuses (unauthorized actor / anchor, stale grounding, unratified) ⇒ admitted:true but
 *     persisted:false + the door's reason.
 */
export function createTestVacuityProducer(units: () => readonly TestUnit[], emit: TestVacuityEmit, at: Hash): TestVacuityProducer {
  return () => {
    const runs: TestVacuityRun[] = [];
    for (const u of units()) {
      const doc = parseTsDoc(u.path, u.content);
      if (doc === undefined) {
        // FAIL-CLOSED: an unparseable unit yields no proven fact, never a false one.
        runs.push({ admitted: false, unitKey: u.unitKey, reason: `unit '${u.unitKey}' could not be parsed (error tree / non-TS / parse throw) — fail-closed, no fact` });
        continue;
      }
      try {
        const facts = scanTestVacuity(doc.root);
        // The scanTestVacuity-backed verifier genesis re-runs (D5) — 'proven' iff a fact with this (shape,
        // testName) still appears in the unit's HEAD scan. genesis is the seal authority; this only supplies it.
        const verify = (_unitKey: string, testName: string, shape: TestVacuityShape): 'proven' | 'abstain' =>
          facts.some((f) => f.testName === testName && f.shape === shape) ? 'proven' : 'abstain';
        for (const f of facts) {
          const proposal: TestVacuityProposal = {
            kind: 'test-vacuity',
            unitKey: u.unitKey,
            testName: f.testName,
            shape: f.shape,
            grounding: { entries: [entryOf(u.anchor, u.path)] },
            tier: MINED_TIER as Tier, // the mined tier — a produced, advisory-class fact (mirrors the transition/sound-arm tier)
            scope: unitScopeOf(u.unitKey), // KNOW-11a authz scope — the unit's own containing directory; the door authorizes against it
          };
          // No `score` — a PRODUCED structural fact carries no obviousness (adapter-io has no harness door;
          // `ObviousnessScore.by` admits only 'harness-predicate'), exactly as a transition carries none.
          const node = trySoundTestVacuity(proposal, verify);
          if (node === undefined) {
            runs.push({ admitted: false, unitKey: u.unitKey, testName: f.testName, reason: 'the injected sound oracle did not re-prove the assertion-only-in-catch shape at HEAD' });
            continue;
          }
          // ROUTE THROUGH THE GOVERNED DOOR — the HEAD truth gate + KNOW-11 authz + ARCH-9 anchor + produced-only
          // apply here (the security fix). A refusal is a MEASURED persisted:false, never a throw.
          const out = emit(node, at);
          runs.push({
            admitted: true,
            unitKey: u.unitKey,
            testName: f.testName,
            persisted: out.emitted,
            ...(out.emitted ? { id: String(out.id) } : { reason: out.rejected ?? 'the governed door refused the write' }),
          });
        }
      } finally {
        doc.dispose(); // release the WASM handles the parse held open (ast.ts discipline)
      }
    }
    return runs;
  };
}
