// @atlas/cli — test/mine-gotcha-arm.test.ts  (196b justified vertical slice — the ATLAS_MINE_SLOT=gotcha arm)
//
// The gotcha arm is the OPT-IN semantic slot: valid as an explicit single arm, but DELIBERATELY absent from the
// sound-by-default SET (it lands `justified`, not `proven`). This suite pins A4c:
//   • `resolveMineSlot('gotcha')` resolves the arm (trimmed, case-insensitive) — the singular selector accepts it
//   • an UNKNOWN arm still THROWS (no silent fallback — the fail-silent trap #167 stays closed for gotcha too)
//   • the DEFAULT `resolveMineSlots` set is UNCHANGED — still [advisory, dependency, count], gotcha NOT added
//   • the throw fires on the REAL CLI path (`resolveProposer`) even with no model configured (Luna F4)

import { describe, expect, it } from 'vitest';
import { MINE_SLOT_ENV, resolveMineSlot, resolveMineSlots, resolveProposer } from '../src/mine-proposer.js';

const withSlot = (v: string | undefined): NodeJS.ProcessEnv => (v === undefined ? {} : { [MINE_SLOT_ENV]: v });

describe('A4c — the gotcha arm: opt-in single arm, NOT in the sound-by-default set', () => {
  it.each(['gotcha', 'GOTCHA', ' Gotcha '])('resolveMineSlot accepts the gotcha arm %j (trimmed, case-insensitive)', (v) => {
    expect(resolveMineSlot(withSlot(v))).toBe('gotcha');
  });

  it('resolveMineSlot STILL throws on an unknown arm (gotcha is added, the typo guard is not weakened)', () => {
    expect(() => resolveMineSlot(withSlot('gotchas'))).toThrow(/not a known mining arm/);
    expect(() => resolveMineSlot(withSlot('gotchya'))).toThrow(/not a known mining arm/);
  });

  it('the message names gotcha as a valid arm (so the misconfiguration is self-correcting)', () => {
    expect(() => resolveMineSlot(withSlot('bogus'))).toThrow(/gotcha/);
  });

  it('resolveMineSlots as an EXPLICIT arm ⇒ the singleton [gotcha] (opt-in, isolated to itself)', () => {
    expect(resolveMineSlots(withSlot('gotcha'))).toEqual(['gotcha']);
  });

  it('the DEFAULT set is UNCHANGED — still [advisory, dependency, count], gotcha is NOT sound-by-default', () => {
    // teeth: the whole point of the opt-in — a default `atlas mine` must NOT silently start emitting justified
    // gotchas. If gotcha were added to the default union, this would read four arms.
    expect(resolveMineSlots({})).toEqual(['advisory', 'dependency', 'count']);
    expect(resolveMineSlots(withSlot(''))).toEqual(['advisory', 'dependency', 'count']);
    expect(resolveMineSlots({})).not.toContain('gotcha');
  });

  it('resolveProposer STILL throws on an unknown arm even with no model configured (Luna F4 — validated first)', () => {
    expect(() => resolveProposer('/nonexistent-repo-for-gotcha-gate', withSlot('gotchas'))).toThrow(/not a known mining arm/);
  });
});
