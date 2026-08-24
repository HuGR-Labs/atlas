// @atlas/cli — src/render.ts  (CLI-3: render a handler Verdict to a process outcome)
//
// Render the frozen `Verdict` (@atlas/tools) to the CLI's process-level outcome (exit code + stdout).
// DETERMINISTIC: a PURE function of the verdict — NO clock/nonce/paths — so the same verdict renders
// byte-identically every time (CLI-3c). WIRE-LOOP Seam-2 adds the `data:` block that closes GAP-B (the CLI
// used to DROP `verdict.data`, so an emitted fact was invisible at the user surface). The block is appended
// AFTER the status/next/invariant lines and ONLY for a known `ok` data shape — an unknown/absent `data`
// yields NO block, so every pre-existing rendering stays byte-unchanged (back-compat).

import type { Verdict } from '@atlas/tools';
import { deriveStatus, EXIT } from './map.js';
import type { Status } from './map.js';

/** The CLI's process-level projection of one handler verdict (ring shape). */
export interface CliVerdict {
  readonly exitCode: number;
  readonly stdout: string;
}

/** A `PackInvariant`-shaped row inside a query pack (structural — never a prose blob). */
interface InvRow {
  readonly nodeId: string;
  readonly tier: string;
  readonly claim: string;
  /** The row's OWN freshness verdict (ADR-0013 clause 5). Typed optional HERE and only here, because this
   *  renderer reads an `unknown` verdict payload rather than a `Pack`: a shape guard that assumed the field
   *  would make a pack from an older door render nothing at all. Rendered as `?` when absent — never
   *  silently as `FRESH`, which is the one value that would read as a verification that did not happen. */
  readonly freshness?: string;
}

/** A `broader ⊃ narrower` coverage edge inside the query envelope (Seam-3). */
interface SubRow {
  readonly broader: string;
  readonly narrower: string;
}

/** A `a ≡ b` human equivalence edge inside the query envelope (WP-SAMEAS). */
interface SameRow {
  readonly a: string;
  readonly b: string;
}

/**
 * Render the DETERMINISTIC `data:` block for a known `ok` verdict data shape, or `''` when the shape is
 * unknown/absent (back-compat: no block ⇒ existing output byte-unchanged). PURE — every byte is a function
 * of `data` alone, in a fixed field order (CLI-3c). The recognised shapes, in guard order:
 *   - query envelope `{ pack, subsumes }` → `  inv <tier> <nodeId> [<freshness>]: <claim>` per (pre-sorted)
 *     GOVERNING invariant, then `  advisory <tier> <nodeId> [<freshness>]: <claim>` per ADVISORY row (its own
 *     verb, never interleaved — ADR-0013), `  advisoryDropped: <n>`, `  stale: <bool>`, then
 *     `  subsumes <broader> ⊃ <narrower>` per (pre-sorted) edge.
 *   - emit `{ id }` (a Hash) → `  id: <hash>`.
 *   - init `{ territories }` → `  territory: <name>` per territory, sorted by name.
 */
function renderData(data: unknown): string {
  if (typeof data !== 'object' || data === null) return '';
  const d = data as Record<string, unknown>;

  // query envelope { pack, subsumes } — the observability readback (Seam-1+3).
  const pack = d.pack as
    | { invariants?: unknown; advisory?: unknown; advisoryDropped?: unknown; stale?: unknown; tokenEstimate?: unknown }
    | undefined;
  if (pack && typeof pack === 'object' && Array.isArray(pack.invariants)) {
    const invs = pack.invariants as readonly InvRow[];
    const adv = Array.isArray(pack.advisory) ? (pack.advisory as readonly InvRow[]) : [];
    const advDropped = typeof pack.advisoryDropped === 'number' ? pack.advisoryDropped : 0;
    const subs = Array.isArray(d.subsumes) ? (d.subsumes as readonly SubRow[]) : [];
    const sames = Array.isArray(d.sameAs) ? (d.sameAs as readonly SameRow[]) : [];
    // N12 CLI/MCP parity: surface `tokenEstimate` (the advisory pack size) on the CLI too — MCP already ships
    // it in the pack JSON, so dropping it here was a real CLI-vs-MCP asymmetry. Deterministic (a number field).
    const tokenEstimate = typeof pack.tokenEstimate === 'number' ? pack.tokenEstimate : 0;
    const lines = [
      // ADR-0013 clause 3 — the GOVERNING band keeps the `inv` verb it has always had, now carrying the row's
      // own freshness verdict. The ADVISORY band below gets its OWN verb (`advisory`) and is never
      // interleaved: a reader must not have to parse a tier letter to know nobody ratified a claim.
      ...invs.map((i) => `  inv ${i.tier} ${i.nodeId} [${i.freshness ?? '?'}]: ${i.claim}`),
      ...adv.map((i) => `  advisory ${i.tier} ${i.nodeId} [${i.freshness ?? '?'}]: ${i.claim}`),
      // The truncation ledger rides out BESIDE the data (#130) — a bounded set that was cut and does not say
      // so reads as "we covered everything". Printed unconditionally, so `0` is a measured fact and not a
      // line the reader has to notice is missing.
      `  advisoryDropped: ${advDropped}`,
      `  stale: ${pack.stale === true}`,
      `  tokenEstimate: ${tokenEstimate}`,
      ...subs.map((s) => `  subsumes ${s.broader} ⊃ ${s.narrower}`),
      // WP-SAMEAS: one line per (pre-sorted) human equivalence edge — surfaced like subsumes, never a merge.
      ...sames.map((s) => `  sameAs ${s.a} ≡ ${s.b}`),
    ];
    return `data:\n${lines.join('\n')}\n`;
  }

  // relations { relations, unit, direction } — the grounded relation edges touching a unit (`atlas relations`,
  // #99a). Recognised by a `relations` array (no other data shape carries that key), guarded BEFORE the shapes
  // below (none of which has a `relations` field, so no cross-shadowing). A header line states the unit,
  // direction and COUNT, so an EMPTY result is a measured fact ("0 edge(s)") and never an absent line; each
  // edge renders `  relation <kind> <A> -> <B> (<nodeKey>)` in the fold's own deterministic order.
  if (Array.isArray(d.relations)) {
    const edges = d.relations as readonly {
      nodeKey: string;
      relationKind: string;
      endpointA: string;
      endpointB: string;
      seal?: string;
    }[];
    const unit = typeof d.unit === 'string' ? d.unit : '';
    const direction = typeof d.direction === 'string' ? d.direction : 'both';
    // #99 R6 (AR-12): each edge surfaces its two-seal provenance as a trailing `[<seal>]` — a sound-minted
    // proven `depends-on` and an advisory relation would otherwise read IDENTICALLY at the CLI. Printed ONLY
    // when the fold carried a seal (additive/absent-tolerant, the `seal`/`freshness` discipline elsewhere in
    // this file): an unsealed edge renders byte-identically to its pre-R6 output (no `[...]` suffix), so a
    // missing seal is never a silent `[proven]`.
    const lines = [
      `  relations: ${unit} ${direction} — ${edges.length} edge(s)`,
      ...edges.map(
        (e) =>
          `  relation ${e.relationKind} ${e.endpointA} -> ${e.endpointB} (${e.nodeKey})` +
          (typeof e.seal === 'string' ? ` [${e.seal}]` : ''),
      ),
    ];
    return `data:\n${lines.join('\n')}\n`;
  }

  // negations { negations, abstentions, scope, abstained } — the grounded negatives + honest abstentions under
  // a scope (`atlas negations`, #99b). Recognised by a `negations` array (no other data shape carries that
  // key; the relations shape carries `relations`, not `negations`, so no cross-shadowing), guarded BEFORE the
  // shapes below. A header line states the scope and BOTH counts, so an EMPTY result is a measured fact and an
  // abstention that fired is never an absent line. Each negative renders `  negation <kind> <target> in
  // <scope> (<nodeKey>)`; each abstention renders `  abstained <kind> <target> in <scope> — <reason>` — the
  // ABSTAINED section is the #202 observability. `--abstained` FOCUSES the render on the abstentions ONLY (the
  // data still carries both arrays, so parity + observability hold); the default shows negatives AND
  // abstentions, so a fired abstention is visible without any flag.
  if (Array.isArray(d.negations)) {
    const negs = d.negations as readonly { nodeKey: string; relationKind: string; target: string; scope: string; freshness?: string }[];
    const absts = d.abstentions as readonly { relationKind: string; target: string; scope: string; reason: string }[] | undefined;
    const abstentions = Array.isArray(absts) ? absts : [];
    const scope = typeof d.scope === 'string' ? d.scope : '';
    const focus = d.abstained === true;
    const abstainedLines = abstentions.map(
      (a) => `  abstained ${a.relationKind} ${a.target} in ${a.scope} — ${a.reason}`,
    );
    // N4: each grounded negative renders its per-row §3 freshness verdict (FRESH/DRIFTED) — a re-opened scope
    // or an extractor-model bump reads DRIFTED, so "does this negative still hold" is legible on the surface.
    const lines = focus
      ? [`  negations: ${scope} — ${abstentions.length} abstention(s)`, ...abstainedLines]
      : [
          `  negations: ${scope} — ${negs.length} negation(s), ${abstentions.length} abstention(s)`,
          ...negs.map((n) => `  negation ${n.relationKind} ${n.target} in ${n.scope} [${n.freshness ?? 'DRIFTED'}] (${n.nodeKey})`),
          ...abstainedLines,
        ];
    return `data:\n${lines.join('\n')}\n`;
  }

  // anchors { rev, units, holes, reason? } — the read-only DISCOVERY planner listing (`atlas anchors <path>`,
  // WP-10.A1.CLI / ADR-0004, the frozen `AnchorsOut`). Recognised by a `units` array PLUS a `holes` array (no
  // other data shape carries either key, so no cross-shadowing with the shapes above/below). A header line states
  // the rev and BOTH counts, so an EMPTY listing is a MEASURED fact ("0 unit(s), 0 hole(s)") and never an absent
  // line; each unit renders `  unit <kind> <qualifiedPath> [<subtreeHash>]` in the leg's own deterministic (index)
  // order, and each declared language hole renders `  hole <ext> — <fileCount> file(s): <reason>` (AUTHOR-4, the
  // real census). The honest-empty `reason` (AUTHOR-3) renders as a trailing `  reason: <reason>` line ONLY when
  // present (the leg sets it iff `units` is empty), so a populated listing stays byte-clean and an empty one is
  // never silent about WHY.
  if (Array.isArray(d.units) && Array.isArray(d.holes)) {
    const units = d.units as readonly { qualifiedPath: string; kind: string; subtreeHash: string }[];
    const holes = d.holes as readonly { ext: string; fileCount: number; reason: string }[];
    const rev = typeof d.rev === 'string' ? d.rev : '';
    const lines = [
      `  anchors: rev ${rev} — ${units.length} unit(s), ${holes.length} hole(s)`,
      ...units.map((u) => `  unit ${u.kind} ${u.qualifiedPath} [${u.subtreeHash}]`),
      ...holes.map((h) => `  hole ${h.ext} — ${h.fileCount} file(s): ${h.reason}`),
    ];
    if (typeof d.reason === 'string') lines.push(`  reason: ${d.reason}`);
    return `data:\n${lines.join('\n')}\n`;
  }

  // link { linked, a, b, retracted? } — the governed sameAs write door result (WP-SAMEAS). A SUCCESSFUL link
  // renders a single `  linked: <a> ≡ <b>` line; a REJECTED link (linked:false) carries its `rejected` string
  // through the handler's ok:false path → the `reason:` block (mirrors emit), so it is never shadowed here.
  // Guarded on `linked === true` BEFORE the `{id}` shape below (a LinkOut has no `id`, so no cross-shadowing).
  //
  // [A-D3 / task #83] a RETRACTION renders its OWN verb — `  retracted: <a> ≢ <b>` — and never the `linked:`
  // line. Both modes settle as `linked:true` (that field means "the act changed the stored relation"), so
  // rendering them alike would put "linked: a ≡ b" on a human's screen at the exact moment the equivalence
  // was withdrawn. Distinct verb, distinct symbol, no way to misread which act happened.
  if (d.linked === true && typeof d.a === 'string' && typeof d.b === 'string') {
    return d.retracted === true
      ? `data:\n  retracted: ${d.a} ≢ ${d.b}\n`
      : `data:\n  linked: ${d.a} ≡ ${d.b}\n`;
  }

  // node (TEST-VACUITY) — a resolved `TestVacuityNode` (the `atlas node <addr>` read door) for the single-anchor
  // proven family (#95, ADR-0015 D5). Recognised by `kind:'test-vacuity'` + a `grounding` object; the emit
  // `{ id }` shape below has NEITHER and the other node shapes carry a different `kind`, so no cross-shadowing. A
  // test-vacuity has no `claimNorm` at this seam — its claim IS the (testName @ unitKey, shape) triple, so that
  // is what renders. The seal + witness render ONLY when present (additive/absent-tolerant, the `seal`/
  // `witness` discipline the relation/predicate branches use); the witness is a `TestVacuityWitness`
  // (shape/testName) — the re-runnable derivation `scanTestVacuity` re-proves at HEAD, never model prose.
  if (d.kind === 'test-vacuity' && typeof d.grounding === 'object' && d.grounding !== null) {
    let out =
      `data:\n  node: ${String(d.id)}\n  tier: ${String(d.tier)}\n  kind: test-vacuity\n` +
      `  test-vacuity: ${String(d.testName)} @ ${String(d.unitKey)} (${String(d.shape)})\n`;
    if (typeof d.seal === 'string') out += `  seal: ${d.seal}\n`;
    if (typeof d.witness === 'object' && d.witness !== null) {
      const w = d.witness as Record<string, unknown>;
      out += `  witness:\n    shape: ${String(w.shape)}\n    testName: ${String(w.testName)}\n`;
    }
    return out;
  }

  // node (RELATION) — a resolved `RelationNode` (the `atlas node <addr>` read door) for the 2-ended family
  // (#99 R6, AR-12). Recognised by `kind:'relation'` + a `grounding` object; the emit `{ id }` shape below has
  // NEITHER and the `relations` LIST shape above carries `relations` (not a bare `kind`), so no cross-shadowing.
  // A relation has no `claimNorm` — its claim IS the directed triple `endpointA <relationKind> endpointB`, so
  // that is what renders. Before R6 this door produced NO block for a relation (the branch below was gated to
  // advisory|predicate), so a proven `depends-on` was invisible at the user surface. The seal + witness render
  // ONLY when present (additive/absent-tolerant); the witness is a `RelationWitness` (relationKind/target/
  // sourceScope), NOT a `PredicateWitness` (slot/target/scope/atLeast) — a relation has no `PredicateSlot`.
  if (d.kind === 'relation' && typeof d.grounding === 'object' && d.grounding !== null) {
    let out =
      `data:\n  node: ${String(d.id)}\n  tier: ${String(d.tier)}\n  kind: relation\n` +
      `  relation: ${String(d.endpointA)} ${String(d.relationKind)} ${String(d.endpointB)}\n`;
    if (typeof d.seal === 'string') out += `  seal: ${d.seal}\n`;
    if (typeof d.witness === 'object' && d.witness !== null) {
      const w = d.witness as Record<string, unknown>;
      out += `  witness:\n    relationKind: ${String(w.relationKind)}\n    target: ${String(w.target)}\n    sourceScope: ${String(w.sourceScope)}\n`;
    }
    return out;
  }

  // node — a resolved `GroundedFact` (the `atlas node <addr>` read door, N6). Recognised by its `kind`
  // (advisory|predicate) + a `grounding` object — the emit `{ id }` shape below has NEITHER, so it is never
  // shadowed. Renders the node's identity + tier + claim (advisory `claimNorm`, else the `claims` set-union).
  if ((d.kind === 'advisory' || d.kind === 'predicate') && typeof d.grounding === 'object' && d.grounding !== null) {
    const claim =
      typeof d.claimNorm === 'string' && d.claimNorm.length > 0
        ? d.claimNorm
        : Array.isArray(d.claims)
          ? (d.claims as readonly string[]).join('; ')
          : '';
    let out = `data:\n  node: ${String(d.id)}\n  tier: ${String(d.tier)}\n  kind: ${d.kind}\n  claim: ${claim}\n`;
    // #239 — a `seal:'proven'` fact's own re-check derivation (SEAL-CARRIES-ITS-WITNESS, PR #195), the ONE
    // leg the original WP deliberately left un-rendered. Printed ONLY when present (additive/absent-
    // tolerant, matching `seal`/`obviousness`'s own discipline above) — an un-sealed node renders byte-
    // identically to before this change.
    if (typeof d.seal === 'string') out += `  seal: ${d.seal}\n`;
    if (typeof d.witness === 'object' && d.witness !== null) {
      const w = d.witness as Record<string, unknown>;
      // NESTED, deliberately, mirroring the stored shape: `d.scope` (the KNOW-11a AUTHZ scope, e.g.
      // 'atlas:mined') and `d.witness.scope` (the VERIFY-SCOPE directory the oracle ranged over, e.g.
      // 'src/pay') are DIFFERENT things — PR #195 nested them precisely so a reader could not misread one
      // for the other. Indenting `witness:`'s own `scope:` one level under it (rather than a flat
      // `witnessScope:` sibling of a top-level `scope:`) keeps that distinction visible in this render too:
      // the path to each field on the page matches the path to each field on the stored object.
      out += `  witness:\n    slot: ${String(w.slot)}\n    target: ${String(w.target)}\n    scope: ${String(w.scope)}\n`;
      if (typeof w.atLeast === 'number') out += `    atLeast: ${w.atLeast}\n`;
    }
    return out;
  }

  // emit { id } — the CAS id of the persisted fact.
  if (typeof d.id === 'string') {
    return `data:\n  id: ${d.id}\n`;
  }

  // init { territories } — the structural move-in. An EMPTY territory set renders NO block (there are no
  // lines to show) so a zero-territory init stays byte-identical to its pre-Seam-2 output (back-compat).
  if (Array.isArray(d.territories)) {
    const names = (d.territories as readonly { name: string }[])
      .map((t) => t.name)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    if (names.length === 0) return '';
    return `data:\n${names.map((n) => `  territory: ${n}`).join('\n')}\n`;
  }

  return '';
}

/**
 * Render a frozen handler `Verdict` to an exit code + stdout (CLI-3). DETERMINISTIC: a PURE function of the
 * verdict — NO clock, NO nonce, NO duration — so the same verdict renders byte-identically every time
 * (CLI-3c). The exit code is `f(status)` (CLI-3b, `deriveStatus`), and the stdout block carries `status`
 * plus BOTH guidance fields (`next`, `invariant`) in a fixed order (CLI-3d — guidance always present), then
 * the Seam-2 `data:` block when the verdict is `ok` and carries a known data shape (else nothing appended).
 */
export function renderVerdict(v: Verdict): CliVerdict {
  return renderAs(v, deriveStatus(v));
}

/**
 * Render a verdict the CLI itself has already classified as a GOVERNANCE REFUSAL — `status: rejected`,
 * exit 2 — through the SAME byte-for-byte body as {@link renderVerdict}.
 *
 * WHY IT EXISTS RATHER THAN A BRANCH IN `deriveStatus`. `deriveStatus` is a pure function of ONE verdict and
 * classifies by the RECORD a governed door carries back (`emitted:false` / `linked:false` / a non-zero
 * reconcile `exitCode`). A refusal raised at the ENTRYPOINT, before any door opens, has no such record and
 * never will — there is no door result to inspect. Fabricating an `EmitOut` so the duck-type fires would be
 * a lie in the data, and widening `deriveStatus` to treat every `ok:false` as a rejection would re-classify
 * an unwired tool and a parse error as governance refusals, which they are not (it also MOVES the pinned
 * SCN-CLI-3b exit derivation). So the classification is made where the knowledge is — at the call site that
 * knows a gate refused — and the rendering stays one function.
 */
export function renderRefusal(v: Verdict): CliVerdict {
  return renderAs(v, 'rejected');
}

/** The shared body: identical bytes for a given verdict, with the status/exit supplied by the caller. */
function renderAs(v: Verdict, status: Status): CliVerdict {
  const dataBlock = v.ok && v.data !== undefined ? renderData(v.data) : '';
  // F5: on a fail-closed / rejected verdict (`ok:false` with a reason), render the REASON so the CLI door is
  // as legible as the MCP `isError` door — the governed refusal is never silent. DETERMINISTIC: a pure
  // function of `v.rejected`, appended after the status/guidance lines (mutually exclusive with `dataBlock`,
  // which renders only on `ok`). An `ok` verdict carries no reason ⇒ pre-existing output stays byte-identical.
  const reasonBlock = !v.ok && v.rejected ? `reason: ${v.rejected}\n` : '';
  const stdout =
    `status: ${status}\n` +
    `next: ${v.guidance.next}\n` +
    `invariant: ${v.guidance.invariant}\n` +
    reasonBlock +
    dataBlock;
  return { exitCode: EXIT[status], stdout };
}
