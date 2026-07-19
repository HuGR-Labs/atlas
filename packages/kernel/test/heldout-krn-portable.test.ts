// @atlas/kernel — test/heldout-krn-portable.test.ts
//
// MICROSCOPE cold-review GATE (held-out leg). Fresh cases authored from the `held_out: true` -2 fixtures
// the WP-1.1-b.KERNEL builder was BLINDED to: SCN-KERNEL-6a-2 (a CAS carrying an event log + a folded
// union node round-trips 1:1) and SCN-KERNEL-6b-2 (no env-relative / proprietary-binary leak, AND the
// malformed-envelope fail-closed path). All assertions are RELATIONAL / round-trip — never a hex digest;
// content keys are minted through the sealed `id` seam. Run against author src UNCHANGED.

import { describe, it, expect } from 'vitest';
import type { Hash, NodeKey } from '@atlas/contracts';
import type { Cas, CasObject } from '../src/types.js';
import { id } from '../src/index.js';
import { asHash } from '../src/brand.js';
import { exportCas, importCas } from '../src/portable.js';

// The event universe of goldens-krn.md (plain-JSON opaque CAS bodies — the reference keeps the stored
// body opaque JSON, fspec-merge:107). contentHash values are the frozen fixture hashes.
const e1 = { kind: 'Event', nodeKey: 'claim:acme-arr-2024', seq: 1, contentHash: '1c9f2a', fresh: true, supersedes: [] as string[] };
const e2 = { kind: 'Event', nodeKey: 'claim:acme-arr-2024', seq: 2, contentHash: '7e40bb', fresh: true, supersedes: [] as string[] };
const e3 = { kind: 'Event', nodeKey: 'claim:acme-hq', seq: 3, contentHash: '3d81ee', fresh: true, supersedes: [] as string[] };

// The folded union node claim:acme-arr-2024 = {e1,e2} — entries as a plain-JSON object keyed by
// contentHash (fspec-merge:138), so the whole node is an open-JSON CasObject.
const unionNode = {
  kind: 'Node',
  nodeKey: 'claim:acme-arr-2024',
  entries: { '1c9f2a': e1, '7e40bb': e2 },
};

// Env-relative + proprietary-binary leak markers (SCN-6b-2): none may appear in the serializer's envelope.
const ENV_REF = /\$ATLAS_HOME|\bfile:\/\/|~\/|%[A-Z_]+%/;
const PROPRIETARY_BIN = /;base64,|application\/octet-stream|"blob"\s*:\s*"[A-Za-z0-9+/]{16,}={0,2}"/;

describe('GATE held-out — SCN-KERNEL-6a-2: CAS with event log + union node round-trips 1:1', () => {
  it('deepEqual(cas, import(export(cas))) with the log {e1,e2,e3} AND the union node preserved', () => {
    const cas: Cas = new Map<Hash, CasObject>([
      [id(e1), e1],
      [id(e2), e2],
      [id(e3), e3],
      [id(unionNode), unionNode],
    ]);

    const round = importCas(exportCas(cas));

    // 1:1 replay into a FRESH store — the log AND the union node survive verbatim.
    expect(round).toEqual(cas);
    expect(round).toBeInstanceOf(Map);
    expect(round).not.toBe(cas);
    // held-out teeth (breaks-on "export omits the EventLog so the union node can't be re-folded"):
    // every log entry AND the union node present under its exact content id — nothing dropped.
    expect(round.size).toBe(4);
    expect(round.get(id(e1))).toEqual(e1);
    expect(round.get(id(e2))).toEqual(e2);
    expect(round.get(id(e3))).toEqual(e3);
    // the union node re-resolves 1:1 — a re-fold would reproduce {e1,e2} on claim:acme-arr-2024.
    expect(round.get(id(unionNode))).toEqual(unionNode);
    expect((round.get(id(unionNode)) as typeof unionNode).entries).toEqual({ '1c9f2a': e1, '7e40bb': e2 });
  });
});

describe('GATE held-out — SCN-KERNEL-6b-2: no env/binary leak + malformed-envelope fails closed', () => {
  const cas: Cas = new Map<Hash, CasObject>([
    [id(e1), e1],
    [id(unionNode), unionNode],
  ]);

  it('the dump carries no env-relative reference and no proprietary binary encoding — open JSON only', () => {
    const dump = exportCas(cas);
    expect(() => JSON.parse(dump) as unknown).not.toThrow();
    // 0 env-relative refs ($ATLAS_HOME, file://, ~/, %VAR%) and 0 proprietary binary encodings (base64 blob).
    expect(dump).not.toMatch(ENV_REF);
    expect(dump).not.toMatch(PROPRIETARY_BIN);
    // and it still replays 1:1 (self-contained).
    expect(importCas(dump)).toEqual(cas);
  });

  it('import FAILS CLOSED on a structurally-malformed envelope (never a partial/fabricated store)', () => {
    // non-JSON text
    expect(() => importCas('}{ not json')).toThrow();
    // valid JSON but no OKF envelope
    expect(() => importCas('null')).toThrow();
    expect(() => importCas('42')).toThrow();
    expect(() => importCas('[]')).toThrow();
    // wrong format tag
    expect(() => importCas(JSON.stringify({ format: 'not-okf', version: 1, objects: {} }))).toThrow();
    // missing / wrong-typed version
    expect(() => importCas(JSON.stringify({ format: 'atlas-okf', objects: {} }))).toThrow();
    expect(() => importCas(JSON.stringify({ format: 'atlas-okf', version: '1', objects: {} }))).toThrow();
    // objects is an array (not an object map) — must be rejected, not coerced
    expect(() => importCas(JSON.stringify({ format: 'atlas-okf', version: 1, objects: [] }))).toThrow();
    // objects missing entirely
    expect(() => importCas(JSON.stringify({ format: 'atlas-okf', version: 1 }))).toThrow();
    // a WELL-FORMED envelope still imports (fail-closed, not fail-always)
    const good = JSON.stringify({ format: 'atlas-okf', version: 1, objects: { [asHash('abcd')]: e1 } });
    expect(() => importCas(good)).not.toThrow();
    expect(importCas(good).get(asHash('abcd'))).toEqual(e1);
  });
});
