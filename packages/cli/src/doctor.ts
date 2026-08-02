// @atlas/cli — src/doctor.ts  (WP-DOCTOR — CLI-1a: `atlas doctor <sub>` sub-dispatch over the DoctorApi)
//
// `atlas doctor` fans out to the FOUR read/advisory legs of the frozen `DoctorApi` (archive / why /
// hotset / reground), built over an INJECTED read-only `DoctorSource` (dependency-inverted — tests pass a
// fake; the real source is assembled at the composition-root WP). Doctor is READ-ONLY + advisory: every
// leg renders a `DoctorOut` deterministically to stdout with exit 0, `reground` renders a PROPOSAL only
// (the store changes solely when it runs through `atlas-emit`), and NO leg carries write authority. TOTAL:
// an unknown subcommand / a missing arg / a not-yet-wired source fails CLOSED to a structured error +
// guidance + non-zero exit — never a throw (mirrors the CLI-1b parser totality).

import { DOCTOR_GUIDANCE, createDoctor } from '@atlas/tools';
import type { DoctorOut, DoctorSource } from '@atlas/tools';
import type { CliVerdict } from './render.js';
import { renderVerdict } from './render.js';

/** The finite doctor sub-command surface — EXACTLY these four read/advisory legs, no more (TOOLS-12). */
export const DOCTOR_SUBCOMMANDS = ['archive', 'why', 'hotset', 'reground'] as const;
export type DoctorSub = (typeof DOCTOR_SUBCOMMANDS)[number];

function isDoctorSub(s: string | undefined): s is DoctorSub {
  return s !== undefined && (DOCTOR_SUBCOMMANDS as readonly string[]).includes(s);
}

/** A structured doctor-layer error — rendered through the SAME `renderVerdict` as the rest of the CLI, so
 *  totality is uniform (status: error · exit 1 · both guidance fields present). Never throws. */
function doctorError(next: string): CliVerdict {
  return renderVerdict({ ok: false, rejected: next, guidance: { next, invariant: DOCTOR_GUIDANCE.invariant } });
}

/** Deterministically render one leg's payload — keyed by the SUBCOMMAND (not by whichever field happens to
 *  be present), so a mis-routed leg (`why` → archive) renders the wrong shape and a golden bites. */
function renderPayload(sub: DoctorSub, out: DoctorOut): string {
  switch (sub) {
    case 'archive':
      return `archive: [${(out.archive ?? []).join(', ')}]`;
    case 'why':
      return out.whyBroken
        ? `whyBroken: fact=${out.whyBroken.fact} class=${out.whyBroken.class}` +
            ` anchorWas=${out.whyBroken.anchorWas.subtreeHash} anchorNow=${out.whyBroken.anchorNow.subtreeHash}`
        : 'whyBroken: none';
    case 'hotset':
      return out.hotSet
        ? `hotSet: size=${out.hotSet.size} budget=${out.hotSet.budget} over=${out.hotSet.over}`
        : 'hotSet: none';
    case 'reground':
      return out.plan
        ? `plan: action=${out.plan.action} fact=${out.plan.fact}` +
            ' — PROPOSAL only; persists nothing. Run through atlas-emit to persist.'
        : 'plan: none';
  }
}

/** Render a `DoctorOut` to a process outcome. READ-ONLY ⇒ exit 0; carries the doctor guidance on every
 *  path (the reground follow-up is ALWAYS the governed write door atlas-emit). */
function renderDoctorOut(sub: DoctorSub, out: DoctorOut): CliVerdict {
  const stdout =
    `status: ok\n` +
    `doctor: ${sub}\n` +
    `${renderPayload(sub, out)}\n` +
    `next: ${DOCTOR_GUIDANCE.next}\n` +
    `invariant: ${DOCTOR_GUIDANCE.invariant}\n`;
  return { exitCode: 0, stdout };
}

/**
 * Dispatch `atlas doctor <sub> [arg]` to the correct `DoctorApi` leg over the injected read-only source.
 * TOTAL: an unknown subcommand, a missing required arg, or a not-yet-wired source all fail CLOSED to a
 * structured error + guidance + non-zero exit — never a throw. Persists NOTHING (no write door is opened):
 * `reground` returns a `RegroundPlan` proposal that the caller runs through `atlas-emit`.
 */
export function runDoctor(positionals: readonly string[], source?: DoctorSource): CliVerdict {
  const sub = positionals[0];
  const arg = positionals[1];

  // totality: an unknown subcommand is a structured error (independent of whether a source is wired).
  if (!isDoctorSub(sub)) {
    return doctorError(
      `unknown doctor subcommand '${sub ?? ''}': expected one of ${DOCTOR_SUBCOMMANDS.join('|')}`,
    );
  }

  // fail CLOSED with guidance when the read-only DoctorSource is not injected — the real source is
  // assembled at the composition-root WP; until then the entrypoint refuses rather than fabricating one.
  if (!source) {
    return doctorError(
      'atlas doctor has no diagnostic source — the read-only DoctorSource is wired at the composition-root WP',
    );
  }

  const doctor = createDoctor(source); // built over the READ-ONLY port — structurally no write method

  // TOTALITY, RESTORED WHERE IT WAS QUIETLY LOST. This function's own header promises "never a throw", and
  // it kept that promise only as long as every `DoctorSource` leg was total. One is not any more: the
  // provenance tripwire makes a COMMITTED durable store refuse rather than report a healthy empty one
  // (`adapter-io/src/doctor-source.ts`), and it does so by throwing, because the frozen `DoctorSource` legs
  // return `number` / `Hash[]` / `DriftItem | undefined` and every one of those would have to LIE.
  //
  // Unlike `handler.handle`, NOTHING between here and `bin.ts` catches — `main` is `async`, so an escaping
  // throw becomes an unhandled rejection rather than a rendered outcome. In production the entrypoint
  // refuses the whole invocation before doctor is dispatched (`cli.ts`, `CliDeps.readRefusal`), so this
  // catch is the backstop for an embedder that composes a source without that gate, and for the next leg
  // that decides it has something to refuse.
  try {
    switch (sub) {
      case 'archive':
        return renderDoctorOut('archive', doctor.archive(arg)); // scope is optional
      case 'why':
        if (arg === undefined) return doctorError('doctor why requires a <fact>');
        return renderDoctorOut('why', doctor.whyBroken(arg));
      case 'hotset':
        if (arg === undefined || !Number.isFinite(Number(arg))) {
          return doctorError('doctor hotset requires a numeric <budget>');
        }
        return renderDoctorOut('hotset', doctor.hotSet(Number(arg)));
      case 'reground':
        if (arg === undefined) return doctorError('doctor reground requires a <fact>');
        return renderDoctorOut('reground', doctor.reground(arg)); // advisory plan — persists nothing
    }
  } catch (e) {
    // The refusal's own text, verbatim — never re-worded, so the discriminant survives to the user door.
    return doctorError(e instanceof Error ? e.message : String(e));
  }
}
