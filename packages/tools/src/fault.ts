// @atlas/tools — src/fault.ts   (ERROR ATTRIBUTION for the one handler — WP-F2F5 legibility)
//
// ── THE DEFECT THIS MODULE EXISTS TO CLOSE ───────────────────────────────────────────────────────────────
// `createHandler`'s catch used to label EVERY leg throw `malformed args — fail-closed: <message>`. Three
// shipped conditions were measured wearing that label:
//
//   1. `TypeError: Cannot read properties of undefined (reading 'contentHash')` — a fault INSIDE the sameAs
//      door, reported to the operator as THE CALLER'S malformed input, at exit 1. A crash wearing a
//      governance verdict is worse than a crash: the operator is sent to debug an invocation that was fine.
//   2. `atlas query --by dependency|trigger needs the composition-root axes` — a deliberate refusal by the
//      composed runtime, mislabelled identically.
//   3. The read-provenance refusal (`untrusted-store: …`) over MCP. `read-provenance.ts` recorded this as a
//      residual it could not fix from its own package, and named this file's owner as the fix site.
//
// It is an ATTRIBUTION defect, not a wording one: in any log or support ticket an internal invariant
// violation was byte-indistinguishable from bad input, and the guidance shipped alongside it told the user
// to go and change their arguments.
//
// ── THE THREE CLASSES, AND HOW EACH IS DECIDED ───────────────────────────────────────────────────────────
//   (a) `malformed-args`  — DECIDED BY THE DOOR, before the leg runs, against the tool's own published
//                           `inputSchema` (TOOLS-3). Not inferred from a throw: inferring it is exactly the
//                           mistake above.
//   (b) refusal           — the leg deliberately declined. Its reason travels VERBATIM, so a refusal that
//                           already carries a discriminant (`untrusted-store: …`) keeps it and
//                           `reasonOf(rejected)` still answers WHICH gate refused.
//   (c) `internal-fault`  — Atlas itself threw. It NAMES ITSELF, and it does NOT borrow the caller-facing
//                           guidance of the tool it happened under.
//
// The class is carried in the DISCRIMINANT — the text before the first `:` of `rejected` — because that is
// the one channel every transport already reproduces byte-for-byte (CLI `reason:` line, MCP `rejected`
// field, in-process `Verdict.rejected`), and because this repo already asserts refusals that way rather
// than by substring (`adapter-io/test/door-regression-support.ts` `reasonOf`, ADR-0007). `faultOf` is the
// decoder, so an embedder compares a value for EQUALITY instead of matching prose.

import type { ToolSchema } from '@atlas/contracts';
import type { Guidance, Verdict } from './types.js';

/** The three error classes a door can produce. `refused` is the residual class: a deliberate `ok:false`. */
export type FaultKind = 'malformed-args' | 'refused' | 'internal-fault';

/** The discriminant of class (a) — the arguments did not parse against the tool's published schema. */
export const FAULT_MALFORMED_ARGS = 'malformed-args';

/** The discriminant of class (c) — Atlas threw while serving a well-formed call. */
export const FAULT_INTERNAL = 'internal-fault';

/** The DISCRIMINANT of a rejection — everything before the first `:`. Mirrors `reasonOf` in the adapter-io
 *  door-regression support module; duplicated (not imported) because `tools` has zero edges to the ring. */
const discriminantOf = (rejected: string | undefined): string => (rejected ?? '').split(':')[0]!;

/**
 * The class of a verdict's failure, or `undefined` when it did not fail. Total.
 *
 * Everything that is not one of THIS module's two discriminants is `refused` — a deliberate `ok:false`
 * decision by a door, which includes the composition root declining a tool it never bound
 * (`tool '…' not wired at this seam`). That residual is the honest reading: the handler knows it did not
 * mint the string itself, and it knows nothing threw.
 */
export function faultOf(v: Verdict<unknown>): FaultKind | undefined {
  if (v.ok) return undefined;
  const d = discriminantOf(v.rejected);
  if (d === FAULT_MALFORMED_ARGS) return FAULT_MALFORMED_ARGS;
  if (d === FAULT_INTERNAL) return FAULT_INTERNAL;
  return 'refused';
}

/** An error may TAG itself, overriding the inference below. Structural (never `instanceof`): a duplicated
 *  module instance — two `dist` copies of `@atlas/tools` on one process — breaks identity, not a property. */
export interface FaultTagged {
  readonly atlasFault?: FaultKind;
}

/** The error class a leg throws to declare class (a) itself — the extension point for a leg that parses its
 *  own arguments beyond what the published schema can express. Tagged structurally, so it survives the
 *  duplicate-module-instance hazard above. */
export class MalformedArgsError extends Error {
  readonly atlasFault: FaultKind = FAULT_MALFORMED_ARGS;
  constructor(message: string) {
    super(message);
    this.name = 'MalformedArgsError';
  }
}

/**
 * The `Error` subclasses a JavaScript ENGINE raises for a program fault. Nothing in this codebase throws one
 * deliberately — `Cannot read properties of undefined` is always a `TypeError` the runtime minted — so their
 * presence is the tell that the throw was NOT a decision. Stated as the residual it is: a leg COULD throw a
 * `TypeError` on purpose and be misfiled as internal, which is why {@link FaultTagged} exists to override.
 */
const ENGINE_FAULTS: ReadonlySet<string> = new Set([
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'EvalError',
  'URIError',
]);

/** The tag an error set on itself, when it is one of the three classes. */
function taggedKind(e: unknown): FaultKind | undefined {
  const tag = (e as FaultTagged | null | undefined)?.atlasFault;
  return tag === FAULT_MALFORMED_ARGS || tag === FAULT_INTERNAL || tag === 'refused' ? tag : undefined;
}

/**
 * Classify a THROWN value into one of the three classes. Total — every value lands somewhere.
 *
 * Order: an error that TAGGED itself wins (a leg knows more than this inference can). Otherwise a thrown
 * NON-`Error` (a bare string, `undefined`, a plain object) is internal — every deliberate refusal in this
 * product throws a named `Error` subclass, so a raw value is a code path nobody wrote — and an engine fault
 * is internal. What is left is a deliberately constructed `Error`: a refusal.
 */
export function classifyThrown(e: unknown): FaultKind {
  const tagged = taggedKind(e);
  if (tagged !== undefined) return tagged;
  if (!(e instanceof Error)) return FAULT_INTERNAL;
  return ENGINE_FAULTS.has(e.name) ? FAULT_INTERNAL : 'refused';
}

/** The reason text of class (a) when a LEG declared it (rather than the door deciding it): the leg's own
 *  message, carrying the discriminant exactly once. */
export function malformedReason(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  return discriminantOf(message) === FAULT_MALFORMED_ARGS ? message : `${FAULT_MALFORMED_ARGS}: ${message}`;
}

/** A thrown value rendered for a human, name included — `TypeError: Cannot read properties of undefined …`. */
function describe(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return `a non-Error value was thrown (${typeof e}): ${String(e)}`;
}

/** The reason text of class (c). It names ITSELF as ours and says, in the first clause, that the caller's
 *  arguments were accepted — the sentence the old label got exactly backwards. */
export function internalReason(tool: string, e: unknown): string {
  return (
    `${FAULT_INTERNAL}: Atlas threw while serving a well-formed '${tool}' call. This is a defect in Atlas, ` +
    `not in your arguments — the call passed the published input schema and was dispatched. ${describe(e)}`
  );
}

/**
 * The guidance class (c) ships. It REPLACES the per-tool guidance on purpose: the tool guidance is written
 * for the caller ("scope must be a path string"), and stamping it on our own crash is the same blame-shift
 * as the label. Non-empty on both fields (TOOLS-4).
 */
export const INTERNAL_GUIDANCE: Guidance = {
  next: 'nothing in this invocation needs changing — report the fault text above with the tool name and the arguments you passed; re-running it unchanged will reproduce it',
  invariant:
    'TOOLS-2: the handler is total, and a fault inside Atlas NAMES ITSELF as internal — it is never re-labelled as the caller\'s malformed input and never borrows a refusal reason that belongs to the caller',
};

// ── class (a): the arguments, checked against the tool's OWN published schema ─────────────────────────────

/** A JSON value's kind, for a message a human can act on. */
function kindOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'an array';
  return typeof v;
}

/** Does `v` satisfy the JSON-Schema primitive `type`? Unknown/absent types are UNCHECKED (return `true`) —
 *  this validator narrows, it never invents a constraint the published schema does not state. */
function satisfies(type: string, v: unknown): boolean {
  switch (type) {
    case 'string':
      return typeof v === 'string';
    case 'number':
      return typeof v === 'number' && Number.isFinite(v);
    case 'integer':
      return typeof v === 'number' && Number.isInteger(v);
    case 'boolean':
      return typeof v === 'boolean';
    case 'array':
      return Array.isArray(v);
    case 'object':
      return typeof v === 'object' && v !== null && !Array.isArray(v);
    default:
      return true;
  }
}

/** The declared `{ properties: { k: { type } } }` map of a published input schema, structurally. */
function declaredTypes(schema: ToolSchema): ReadonlyMap<string, string> {
  const props = (schema.inputSchema as { properties?: unknown }).properties;
  const out = new Map<string, string>();
  if (typeof props !== 'object' || props === null) return out;
  for (const [key, spec] of Object.entries(props as Record<string, unknown>)) {
    const type = (spec as { type?: unknown } | null)?.type;
    if (typeof type === 'string') out.set(key, type);
  }
  return out;
}

/**
 * Class (a), decided by the door: the `malformed-args` reason, or `undefined` when the arguments parse.
 *
 * TWO checks, and the boundary between them is deliberate:
 *   - the ENVELOPE — a schema of `type:'object'` demands an object. `undefined` / a bare string / an array
 *     arriving over MCP is the literal "the arguments did not parse", and it is the shape that used to
 *     produce `Cannot read properties of undefined (reading 'scope')` under the caller's name.
 *   - the DECLARED TYPE of each property that is PRESENT.
 *
 * REQUIRED-PRESENCE IS DELIBERATELY NOT CHECKED HERE, and the reason is measured rather than aesthetic:
 * `cli/test/wp-9.1.1-a-cli.test.ts` SCN-CLI-3b pins the status derivation over `handle('atlas-emit', {})`,
 * `handle('atlas-reconcile', {})` and `handle('atlas-init', {})` — canned legs that ignore their arguments —
 * at exit 2 / 2 / 0. Enforcing `required` here re-classifies all three as usage errors and MOVES those
 * shipped goldens. `additionalProperties` is likewise unenforced: the composed query leg reads a `by` mode
 * the published schema does not declare, so enforcing it would refuse `--by dependency` outright.
 * Both gaps are stated, not closed, because closing either is a golden change and not this seat's to make.
 */
export function malformedArgsReason(tool: string, schema: ToolSchema, args: unknown): string | undefined {
  return envelopeOrTypeReason(tool, schema, args);
}

/**
 * The class-(a) reason for a MISSING REQUIRED argument — applied ONLY as a fallback on the THROW path, and
 * that placement is the whole design.
 *
 * Required-presence cannot be enforced up front without moving three shipped status goldens (see above). But
 * omitting a required argument is unambiguously the caller's, and leaving it to the engine produces exactly
 * the misattribution this seat exists to remove: with no marshaller, `atlas-query` with no `scope` reaches
 * the leg, the leg does `scope.startsWith(…)`, and a `TypeError` comes back — which the classifier, reading
 * an engine fault, would call a defect of ours. So when a throw WOULD be filed as internal, the published
 * `required` set is consulted first: if the caller left a required argument out, that is the better
 * explanation and it wins. It cannot over-fire — a leg that tolerates the omission never reaches the catch,
 * which is precisely why `handle('atlas-emit', {})` still returns its governed `emitted:false` refusal.
 */
export function missingRequiredReason(tool: string, schema: ToolSchema, args: unknown): string | undefined {
  const required = (schema.inputSchema as { required?: unknown }).required;
  if (!Array.isArray(required)) return undefined;
  const bag = typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {};
  const missing = required.filter((k): k is string => typeof k === 'string' && !(k in bag));
  if (missing.length === 0) return undefined;
  return `${FAULT_MALFORMED_ARGS}: '${tool}' requires ${missing.map((k) => `'${k}'`).join(', ')}; not supplied`;
}

/** The two up-front checks — the envelope, then the declared type of each property that is present. */
function envelopeOrTypeReason(tool: string, schema: ToolSchema, args: unknown): string | undefined {
  const wantsObject = (schema.inputSchema as { type?: unknown }).type === 'object';
  if (wantsObject && (typeof args !== 'object' || args === null || Array.isArray(args))) {
    return `${FAULT_MALFORMED_ARGS}: '${tool}' takes a JSON object of arguments; it received ${kindOf(args)}`;
  }
  if (typeof args !== 'object' || args === null) return undefined;
  const bag = args as Record<string, unknown>;
  for (const [key, type] of declaredTypes(schema)) {
    if (!(key in bag)) continue; // absent ⇒ the leg's business (see the note above)
    if (satisfies(type, bag[key])) continue;
    return `${FAULT_MALFORMED_ARGS}: '${tool}' argument '${key}' must be ${type}; it received ${kindOf(bag[key])}`;
  }
  return undefined;
}
