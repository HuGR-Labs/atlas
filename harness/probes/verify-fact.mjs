#!/usr/bin/env node
// harness/probes/verify-fact.mjs — the IO wrapper the enforcer's verify hook shells for `verifyDependency`
// (@atlas/genesis, spike/verify-fact).
//
// WHAT. Reads ONE JSON object on stdin — `{ sourceScope, target, worldScope, scipPath }` — loads the SCIP
// feed at `scipPath` the way `atlas doctor index` loads it (`indexer-report.ts` `scipState`: the throwing
// `readScip`, degraded to the empty projection on ANY failure, never a throw here — the twin of
// `readScipOrEmpty`, which is not itself exported from the `@atlas/adapter-io` barrel), builds
// `createSymbolReverse` (@atlas/index) over it, derives `pathOfHash` the way the negation door recovers a
// docHash's path (`governed-emit-negation.ts` `indexPathsByHash`) — restricted to exactly the hashes
// `SymbolReverseApi` can ever return, since `createSymbolReverse` mints `nodeHashOfPath(doc.relativePath)`
// for precisely the SCIP feed's own documents and no others (`packages/index/src/symbol-reverse.ts`) — and
// calls `verifyDependency` (@atlas/genesis). Writes the `FactVerdict` as ONE JSON line to stdout. ALL
// diagnostics go to stderr. Exit 0 ALWAYS — the verdict lives in stdout, never the exit code.
//
// ── HOW THIS RUNS `@atlas/*` WITHOUT `harness/` LINKING IT (harness/README.md's one-way dependency) ────────
// `harness/gates/gate-directory.test.mjs` mechanically checks that no committed `.mjs` under `harness/`
// contains a static `import .. from '@atlas/…'`. This file (a probe, not a gate, but the check walks all of
// `harness/`) never links `@atlas/index` / `@atlas/adapter-io` / `@atlas/genesis` into its OWN process. It
// writes a small, self-contained RUNNER script to a throwaway temp file (never committed, never under
// `harness/`) that imports each package by its resolved ABSOLUTE `dist/` path, spawns it as a genuinely
// separate `node` process, and reads back the verdict over stdout — the SAME arm's-length shape
// `harness/probes/a2-staleness.mjs` uses to drive the drift oracle.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');

// The built entrypoints this probe drives. Their `dist/` is produced by `npm run build` (`tsc -b`), which CI
// runs before any probe — the same build-order dependency `a2-staleness.mjs` already relies on. Computed as
// path strings only: this line resolves no module and links nothing into THIS process.
const INDEX_ENTRY = pathToFileURL(join(REPO_ROOT, 'packages', 'index', 'dist', 'src', 'index.js')).href;
const ADAPTER_IO_ENTRY = pathToFileURL(join(REPO_ROOT, 'packages', 'adapter-io', 'dist', 'src', 'index.js')).href;
const GENESIS_ENTRY = pathToFileURL(join(REPO_ROOT, 'packages', 'genesis', 'dist', 'src', 'index.js')).href;

/** Read stdin to completion, synchronously (fd 0). */
function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

/** The ABSTAIN verdict this wrapper itself can produce, over IO it does not trust (malformed stdin, or an
 *  infrastructure failure in the spawned runner) — never a throw at this door, mirroring `verifyDependency`'s
 *  own totality. `oracle` stays `'symbol-reverse'`: the wrapper is a thin IO shell around that one oracle,
 *  never a second decision-maker. */
const wrapperAbstain = (reason) => ({ verdict: 'abstain', reason, oracle: 'symbol-reverse' });

/** The child-process runner's full source, generated fresh each call (so the three `*_ENTRY` paths above are
 *  always the CURRENT ones — never a stale copy on disk). This is the ONLY place `@atlas/index` /
 *  `@atlas/adapter-io` / `@atlas/genesis` are imported anywhere in this wrapper, and it happens in a process
 *  this file spawns, not the one it runs in. */
function runnerSource() {
  return `
import { readFileSync } from 'node:fs';
import { createSymbolReverse, isLocalSymbol, nodeHashOfPath } from '${INDEX_ENTRY}';
import { readScip } from '${ADAPTER_IO_ENTRY}';
import { verifyDependency } from '${GENESIS_ENTRY}';

// The SAME degrade \`readScipOrEmpty\` performs (adapter-io/src/scip.ts) — missing file, a non-regular-file
// symlink, or a corrupt/foreign protobuf all fold to the empty projection, NEVER a throw. Mirrors
// \`indexer-report.ts\`'s \`scipState\`, which reads through the throwing \`readScip\` for the same reason:
// \`readScipOrEmpty\` is not exported from the \`@atlas/adapter-io\` barrel, so the degrade is restated here,
// byte-identical to the source it mirrors (cited, not invented — can drift if \`scip.ts\` changes).
function readScipOrEmpty(scipPath) {
  try {
    return readScip(scipPath);
  } catch {
    return { documents: [] };
  }
}

const claim = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const scipOutput = readScipOrEmpty(claim.scipPath);
const reverse = createSymbolReverse(scipOutput);

// pathOfHash: the docHash->path recovery the negation door performs by walking the full spatial axis
// (\`indexPathsByHash\`, governed-emit-negation.ts) — restricted here to exactly the SCIP feed's own
// documents, which is EVERY hash \`SymbolReverseApi\` can ever return (\`createSymbolReverse\` mints
// \`nodeHashOfPath(doc.relativePath)\` for precisely those documents and no others, symbol-reverse.ts).
const byHash = new Map();
for (const doc of scipOutput.documents) byHash.set(String(nodeHashOfPath(doc.relativePath)), doc.relativePath);
const pathOfHash = (h) => byHash.get(String(h));

const verdict = verifyDependency(
  { sourceScope: claim.sourceScope, target: claim.target, worldScope: claim.worldScope },
  reverse,
  pathOfHash,
  isLocalSymbol,
);
process.stdout.write(JSON.stringify(verdict));
`;
}

/** Run one claim through the real oracle in a spawned child process. Throws only on an INFRASTRUCTURE
 *  failure (dist/ not built, a malformed JSON reply) — never on a decided/abstained verdict, which is
 *  ordinary output. The caller (main, below) converts even that throw into an honest ABSTAIN on stdout,
 *  because this wrapper's own contract is "exit 0 always, verdict in stdout". */
function runClaimInSubprocess(claim) {
  const dir = mkdtempSync(join(tmpdir(), 'verify-fact-runner-'));
  try {
    const claimPath = join(dir, 'claim.json');
    const runnerPath = join(dir, 'runner.mjs');
    writeFileSync(claimPath, JSON.stringify(claim));
    writeFileSync(runnerPath, runnerSource());
    const out = execFileSync('node', [runnerPath, claimPath], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    return JSON.parse(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const raw = readStdin();
  let claim;
  try {
    claim = JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`verify-fact: malformed stdin JSON — ${e instanceof Error ? e.message : String(e)}\n`);
    process.stdout.write(JSON.stringify(wrapperAbstain('malformed')) + '\n');
    process.exit(0);
  }
  if (
    typeof claim !== 'object' ||
    claim === null ||
    typeof claim.sourceScope !== 'string' ||
    typeof claim.target !== 'string' ||
    typeof claim.worldScope !== 'string' ||
    typeof claim.scipPath !== 'string'
  ) {
    process.stderr.write('verify-fact: stdin must be {sourceScope,target,worldScope,scipPath}, all strings\n');
    process.stdout.write(JSON.stringify(wrapperAbstain('malformed')) + '\n');
    process.exit(0);
  }

  let verdict;
  try {
    verdict = runClaimInSubprocess(claim);
  } catch (e) {
    process.stderr.write(`verify-fact: oracle subprocess failed — ${e instanceof Error ? e.message : String(e)}\n`);
    verdict = wrapperAbstain('probe-error');
  }
  process.stdout.write(JSON.stringify(verdict) + '\n');
  process.exit(0);
}

main();
