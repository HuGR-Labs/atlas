// harness/gates/req-clause-guard.test.mjs — the teeth of the REQ→INV quote check, on a fixture corpus.
//
// `gate-directory.test.mjs` proves this file's gate CAN fail (empty tree ⇒ non-zero). That is not the same
// as proving it checks the RIGHT thing on a POPULATED tree: a gate can die on a missing directory and be
// vacuous on real input. These cases are that second half. Each one is a MUTATION of a corpus the gate
// passes — flip one property, the gate must go red, and the message must name the row.
//
// Every case runs the gate as a SUBPROCESS against a fixture repo (`REQ_CLAUSE_ROOT`), with the ledger
// supplied out of band (`REQ_CLAUSE_LEDGER`). Importing it would run its top-level sweep and `process.exit`.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GATE = join(dirname(fileURLToPath(import.meta.url)), 'req-clause-guard.mjs');

/** A fixture repo: `docs/requirements/req-fix.md` + `docs/reference/atlas-fix.md`. */
function run(reqBody, refBody, ledger = {}, pins = {}) {
  const root = mkdtempSync(join(tmpdir(), 'atlas-reqclause-'));
  try {
    mkdirSync(join(root, 'docs', 'requirements'), { recursive: true });
    mkdirSync(join(root, 'docs', 'reference'), { recursive: true });
    writeFileSync(join(root, 'docs', 'requirements', 'req-fix.md'), reqBody);
    writeFileSync(join(root, 'docs', 'reference', 'atlas-fix.md'), refBody);
    try {
      const stdout = execFileSync(process.execPath, [GATE], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          REQ_CLAUSE_ROOT: root,
          REQ_CLAUSE_LEDGER: JSON.stringify(ledger),
          REQ_CLAUSE_PINS: JSON.stringify(pins),
        },
      });
      return { code: 0, out: stdout };
    } catch (e) {
      return { code: e.status ?? -1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const REF = [
  '## Invariants',
  '',
  '- **FIX-1 The bounded thing.** It MUST return a `≤ ~2K` **governing** pack of `tier≥T1`',
  '  invariants, beside a separately capped ADVISORY band; `stale:true` MUST mean re-ground.',
  '- **FIX-2 The other thing.** `anchors <path>` MUST return exactly the units the index carries',
  '  under `path` — each with its `kind` — and MUST NOT invent, omit, or reorder a unit. Phrased as',
  '  "the unit is structurally unchanged," never as "the claim is true."',
  '',
  '## Acceptance',
  '',
  '1. **FIX-2** — the acceptance restatement, which says a probe reports the reason it declined.',
  '',
].join('\n');

const req = (id, source, clause) =>
  ['# Requirements — fixture', '', `### ${id} — a requirement`, `source: ${source}`, 'The thing shall do the thing.', `normative-clause: ${clause}`, ''].join('\n');


/** The digest the gate PRINTS in its own "PIN the ratified text" instruction. It is never recomputed
 *  here, so these tests cannot agree with a broken implementation by reimplementing it. */
function pinFor(reqBody, refBody, ledgerKey) {
  const out = run(reqBody, refBody, { [ledgerKey]: 'known' }).out;
  const m = /"digest": "([0-9a-f]{32})"/.exec(out);
  expect(m, 'the UNPROTECTED refusal must print the digest to pin').not.toBeNull();
  return m[1];
}
describe('req-clause-guard — a quote that left its invariant fails the build', () => {
  it('PASSES when the quote is still in the cited invariant (the control — without it every red below is vacuous)', () => {
    const r = run(req('REQ-FIX-1a', 'INV-FIX-1 @ reference/atlas-fix.md#fix-1', '"return a `≤ ~2K` **governing** pack of `tier≥T1` invariants"'), REF);
    expect(r.out).toContain('req-clause-guard: OK');
    expect(r.code).toBe(0);
  });

  it('FAILS on the real shape: the invariant was amended and the quote was not fanned out', () => {
    // The pre-amendment wording of the sentence above — exactly the REQ-TOOLS-6b defect.
    const r = run(req('REQ-FIX-1a', 'INV-FIX-1 @ reference/atlas-fix.md#fix-1', '"return a `≤ ~2K` pack of `tier≥T1` invariants"'), REF);
    expect(r.code).toBe(1);
    expect(r.out).toContain('REQ-FIX-1a');
    expect(r.out).toContain('Diverges after 17 char(s)');
  });

  it('a `…` elision is honoured — fragments must occur VERBATIM and IN ORDER', () => {
    const src = 'INV-FIX-2 @ reference/atlas-fix.md#fix-2';
    expect(run(req('REQ-FIX-2a', src, '"MUST return exactly the units the index carries … MUST NOT invent, omit"'), REF).code).toBe(0);
    // …and order is enforced: the same two fragments, swapped, must NOT pass.
    expect(run(req('REQ-FIX-2a', src, '"MUST NOT invent, omit … MUST return exactly the units the index carries"'), REF).code).toBe(1);
  });

  it('`\\"` is the escape for a quote inside the span, not a divergence', () => {
    const r = run(req('REQ-FIX-2b', 'INV-FIX-2 @ reference/atlas-fix.md#fix-2', '"never as \\"the claim is true.\\""'), REF);
    expect(r.code).toBe(0);
  });

  it('an AMENDMENT TOMBSTONE cannot re-satisfy a stale quote (the hole that made this gate report OK)', () => {
    const withTombstone = REF.replace(
      '  invariants, beside a separately capped ADVISORY band; `stale:true` MUST mean re-ground.',
      ['  invariants, beside a separately capped ADVISORY band; `stale:true` MUST mean re-ground.',
        '  <!-- AMENDED: was "return a `≤ ~2K` pack of `tier≥T1` invariants" -->'].join('\n'),
    );
    const r = run(req('REQ-FIX-1a', 'INV-FIX-1 @ reference/atlas-fix.md#fix-1', '"return a `≤ ~2K` pack of `tier≥T1` invariants"'), withTombstone);
    expect(r.code).toBe(1);
    expect(r.out).toContain('REQ-FIX-1a');
  });

  it('markdown emphasis and case are NOT normalised away — the amendment moved exactly those bytes', () => {
    const src = 'INV-FIX-1 @ reference/atlas-fix.md#fix-1';
    expect(run(req('REQ-FIX-1b', src, '"a `≤ ~2K` governing pack"'), REF).code).toBe(1);      // `**` dropped
    expect(run(req('REQ-FIX-1c', src, '"`stale:true` must mean re-ground"'), REF).code).toBe(1); // MUST → must
  });

  it('a hit at a LATER carrier of the same id is reported, never silently accepted', () => {
    const r = run(req('REQ-FIX-2c', 'INV-FIX-2 @ reference/atlas-fix.md#fix-2', '"a probe reports the reason it declined"'), REF);
    expect(r.code).toBe(1);
    expect(r.out).toContain('another carrier of the same id');
  });

  it('a row it cannot evaluate is NAMED on every run, pass or fail — never counted as a pass', () => {
    const noPtr = run(req('REQ-FIX-3a', 'SECURITY AMENDMENT — NOT a lift', '"anything at all"'), REF);
    expect(noPtr.code).toBe(0);            // nothing is asserted about it…
    expect(noPtr.out).toContain('UNEVALUABLE (1)');
    expect(noPtr.out).toContain('REQ-FIX-3a');   // …but it is named, on a PASSING run
    const badAnchor = run(req('REQ-FIX-3b', 'INV-FIX-9 @ reference/atlas-fix.md#fix-9', '"anything at all"'), REF);
    expect(badAnchor.out).toContain("no invariant block for '#fix-9'");
  });

  it('the LEDGER is shrink-only: it silences a known row, and a stale entry FAILS the gate', () => {
    const stale = req('REQ-FIX-1a', 'INV-FIX-1 @ reference/atlas-fix.md#fix-1', '"return a `≤ ~2K` pack of `tier≥T1` invariants"');
    const key = /REQ-FIX-1a @ ([0-9a-f]{8})/.exec(run(stale, REF, {}).out);
    expect(key, 'the failure must print the ledger key so the entry can be written').not.toBeNull();
    // INV-FIX-1 has exactly one citing REQ here, so ledgering it makes the invariant 100% waived and the
    // WAIVER COVERAGE leg takes over. Pin it, so THIS case still isolates the ledger's own behaviour.
    const pin = { 'docs/reference/atlas-fix.md#fix-1': { digest: pinFor(stale, REF, key[0]), why: 'fixture' } };
    expect(run(stale, REF, { [key[0]]: 'known' }, pin).code).toBe(0);
    // The SAME ledger against a corpus where the row no longer diverges ⇒ RATCHET failure.
    const fixed = req('REQ-FIX-1a', 'INV-FIX-1 @ reference/atlas-fix.md#fix-1', '"return a `≤ ~2K` **governing** pack of `tier≥T1` invariants"');
    const r = run(fixed, REF, { [key[0]]: 'known' });
    expect(r.code).toBe(1);
    expect(r.out).toContain('RATCHET');
  });
});

describe('req-clause-guard — WAIVER COVERAGE: an invariant every citing REQ has waived', () => {
  // Reproduced on the real tree before this leg existed (issue #199): INV-TOOLS-1, the constitutional
  // write-door invariant, is cited by five REQs and all five are ledgered. Its entire normative text was
  // replaced with its own negation and all nine gates exited 0. These cases are that hole, in a fixture.

  const stale = req('REQ-FIX-1a', 'INV-FIX-1 @ reference/atlas-fix.md#fix-1', '"a quote that is not in FIX-1"');
  const ledgerKey = () => /REQ-FIX-1a @ ([0-9a-f]{8})/.exec(run(stale, REF, {}).out)[0];
  const pinned = (k) => ({ 'docs/reference/atlas-fix.md#fix-1': { digest: pinFor(stale, REF, k), why: 'fixture' } });

  it('a 100%-waived invariant with NO pin FAILS, and the refusal says what would restore protection', () => {
    const r = run(stale, REF, { [ledgerKey()]: 'known' });
    expect(r.code).toBe(1);
    expect(r.out).toContain('UNPROTECTED INVARIANT');
    expect(r.out).toContain('docs/reference/atlas-fix.md#fix-1');
    expect(r.out).toContain('REQ-FIX-1a');
    expect(r.out).toContain('un-waiving');                 // route 1 back to protection
    expect(r.out).toContain('harness/inv-text-pins.json'); // route 2, with the digest to use
  });

  it('the pin has TEETH: with the invariant pinned, editing its text FAILS (the #199 splice, in miniature)', () => {
    const k = ledgerKey();
    const pin = pinned(k);
    expect(run(stale, REF, { [k]: 'known' }, pin).code, 'pinned + unedited must PASS').toBe(0);
    // Invert the pinned invariant the way #199 inverted INV-TOOLS-1. Nothing quotes it any more, so the
    // pin is the only thing left holding it.
    const inverted = REF.replace('It MUST return a', 'It MUST NOT return a');
    expect(inverted, 'the mutation must actually change the fixture').not.toBe(REF);
    const r = run(stale, inverted, { [k]: 'known' }, pin);
    expect(r.code).toBe(1);
    expect(r.out).toContain('HAS CHANGED');
    expect(r.out).toContain('docs/reference/atlas-fix.md#fix-1');
  });

  it('a re-wrap of the pinned text is NOT a change — the pin holds words, not line breaks', () => {
    const k = ledgerKey();
    const rewrapped = REF.replace(
      '- **FIX-1 The bounded thing.** It MUST return a `≤ ~2K` **governing** pack of `tier≥T1`\n  invariants, beside',
      '- **FIX-1 The bounded thing.** It MUST return a `≤ ~2K` **governing**\n  pack of `tier≥T1` invariants, beside',
    );
    expect(rewrapped, 'the re-wrap must actually change the bytes').not.toBe(REF);
    expect(run(stale, rewrapped, { [k]: 'known' }, pinned(k)).code).toBe(0);
  });

  it('a pin for an invariant that REGAINED a live quote is STALE and fails — the set shrinks, never grows', () => {
    const k = ledgerKey();
    const pin = pinned(k);
    // Same pin, but now a live REQ quotes FIX-1 again, so nothing about FIX-1 is 100% waived.
    const live = req('REQ-FIX-1z', 'INV-FIX-1 @ reference/atlas-fix.md#fix-1', '"`stale:true` MUST mean re-ground"');
    const r = run(live, REF, {}, pin);
    expect(r.code).toBe(1);
    expect(r.out).toContain('STALE PIN');
  });

  it('a pin cannot be moved between invariants by copy-paste — the anchor is hashed with the text', () => {
    const k = ledgerKey();
    const moved = { 'docs/reference/atlas-fix.md#fix-2': pinned(k)['docs/reference/atlas-fix.md#fix-1'] };
    const r = run(stale, REF, { [k]: 'known' }, moved);
    expect(r.code).toBe(1);
    expect(r.out).toContain('STALE PIN');            // fix-2 is not 100% waived...
    expect(r.out).toContain('UNPROTECTED INVARIANT'); // ...and fix-1 is still unpinned
  });

  it('the coverage table is PRINTED on a passing run, so the class is auditable without a failure', () => {
    const k = ledgerKey();
    const r = run(stale, REF, { [k]: 'known' }, pinned(k));
    expect(r.code).toBe(0);
    expect(r.out).toContain('WAIVER COVERAGE');
    expect(r.out).toContain('UNPROTECTED BY QUOTE  docs/reference/atlas-fix.md#fix-1');
    expect(r.out).toContain('PINNED');
  });
});
