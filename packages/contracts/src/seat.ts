// @orchestra/contracts — seat.ts
//
// THE KEYSTONE SEAM. This is the single frozen interface that lets (a) the Orchestra lead drive ANY
// seat uniformly and (b) every seat be built in its OWN repo, in parallel, blind to the others, then
// vendored into the mono under seats/<name>/. A seat repo depends on THIS package and nothing else
// from the mono. Freeze it before any seat is built.
//
// DESIGN NOTES (grounded in 2026 multi-agent SOTA, see ARCHITECTURE.md §1):
//   • The ONLY channel parent→seat is the WorkBrief (a data object, not a live conversation) — the
//     lead chews it fully; the seat never "figures it out".
//   • The seat returns a ResultCard, never a transcript — this is the return-firewall that stops the
//     supervisor's context (the real cost center) from exploding at scale.
//   • A seat is a full HARNESS (own CLI/MCP/skills/SDK loop). This interface is what it exposes to the
//     lead; the seat's internal richness lives behind run().
//
// STATUS: DRAFT v1 for owner ratification. Types are the seam; zero logic lives here.

/** A guarantee id in the governed model (e.g. 'G2' relay-armed-green). Kept as a nominal string so
 *  contracts stays logic-free; the catalog + folds live in @orchestra/governance. */
export type GuaranteeId = string;

/** The four axioms of work (LAW #1), carried on every dispatchable unit. A brief missing any field is
 *  UNDER-DECIDED and must not be dispatchable — enforced in @orchestra/orchestrator, typed here. */
export interface WpContract {
  readonly completeness: readonly string[]; // the baseline-RED items whose red→green proves coverage
  readonly invariants: readonly string[]; // structured WHY-rules from the fixed vocab (never prose)
  readonly qualityBar: readonly string[]; // the standing gates that bind this unit
  readonly dod: readonly string[]; // definition of done — the RIGHT thing
}

/** A real oracle command the seat MUST run (never self-attest). Exit 0 = green. */
export interface Gate {
  readonly cmd: string;
  readonly cwd?: string;
}

/** A grounded memory fact (M1–M4): a fixed-vocab kind + subject + a MANDATORY grounding ref. A fact
 *  without `ref` is dropped downstream — a rumor is not a memory. Mirrors @orchestra/memory's model. */
export interface MemoryFact {
  readonly kind: 'invariant-held' | 'invariant-broken' | 'gotcha' | 'fact' | 'decision';
  readonly subject: string;
  readonly ref: string; // file:line | sha | test-name — MANDATORY grounding
  readonly note?: string;
}

/** What the ResultCard MUST contain — declared by the lead in the brief, verified on return. Keeps the
 *  return-firewall a contract, not a hope. */
export interface ResultShape {
  readonly fields: readonly string[]; // named claims the seat must fill (e.g. 'approach','risk')
  readonly maxNoteChars: number; // the compact-card bound — the lead never ingests more than this
}

/** THE dispatch packet — the one chewed, un-forgeable channel from lead to seat. Content-addressed:
 *  relayToken == sha256(canonical(brief-minus-token)), binding arm↔release (v1 R6, ported). */
export interface WorkBrief {
  readonly wpId: string;
  readonly anchor: string; // the target, MARKED: "file.ts:symbol" — the seat transcribes, never designs
  readonly owns: readonly string[]; // the disjoint write-scope globs (no two seats overlap)
  readonly contract: WpContract; // the four axioms — REQUIRED (an under-decided brief won't type-dispatch)
  readonly gates: readonly Gate[]; // the real completion oracles
  readonly relayToken: string; // content-addressed arm↔release binding
  readonly returnShape: ResultShape;
  readonly context?: string; // pre-digested, minimal — NOT a dumping ground
}

/** Machine-checkable evidence the lead verifies (never trusts a self-report — v1 AP-5). */
export interface Evidence {
  readonly gateResults: readonly boolean[]; // measured exit codes, one per brief.gate
  readonly changedFiles: readonly string[]; // "path@contentSha"
  readonly meteredTokens: number; // real seat usage → the wp.metered ledger
}

/** The return-firewall payload — the lead ingests THIS, never the seat's transcript. */
export interface ResultCard {
  readonly wpId: string;
  readonly outcome: 'sealed' | 'held' | 'blocked' | 'escalated';
  readonly evidence: Evidence;
  readonly fields: Readonly<Record<string, string>>; // the ResultShape.fields, filled
  readonly absorb?: readonly MemoryFact[]; // grounded craft to persist (may be empty)
  readonly note: string; // ≤ returnShape.maxNoteChars — the compact human line
}

/** What a seat's manifest declares — read by the lead to route work and by CI to verify conformance.
 *  NOTE: a seat does NOT self-declare a GAN role. The roster is fixed and named — the orchestrator
 *  KNOWS charlie/patty generate, lucy/billy/frankie evaluate, jimmy explores — so the generator↔
 *  evaluator rule (a generator WP is unsealable without an evaluator ResultCard) is enforced from the
 *  known roster (@orchestra/orchestrator), not a redundant self-reported field. */
export interface SeatManifest {
  readonly id: string; // 'charlie' | 'lucy' | ... — the roster identity (the lead derives the rest)
  readonly kit: string; // the seat's craft-kit name (e.g. 'FORGE' for backend execution)
  readonly model: 'opus' | 'sonnet' | 'haiku' | string; // the seat's default SDK model tier
  readonly capabilities: readonly string[]; // what work this seat accepts (routing)
  readonly toolAllowlist: readonly string[]; // the seat's own MCP tools (callable via CLI + MCP)
  readonly contractVersion: string; // the @orchestra/contracts version it was built against
}

/** Ambient runtime the lead provides to a run (paths, the governed event sink, clock). Injected so the
 *  seat stays deterministic + testable; the seat NEVER reaches for global time/rand. */
export interface SeatRunContext {
  readonly cwd: string;
  readonly nowIso: string; // injected clock (kernel determinism law)
  readonly emit: (probe: { id: GuaranteeId; passed: boolean; note?: string }) => void;
}

/**
 * THE SEAT CONTRACT. Every seat harness satisfies exactly this. The lead calls run(); the seat's whole
 * world (its SDK loop, MCP tools, skills, kit) lives behind it. `manifest()` is pure + total.
 *
 * A seat harness ALSO ships (verified by CI against this contract, specified in seats/_template):
 *   • a CLI `orchestra-<id>` with `run <brief.json>`, `tool <name> <args>`, `manifest`
 *   • an MCP server exposing toolAllowlist (parity with the CLI — v1 R3/R4 lesson)
 *   • its skills + SDK loop
 */
export interface SeatHarness {
  manifest(): SeatManifest;
  run(brief: WorkBrief, ctx: SeatRunContext): Promise<ResultCard>;
}
