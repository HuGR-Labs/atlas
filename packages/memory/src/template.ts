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
