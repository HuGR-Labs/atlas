// harness/gates/layer-guard.mjs — the ARCHITECTURE FITNESS FUNCTION (reference/atlas-architecture.md)
//
// A layer rule that lives only in prose is not a rule. This gate reads the REAL dependency graph and the
// REAL composition root and fails on anything that violates the hierarchy or the exposure law:
//
//   ARCH-1/2  LAYER      — dependencies flow outer→inner only; the graph is acyclic; `tools` (the port
//                          layer) has ZERO edges to adapter-io / cli / mcp-server.
//   ARCH-3    BINDING    — every member of the tool union has a bound leg at the ONE composition root, and
//                          every bound leg's token is a member of the union. Checked in BOTH directions:
//                          a typed-but-unbound door is a hole, a bound-but-undeclared leg is a ghost.
//   ARCH-5/6  SURFACE    — advertised ≡ invocable; GOVERNANCE_SURFACE ⊎ READ_SURFACE is total and disjoint;
//                          WRITE_PATHS ⊆ GOVERNANCE_SURFACE.
//   ARCH-7    BUDGET     — the statically-advertised tool count stays ≤ 30 (a MEASURED threshold, not an
//                          invented one — see reference/atlas-architecture.md §2.2). Crossing it is not
//                          forbidden; it fails the gate so the move to dynamic projection (ARCH-8) is a
//                          deliberate decision rather than a drift.
//
// Grounding: architecture fitness functions (Ford/Parsons/Kua; ArchUnit → ArchUnitTS). DIST-free where it
// can be: the LAYER + BINDING checks read source and package manifests, so they work before a build. Only
// the SURFACE check imports the built constants.
//
// It is NOT dependency-free, and the earlier revision that claimed to be paid for it: reading TypeScript
// with regexes is what put a private comment stripper in this file, and that stripper deleted real import
// statements. Lexing is delegated to `lexing.mjs` — the argument, and the measurement, live in its header.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// The ONE comment stripper in this repo. Keeping a private copy here is what created the hole it now closes.
import { stripComments } from './lexing.mjs';

// The repo root, OVERRIDABLE so the gate's own test can point it at a fixture tree. Without this the gate
// could only ever be mutation-tested by hand against the live repo — which is precisely the 'trust me' the
// gate exists to abolish.
const ROOT = process.env.LAYER_GUARD_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PKGS = join(ROOT, 'packages');

/**
 * The layer ranking is DERIVED, never transcribed.
 *
 * The canonical order is the `L0..L8` diagram in the repo-root `ARCHITECTURE.md`, which every core package
 * barrel independently restates (`// Layer N:`). An earlier version of this gate hard-coded its own array
 * and got it WRONG in three places (persist ranked above knowledge; memory and genesis unranked entirely),
 * which false-PASSed real inversions out of `persist` and false-FAILed the legal `knowledge → persist` edge.
 * A gate that enforces a wrong architecture is worse than no gate — so the order is now read from the one
 * place that already declared it, and drift between that diagram and this gate is impossible by construction.
 *
 * The outer RING (adapter-io + the entrypoints + the e2e suites) sits above the core and is ranked here
 * because ARCHITECTURE.md's diagram predates it. Any workspace package that is neither in the diagram nor
 * in this ring list is a HARD FAILURE — silently-unranked packages are exactly how the previous version let
 * memory and genesis through unchecked.
 */
const ARCHITECTURE_DOC = join(ROOT, 'ARCHITECTURE.md');

/** The ring, above every `L*` core layer. Index order = increasing depth; `e2e*` import all, are imported by none. */
const RING_ORDER = ['adapter-io', 'cli', 'mcp-server', 'e2e', 'e2e-blackbox'];

/** Parse `<names…> L<n>` rows out of the canonical diagram → Map(pkg → rank). Several packages may share a
 *  rank on one row (`persist   index       L2`), which is a genuine TIER: a peer edge inside a tier is an
 *  inversion just as an upward edge is, so equal ranks are compared with `>=`. */
function canonicalRanks(known) {
  if (!existsSync(ARCHITECTURE_DOC)) {
    note(`ARCH-1 canonical layer diagram missing: ${ARCHITECTURE_DOC} — the layer order MUST be declared, not inferred`);
    return null;
  }
  const ranks = new Map();
  for (const line of readFileSync(ARCHITECTURE_DOC, 'utf8').split('\n')) {
    const m = /^(.*?)\bL(\d)\b/.exec(line);
    if (m === null) continue;
    for (const word of m[1].match(/[a-z][a-z-]*/g) ?? []) {
      if (known.has(word)) ranks.set(word, Number(m[2]));
    }
  }
  if (ranks.size === 0) {
    note(`ARCH-1 no \`L<n>\` layer rows parsed from ${ARCHITECTURE_DOC} — the diagram format changed; this gate is blind until it is fixed`);
    return null;
  }
  // The ring is stacked strictly above the deepest core layer.
  const base = Math.max(...ranks.values()) + 1;
  RING_ORDER.forEach((pkg, i) => { if (known.has(pkg)) ranks.set(pkg, base + i); });
  return ranks;
}

/** ARCH-2, stated as an explicit denylist so the message can name the invariant rather than a rank. */
const FORBIDDEN_EDGES = [
  ['tools', 'adapter-io'],
  ['tools', 'cli'],
  ['tools', 'mcp-server'],
];

/** ARCH-7 — the measured static-surface budget. See §2.2 for the citations behind the number. */
const TOOL_BUDGET = 30;

/** The ONE composition root (ARCH-3). */
const COMPOSITION_ROOT = join(PKGS, 'adapter-io', 'src', 'wire.ts');

const fail = [];
const note = (msg) => fail.push(msg);

// ── read the workspace graph ─────────────────────────────────────────────────────────────────────────
const shortName = (dep) => (dep.startsWith('@atlas/') ? dep.slice('@atlas/'.length) : null);

function workspaceGraph() {
  const graph = new Map();
  const undeclared = [];
  const opaque = [];
  for (const dir of readdirSync(PKGS)) {
    const manifest = join(PKGS, dir, 'package.json');
    if (!existsSync(manifest)) continue;
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
    const declared = new Set(
      Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).map(shortName).filter((d) => d !== null),
    );
    const imported = sourceImports(dir);
    for (const dep of imported.edges) {
      if (dep !== dir && !declared.has(dep)) undeclared.push(`@atlas/${dir} imports @atlas/${dep} but does not declare it`);
    }
    opaque.push(...imported.opaque);
    graph.set(dir, [...new Set([...declared, ...imported.edges])].filter((d) => d !== dir));
  }
  return { graph, undeclared, opaque };
}

/**
 * The edges that ACTUALLY create coupling are imports, not manifest entries. A manifest-only graph is
 * blind: a source import needs no manifest edit to resolve (npm workspaces symlinks every package into the
 * root `node_modules`), which was demonstrated on this tree — a real `tools → adapter-io` runtime edge
 * passed the entire gate suite green. So the graph is the UNION of declared and imported edges, and the
 * divergence between them is itself reported.
 *
 * Both static (`from '@atlas/x'`) and dynamic (`import('@atlas/x')`) forms are scanned; `wire.ts` uses the
 * dynamic form heavily in type positions, so a `from`-only scan misses real edges. A dynamic specifier that
 * is NOT a literal cannot be resolved statically and is refused outright in an inner layer — that is the
 * exact shape used to smuggle the undetectable edge.
 *
 * ── WHAT THE SPECIFIER GRAMMAR MUST ADMIT, because two shapes it rejected were live blind spots ───────
 * The point of scanning source at all is stated above: a source import needs no manifest edit to resolve.
 * So the source scan MUST see at least everything the manifest scan sees, or the check it exists to
 * perform inverts — an edge becomes easier to hide in code than in a manifest. It did not, twice, and both
 * were reproduced on a fixture where the plain form correctly failed with 4 violations:
 *
 *   DIGITS. The captured name was `[a-z][a-z-]*`, which rejects `0-9`, while `shortName` (which reads the
 *   MANIFEST) accepts any `@atlas/*`. `e2e` and `e2e-blackbox` are real ranked packages in `RING_ORDER`.
 *   `@atlas/e2e` in a manifest was graphed and failed the gate; the SAME edge written as a source import
 *   scored exit 0, 0 violations. That asymmetry is precisely the smuggling shape, running backwards.
 *
 *   SUBPATHS. The specifier was matched WHOLE against the closing quote, so any deep import —
 *   `@atlas/adapter-io/dist/src/index.js` — matched nothing at all and the edge was invisible. The
 *   package identity is everything up to the first `/` after the scope; whatever follows is a file within
 *   the SAME package and cannot change which package is being coupled to.
 */
function sourceImports(pkgDir) {
  const out = { edges: new Set(), opaque: [] };
  const srcRoot = join(PKGS, pkgDir, 'src');
  if (!existsSync(srcRoot)) return out;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) { walk(p); continue; }
      if (!/\.(ts|tsx|mts|js|mjs)$/.test(entry.name)) continue;
      // Strip comments FIRST. This codebase is comment-dense and routinely NAMES other packages in prose
      // ("`@atlas/contracts`-owned", "would invert the DAG"). Scanning raw text turns every such mention
      // into a phantom edge — an earlier revision of this scanner reported 68 violations, all false.
      //
      // The stripper is the SHARED, parser-backed one. The two-regex form that used to sit on this line
      // deleted real imports — see `lexing.mjs`; pinned by fixture in layer-guard.test.mjs.
      const src = stripComments(readFileSync(p, 'utf8'), entry.name);
      // Only real specifier positions count. `[a-z0-9-]` and the `(?:\/…)?` tail: see DIGITS/SUBPATHS above.
      const SPECIFIER =
        /(?:\bfrom\s*|\bimport\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)['"]@atlas\/([a-z][a-z0-9-]*)(?:\/[^'"]*)?['"]/g;
      for (const m of src.matchAll(SPECIFIER)) out.edges.add(m[1]);
      // A dynamic import whose specifier is not a string literal is statically unresolvable. HEURISTIC, and
      // stated as one: a captured `:` means this is a TypeScript signature for a METHOD NAMED `import`
      // (`import(json: string): Cas`, which both portable.ts files declare), not a dynamic import — a real
      // specifier expression cannot carry a top-level colon. Without this exclusion the scan reports those
      // two interface members as unresolvable imports.
      for (const m of src.matchAll(/\bimport\s*\(\s*(?!['"`])([^)]{0,60})\)/g)) {
        if (m[1].includes(':')) continue;
        out.opaque.push(`${pkgDir}/src/${p.slice(srcRoot.length + 1)}: import(${m[1].trim().slice(0, 40)})`);
      }
    }
  };
  walk(srcRoot);
  return out;
}

// ── ARCH-1/2 — direction, forbidden edges, acyclicity ────────────────────────────────────────────────
function checkLayers(graph, rank) {
  if (rank === null) return; // the canonical diagram could not be read; already noted
  // ARCH-1: NO package may be silently unranked. An unranked package skips the direction check entirely,
  // which is how an earlier version of this gate left `memory` and `genesis` unchecked while printing OK.
  for (const pkg of graph.keys()) {
    if (!rank.has(pkg)) {
      note(`ARCH-1 unranked package '@atlas/${pkg}': it is in neither ARCHITECTURE.md's layer diagram nor the ring list, so its edges are UNCHECKED. Rank it before it ships.`);
    }
  }

  for (const [pkg, deps] of graph) {
    const from = rank.get(pkg);
    for (const dep of deps) {
      if (!graph.has(dep)) continue; // not a workspace package
      const to = rank.get(dep);
      if (from !== undefined && to !== undefined && to >= from) {
        note(`ARCH-1 layer inversion: @atlas/${pkg} (L${from}) depends on @atlas/${dep} (L${to}) — a package may import only from a STRICTLY lower layer (ARCHITECTURE.md)`);
      }
    }
  }

  for (const [outer, inner] of FORBIDDEN_EDGES) {
    if ((graph.get(outer) ?? []).includes(inner)) {
      note(`ARCH-2 forbidden edge: @atlas/${outer} MUST NOT depend on @atlas/${inner} — a port is declared in the consuming layer and implemented outward`);
    }
  }

  // Acyclicity — iterative DFS with an explicit path so the cycle can be NAMED, not just detected.
  const state = new Map(); // 0 = unvisited, 1 = on-stack, 2 = done
  const path = [];
  const visit = (node) => {
    if (state.get(node) === 2) return;
    if (state.get(node) === 1) {
      const cycle = [...path.slice(path.indexOf(node)), node].map((n) => `@atlas/${n}`).join(' → ');
      note(`ARCH-1 dependency CYCLE: ${cycle}`);
      return;
    }
    state.set(node, 1);
    path.push(node);
    for (const dep of graph.get(node) ?? []) if (graph.has(dep)) visit(dep);
    path.pop();
    state.set(node, 2);
  };
  for (const pkg of graph.keys()) visit(pkg);
}

// ── ARCH-3 — the union and the composition root agree, in BOTH directions ────────────────────────────
/** The quoted keys of the `const legs: ToolLegs = { … }` object literal at the composition root. Parsed
 *  from source (not dist) so the check runs before a build; anchored on the exact declaration so a second
 *  legs-like literal elsewhere cannot satisfy it. */
function boundLegs() {
  if (!existsSync(COMPOSITION_ROOT)) {
    note(`ARCH-3 composition root missing: ${COMPOSITION_ROOT} — there MUST be exactly one leg-binding site`);
    return null;
  }
  // STRIP FIRST, THEN LOCATE. The order is the whole point and it used to be the other way round: the
  // literal was found and brace-matched over RAW text and only the resulting SLICE was stripped, so the
  // comment above the strip claimed a protection the code did not have. A `}` in prose inside the literal
  // — `// the handler dispatches on legs[tool] } and never checks membership` is the shape wire.ts invites —
  // drove the depth counter to zero early, `end` landed on the comment, and every leg BELOW that line fell
  // outside the block. A bound-but-undeclared ghost leg there is invocable over MCP and invisible here:
  // exit 0. Reproduced on a fixture where the same ghost leg without the comment correctly fails.
  //
  // Blanking is offset-preserving, so `src` and the located offsets still describe the same bytes; the only
  // thing that changed is that braces, quotes and `...` inside comments are no longer read as syntax. The
  // `indexOf` anchor is stripped too, which is a second small gain: a commented-out `const legs: ToolLegs`
  // can no longer be mistaken for the binding site.
  const src = stripComments(readFileSync(COMPOSITION_ROOT, 'utf8'), 'wire.ts');
  const start = src.indexOf('const legs: ToolLegs = {');
  if (start < 0) {
    note(`ARCH-3 composition root has no \`const legs: ToolLegs = {\` binding block (${COMPOSITION_ROOT})`);
    return null;
  }
  // Brace-match from the literal's opening brace so nested objects/arrow bodies do not truncate the scan.
  //
  // STILL UNCOVERED, and stated rather than left to be discovered: this counter is comment-aware now but
  // not STRING-aware. A `}` inside a string or template INSIDE the legs literal can still close the block
  // early. Measured on the real wire.ts today: the located block is byte-identical before and after this
  // change and no leg hides behind such a brace, so it is a latent gap, not a live one. Closing it needs
  // the object literal to come from the AST rather than from a bracket count — a different change from
  // this one, and not one to smuggle in alongside a correctness fix.
  const open = src.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) { end = i; break; }
  }
  if (end < 0) {
    note('ARCH-3 composition root: unbalanced braces in the legs binding block');
    return null;
  }
  // Already stripped above, so this is a plain cut. `wire.ts` is ~70% comment by volume, which is why every
  // scan below — bracket walk, `^\s*` key anchor, computed-key probe — needs prose to have stopped being syntax.
  const block = src.slice(open, end);

  // A SPREAD or a COMPUTED key AT THE TOP LEVEL of the literal hides a leg from this scan while leaving it
  // fully invocable — the handler dispatches on `legs[tool]` with no membership check, so a spread-in leg is
  // reachable over MCP with the gate green. Demonstrated on this tree.
  //
  // DEPTH MATTERS: a conditional spread inside a NESTED option object (`...(cfg.x !== undefined ? … : {})`,
  // which wire.ts legitimately uses in a seam config) is not a leg and must not fire. A depth-blind check
  // reports it and cries wolf — which is exactly what the first revision of this check did.
  let nest = 0;
  for (let i = 0; i < block.length; i++) {
    const c = block[i];
    if (c === '{' || c === '[' || c === '(') nest++;
    else if (c === '}' || c === ']' || c === ')') nest--;
    else if (nest === 1 && block.startsWith('...', i)) {
      note('ARCH-3 the leg binding block contains a top-level SPREAD (`...`): the bound set cannot be determined statically, and a spread-in leg is invocable while invisible to this gate. Bind every leg with a literal quoted key.');
      break;
    }
  }
  if (/^\s*\[[^\]]+\]\s*:/m.test(block)) {
    note('ARCH-3 the leg binding block contains a COMPUTED key (`[expr]:`): the bound set cannot be determined statically. Bind every leg with a literal quoted key.');
  }
  // `[a-z0-9-]`, not `[a-z-]`. The digit-blind class was the SAME defect as the specifier grammar one
  // function away, with the same consequence in the same direction: `'atlas-v2'` bound here matched nothing,
  // so the leg was absent from the returned set, absent from ARCH-3/5's bound-but-undeclared check, and
  // fully invocable — `legs[tool]` dispatches with no membership test. Exit 0 on a ghost. (The other
  // direction is loud and was never the risk: a SURFACE tool with a digit would have been reported as
  // typed-but-unbound.)
  return new Set([...block.matchAll(/^\s*['"](atlas-[a-z0-9-]+)['"]\s*:/gm)].map((m) => m[1]));
}

async function checkSurface(legs) {
  let mod;
  try {
    mod = await import(join(PKGS, 'tools', 'dist', 'src', 'index.js'));
  } catch {
    note('ARCH-5 cannot import the built tool surface (packages/tools/dist) — run `npm run typecheck` first');
    return;
  }

  const governance = [...(mod.GOVERNANCE_SURFACE ?? [])];
  const write = [...(mod.WRITE_PATHS ?? [])];
  // READ_SURFACE does not exist yet (ARCH-6 / CAMPAIGN-10.3). Absent ⇒ empty, so the checks below hold
  // today and tighten automatically the moment the constant lands.
  const read = [...(mod.READ_SURFACE ?? [])];

  const union = new Set([...governance, ...read]);

  // ARCH-6 — disjoint, and WRITE_PATHS ⊆ GOVERNANCE_SURFACE.
  for (const t of read) {
    if (governance.includes(t)) note(`ARCH-6 partition violated: '${t}' is in BOTH GOVERNANCE_SURFACE and READ_SURFACE`);
    if (write.includes(t)) note(`ARCH-6 authority violated: '${t}' is in READ_SURFACE and in WRITE_PATHS`);
  }
  for (const t of write) {
    if (!governance.includes(t)) note(`ARCH-6 authority violated: write path '${t}' is not in GOVERNANCE_SURFACE`);
  }

  // ARCH-5 — the surface constants vs the bound legs (legs are resolved by the caller so ARCH-3 runs
  // even when dist is absent — an earlier revision nested it here, so a missing build silently skipped it).
  if (legs !== null) {
    for (const t of union) {
      if (!legs.has(t)) note(`ARCH-3/5 '${t}' is declared in the tool surface but has NO bound leg at the composition root — a typed-but-unbound door is a hole`);
    }
    for (const t of legs) {
      if (!union.has(t)) note(`ARCH-3/5 leg '${t}' is bound at the composition root but is in NO surface constant — a bound-but-undeclared leg is invocable and invisible to every surface pin`);
    }
  }

  // ARCH-7 — the measured budget.
  if (union.size > TOOL_BUDGET) {
    note(`ARCH-7 static surface budget exceeded: ${union.size} tools > ${TOOL_BUDGET}. Tool-selection accuracy degrades sharply past ~30 (see reference/atlas-architecture.md §2.2). Move growth to the dynamic scope-scoped projection (ARCH-8) rather than raising this number.`);
  }

  return {
    governance: governance.length,
    read: read.length,
    total: union.size,
    readAbsent: mod.READ_SURFACE === undefined,
  };
}

// ── run ──────────────────────────────────────────────────────────────────────────────────────────────
const { graph, undeclared, opaque } = workspaceGraph();
const rank = canonicalRanks(new Set(graph.keys()));
checkLayers(graph, rank);

// A source import that no manifest declares is a real edge the build resolves by workspace hoisting. It is
// not itself a layer violation (the direction check above already ranks it), but it means the manifest is
// not a faithful description of the graph — report it so the drift is visible rather than load-bearing.
for (const u of undeclared) note(`ARCH-1 undeclared edge: ${u} — the manifest does not describe the real graph`);
// An unresolvable dynamic specifier defeats every static check in this gate, in the inner layers where it
// matters. Refuse it there rather than pretend the scan was complete.
for (const o of opaque) {
  const pkg = o.slice(0, o.indexOf('/'));
  if ((rank?.get(pkg) ?? Infinity) <= (rank?.get('tools') ?? Infinity)) {
    note(`ARCH-1 non-literal dynamic import in an inner layer — statically unresolvable, so this gate cannot see where it points: ${o}`);
  }
}

const legs = boundLegs();
const surface = await checkSurface(legs);

if (fail.length > 0) {
  console.error('layer-guard: FAIL\n');
  for (const f of fail) console.error(`  ✗ ${f}`);
  console.error(`\n${fail.length} violation(s). Contract: docs/reference/atlas-architecture.md`);
  process.exit(1);
}

// The success line states ONLY what was checked. It deliberately does NOT claim "advertised ≡ invocable":
// this gate never reads `mcp-server/src/server.ts`, so the ADVERTISED set is out of its scope — it compares
// the surface CONSTANTS against the bound legs. Overstating that was a real defect in the first version.
console.log(
  `layer-guard: OK — ${graph.size} packages ranked + acyclic, 0 layer inversions (manifest ∪ source imports); ` +
    `surface constants ${surface?.total ?? '?'}/${TOOL_BUDGET} ` +
    `(${surface?.governance ?? '?'} governance + ${surface?.read ?? 0} read) ≡ bound legs.` +
    (surface?.readAbsent === true ? '\n  (READ_SURFACE not yet exported — its partition is DECLARED UNCOVERED, not verified.)' : ''),
);
