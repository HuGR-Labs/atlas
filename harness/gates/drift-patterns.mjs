// harness/gates/drift-patterns.mjs — the governance-count DRIFT vocabulary, extracted so it can be TESTED.
//
// These patterns are the whole of `spec-conformance-guard`'s check (2). They live in their own module for
// one reason: a regex nobody can falsify is not a gate. Kept here they are importable by
// `drift-patterns.test.mjs` without importing the guard's top-level work (dist import, repo-wide sweep,
// `process.exit`), so the corpus below is exercised on every `npm test` instead of in someone's shell.
//
// The corpus that motivated each entry is recorded in the test, not paraphrased here.

/** Pre-amendment governance-count forms. A line matching any of these is drift unless {@link ALLOW} clears it. */
export const STALE = [
  /\b(4|four)[ -]?(governance|governed|legs?|tools?|write)\b/i,
  /\bfour-leg\b/i, /\b4-leg\b/i, /\b4-tool\b/i,
  /\bno fifth\b/i, /\bfifth (governance|write) tool\b/i,
  /writePaths ?== ?1\b/i, /write-?[sS]urface ?== ?4\b/i, /cardinality ?== ?4\b/i,
  /\bthe closed four\b/i, /\bthe four governed tools\b/i, /\bexactly four\b/i,
  // The SINGULAR-write-door form. Previously unmatched by ANY pattern — which is how `handler.ts` shipped
  // "the single fail-closed write door" as the MCP-published description of `atlas-emit`, telling every
  // agent seat there is one write door, for four days after the amendment.
  //
  // Matched on the CONCEPT rather than a literal phrase (a literal `/single[ -]write[ -]door/` misses
  // "single **fail-closed** write door"). A plain `.{0,24}` gap false-fired on "…the one question a write
  // door must ask", where `one` quantifies `question`, not `write door` — the ARTICLE is the tell, so the
  // gap forbids one rather than restricting what else may appear.
  //
  // The gap is a CHARACTER class, not `\s`-separated word tokens. A word-token gap silently lost the very
  // form the paragraph above claims to catch: markdown bold, a comma, or backticks between "single" and
  // "write door" are punctuation, not word characters, so `single **fail-closed** write door`,
  // `single, fail-closed write door` and ``a single `fail-closed` write door`` all escaped it. That is
  // strictly weaker than the regex this module was extracted from, in a commit that called itself an
  // extraction — a gate quietly losing teeth is worse than a gate that never had them.
  /\b(?:single|one)\b(?:(?!\b(?:an?|the)\b)[^.\n]){0,26}\bwrite doors?\b/i,
  /\bthe only write door\b/i,
];

/** A line matching any of these is a LEGITIMATE use of the words above, not drift. */
export const ALLOW = [
  // NARROW on purpose: `ADR-0003` specifically, not `ADR-\d+`. This clears the ONE amendment whose
  // narrative must quote the pre-amendment count; a general ADR reference would let any future document
  // re-assert a retired count merely by citing an ADR nearby.
  /ADR-0003/, /\bformer\b/i, /\bamend/i, /\baccidental\b/i, /\bevolves\b/i, /\bwording\b/i, // amendment narrative
  /single-write-door structural/i,            // INV-TOOLS-15 term-of-art (store-row medium)
  /four read legs?/i, /ALL FOUR legs/i, /the four legs, no more/i, /exactly the four legs/i, // doctor read legs
  /GATE's four legs/i, /the four legs route/i, /DOCTOR_SUBCOMMANDS/,
];

/** Is this line a stale governance-count claim? Pure + total — the guard's per-line verdict, verbatim. */
export function isStaleGovernanceClaim(line) {
  return STALE.some((r) => r.test(line)) && !ALLOW.some((r) => r.test(line));
}
