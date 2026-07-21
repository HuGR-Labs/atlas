// @atlas/adapter-io — src/scip.ts  (ADAPT-SCIP-1/2: read a SCIP dump + plan the per-language indexers)
//
// The raw scip adapter: read an external `scip.proto` dump into the frozen `ScipOutput` projection
// (@atlas/index) and plan which indexer to run per language. Implemented — WP-9.1.1-b.SCIP (tests: scip.test.ts).

import { existsSync, readFileSync } from 'node:fs';
import { deserializeSCIP, SymbolRole } from '@c4312/scip';
import type { ScipOutput } from '@atlas/index';

/** The languages the indexer planner knows about (ring shape — constitution D2). */
export type LangId = 'ts' | 'py' | 'go' | 'java' | 'rust' | 'rb';

/** One planned per-language SCIP indexer invocation (ring shape — constitution D2). */
export interface IndexerPlan {
  readonly lang: LangId;
  readonly tool: string;
  readonly args: readonly string[];
}

/** Read a per-language SCIP indexer dump into the minimal frozen `ScipOutput` projection (ADAPT-SCIP-1). */
export function readScip(scipPath: string): ScipOutput {
  const index = deserializeSCIP(readFileSync(scipPath));
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
 *   • MISSING file      — a fresh repo with no `.atlas/index.scip` yet (`readScip` → `readFileSync` ENOENT).
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

/** The real per-language SCIP indexer tools the ring knows how to run (constitution adapt-scip-2, D1:
 *  web-tree-sitter + SCIP only — deliberately NO 'stack-graphs', which the stale core `MECHANISMS`
 *  constant still lists; this dispatch is the live selector and supersedes it). A `LangId` absent from
 *  this map has no configured indexer ⇒ the honest-hole sentinel (files-only structural hole). */
const REAL_INDEXER: Partial<Record<LangId, string>> = {
  ts: 'scip-typescript',
  py: 'scip-python',
};

/** The sentinel tool for a language with no configured indexer: it contributes its files to the
 *  `FileTree` only (an honest structural hole), never routed to another language's indexer. */
const HONEST_HOLE = 'honest-hole';

/**
 * Plan which indexer to run for each requested language (ADAPT-SCIP-2). TOTAL dispatch: every input
 * `LangId` maps to exactly ONE plan — a real per-language indexer when one is configured, otherwise the
 * `honest-hole` sentinel. Never routes an un-indexed language to another language's indexer; never emits
 * 'stack-graphs'. Order + arity mirror the input (one plan per input lang, in order).
 */
export function planIndexers(langs: LangId[]): IndexerPlan[] {
  return langs.map((lang) => ({ lang, tool: REAL_INDEXER[lang] ?? HONEST_HOLE, args: [] }));
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
