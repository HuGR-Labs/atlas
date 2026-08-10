#!/usr/bin/env node
// @atlas/cli — src/bin.ts  (the `atlas` entrypoint: the composed runtime, driven over argv)
//
// The thin production entrypoint: `composeRuntime(process.cwd())` reads the repo at the cwd and returns THE
// one governed durable `WiredHandler`; `main` parses argv, routes through it, and returns a process exit
// code. The handler rides the existing `CliDeps.handler` seam (frozen `main(argv, deps?)` shape unchanged),
// so prod and tests share ONE surface — prod composes the real handler, tests inject a fake (WIRE-1).
import { composeRuntime, initAst } from '@atlas/adapter-io';
import { main } from './cli.js';

// Warm up the opt-in AST grammar ONCE at the composition driver (F1): `foldAstUnits` — the sync FileTree
// refinement `composeRuntime` folds before every `build` — reads module-level grammar singletons and is a
// no-op until `initAst()` resolves. Awaiting it HERE (the entrypoint) is why `composeRuntime` can stay sync
// yet still index `::` sub-file symbol nodes, so a symbol grounding is groundable and `subsumes` fires.
void (async () => {
  await initAst();
  const { handler, doctorSource, promote, own, relations, readRefusal } = composeRuntime(process.cwd());
  // The provenance refusal rides the same injected-deps seam as the handler (conditional spread keeps it
  // ABSENT on a healthy repo — exactOptionalPropertyTypes), so prod and tests share ONE surface. `promote`
  // (the KNOW-8 governed promotion leg) rides that same seam: it is not a `Tool`, so it cannot arrive through
  // the handler, and threading it here is what makes `atlas promote` REACHED rather than a reference model.
  // `own` (the RETR-12 briefing leg) rides it for exactly the same reason, and this line is the entire
  // difference between `@atlas/retrieval` being running code and being a well-tested library nothing calls:
  // before it, EVERY import of that package from another package's `src` was `import type`.
  process.exitCode = await main(process.argv.slice(2), {
    handler,
    doctorSource,
    promote,
    own,
    // `relations` (the #99a grounded-relation read leg) rides the same injected-deps seam as `own`, and for
    // the same reason: the CLI must not stand up a second runtime, or the relations it reads stop being the
    // ones off the store `atlas query` reads back. This line is what makes `relationsOf` running code.
    relations,
    ...(readRefusal !== undefined ? { readRefusal } : {}),
  });
})();
