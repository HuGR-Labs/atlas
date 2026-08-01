// harness/gates/drift-patterns.test.mjs — the anti-drift vocabulary's OWN teeth.
//
// `spec-conformance-guard`'s check (2) is a list of regexes, and a regex is the easiest kind of gate to get
// silently wrong in BOTH directions: too loose and it cries wolf until authors write around it, too tight
// and it waves through the exact claim it exists to catch. Both have already happened here, so both
// directions are pinned below with the real corpus.
//
// The MISSES list is the more important one: every entry is a line that actually shipped on `master`.

import { describe, it, expect } from 'vitest';
import { isStaleGovernanceClaim } from './drift-patterns.mjs';

/** Lines that ARE stale governance-count claims — each one shipped, or is the form that shipped. */
const DRIFT = [
  // The one that shipped as the MCP-PUBLISHED description of `atlas-emit` for four days after ADR-0003,
  // telling every agent seat there is one write door. No pattern matched it: the literal
  // `single write door` form was covered, "single **fail-closed** write door" was not.
  'description: \'the single fail-closed write door — every durable write lands here\'',
  'atlas-emit is the single write door',
  'there is one write door',
  'the only write door is emit',
  'a single governed write door',
  // The repo-root constitution, which the sweep did not even READ until the root was added to the walk.
  '`atlas-emit` (4 tools · 1 write door)',
  'the four governed tools',
  'exactly four legs',
  'no fifth tool may be added',
  'four-leg handler',
  'writePaths == 1',
  'cardinality == 4',
];

/** Lines that merely CONTAIN the vocabulary and must not fire — each one is a real line in this repo. */
const CLEAN = [
  // This one false-fired: `one` quantifies `question`, not `write door`. Caught only because it happened to
  // sit in a file the guard swept while the author was watching.
  'the one question a write door must ask is whether the class is weaker',
  'one of the governed write doors is atlas-emit',
  'the two governed write doors (emit, link)',
  'writePaths == 2',
  // Term-of-art + the ADR narrative + doctor's four READ legs — the ALLOW list's whole job.
  'INV-TOOLS-15: the single-write-door structural medium (a store row)',
  'ADR-0003 amended the former "exactly four" to a property',
  'doctor exposes four read legs, none of which writes',
  'the four legs route through DOCTOR_SUBCOMMANDS',
];

describe('anti-drift vocabulary — it catches the claims that shipped', () => {
  for (const line of DRIFT) {
    it(`FLAGS: ${line.slice(0, 62)}`, () => {
      expect(isStaleGovernanceClaim(line)).toBe(true);
    });
  }
});

describe('anti-drift vocabulary — it does NOT cry wolf', () => {
  for (const line of CLEAN) {
    it(`allows: ${line.slice(0, 62)}`, () => {
      expect(isStaleGovernanceClaim(line)).toBe(false);
    });
  }
});
