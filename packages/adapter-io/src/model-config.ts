// @atlas/adapter-io — src/model-config.ts  (ADR-0011 Decision 2: the OPERATOR-scoped model command)
//
// Resolves the command `createCommandClient` (llm.ts) runs. It is deliberately NOT read from the repository
// under analysis, and this module ENFORCES that rather than merely documenting it: a command sourced from a
// committed file would make `atlas mine` on a freshly-cloned repository an arbitrary-code-execution path.
// Operator-scoped settings are already the repo's idiom (`ATLAS_ACTOR` / `ATLAS_RATIFY_TOKEN`, compose.ts).
//
// ── failure semantics, and why they INVERT policy.ts ───────────────────────────────────────────────────
// `loadPolicy` is total and fails CLOSED to a denying default: a broken policy authorizes nothing, so
// degrading silently is safe. Here the safety direction is the opposite. A broken model config that
// degraded to "no model" would abstain at every site and report a clean, empty run — indistinguishable from
// a repository that genuinely holds no groundable fact. That is the same fail-silent shape `llm.ts` refuses
// for a non-zero exit, and it must be refused identically at the config layer:
//
//   ABSENT   ⇒ `null`  — no model wired. The honest zero-config state; `mine` abstains and SAYS so.
//   MALFORMED⇒ THROW   — a stated, actionable error. Never a silent fall-back to `null`.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { isContainedIn } from './containment.js';
import type { ModelCommand } from './llm.js';

/** The mechanism a model call is issued FOR (GEN-13's closed `Mechanism` set, minus the non-model ones).
 *  Only `propose` is populated today: the cheap pass is one call and the escalation ladder has no executor
 *  (ADR-0011 §"What this ADR does NOT close"). The key exists so that adding `refuter` — which GEN-13f
 *  requires to be a SMALL model, i.e. a different binding — is a config entry, never a refactor. */
export type ModelRole = 'propose' | 'refuter' | 'check-synthesis';

/** The resolved operator configuration. `roles.propose` is the only REQUIRED binding. */
export interface ModelConfig {
  readonly roles: Readonly<Partial<Record<ModelRole, ModelCommand>>>;
  readonly timeoutMs: number;
  readonly costCap: number;
}

/** Why a model config was REFUSED. Each is actionable on its own — a caller can print it verbatim. */
export type ModelConfigRefusal =
  | 'inside-repo' // the security boundary: an executable named by the repo under analysis
  | 'unreadable'
  | 'not-json'
  | 'malformed';

/** A model config that could not be trusted. Thrown — never degraded to `null` (see the header). */
export class ModelConfigError extends Error {
  constructor(
    readonly refusal: ModelConfigRefusal,
    message: string,
  ) {
    super(message);
    this.name = 'ModelConfigError';
  }
}

/** Wall-clock default when the config omits one. Class **C — unexamined** under ADR-0011 Decision 4: no
 *  spec pins it and no measurement supports it yet, so it is PROVISIONAL and labelled as such here. */
export const PROVISIONAL_TIMEOUT_MS = 60_000;

/** Per-call spend ceiling default. Also class **C — provisional**. NOTE it is not enforceable by the
 *  subprocess adapter (a child reports no price — llm.ts says so); it is carried for the escalation work,
 *  where a metered adapter can honour it. Carrying an UNENFORCED cap is only acceptable because both this
 *  comment and `createCommandClient`'s say so out loud. */
export const PROVISIONAL_COST_CAP = 0.05;

/** Where the operator config lives, in precedence order: an explicit `$ATLAS_MODEL_CONFIG`, then the XDG
 *  location, then `~/.config/atlas/model.json`. Exported so `atlas config` can SHOW the resolved path —
 *  a config whose location is guesswork is not configurable in any useful sense. */
export function modelConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.ATLAS_MODEL_CONFIG;
  if (typeof explicit === 'string' && explicit.trim() !== '') return resolve(explicit);
  const xdg = env.XDG_CONFIG_HOME;
  const base = typeof xdg === 'string' && xdg.trim() !== '' ? xdg : join(homedir(), '.config');
  return resolve(join(base, 'atlas', 'model.json'));
}

/**
 * Load the operator's model configuration.
 *
 * `repoPath` is the repository being mined, and it is passed for ONE reason: to refuse a config that lives
 * inside it. That check is the enforcement of ADR-0011's two-scope split — without it the split is a
 * convention, and a convention does not stop an attacker who ships a `.atlas/model.json` in their repo and
 * points `$ATLAS_MODEL_CONFIG` at it from a README instruction.
 *
 * Containment, not tracked-ness, is the predicate on purpose: an operator legitimately keeps `~/.config` in
 * a dotfiles repository, so "is tracked by git" would reject the normal case while missing the attack.
 *
 * @returns the validated config, or `null` when NO config file exists (the honest zero-config state).
 * @throws {ModelConfigError} when a file exists but cannot be trusted.
 */
export function loadModelConfig(repoPath: string, env: NodeJS.ProcessEnv = process.env): ModelConfig | null {
  const path = modelConfigPath(env);

  // The security boundary, checked BEFORE the file is opened — the refusal must not depend on its contents.
  if (isInside(repoPath, path)) {
    throw new ModelConfigError(
      'inside-repo',
      `refusing to read the model command from inside the repository under analysis (${path}). The command ` +
        `names an executable Atlas will RUN, so sourcing it from the repo would make \`atlas mine\` on a ` +
        `cloned repository an arbitrary-code-execution path. Move it to ~/.config/atlas/model.json.`,
    );
  }

  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    if ((e as { code?: unknown } | null)?.code === 'ENOENT') return null; // absent ⇒ no model wired
    throw new ModelConfigError('unreadable', `the model config at ${path} could not be read: ${String(e)}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new ModelConfigError('not-json', `the model config at ${path} is not valid JSON: ${String(e)}`);
  }

  return parseModelConfig(raw, path);
}

/** Narrow parsed JSON to a `ModelConfig`. Every rejection names the offending field — a validator that
 *  only says "malformed" makes the operator bisect their own file. */
function parseModelConfig(raw: unknown, path: string): ModelConfig {
  const refuse = (what: string): never => {
    throw new ModelConfigError('malformed', `the model config at ${path} is malformed: ${what}`);
  };

  if (!isRecord(raw)) return refuse('the top level must be an object');
  if (!isRecord(raw.roles)) return refuse('`roles` must be an object');

  const roles: Partial<Record<ModelRole, ModelCommand>> = {};
  for (const role of ['propose', 'refuter', 'check-synthesis'] as const) {
    const entry = raw.roles[role];
    if (entry === undefined) continue;
    if (!isRecord(entry)) return refuse(`\`roles.${role}\` must be an object`);
    if (typeof entry.cmd !== 'string' || entry.cmd.trim() === '') {
      return refuse(`\`roles.${role}.cmd\` must be a non-empty string`);
    }
    // An ARRAY, never a string: there is no shell, so a single string would be run as one argv[0] with
    // spaces in it rather than split. Rejecting it here turns a confusing ENOENT into a clear message.
    if (!Array.isArray(entry.args) || !entry.args.every((a) => typeof a === 'string')) {
      return refuse(`\`roles.${role}.args\` must be an array of strings (there is no shell, so it is never split)`);
    }
    roles[role] = { cmd: entry.cmd, args: [...(entry.args as string[])] };
  }

  if (roles.propose === undefined) return refuse('`roles.propose` is required — it is the cheap-pass binding');

  const timeoutMs = optionalPositive(raw.timeoutMs, PROVISIONAL_TIMEOUT_MS, () => refuse('`timeoutMs` must be a positive finite number'));
  const costCap = optionalPositive(raw.costCap, PROVISIONAL_COST_CAP, () => refuse('`costCap` must be a positive finite number'));

  return { roles, timeoutMs, costCap };
}

/** An absent numeric field takes the provisional default; a PRESENT-but-invalid one is refused. Silently
 *  defaulting a typo'd value would hide exactly the misconfiguration this module exists to surface. */
function optionalPositive(v: unknown, fallback: number, refuse: () => never): number {
  if (v === undefined) return fallback;
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) refuse();
  return v as number;
}

/**
 * Is `candidate` the repo directory itself, or anything beneath it?
 *
 * SYMLINKS ARE RESOLVED, and that leg is real: on macOS `/var` is a symlink to `/private/var`, so a repo the
 * shell reports as `/var/folders/x` has a real path of `/private/var/folders/x`. Comparing those two
 * spellings textually yields a `..`-prefixed relative path, the guard reads "outside the repo", and the
 * planted config is READ. Found by the S24 black-box story on its first run against a real temp repo; any
 * repo reached through a symlinked parent is the general case, macOS temp dirs merely the one that surfaced.
 *
 * BUT RESOLVING SYMLINKS IS NOT ENOUGH, WHICH IS WHY THIS DELEGATES. `realpathSync` does not canonicalize
 * SPELLING — on APFS it is case-preserving and normalization-preserving, so it returns the path AS
 * REQUESTED. Two spellings of the SAME directory (`…/repo` vs `…/REPO`, NFC vs NFD) therefore still compare
 * as different strings, and the same "outside the repo" verdict loads the same attacker config. Measured
 * against the built module: honest spelling refused, case variant LOADED.
 *
 * So identity is decided on (dev, ino) — the kernel's own answer — by `containment.ts`, and there is exactly
 * ONE implementation of it. A string comparison kept alongside as belt-and-braces would only be a second,
 * wrong answer for the next reader to trust.
 */
function isInside(repoPath: string, candidate: string): boolean {
  return isContainedIn(repoPath, candidate);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
