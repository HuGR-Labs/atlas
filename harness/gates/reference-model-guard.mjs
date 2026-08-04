#!/usr/bin/env node
// reference-model-guard — the REFERENCE-MODEL LEDGER. Nothing stops a fifth one; this does.
//
// This tree carries two kinds of module that look identical in an editor:
//
//   SHIPPED    — something a user reaches. `atlas emit` runs it.
//   REFERENCE  — a specification artifact. It compiles, it is exported from its barrel, it has a rigorous
//     MODEL      test suite, and NO production code calls it. It exists to state an invariant executably.
//
// Confusing the two has cost real work here. A suite over `packages/tools/src/guard.ts` was driven to zero
// surviving mutants and raised ZERO shipped confidence, because the door the CLI actually uses is
// `packages/adapter-io/src/store.ts` and `guard.ts` has no production caller at all. The vocabulary read as
// coverage. Fifty-four modules across nine packages are in that state; the ledger below is all of them.
//
// So: reference models are LEGAL, and each one is written down. A module that becomes one without being
// written down fails this gate. Nothing here deletes code and nothing here wires code — the ledger only
// forces the classification to be DECLARED rather than discovered by the next reviewer.
//
// ── WHAT IT FORBIDS ──────────────────────────────────────────────────────────────────────────────────
//   (1) A NEW reference model  — a module whose exported values acquire zero production callers, absent
//                                from the ledger below. This is the "fifth one" leg.
//   (2) LEDGER DRIFT           — a listed module whose count of zero-caller value exports changed. Adding
//                                a dead export to an already-dead module is exactly how these grew.
//   (3) A STALE ENTRY          — a listed module that is now value-reachable, or gone. Delete the entry;
//                                a ledger that only ever grows is a ledger nobody reads.
//   (4) MISCLASSIFIED REACH    — `types:` on an entry must match the measured TYPE reachability. See below.
//   (5) ILLEGIBILITY           — `banner:` and `shipped:` are REQUIRED on every entry. `banner:` is checked
//                                against the file in BOTH directions, and the marker must sit in a COMMENT
//                                in the first 40 lines — a header, not a substring anywhere in the file.
//                                A non-null `shipped:` must name an existing FILE. Legs 1-4 defend the
//                                COUNT; this one defends the READER, which is what the finding was about.
//
// ── TYPE-ONLY IS NOT DEAD ────────────────────────────────────────────────────────────────────────────
// `packages/tools/src/transport.ts` is reachable — but ONLY through `import type { PhasePushSource }` at
// `packages/adapter-io/src/poke-file.ts`. Its TYPES are a live contract; its VALUES (`createTransport`)
// never run. Calling that "dead" would be wrong and would get the entry deleted along with a real seam.
// Seven modules are in that state and carry `types: true`. The distinction is compiler-enforced, not guessed:
// this repo builds with `verbatimModuleSyntax: true`, under which a type-only import MUST be written
// `import type` / `import { type X }`, so the syntax and the emit cannot disagree. The analyser was
// nonetheless cross-checked against the emitted `dist/**/src/**.js` (types already erased by tsc) and the
// two agreed on all 54 modules. See harness/lib/reachability.mjs.
//
// ── LIMITS, STATED ───────────────────────────────────────────────────────────────────────────────────
// Reachability is DIRECT, not transitive from an entrypoint (reachability.mjs says why). A closed ring of
// modules that import each other passes even if nothing outside reaches the ring — `@atlas/memory` and
// `@atlas/retrieval` are in exactly that state today and the ledger says so in their cluster headers.
// And a dead export added to a module that is otherwise LIVE is not caught (`mergeScip` in scip.ts).
// Both are separate diseases from "a whole module is a specification artifact"; neither is claimed here.
//
// Run: `node harness/gates/reference-model-guard.mjs` (no build needed — it reads source only).

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { referenceModels } from '../lib/reachability.mjs';

const ROOT = process.env.REFERENCE_MODEL_GUARD_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PKGS = join(ROOT, 'packages');

/** The fixed header marker a declared reference model must carry. Deliberately a section RULE and not a
 *  bare word: `REFERENCE MODEL` alone appears in ordinary prose all over this repo. */
const BANNER_MARKER = '── REFERENCE MODEL';

/** How far into a file a HEADER may reach. The six banners on the tree place their marker at lines 7-14
 *  and their back-reference at lines 20-26, all inside the module's opening comment block; 40 clears that
 *  with room and still refuses a marker parked at the bottom of a 200-line file. */
const HEADER_LINES = 40;

/**
 * Does this source carry a reference-model banner in its HEADER — both the marker and a back-reference to
 * this ledger, inside the file's LEADING COMMENT BLOCK, within the first HEADER_LINES lines?
 *
 * The comment ranges come from the TypeScript scanner, not from a line pattern. Two earlier revisions of
 * this check were fooled in the same way the analyser was: a whole-file `includes` accepted the marker in
 * a string literal, and its replacement — filtering lines on `/^\s*(\/\/|\*|\/\*)/` — accepted the marker
 * on the interior lines of a MULTI-LINE STRING, which satisfy that pattern perfectly. A template literal
 * is not a comment; only a real parser reliably knows the difference, and one is already a dependency.
 */
function hasHeaderBanner(text) {
  const cutoff = text.split('\n', HEADER_LINES).join('\n').length;
  // The MARKER's offset must be inside the header, not merely the comment's opening brace. Filtering on
  // `r.pos` alone accepted a single block comment opened at line 1 with the marker parked at line 200 —
  // technically a leading comment, and nothing a reader would ever call a header.
  const at = (needle) =>
    (ts.getLeadingCommentRanges(text, 0) ?? []).some((r) => {
      const i = text.indexOf(needle, r.pos);
      return i >= 0 && i < r.end && i < cutoff;
    });
  return at(BANNER_MARKER) && at('reference-model-guard');
}

/**
 * THE LEDGER. `values` = how many exported VALUES the module has with zero production callers (which, for
 * every module here, is all of them). `types: true` = its declarations ARE consumed elsewhere.
 * `shipped` names the module that actually does the job in the product, where one exists — and where it
 * does not, that is stated instead of implied. Counts are MEASURED (see the header of each cluster).
 */
const LEDGER = {
  // ── @atlas/tools — the port layer. 5 of its 13 modules are specification artifacts. Each names the ────
  //    frozen interface it witnesses; the composition root (adapter-io/src/wire.ts) value-imports only
  //    createHandler / createInit / createQuery / createReconcile from this package, and nothing anywhere
  //    in `packages/<pkg>/src` imports any of the five modules below as a value.
  'packages/tools/src/guard.ts': { values: 2, shipped: 'packages/adapter-io/src/store.ts', banner: true },
  'packages/tools/src/emit.ts': { values: 1, types: true, shipped: 'packages/adapter-io/src/governed-emit.ts', banner: true },
  'packages/tools/src/transport.ts': { values: 4, types: true, shipped: ['packages/cli/src/cli.ts', 'packages/mcp-server/src/server.ts'], banner: true },
  'packages/tools/src/push.ts': { values: 2, shipped: null, banner: true }, // TOOLS-14 phase push: no product path exists
  'packages/tools/src/diff.ts': { values: 2, shipped: null, banner: true }, // atlas-diff is wired to NEITHER transport (see the barrel note)

  // ── @atlas/adapter-io — the outer ring, where a reader is most likely to assume "shipped". ────────────
  'packages/adapter-io/src/poke-file.ts': { values: 3, shipped: null, banner: true }, // the third transport; nothing constructs it (task #36)

  // ── @atlas/memory — a CLOSED PACKAGE. No module anywhere outside `packages/memory` value-imports it; ──
  //    the sole cross-package edge is one `import type` in genesis/src/seed.ts. Its internal modules make
  //    each other look live (the direct-reachability limit above), so the ledger under-counts here.
  'packages/memory/src/awareness.ts': { values: 11, shipped: null, banner: false },
  'packages/memory/src/inject.ts': { values: 6, shipped: null, banner: false },
  'packages/memory/src/kinds.ts': { values: 3, shipped: null, banner: false },
  'packages/memory/src/logbook.ts': { values: 6, shipped: null, banner: false },
  'packages/memory/src/orient.ts': { values: 10, shipped: null, banner: false },
  'packages/memory/src/portable.ts': { values: 5, shipped: null, banner: false },
  'packages/memory/src/respawn.ts': { values: 8, shipped: null, banner: false },
  'packages/memory/src/rules.ts': { values: 17, shipped: null, banner: false },

  // ── @atlas/retrieval — NO LONGER CLOSED, and the ledger is how we found out. ──────────────────────────
  //    It was closed for the package's whole life: every cross-package edge into it was an `import type`,
  //    so the pack the product served came from adapter-io/src/retrieval-model.ts and `own.ts` was a model
  //    of a door nothing opened. `own-source.ts` now VALUE-imports `createOwn` / `ownToolName` to compose
  //    `atlas own <scope>`, so `own.ts` moved dead → live and this gate FAILED with STALE LEDGER ENTRY —
  //    exactly the direction it exists to catch, and the only reason the transition is on the record.
  //    The REST of the package is still closed; `retrieval-model.ts` is still the pack assembler.
  'packages/retrieval/src/drop.ts': { values: 9, shipped: null, banner: false },
  'packages/retrieval/src/ledger.ts': { values: 4, shipped: null, banner: false },
  'packages/retrieval/src/offatlas.ts': { values: 1, shipped: null, banner: false },
  // own.ts is DELETED from this ledger, not set to zero: it has production callers and is no longer a
  // reference model. Measured with this gate's own analyser — 54 → 53 entries, own.ts absent, every other
  // retrieval row unchanged (drop 9, ledger 4, offatlas 1, pack 5, poke 5, relate 6).
  'packages/retrieval/src/pack.ts': { values: 5, types: true, shipped: 'packages/adapter-io/src/retrieval-model.ts', banner: false },
  'packages/retrieval/src/poke.ts': { values: 5, shipped: null, banner: false },
  'packages/retrieval/src/relate.ts': { values: 6, shipped: null, banner: false },

  // ── @atlas/persist — one value edge crosses into this package in the whole tree (`NOTES_REF`, read by ─
  //    adapter-io/src/git-forge.ts). Everything below states a persistence invariant nothing executes.
  // 1 -> 2: `UnaddressableAttachmentError` joined `createAttach`. JUSTIFIED, and the gate was right to ask.
  // Task #136 measured that `attach()` handed back `{hash: ''}` for an object the CAS cannot address — a
  // receipt for a body it never stored — and added a named refusal. The module still has ZERO production
  // callers (probe: 251 loads, 0 calls), so this is a guard on a path only an embedder of the barrel takes.
  // That is exactly the state this ledger exists to keep visible: hardening a reference model is legal, and
  // it must not be mistaken for hardening the shipped path.
  'packages/persist/src/attach.ts': { values: 2, shipped: null, banner: false },
  'packages/persist/src/diff.ts': { values: 4, shipped: null, banner: false },
  'packages/persist/src/merge.ts': { values: 8, shipped: null, banner: false },
  'packages/persist/src/metering.ts': { values: 1, shipped: null, banner: false },
  'packages/persist/src/placement.ts': { values: 6, shipped: null, banner: false },
  'packages/persist/src/provenance.ts': { values: 2, shipped: null, banner: false },
  'packages/persist/src/reconstruct.ts': { values: 11, shipped: null, banner: false },
  'packages/persist/src/reinvoke.ts': { values: 2, shipped: null, banner: false },
  'packages/persist/src/source.ts': { values: 4, shipped: null, banner: false },
  'packages/persist/src/transcript-store.ts': { values: 4, shipped: null, banner: false },

  // ── @atlas/genesis — PARTLY wired: `packages/cli/src/mine.ts` value-imports makeRunController / ───────
  //    createScan / createMine / runExtract / admit. The modules below are the un-wired remainder.
  'packages/genesis/src/align.ts': { values: 7, shipped: null, banner: false },
  'packages/genesis/src/cost-policy.ts': { values: 13, shipped: null, banner: false },
  'packages/genesis/src/loops.ts': { values: 8, shipped: null, banner: false },
  'packages/genesis/src/seed.ts': { values: 5, shipped: null, banner: false },
  'packages/genesis/src/usefulness.ts': { values: 2, shipped: null, banner: false },

  // ── @atlas/grounding — PARTLY wired: `driftDetect` / `bindGate` / `isGrounded` / `ground` reach ────────
  //    adapter-io. `ground` joined them when the mine admission supply landed: the GROUND-3 anchor builder
  //    re-derives each mined receipt against the pass's own axes, which is what lets a structural seed's
  //    dep-axis identity reach a verdict `driftDetect` will accept. Its entry is DELETED, not amended —
  //    a shipped module is not a reference model, and leaving the row would make the ledger lie in the
  //    direction that hides real code.
  'packages/grounding/src/emit-guard.ts': { values: 2, shipped: 'packages/adapter-io/src/governed-emit.ts', banner: false },
  'packages/grounding/src/freshness.ts': { values: 2, shipped: null, banner: false },
  'packages/grounding/src/subtree.ts': { values: 1, shipped: null, banner: false },

  // ── @atlas/index — PARTLY wired: build / createResolve / createDepgraph / nodeHashOfPath reach wire.ts.
  'packages/index/src/cas.ts': { values: 1, types: true, shipped: 'packages/adapter-io/src/store.ts', banner: false },
  'packages/index/src/compose.ts': { values: 1, shipped: 'packages/adapter-io/src/wire.ts', banner: false },
  'packages/index/src/coverage.ts': { values: 2, shipped: null, banner: false },
  'packages/index/src/fold.ts': { values: 4, types: true, shipped: null, banner: false },
  'packages/index/src/ownership.ts': { values: 2, shipped: null, banner: false },

  // ── @atlas/knowledge — PARTLY wired: currentNodes / deriveSameAs / deriveSubsumes reach wire.ts, and ──
  //    the ratify + write legs are reached by the governed doors. The lifecycle facet is not.
  'packages/knowledge/src/lifecycle/emit.ts': { values: 1, shipped: 'packages/adapter-io/src/governed-emit.ts', banner: false },
  'packages/knowledge/src/lifecycle/evaluator.ts': { values: 4, shipped: null, banner: false },
  'packages/knowledge/src/lifecycle/freshness.ts': { values: 1, shipped: null, banner: false },
  'packages/knowledge/src/lifecycle/hits.ts': { values: 1, types: true, shipped: null, banner: false },
  'packages/knowledge/src/lifecycle/produce.ts': { values: 1, shipped: null, banner: false },
  'packages/knowledge/src/lifecycle/status.ts': { values: 1, shipped: null, banner: false },
  'packages/knowledge/src/ratify/init.ts': { values: 2, shipped: 'packages/tools/src/init.ts', banner: false },
  // 1 -> 2: `UnaddressablePriorError` joined `bindArchive`. Same shape as `attach.ts` above, same task #136 —
  // `supersede()` was reporting "the prior is retained, here is the link" about a prior that had just died,
  // with a zero-length pointer. Named refusal added; module still has ZERO production callers.
  'packages/knowledge/src/write/archive.ts': { values: 2, shipped: null, banner: false },
  'packages/knowledge/src/write/template.ts': { values: 3, shipped: null, banner: false },
};

const fail = [];
const measured = new Map(referenceModels(PKGS).map((r) => [r.path, r]));

// (1) a NEW reference model — the leg this gate exists for.
for (const [path, row] of measured) {
  if (Object.hasOwn(LEDGER, path)) continue;
  fail.push(
    `NEW REFERENCE MODEL — ${path}\n` +
      `      ${row.values} exported value(s) with ZERO production callers: ${row.names.join(', ')}\n` +
      `      ${row.typeReachable ? 'Its TYPES are consumed elsewhere; only its code is unreachable.' : 'Nothing in packages/*/src references it at all.'}\n` +
      `      Either wire it to a product path, or put a header banner on it (see packages/tools/src/guard.ts)\n` +
      `      and add it to the LEDGER here — with \`shipped:\` and \`banner:\`, both of which are checked.`,
  );
}

// (2)(3)(4) the ledger describes the tree it claims to describe.
for (const [path, entry] of Object.entries(LEDGER)) {
  const row = measured.get(path);
  if (row === undefined) {
    const why = existsSync(join(ROOT, path))
      ? 'it now HAS production callers — the reference model became shipped code'
      : 'the file no longer exists';
    fail.push(
      `STALE LEDGER ENTRY — ${path}\n` +
        `      Listed as a reference model, but ${why}.\n` +
        `      Delete the entry (and its banner) so the ledger keeps meaning what it says.`,
    );
    continue;
  }
  if (row.values !== entry.values) {
    const verb = row.values > entry.values ? 'GAINED' : 'lost';
    fail.push(
      `LEDGER DRIFT — ${path}\n` +
        `      ${verb} zero-caller value export(s): ledger says ${entry.values}, measured ${row.values}.\n` +
        `      Now: ${row.names.join(', ')}\n` +
        `      ${row.values > entry.values ? 'A dead export was added to an already-dead module. Justify it, then update the count.' : 'Good — tighten the ledger to the new count.'}`,
    );
  }
  if (row.typeReachable !== (entry.types === true)) {
    fail.push(
      `MISCLASSIFIED REACH — ${path}\n` +
        `      ledger says types: ${entry.types === true}, measured type-reachable: ${row.typeReachable}.\n` +
        `      ${row.typeReachable ? 'Its declarations ARE imported elsewhere — mark `types: true` before anyone deletes a live seam.' : 'Nothing imports its types any more — drop `types: true`.'}`,
    );
  }

  // (5) LEGIBILITY. Everything above defends the COUNT. This leg defends the thing the task was actually
  // about: that a reader opening the file can tell a specification artifact from live code.
  //
  // `banner` is REQUIRED and tri-state, and it is checked in BOTH directions against the file, exactly
  // like `types:`. A missing field fails — so a new entry cannot be waved through by adding one silent
  // line here, which is precisely how a cold review smuggled a bannerless module past the previous
  // revision. `banner: false` is a SIGNED debt, not an omission: it asserts the file carries no banner, so
  // the day someone writes one they must flip the flag, and the flag can only ratchet toward legibility.
  //
  // HONEST CEILING: no gate can check that prose is TRUE or USEFUL. What is checked is that a HEADER
  // COMMENT exists — the marker and the back-reference must both appear inside a comment within the first
  // HEADER_LINES lines. The word "header" was load-bearing prose that the first revision did not enforce:
  // a whole-file `includes` accepted the marker sitting in a string literal
  // (`const NOTE = '── REFERENCE MODEL …'`), at the BOTTOM of the file, or split across two unrelated
  // comments mid-file. Three ways to hold `banner: true` without a reader ever seeing one.
  //
  // This is what makes the ratchet sound in BOTH directions. The debt side always was: `banner: false` on
  // a file that HAS a banner fails, so the flag only moves toward `true`, and leg 1 still forces the entry
  // to exist at all. The credit side was cheap to fake until now. Judging whether the prose is worth
  // reading remains a human job and is not claimed.
  if (!Object.hasOwn(entry, 'banner')) {
    fail.push(
      `UNDECLARED LEGIBILITY — ${path}\n` +
        `      The ledger entry omits \`banner:\`. Every entry must state whether the module carries a\n` +
        `      REFERENCE MODEL header: \`banner: true\` (and write one, see packages/tools/src/guard.ts) or\n` +
        `      \`banner: false\` (a signed, counted debt). Adding a bare line here is not a classification.`,
    );
  } else {
    const marked = hasHeaderBanner(existsSync(join(ROOT, path)) ? readFileSync(join(ROOT, path), 'utf8') : '');
    if (marked !== entry.banner) {
      fail.push(
        entry.banner
          ? `BANNER MISSING — ${path}\n` +
            `      Ledger says \`banner: true\`, but the file carries no "${BANNER_MARKER}" header naming\n` +
            `      this ledger. A banner was deleted, or was never written. Restore it — the entry is the\n` +
            `      only other place a reader would learn this module never runs.`
          : `BANNER UNDECLARED — ${path}\n` +
            `      The file HAS a "${BANNER_MARKER}" header but the ledger still says \`banner: false\`.\n` +
            `      Good news; flip the flag so the legibility count is true.`,
      );
    }
  }

  // `shipped:` is REQUIRED and load-bearing. It was decoration in the first revision — never read by any
  // check — so it could name a path that had never existed. A reader trusting it is the whole point.
  if (!Object.hasOwn(entry, 'shipped')) {
    fail.push(`UNDECLARED COUNTERPART — ${path}\n      The entry omits \`shipped:\`. Name the module that does the job in the product, or state \`null\`.`);
  } else {
    for (const s of entry.shipped === null ? [] : [entry.shipped].flat()) {
      // A FILE, not merely a path: `existsSync` alone accepts `packages/cli`, a directory, which points a
      // reader at nothing in particular and is exactly the kind of almost-true a ledger must not carry.
      if (!(existsSync(join(ROOT, s)) && statSync(join(ROOT, s)).isFile())) {
        fail.push(
          `DANGLING COUNTERPART — ${path}\n` +
            `      \`shipped: '${s}'\` does not name an existing FILE. Either it moved, it never did, or it\n` +
            `      is a directory — name the module that does the job, not the neighbourhood it lives in.`,
        );
      }
    }
  }
}

if (fail.length > 0) {
  console.error('reference-model-guard: FAIL\n');
  for (const f of fail) console.error(`  ✗ ${f}\n`);
  console.error(`${fail.length} violation(s). A reference model is legal; an UNDECLARED one is not.`);
  process.exit(1);
}

const typed = [...measured.values()].filter((r) => r.typeReachable).length;
const values = [...measured.values()].reduce((n, r) => n + r.values, 0);
const bannered = Object.values(LEDGER).filter((e) => e.banner === true).length;
const total = Object.keys(LEDGER).length;
console.log(
  `reference-model-guard: OK — ${measured.size} declared reference model(s) carrying ${values} value export(s) ` +
    `with no production caller; ${typed} of them type-reachable (declarations live, code inert). ` +
    `Ledger ≡ tree, in both directions.\n` +
    `  LEGIBILITY: ${bannered}/${total} carry a REFERENCE MODEL banner. ` +
    `The other ${total - bannered} are DECLARED UNBANNERED — registered and counted here, not yet legible ` +
    `in the file a reader opens. That debt is deliberate: ${Object.values(LEDGER).filter((e) => e.shipped === null).length} of ` +
    `${total} entries have no shipped counterpart to name, and inventing prose for them would be worse than none.`,
);
