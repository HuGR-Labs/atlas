// @atlas/memory — src/template.ts  (WP-6.25-b.MEM · MEM-5)
//
// The templated-write gate, fail-closed (MEM-5). Every Memory write fills its per-type template — the four
// frozen entry types (types.ts) — or is REJECTED fail-closed: a missing required field NEVER persists (0
// free prose), and prose spilling OUTSIDE a type's fixed template keys is likewise rejected. The template is
// a FIXED field skeleton (structured, never a prose blob), so this file is the per-type VALIDATOR + the
// canonical STRUCTURED render (a `key=<json>` block over the template keys in fixed order, byte-stable).

import type { MemoryEntry, MemoryKind } from './types.js';

// ── frozen templated-write surface, co-located here (was ref/template.ts) ──────────────────────────────────

/**
 * The fail-closed validation verdict (MEM-5). `valid:false` rejects the write — no invalid entry persists.
 *
 * [PINNED —error payload not frozen] the reference freezes "rejected fail-closed on any missing
 * field / over cap / out-of-section prose", not a concrete error shape; `reasons` is the honest minimum
 * (the failed checks), NOT an invented diagnostic record.
 */
export interface TemplateVerdict {
  readonly valid: boolean;
  readonly reasons: readonly string[]; // failed checks (missing field / over cap / out-of-section) — empty iff valid
}

export interface TemplateApi {
  /** Validate a write against its per-type required-field set + section bounds; rejects fail-closed on
   *  any missing field / over cap / out-of-section prose (MEM-5). Pure + total. (method-tags-mem:53) */
  validate(kind: MemoryKind, entry: MemoryEntry): TemplateVerdict;

  /** The canonical STRUCTURED render of a templated entry — never a prose blob, byte-stable for equal
   *  input (the driftless discipline mirrored from the pack/invariant render).
   *
   *  [PINNED —exact render format not frozen] The reference pins "structured, never prose" but freezes
   *  no concrete serialization; transcribed as `string` (a canonical structured line/block), NOT an
   *  invented layout. */
  render(kind: MemoryKind, entry: MemoryEntry): string;
}

// re-export the entry vocabulary the tests build fixtures over (barrel wired at SEAL — test imports src).
export type {
  MemoryEntry,
  MemoryKind,
  LogbookEntry,
  TaskMemoryEntry,
  PrMemoryEntry,
  ProjectMemoryEntry,
  MemoryRecord,
  MemoryStore,
  MemberId,
  Ref,
} from './types.js';

// ── the per-type templates (the frozen entry field skeletons — types.ts) ──────────────────────────────────

/** The REQUIRED fields per Memory type — a write missing any is rejected fail-closed (MEM-5). */
const REQUIRED: Record<MemoryKind, readonly string[]> = {
  project: ['rule', 'scope', 'frecency'],
  task: ['taskId', 'attempted', 'failedWith', 'stoppedAt', 'lesson'],
  pr: ['prId', 'decisions', 'reviewOutcomes', 'knowledgeDelta'],
  logbook: ['prId', 'at', 'territories', 'shipped', 'decisions', 'tradeoffs', 'risks', 'openThreads', 'links'],
};

/** The OPTIONAL fields per type — present in the template, never required. */
const OPTIONAL: Record<MemoryKind, readonly string[]> = {
  project: ['grounding'],
  task: ['ref'],
  pr: ['ref'],
  logbook: [],
};

/** The full closed key set of a type's template = required ∪ optional. A key outside it is out-of-section. */
function templateKeys(kind: MemoryKind): ReadonlySet<string> {
  return new Set([...REQUIRED[kind], ...OPTIONAL[kind]]);
}

// ── the DERIVED MemoryKind (ARCH-9 applied one layer down) ───────────────────────────────────────────────

/** The four types, in a fixed order so an ambiguous entry reports its candidates deterministically. */
const KINDS: readonly MemoryKind[] = ['project', 'task', 'pr', 'logbook'];

/**
 * Raised when an entry's shape does not identify exactly one template — no candidate, or more than one.
 * Fail-closed: an entry the discriminator cannot name is never written under a guessed type.
 */
export class UndeterminedKindError extends Error {
  readonly candidates: readonly MemoryKind[];
  constructor(candidates: readonly MemoryKind[]) {
    super(
      candidates.length === 0
        ? 'MEM-5 kind derivation: no template matches this entry (it satisfies no type\u2019s required keys, ' +
          'or carries keys outside every template) \u2014 rejected, never written under a guessed type'
        : `MEM-5 kind derivation: entry matches MORE THAN ONE template (${candidates.join(', ')}) — the ` +
          'templates are no longer mutually exclusive, so the derivation is not sound; rejected',
    );
    this.name = 'UndeterminedKindError';
    this.candidates = candidates;
  }
}

/**
 * Derive an entry's `MemoryKind` from its SHAPE — the unique type whose required keys are all present and
 * whose template contains every key the entry carries.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT A CONVENIENCE. `validate(kind, entry)` takes the type as a PARAMETER,
 * so before this the caller chose which template judged their own write. That is the confused deputy the
 * architecture reference forbids by name at the governance doors (ARCH-9: *"a gate-selecting field is
 * derived, never chosen"*), one layer down and in the same shape — `kind` selects `REQUIRED[kind]`, which
 * IS the gate. A caller could claim `project` for a logbook payload and be judged against three keys
 * instead of nine. `partition()` already derives the Memory-vs-Knowledge axis; this closes the other one,
 * so `put` now derives BOTH discriminants and the payload announces neither.
 *
 * SOUNDNESS IS CHECKED, NOT ASSUMED. The derivation is sound only while the four templates are mutually
 * exclusive under this predicate. That is a property of the data, not a wish, so a tie is an ERROR rather
 * than a first-match win: if a future template makes two types simultaneously satisfiable, this fails
 * loudly instead of silently picking the one that happens to be listed first.
 *
 * Pure + total over any input — an untemplated value is inspected behind `Record<string, unknown>` and
 * yields the no-candidate error, never a throw from property access.
 */
export function memoryKindOf(entry: MemoryEntry): MemoryKind {
  // `Object.keys(null)` THROWS a TypeError, so totality is not free here — an explicit non-object guard is
  // what makes the sentence above true. A test asserted the null case and passed on the WRONG throw.
  if (entry === null || typeof entry !== 'object') throw new UndeterminedKindError([]);
  const rec = entry as unknown as Record<string, unknown>;
  const keys = Object.keys(rec);
  const candidates = KINDS.filter((k) => {
    if (REQUIRED[k].some((r) => rec[r] === undefined)) return false;
    const allowed = templateKeys(k);
    return keys.every((key) => allowed.has(key));
  });
  if (candidates.length !== 1) throw new UndeterminedKindError(candidates);
  return candidates[0] as MemoryKind;
}

// ── MEM-5: the fail-closed validator ─────────────────────────────────────────────────────────────────────

/**
 * MEM-5 — validate a write against its per-type template: REJECT fail-closed on (a) any missing required
 * field, or (b) any key OUTSIDE the fixed template (the logbook's out-of-section free-form prose). Pure +
 * total — an untemplated write is inspected defensively behind `Record<string, unknown>`; nothing throws.
 */
export function validate(kind: MemoryKind, entry: MemoryEntry): TemplateVerdict {
  const rec = entry as unknown as Record<string, unknown>;
  const reasons: string[] = [];

  for (const key of REQUIRED[kind]) {
    if (rec[key] === undefined) reasons.push(`missing field: ${key}`);
  }
  const allowed = templateKeys(kind);
  for (const key of Object.keys(rec)) {
    if (!allowed.has(key)) reasons.push(`out-of-section prose: ${key}`);
  }
  return { valid: reasons.length === 0, reasons };
}

// ── MEM-5: the canonical STRUCTURED render (never a prose blob) ───────────────────────────────────────────

/**
 * The canonical structured render of a templated entry — the template keys (required, then optional) in a
 * FIXED order, each `key=<json>`, joined by newlines. Byte-stable for equal input (the driftless discipline
 * mirrored from the pack/invariant render), and structured — never a free-form prose blob.
 */
export function render(kind: MemoryKind, entry: MemoryEntry): string {
  const rec = entry as unknown as Record<string, unknown>;
  const keys = [...REQUIRED[kind], ...OPTIONAL[kind]];
  return keys
    .filter((k) => rec[k] !== undefined)
    .map((k) => `${k}=${JSON.stringify(rec[k])}`)
    .join('\n');
}

// ── frozen-oracle conformance (compile-time differential-vs-oracle) ──────────────────────────────────────

/** Bind the built surface to the FROZEN `TemplateApi` (`validate` + `render`). */
export function makeTemplateApi(): TemplateApi {
  return { validate, render };
}

const _templateCheck: () => TemplateApi = makeTemplateApi;
void _templateCheck;
