// @atlas/adapter-io — src/prompt.ts  (ADR-0011 Decision 3: the prompt is a versioned, hashed artifact)
//
// Builds the one S2 proposal prompt from a template that SHIPS AS A FILE (`prompts/propose.md`), rather
// than from a string literal. The template carries GEN-12 (abstention is valid), GEN-4d (no
// self-declaration), GEN-6 (a mined signal is not a fact) and door-2 (non-obvious ∧ actionable). A prompt
// that is freely editable AND invisible turns those invariants into suggestions, so the resolved template
// is DIGESTED and the digest travels with the run: an override is recorded, never silent.
//
// The template's own per-clause justification lives inside it as an HTML comment and is STRIPPED here, so
// the reasoning is versioned next to the text without being sent to the model.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { id } from '@atlas/kernel';
import type { Hash, StructRef } from '@atlas/contracts';
import type { Candidate } from '@atlas/genesis';

/** Why a prompt could not be built. Thrown, never papered over — see `NO_SOURCE` in particular. */
export type PromptRefusal =
  | 'template-unreadable'
  | 'template-has-no-source-slot' // a template that never interpolates the code would send an empty ask
  | 'source-unreadable'; //          sending a source-less prompt is what invites a fabricated fact

export class PromptError extends Error {
  constructor(
    readonly refusal: PromptRefusal,
    message: string,
  ) {
    super(message);
    this.name = 'PromptError';
  }
}

/** The three slots the template may interpolate. `{{SOURCE}}` is MANDATORY (see `assertUsable`). */
const SLOT_SOURCE = '{{SOURCE}}';
const SLOT_PATH = '{{PATH}}';
const SLOT_UNIT = '{{UNIT}}';

/**
 * The shipped template, resolved from the PACKAGE ROOT — the nearest ancestor holding a `package.json`.
 *
 * Not module-relative, and the difference is a real shipping bug rather than a style choice: `tsc` emits to
 * `dist/` and copies no assets, so `dirname(module)/../prompts` resolves to `packages/adapter-io/prompts`
 * from source and to `packages/adapter-io/dist/prompts` — which does not exist — from the build. Tests
 * import from `src/` and would stay green while the shipped CLI refused every run. Found by probing the
 * built binary, never by the suite.
 *
 * No cwd is consulted, so the CLI, the MCP server and a test all resolve the same file.
 */
export function shippedTemplatePath(): string {
  return join(packageRoot(dirname(fileURLToPath(import.meta.url))), 'prompts', 'propose.md');
}

/** Walk up to the nearest directory containing `package.json`. Bounded by the filesystem root, so a module
 *  outside any package yields its own directory rather than looping. */
function packageRoot(from: string): string {
  let dir = from;
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const up = dirname(dir);
    if (up === dir) return from; // reached the root without finding one
    dir = up;
  }
}

/** Read the anchored unit's source. Injected because slicing a symbol out of a file is the AST's business,
 *  not this module's; `null` means the bytes could not be produced (deleted file, unresolvable anchor). */
export interface SourceReader {
  read(site: StructRef): string | null;
}

/** A prompt builder plus the digest of the template it was built from — the pair is what makes an override
 *  auditable. `digest` is the sealed kernel `id` over the RAW template bytes (comments included), never a
 *  hand-rolled hash (KERNEL-1/2a). */
export interface PromptFactory {
  readonly digest: Hash;
  readonly build: (cand: Candidate) => string;
}

/**
 * Load a prompt template and return a `buildPrompt` over it.
 *
 * The digest is taken over the file EXACTLY as it ships — including the justification comment — because the
 * question provenance has to answer is "which artifact produced this fact", and an edit to the reasoning is
 * an edit to the artifact even when the sent text is unchanged.
 */
export function createPromptFactory(deps: { source: SourceReader; templatePath?: string }): PromptFactory {
  const path = deps.templatePath ?? shippedTemplatePath();
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (e) {
    throw new PromptError('template-unreadable', `the prompt template at ${path} could not be read: ${String(e)}`);
  }
  const template = assertUsable(stripComments(raw), path);
  const digest = id({ promptTemplate: raw } as never);

  return {
    digest,
    build(cand: Candidate): string {
      const site = cand.site;
      const source = deps.source.read(site);
      if (source === null) {
        // NOT an abstention. An abstention says "this unit holds no fact"; this says "we never showed the
        // model the unit". Collapsing the two would let a broken source path read as a barren repository.
        throw new PromptError(
          'source-unreadable',
          `no source could be read for ${site.qualifiedPath} — refusing to prompt without the bytes the ` +
            `claim must re-derive from`,
        );
      }
      return template
        .split(SLOT_PATH)
        .join(filePathOf(site))
        .split(SLOT_UNIT)
        .join(unitNameOf(site))
        .split(SLOT_SOURCE)
        .join(source);
    },
  };
}

/**
 * The shipped `SourceReader`: the FILE the anchor lives in, read from the repo.
 *
 * **Granularity is stated, not implied.** This is FILE-granular even for a `symbol` anchor — slicing the
 * exact subtree out needs the AST fold, which is a separate seam. The consequence is real and belongs on
 * the record: the model is shown more than the anchored unit, so a claim it makes may be true of the file
 * while being attributed to the symbol. The admission gate re-derives against the anchor regardless, so
 * this widens what may be PROPOSED, never what may be admitted. Symbol-granular slicing is the refinement.
 *
 * A path escaping the repository is refused (`null`), not read: `qualifiedPath` originates in the index,
 * but a reader that trusts its input is one index bug away from serving `/etc/passwd` to a model.
 */
export function createFileSourceReader(repoPath: string): SourceReader {
  const root = resolve(repoPath);
  return {
    read(site: StructRef): string | null {
      const rel = filePathOf(site);
      const abs = resolve(root, rel);
      const inside = relative(root, abs);
      if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) return null; // escapes the repo
      try {
        return readFileSync(abs, 'utf8');
      } catch {
        return null; // deleted / unreadable / a directory — the caller REFUSES rather than prompting blind
      }
    },
  };
}

/** Remove the template's own justification block. Non-greedy and repeated, so several comments are handled
 *  and a `-->` inside prose cannot swallow the rest of the file. */
function stripComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->\n?/g, '').trimStart();
}

/** A template that never interpolates the code would send a well-formed ask with nothing to ground against,
 *  and the model would answer it from memory. Refusing at LOAD time makes that unshippable rather than a
 *  quiet degradation on every site. */
function assertUsable(template: string, path: string): string {
  if (!template.includes(SLOT_SOURCE)) {
    throw new PromptError(
      'template-has-no-source-slot',
      `the prompt template at ${path} never interpolates ${SLOT_SOURCE} — a prompt carrying no source ` +
        `cannot be grounded, and the model would answer it from parametric memory`,
    );
  }
  return template;
}

/** `qualifiedPath` is `<file>::<symbol>` for a symbol anchor and a bare path otherwise (struct.ts). Split on
 *  the FIRST separator only: a path may legitimately contain more (`::` is escaped upstream, not absent). */
function filePathOf(site: StructRef): string {
  const at = site.qualifiedPath.indexOf('::');
  return at === -1 ? site.qualifiedPath : site.qualifiedPath.slice(0, at);
}

/** The unit's own name — the symbol for a symbol anchor, otherwise the whole path (a file/repo anchor IS
 *  its path). Never empty: an unnamed unit gives the model nothing to anchor the claim to. */
function unitNameOf(site: StructRef): string {
  const at = site.qualifiedPath.indexOf('::');
  const name = at === -1 ? site.qualifiedPath : site.qualifiedPath.slice(at + 2);
  return name === '' ? site.qualifiedPath : name;
}
