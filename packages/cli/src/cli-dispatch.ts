// @atlas/cli — src/cli-dispatch.ts  (two before-handler interceptor blocks, pulled out of cli.ts VERBATIM)
//
// GODFILE RELIEF (WP-10.A2-a.CLI): `mine` and `verify-store` are the two LARGEST before-handler dispatch
// blocks in cli.ts (each carries a long WHY comment this repo's culture treats as load-bearing — see
// MEMORY "committed artifacts carry their own checkability" — trimming that prose was rejected as the fix;
// relocating it, unchanged, is not). Both are inert extractions: same imports, same control flow, same
// bytes on every branch — cli.ts's two call sites are now `return dispatchMine();` / `return
// dispatchVerifyStore(deps.reverify);` where the bodies used to sit inline.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHistorySource, memoryRecallVerdict, memoryHeaderVerdict, memoryAwarenessVerdict, memoryOrientationVerdict } from '@atlas/adapter-io';
import type { ReverifyReport } from '@atlas/adapter-io';
import type { Awareness, MemoryRecord, Orientation, TurnHeader } from '@atlas/memory';
import { runMineArms } from './mine.js';
import { runReverify } from './reverify.js';
import { renderRefusal } from './render.js';
import { emit, emitCli, errorVerdict, refusalVerdict } from './cli-verdict.js';

/**
 * CLI-4 / SOUND-DEFAULT-MINE: `mine` drives the FROZEN genesis run-controller (`runMineArms`) over the repo
 * at cwd. A DEFAULT run mines the SOUND-by-default union (advisory + dependency + count) as one governed
 * pass PER ARM; an explicit `ATLAS_MINE_SLOT` isolates a single arm (the bench harness). Each pass is the
 * frozen single-arm controller; the multi-arm loop lives at THIS driver level, and the outcome projects to a
 * MERGED `CliVerdict`. It routes NOT through `deps.handler` (genesis is its own
 * composed driver, mine.ts) but its rendered `CliVerdict` reaches the console over the SAME emit/exit path
 * as every other command (uniform bytes). Every mined write is CANDIDATE-only (GEN-4/12); never throws.
 * [ADR-0011] A misconfigured MODEL is not a mining outcome. It must stay loud — rendering it as
 * "0 candidate facts" would be indistinguishable from a repo that genuinely holds none — but a raw
 * stack trace is below this CLI's own bar. It is rendered through the SAME refusal path as every other
 * governed decline, carrying the loader's actionable message verbatim. Any OTHER throw is re-raised:
 * our own crash must not be dressed up as the caller's bad configuration (the #129 blame-shift).
 *
 * `ModelCommandError` (the command is missing / timed out / exited non-zero) is the THIRD name here, and
 * it reached this catch only after `mine.ts` started re-throwing it: it is raised inside a per-site
 * `visit`, and GEN-8c catches that bare, so the run used to end as an anonymous partial (`exit 1 ·
 * llmCalls 0 · resume at rank -1`) with neither the command name nor its stderr. Exit 2, like the other
 * two — a run that legitimately ran out of budget still exits 1 with its report, so the two are
 * distinguishable from the outside.
 *
 * `UnaddressableCasObjectError` (#140) is the FOURTH name here, and for the same shape of reason: the
 * candidate sidecar's write door (`@atlas/adapter-io` `sidecar-commit.ts`) throws it as its OWN
 * fail-closed floor when a decision names a CAS object the store cannot address — nothing durable is
 * written, but the throw crosses `drive.ts`'s per-site loop (`ports.upsert` at genesis GEN-8a, OUTSIDE
 * the per-site GEN-8c fault boundary, which only wraps `visit`) unrecognized. Left uncaught, the operator
 * gets a raw stack trace instead of a verdict — fail-closed-SILENT, contradicting ADR-0003's "a refusal
 * is FAIL-CLOSED-VISIBLE on both transports". The store's own message already carries the
 * `unaddressable-cas-object` discriminant verbatim (matching `governed-emit-address.ts`'s `commitRefusalOf`
 * re-file of the SAME error on the `emit` door), so it travels unchanged onto the `reason:` line.
 *
 * [WIRE-MINE-HISTORY, #243] The ONLY production caller of `runMineArms` — so THIS is the composition point
 * that decides whether the shipped ranking ever sees a real signal. Left uninjected, `mine.ts`'s
 * `history: deps?.history ?? defaultHistory()` always took the honest-empty fallback (zero commits, zero
 * frontier), and every mined signal — hotspot, coupling, blame — was built, tested in isolation, and dead
 * on this path (measured: `frontier()`/`signals()` never called with a real repo/rev outside a unit test).
 * `createHistorySource(repoPath, 'HEAD')` is injected ONCE here and threaded through `deps` to EVERY arm
 * `driveMineArms` drives (`{...deps, slot}`, mine-arms.ts) — one instance, still `probeHistory`'d fresh
 * per arm (measured cost below; no cache added — see the WP's anti-overengineering bound). `defaultHistory()`
 * stays the library-level fallback for every OTHER caller of `runMine`/`runMineArms` (tests, a non-git
 * tree, `@atlas/cli`'s public surface) — this injection touches only the CLI's own composition, not the
 * fallback's honesty.
 */
export async function dispatchMine(): Promise<number> {
  try {
    return emitCli(await runMineArms(process.cwd(), { history: createHistorySource(process.cwd(), 'HEAD') }));
  } catch (e) {
    const name = (e as { name?: unknown } | null)?.name;
    if (
      name !== 'ModelConfigError' &&
      name !== 'PromptError' &&
      name !== 'ModelCommandError' &&
      name !== 'UnaddressableCasObjectError'
    )
      throw e;
    return emitCli(renderRefusal(refusalVerdict((e as Error).message)));
  }
}

/**
 * REVERIFY-GATE: `atlas verify-store` — re-proves EVERY `seal:'proven'` fact in the durable store
 * against the live index, via the fact's OWN recorded witness. It drives the composition root's
 * `reverify` thunk — the SAME `verifyFact` oracle `atlas verify-fact` rides, no second oracle — and
 * renders the three-bucket report (`re-proven`/`broken`/`unverifiable`). Like `promote` it is a WRITE-
 * shaped command in NEITHER sense: it writes nothing (a READ door, `GOVERNANCE_SURFACE` stays 5) but its
 * exit code IS a governance signal (2 on any `broken`/`unverifiable` row) — see `reverify.ts`'s header.
 *
 * WRONG-DIR REFUSAL (task #244), checked BEFORE `reverify` is even consulted so an injected/fake
 * thunk can never mask it. `composeRuntime` (bin.ts) always composes against `process.cwd()` — never a
 * repo path this command was actually told about — so running `atlas verify-store` without `cd`-ing into
 * the target repo composes over a DIFFERENT directory entirely and, because `reverify-store.ts` has no
 * sealed facts to loop over there, renders the SAME "0 sealed-proven fact(s) — nothing to re-verify (an
 * honest zero, not a skip)" line a genuinely empty, real store would print. That wording is honest about
 * the WRONG subject: it answers "how many sealed facts does THIS directory hold" when the operator meant
 * a different directory. `verify-store`'s entire domain is `seal:'proven'` facts recorded under a repo's
 * OWN `.atlas/` — there is no legitimate way for it to have anything to say about a directory that does
 * not even have one, so refusing (rather than serving the indistinguishable zero) costs no real case:
 * unlike `query`/`doctor`/etc., which are useful structural tools even before a repo's first governed
 * write, `verify-store` before any write has ever happened has nothing to check either way.
 */
export function dispatchVerifyStore(reverify: (() => ReverifyReport) | undefined): number {
  const atlasDir = join(process.cwd(), '.atlas');
  if (!existsSync(atlasDir)) {
    return emitCli(
      renderRefusal(
        refusalVerdict(
          `no '.atlas/' directory at '${atlasDir}' — 'atlas verify-store' has nothing to re-verify here. ` +
            `Either this is not an Atlas repository, you have not run 'atlas init' / made any governed emit ` +
            `here yet, or you ran this command from the wrong directory. Refusing rather than printing the ` +
            `SAME "0 sealed-proven fact(s)" bytes a genuinely empty, real '.atlas/' store would print.`,
        ),
      ),
    );
  }
  if (!reverify) {
    return emit(errorVerdict('atlas runtime is not composed yet — the WireConfig seams need the composition-root WP'));
  }
  return emitCli(runReverify(reverify));
}

// ── WP-11.W8 / CAMPAIGN-11 — the four memory READ_SURFACE doors, pulled out here for the SAME LOC-relief
// reason `dispatchMine`/`dispatchVerifyStore` were: each is a short before-handler interceptor block, and
// housing all four beside their two siblings keeps cli.ts's own dispatch table to one line per command.

/** `atlas memory-recall [--owner o] [--kind k] [--task-id t] [--pr-id p]` — MEM-4b's ONE explicit-consult
 *  path. The query is built from whichever flags are present; an unqualified call (no flag at all) answers
 *  the empty set (`memoryRecallVerdict`/`recall` are both total — never a throw). */
export function dispatchMemoryRecall(
  recall: ((query: unknown) => readonly MemoryRecord[]) | undefined,
  flags: Readonly<Record<string, string>>,
): number {
  if (!recall) return emit(errorVerdict('atlas runtime is not composed yet — the WireConfig seams need the composition-root WP'));
  const query: Record<string, string> = {};
  if (flags['owner'] !== undefined) query['owner'] = flags['owner'];
  if (flags['kind'] !== undefined) query['kind'] = flags['kind'];
  if (flags['task-id'] !== undefined) query['taskId'] = flags['task-id'];
  if (flags['pr-id'] !== undefined) query['prId'] = flags['pr-id'];
  return emit(memoryRecallVerdict(recall, query));
}

/** `atlas memory-header` — MEM-1/4/7's per-seat running-turn header (no input). */
export function dispatchMemoryHeader(header: (() => TurnHeader) | undefined): number {
  if (!header) return emit(errorVerdict('atlas runtime is not composed yet — the WireConfig seams need the composition-root WP'));
  return emit(memoryHeaderVerdict(header));
}

/** `atlas memory-awareness` — the MEM-11/12 SHARED Awareness slab (no input). */
export function dispatchMemoryAwareness(awareness: (() => Awareness) | undefined): number {
  if (!awareness) return emit(errorVerdict('atlas runtime is not composed yet — the WireConfig seams need the composition-root WP'));
  return emit(memoryAwarenessVerdict(awareness));
}

/** `atlas memory-orientation` — the MEM-6 DERIVED, SHARED Orientation slab (no input). */
export function dispatchMemoryOrientation(orientation: (() => Orientation) | undefined): number {
  if (!orientation) return emit(errorVerdict('atlas runtime is not composed yet — the WireConfig seams need the composition-root WP'));
  return emit(memoryOrientationVerdict(orientation));
}
