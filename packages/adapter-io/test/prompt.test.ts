// Acceptance suite for `createPromptFactory` — the prompt as a versioned, hashed artifact (ADR-0011 D3).
//
// The load-bearing families:
//   • THE JUSTIFICATION MUST NOT REACH THE MODEL. The template carries its own per-clause reasoning as an
//     HTML comment so the argument is versioned beside the text. If that block were sent, the model would
//     be reading commentary about how often it is expected to abstain — steering the very behaviour the
//     prompt is trying to elicit honestly.
//   • A PROMPT WITHOUT SOURCE IS NEVER SENT. Two distinct refusals guard it: a template that never
//     interpolates the code is rejected at LOAD time, and an unreadable unit throws rather than degrading
//     into an abstention. "No fact here" and "we never showed it the unit" must stay different answers.
//   • THE DIGEST COVERS THE ARTIFACT AS SHIPPED, comment included — provenance answers "which artifact
//     produced this fact", and editing the reasoning edits the artifact.

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { asSubtreeHash } from '@atlas/kernel';
import type { StructRef } from '@atlas/contracts';
import type { Candidate, MinedSignals } from '@atlas/genesis';

import { createPromptFactory, PromptError, shippedTemplatePath } from '../src/prompt.js';
import type { SourceReader } from '../src/prompt.js';

const created: string[] = [];
afterEach(() => {
  while (created.length > 0) rmSync(created.pop()!, { recursive: true, force: true });
});

/** Write a template to a fresh temp dir and return its path. */
function templateAt(body: string): string {
  const d = mkdtempSync(join(tmpdir(), 'atlas-prompt-'));
  created.push(d);
  const p = join(d, 'propose.md');
  writeFileSync(p, body);
  return p;
}

const NO_SIGNALS: MinedSignals = { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] };
const candidateAt = (qualifiedPath: string): Candidate => ({
  site: { kind: 'symbol', qualifiedPath, subtreeHash: asSubtreeHash('st-x') } as StructRef,
  signals: NO_SIGNALS,
  ppr: 0,
  rank: 1,
});

const reader = (text: string | null): SourceReader => ({ read: () => text });

const CODE = 'export function charge(): void { /* the bytes the claim must re-derive from */ }';

function refusalOf(fn: () => unknown): PromptError {
  try {
    fn();
  } catch (e) {
    if (e instanceof PromptError) return e;
    throw new Error(`expected a PromptError, got ${String(e)}`);
  }
  throw new Error('expected a throw, got a return');
}

describe('createPromptFactory — the SHIPPED template', () => {
  const factory = () => createPromptFactory({ source: reader(CODE) });

  it('interpolates the unit path, the unit name and the source', () => {
    const out = factory().build(candidateAt('packages/billing/src/charge.ts::charge'));
    expect(out).toContain('packages/billing/src/charge.ts');
    expect(out).toContain('charge');
    expect(out).toContain(CODE);
  });

  it('leaves NO unfilled placeholder in the sent text', () => {
    // teeth (breaks-on "a slot is renamed in the template but not here"): the model would receive a literal
    // `{{SOURCE}}` and answer about a unit it was never shown.
    expect(factory().build(candidateAt('a/b.ts::b'))).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it('STRIPS the justification comment — the reasoning is versioned, not sent', () => {
    // teeth (breaks-on "stripComments is removed"): the model would read, among other things, the note that
    // abstention is expected to be the common outcome — steering the behaviour instead of eliciting it.
    const out = factory().build(candidateAt('a/b.ts::b'));
    expect(out).not.toContain('<!--');
    expect(out).not.toContain('arXiv'); // a citation that appears ONLY inside the justification block
    expect(out.trimStart().startsWith('You are shown')).toBe(true);
  });

  it('does NOT carry the mined signals — GEN-6 is made structurally unviolable, not instructed', () => {
    // `Candidate.signals` is never read by the builder. A churn/SZZ figure in the prompt is how a signal
    // becomes a "fact"; the surest way to honour GEN-6 is for the model never to see one.
    const cand = { ...candidateAt('a/b.ts::b'), signals: { ...NO_SIGNALS, szzBugCommits: 4242, owners: ['zelda'] } };
    const out = createPromptFactory({ source: reader(CODE) }).build(cand);
    expect(out).not.toContain('4242');
    expect(out).not.toContain('zelda');
  });

  it('the shipped template is the default, resolved without a cwd assumption, and it EXISTS', () => {
    const path = shippedTemplatePath();
    expect(path.endsWith('/prompts/propose.md')).toBe(true);
    expect(existsSync(path)).toBe(true);
    expect(() => factory()).not.toThrow();

    // HONEST LIMIT: this test runs from `src/`, so it cannot by itself catch the packaging bug it was
    // written for — `tsc` copies no assets, so a module-relative path resolved to `dist/prompts/` and the
    // built CLI refused every run while this suite stayed green. It was found by probing the built binary.
    // The regression guard that would catch it is the black-box subprocess run, not this assertion; what
    // this pins is that the path is package-root-relative, which is what makes both layouts agree.
    expect(path).toContain('/adapter-io/prompts/');
    expect(path).not.toContain('/dist/');
  });
});

describe('createPromptFactory — a prompt without source is never sent', () => {
  it('a template that never interpolates {{SOURCE}} is refused at LOAD time', () => {
    // teeth (breaks-on "assertUsable is removed"): every site would get a well-formed ask with no code, and
    // the model would answer all of them from parametric memory — ungrounded facts at full rate.
    const path = templateAt('Say something about {{UNIT}}.');
    const err = refusalOf(() => createPromptFactory({ source: reader(CODE), templatePath: path }));
    expect(err.refusal).toBe('template-has-no-source-slot');
  });

  it('an unreadable unit THROWS — it is not silently an abstention', () => {
    // teeth (breaks-on "the null branch returns the template unfilled / returns ''"): a broken anchor path
    // would report as "this unit holds no fact", so a wholly unreadable repo would look merely barren.
    const err = refusalOf(() => createPromptFactory({ source: reader(null) }).build(candidateAt('a/b.ts::b')));
    expect(err.refusal).toBe('source-unreadable');
    expect(err.message).toContain('a/b.ts::b');
  });

  it('an unreadable TEMPLATE is refused distinctly from an unreadable unit', () => {
    const err = refusalOf(() => createPromptFactory({ source: reader(CODE), templatePath: '/no/such/template.md' }));
    expect(err.refusal).toBe('template-unreadable');
  });
});

describe('createPromptFactory — the digest identifies the artifact as shipped', () => {
  const BODY = '<!-- reason A -->\nAsk about {{UNIT}}:\n{{SOURCE}}\n';

  it('the same template yields the same digest', () => {
    const a = createPromptFactory({ source: reader(CODE), templatePath: templateAt(BODY) });
    const b = createPromptFactory({ source: reader(CODE), templatePath: templateAt(BODY) });
    expect(a.digest).toBe(b.digest);
  });

  it('editing ONLY the justification changes the digest, though the sent text is identical', () => {
    // teeth (breaks-on "the digest is taken over the STRIPPED text"): the reasoning could then be rewritten
    // under a provenance record that claims the artifact is unchanged.
    const a = createPromptFactory({ source: reader(CODE), templatePath: templateAt(BODY) });
    const b = createPromptFactory({ source: reader(CODE), templatePath: templateAt(BODY.replace('reason A', 'reason B')) });
    expect(a.build(candidateAt('a/b.ts::b'))).toBe(b.build(candidateAt('a/b.ts::b'))); // same text sent
    expect(a.digest).not.toBe(b.digest); // different artifact
  });
});

describe('createPromptFactory — anchor naming', () => {
  it('splits `<file>::<symbol>` on the FIRST separator', () => {
    // The assertions are on the EXACT attribute, not on a substring of it. `toContain('src/a.ts')` cannot
    // tell `path="src/a.ts"` from `path="src/a.ts::ns"` — one is a prefix of the other — so a
    // `lastIndexOf` mutant survived it. That is the one-directional blindness of substring assertions,
    // already catalogued in this repo; the fix belongs in the assertion, not in the code.
    const out = createPromptFactory({ source: reader(CODE) }).build(candidateAt('src/a.ts::ns::deep'));
    expect(out).toContain('path="src/a.ts"'); // teeth: `lastIndexOf` yields `path="src/a.ts::ns"`
    expect(out).toContain('name="ns::deep"'); // teeth: `lastIndexOf` yields `name="deep"`
  });

  it('a bare path (file / repo anchor) is its own name — never an empty unit', () => {
    const out = createPromptFactory({ source: reader(CODE) }).build(candidateAt('src/a.ts'));
    expect(out).toContain('path="src/a.ts"');
    expect(out).toContain('name="src/a.ts"');
  });

  it('a TRAILING separator still names the unit — the model is never handed an anonymous anchor', () => {
    // `src/a.ts::` is malformed input from the index, and totality is the house rule: it must not throw and
    // must not degrade. teeth (breaks-on "the empty-name fallback is dropped"): the prompt would carry
    // `name=""`, asking the model to state a fact about a unit it cannot identify — an invitation to answer
    // about the file at large and call it a fact about a symbol.
    const out = createPromptFactory({ source: reader(CODE) }).build(candidateAt('src/a.ts::'));
    expect(out).not.toContain('name=""');
    expect(out).toContain('name="src/a.ts::"');
  });
});
