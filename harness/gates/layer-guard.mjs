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
// Grounding: architecture fitness functions (Ford/Parsons/Kua; ArchUnit → ArchUnitTS). Deliberately
// dependency-free and dist-free where it can be: the LAYER + BINDING checks read source and package
// manifests, so they work before a build. Only the SURFACE check imports the built constants.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PKGS = join(ROOT, 'packages');

/** The normative layer order (reference/atlas-architecture.md §1.2). Index = depth; an edge may only point
 *  to a STRICTLY lower index. Packages absent from this list are unranked and only checked for cycles. */
const LAYER_ORDER = [
  'contracts',
  'kernel',
  'index',
  'grounding',
  'knowledge',
  'persist',
  'retrieval',
  'tools',
  'adapter-io',
  'cli',
  'mcp-server',
];

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
  for (const dir of readdirSync(PKGS)) {
    const manifest = join(PKGS, dir, 'package.json');
    if (!existsSync(manifest)) continue;
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
      .map(shortName)
      .filter((d) => d !== null);
    graph.set(dir, deps);
  }
  return graph;
}

// ── ARCH-1/2 — direction, forbidden edges, acyclicity ────────────────────────────────────────────────
function checkLayers(graph) {
  const rank = new Map(LAYER_ORDER.map((n, i) => [n, i]));

  for (const [pkg, deps] of graph) {
    const from = rank.get(pkg);
    for (const dep of deps) {
      if (!graph.has(dep)) continue; // not a workspace package
      const to = rank.get(dep);
      if (from !== undefined && to !== undefined && to >= from) {
        note(`ARCH-1 layer inversion: @atlas/${pkg} (rank ${from}) depends on @atlas/${dep} (rank ${to}) — dependencies flow outer→inner ONLY`);
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
  const src = readFileSync(COMPOSITION_ROOT, 'utf8');
  const start = src.indexOf('const legs: ToolLegs = {');
  if (start < 0) {
    note(`ARCH-3 composition root has no \`const legs: ToolLegs = {\` binding block (${COMPOSITION_ROOT})`);
    return null;
  }
  // Brace-match from the literal's opening brace so nested objects/arrow bodies do not truncate the scan.
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
  const block = src.slice(open, end);
  return new Set([...block.matchAll(/['"]([a-z-]+)['"]\s*:/g)].map((m) => m[1]));
}

async function checkSurface() {
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

  // ARCH-5 — advertised ≡ invocable. The bound legs ARE the invocable set.
  const legs = boundLegs();
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

  return { governance: governance.length, read: read.length, total: union.size };
}

// ── run ──────────────────────────────────────────────────────────────────────────────────────────────
const graph = workspaceGraph();
checkLayers(graph);
const surface = await checkSurface();

if (fail.length > 0) {
  console.error('layer-guard: FAIL\n');
  for (const f of fail) console.error(`  ✗ ${f}`);
  console.error(`\n${fail.length} violation(s). Contract: docs/reference/atlas-architecture.md`);
  process.exit(1);
}

console.log(
  `layer-guard: OK — ${graph.size} packages, acyclic, 0 layer inversions; ` +
    `surface ${surface?.total ?? '?'}/${TOOL_BUDGET} tools ` +
    `(${surface?.governance ?? '?'} governance + ${surface?.read ?? 0} read), advertised ≡ invocable.`,
);
