// @atlas/adapter-io — src/scip.ts  (ADAPT-SCIP-1/2: read a SCIP dump + plan the per-language indexers)
//
// The raw scip adapter: read an external `scip.proto` dump into the frozen `ScipOutput` projection
// (@atlas/index) and plan which indexer to run per language. Implemented — WP-9.1.1-b.SCIP (tests: scip.test.ts).

import { existsSync, readFileSync, statSync } from 'node:fs';
import { deserializeSCIP, SymbolRole } from '@c4312/scip';
import type { ScipOutput } from '@atlas/index';

/** The languages the indexer planner knows about (ring shape — constitution D2). */
export type LangId = 'ts' | 'py' | 'go' | 'java' | 'rust' | 'rb';

/**
 * One planned per-language SCIP indexer invocation (ring shape — constitution D2).
 *
 * `args` USED TO BE EMPTY on every plan, which made this a name and not a command. REQ-INDEX-3a requires the
 * axes to be derived "via a per-language SCIP indexer (SCIP-primary; a separate installed, version-pinned
 * binary per language)", and a plan that names a tool with no arguments and no version discharges neither
 * half: nobody can run it, and nobody can tell whether what they DID run is the release it was written
 * against. Both are now carried, so `atlas doctor index` can print a line an operator pastes verbatim.
 */
export interface IndexerPlan {
  readonly lang: LangId;
  readonly tool: string;
  readonly args: readonly string[];
  /** The PINNED release of `tool` this plan was written against and MEASURED with. ABSENT for the
   *  `honest-hole` sentinel, which names no binary and therefore pins no version. */
  readonly version?: string;
}

/**
 * The bytes of a SCIP dump, read ONLY when the path is a REGULAR FILE.
 *
 * WHY THE TYPE CHECK IS THE GUARD, and why the existing try/catch was not one. `readFileSync` on a
 * character device reads until EOF, and `/dev/zero` has none: the call never returns, never throws, and
 * never allocates enough to be killed — measured at 3 minutes still spinning, and 60s of the real `atlas`
 * bin producing no stdout, no stderr and no exit. `readScipOrEmpty` absorbs THROWS (a missing dump, a
 * corrupt one); a read that does not return is outside what any `catch` can see.
 *
 * That is reachable from a COMMITTED artifact, which is the whole reason it matters. `.atlas/index.scip`
 * is deliberately EXEMPT from the durable-store provenance refusal (`store-provenance.ts`
 * `isDurableStorePath`) because it is a build input, and `atlas init`'s ignore rule un-ignores it by name.
 * Git tracks symlinks (mode `120000`), so "ship a dump" and "ship a symlink named like a dump" are one
 * act — and BOTH entrypoints read this path at STARTUP (`composeRuntime`, `assembleHandler`), so the CLI
 * and the MCP server are bricked before any door opens, silently. `wire.ts` already names this exact
 * hazard one door over ("an unbounded file like /dev/zero … can never hang/OOM") and guards the `atlas
 * node` content address against it; the guard was never applied to the dump.
 *
 * `statSync` FOLLOWS the link deliberately — a symlink pointing at a real `.scip` is a legitimate build
 * layout and stays supported. What is refused is the TARGET not being a regular file: a character/block
 * device, a FIFO, a socket, a directory. Refused by THROWING, so the one shared degrade below
 * (`readScipOrEmpty` ⇒ `{documents: []}`, a files-only index) covers it with no second failure path —
 * the same outcome a missing or corrupt dump already produces.
 *
 * WHAT THIS DOES NOT BOUND, stated because it would otherwise read as a size guard: a genuinely enormous
 * REGULAR file is still read whole. That case is self-limiting and visible — the bytes have to exist in
 * the repository — whereas the device symlink costs 9 bytes and is unbounded.
 */
function scipBytes(scipPath: string): Uint8Array {
  const stat = statSync(scipPath); // throws on a dangling link ⇒ absorbed by the degrade, like any ENOENT
  if (!stat.isFile()) {
    throw new Error(
      `scip: '${scipPath}' is not a regular file — a device, FIFO, socket or directory is not an indexer ` +
        'dump, and reading one can block forever (a git-tracked symlink to /dev/zero bricks both bins at boot)',
    );
  }
  return readFileSync(scipPath);
}

/** Read a per-language SCIP indexer dump into the minimal frozen `ScipOutput` projection (ADAPT-SCIP-1). */
export function readScip(scipPath: string): ScipOutput {
  const index = deserializeSCIP(scipBytes(scipPath));
  return {
    documents: index.documents.map((doc) => ({
      relativePath: doc.relativePath,
      occurrences: doc.occurrences.map((occ) => ({
        symbol: occ.symbol,
        role: (occ.symbolRoles & SymbolRole.Definition) !== 0 ? 'definition' : 'reference',
      })),
    })),
  };
}

/**
 * Read the optional SCIP dump at `scipPath`, DEGRADING to the empty projection (`{ documents: [] }`) when
 * the dump cannot be projected — NEVER a throw. Both failure modes fold to the SAME files-only structural
 * view:
 *   • MISSING file      — a fresh repo with no `.atlas/index.scip` yet (`readScip` → `statSync` ENOENT).
 *   • NOT-A-REGULAR-FILE — a git-tracked symlink to a device/FIFO (see `scipBytes`): the read would never
 *     return, so the path is refused BEFORE any byte is read rather than absorbed after the fact.
 *   • PRESENT-but-corrupt — garbage bytes, a truncated protobuf, or a foreign/stale schema that makes
 *     `deserializeSCIP` THROW. Fail CLOSED here rather than at boot: `wire.ts` (`assembleHandler`) and
 *     `compose.ts` (`composeRuntime`) BOTH read the `.scip` at startup through this ONE shared guard, so an
 *     unguarded deserialize would crash BOTH bins on a corrupt index. Degrading loses symbol granularity
 *     (files-only), it never crashes.
 * The valid-SCIP happy path is byte-identical to `readScip` (only the throwing paths are absorbed).
 */
export function readScipOrEmpty(scipPath: string): ScipOutput {
  if (!existsSync(scipPath)) return { documents: [] };
  try {
    return readScip(scipPath);
  } catch {
    return { documents: [] };
  }
}

/**
 * Where EVERY reader in the ring looks for the dump, repo-relative and POSIX-slashed
 * (`compose.ts` / `skeleton-source.ts` / `wire.ts` all resolve `join(repoPath, '.atlas', 'index.scip')`).
 * It is declared HERE because the planned `--output` argument below has to name the SAME path the reader
 * opens, and a planned command that writes the dump anywhere else is worse than no plan at all: the
 * indexer succeeds, the operator believes the repository is indexed, and `axes.edges` stays empty.
 */
export const SCIP_INDEX_REL = '.atlas/index.scip';

/** One CONFIGURED per-language indexer: the binary, the release it is pinned to, and the arguments that
 *  make it a runnable command. ONE row per language — the tool, its pin and its arguments cannot drift
 *  apart because there is nowhere for them to drift to. */
interface ConfiguredIndexer {
  readonly tool: string;
  readonly version: string;
  readonly args: readonly string[];
}

/**
 * The real per-language SCIP indexer tools the ring knows how to run (constitution adapt-scip-2, D1:
 * web-tree-sitter + SCIP only — deliberately NO 'stack-graphs', which the stale core `MECHANISMS`
 * constant still lists; this dispatch is the live selector and supersedes it). A `LangId` absent from
 * this map has no configured indexer ⇒ the honest-hole sentinel (files-only structural hole).
 *
 * THE PINS ARE MEASURED, not looked up: both binaries were installed at these versions and probed with
 * `--version` and `index --help` while this table was written, and the `ts` row was RUN over this
 * repository end-to-end (`.atlas/index.scip`, 11 MB, 200 mine sites where there had been 0). `--output` is
 * resolved relative to the process working directory in BOTH tools — `scip-python --help` says so
 * outright — so the command is documented to be run from the repository root, which is also the only
 * directory from which `SCIP_INDEX_REL` denotes the path the reader opens.
 *
 * ATLAS NEVER RUNS THESE. The row is a PLAN that `atlas doctor index` prints for the operator to run; no
 * code path in this repository spawns an indexer, deliberately (see `docs/reference/commands/doctor.md`).
 */
const REAL_INDEXER: Partial<Record<LangId, ConfiguredIndexer>> = {
  ts: { tool: 'scip-typescript', version: '0.4.0', args: ['index', '--output', SCIP_INDEX_REL] },
  py: { tool: 'scip-python', version: '0.6.6', args: ['index', '--output', SCIP_INDEX_REL] },
};

/** The sentinel tool for a language with no configured indexer: it contributes its files to the
 *  `FileTree` only (an honest structural hole), never routed to another language's indexer. Exported so a
 *  caller can split a plan list on the DISCRIMINANT rather than on a substring of a rendered line. */
export const HONEST_HOLE = 'honest-hole';

/**
 * Plan which indexer to run for each requested language (ADAPT-SCIP-2). TOTAL dispatch: every input
 * `LangId` maps to exactly ONE plan — a real per-language indexer when one is configured, otherwise the
 * `honest-hole` sentinel. Never routes an un-indexed language to another language's indexer; never emits
 * 'stack-graphs'. Order + arity mirror the input (one plan per input lang, in order).
 */
export function planIndexers(langs: LangId[]): IndexerPlan[] {
  return langs.map((lang) => {
    const configured = REAL_INDEXER[lang];
    return configured === undefined
      ? { lang, tool: HONEST_HOLE, args: [] }
      : { lang, tool: configured.tool, args: configured.args, version: configured.version };
  });
}

/**
 * Merge per-language `.scip` reader outputs into one `ScipOutput` (ADAPT-SCIP-2). A PURE concat of the
 * per-language `documents` — faithful: never drops or fabricates a document, and performs NO
 * cross-language dedup (edge dedup is the build's job, `deriveEdges` in @atlas/index). Preserves
 * INDEX-13 cross-language honesty: an un-indexed language simply contributes no documents here (its
 * files are still in the `FileTree`), and no other language's occurrences are altered.
 */
export function mergeScip(outputs: readonly ScipOutput[]): ScipOutput {
  return { documents: outputs.flatMap((o) => o.documents) };
}
