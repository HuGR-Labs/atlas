#!/usr/bin/env node
// scripts/genesis/verify-fact.mjs
//
// The external PROVE-or-ABSTAIN probe the sound-genesis state-machine profile
// (`genesis-dependency-sound`) shells from its verify hook. It is the bridge between the hook's JSON
// contract (STDIN → one line of STDOUT) and Atlas's shipped deterministic symbol-reverse oracle
// (`createVerifyFactLeg` / `verifyDependency`, @atlas/adapter-io + @atlas/genesis).
//
// DESIGN MANDATE — "stripped, never a crash": every path (guard, oracle, thrown error) writes exactly ONE
// final line of JSON to stdout and exits 0. The hook parses the LAST stdout line as the verdict and treats a
// non-zero exit / crash DIFFERENTLY from a clean abstain, so this probe must be TOTAL: fail-closed to
// `abstain`, never crash, never exit non-zero, never write anything else to stdout.

import { readScipOrEmpty, createVerifyFactLeg } from '@atlas/adapter-io';

const emit = (verdict) => {
  process.stdout.write(JSON.stringify(verdict) + '\n');
  process.exit(0);
};

const abstain = (reason) => emit({ verdict: 'abstain', oracle: 'symbol-reverse', reason });

const isNonEmptyString = (x) => typeof x === 'string' && x.length > 0;

const readStdin = () =>
  new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });

async function main() {
  const raw = await readStdin();
  const req = JSON.parse(raw);
  const { class: factClass, sourceScope, target, worldScope, scipPath } = req;

  // GUARD (fail-closed): only the `dependency` class is decidable here, and every field must be a
  // non-empty string. Anything else is malformed — abstain, exit 0.
  if (
    factClass !== 'dependency' ||
    !isNonEmptyString(target) ||
    !isNonEmptyString(sourceScope) ||
    !isNonEmptyString(worldScope) ||
    !isNonEmptyString(scipPath)
  ) {
    return abstain('malformed');
  }

  // ORACLE. A missing/empty index yields an empty ScipOutput → the oracle abstains soundly; that is NOT an
  // error. The feed + oracle are pure and total (never throw), so `v` is always a well-formed FactVerdict.
  const scip = readScipOrEmpty(scipPath);
  const leg = createVerifyFactLeg(scip, { indexerName: 'scip-typescript' });
  const v = leg({ kind: 'dependency', claim: { sourceScope, target, worldScope } });

  // STDOUT — exactly one final line: the verdict + oracle, plus `reason` only when the oracle emitted one.
  return emit({ verdict: v.verdict, oracle: v.oracle, ...(v.reason ? { reason: v.reason } : {}) });
}

main().catch(() => {
  // TOTALITY: any thrown error (unreadable stdin, malformed JSON, an unexpected oracle throw) is a clean,
  // fail-closed abstain — never a crash, never a non-zero exit.
  abstain('probe-error');
});
