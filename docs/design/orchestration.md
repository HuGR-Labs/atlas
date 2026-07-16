# Orchestra — Orchestration design (the Conductor)

> **Status: DRAFT v0 — first cut, to design together.** This is phase 3 (ORCHESTRATE) from
> [docs/TEAM.md](../TEAM.md). It covers only the Conductor — not DEFINE/DESIGN (upstream) and not the
> seats' internals (downstream). The point of this doc is to agree the *spine + the load-bearing
> decisions* before code.

## 1. What the Conductor is (and is NOT)

The Conductor is the orchestration layer (`packages/orchestrator`), driven in a session by a lead. It
takes a **ratified spec + architecture** (the upstream handoff) and turns it into merged, verified,
sealed work — by dispatching to seats.

**It never invents.** No product, no spec, no architecture, no scope. If the input is under-decided,
it bounces UP to Define/Design; it does not fill the gap by guessing. This one rule is the whole
anti-hallucination stance: *the Conductor orchestrates decisions, it does not make them.*

Its scarce resource is **judgment**, and it keeps 100% of it: it slices, freezes, chews, and verifies;
seats only execute work that is already verifiable-not-judged.

## 2. The object model (what it operates on)

```
Campaign  — a ratified goal (from DEFINE) → a sequence of Waves.
  Wave    — a disjoint batch of WPs dispatchable in parallel + a merge DAG.
    WP    — one atom of work: a WorkBrief (contracts/seat.ts). The unit a seat runs.
```

Everything is **event-sourced**: the Conductor's state is a fold over an append-only log
(`.orchestra/log.jsonl`), never in-memory truth. Reconstructable at any point — a v1 primitive kept.

## 3. The loop — three acts

### Act I — DECOMPOSE (the pre-work; all judgment lives here)

Turn the ratified design into WPs that are **verifiable, not judged**:

1. **Slice disjoint.** Each WP owns a non-overlapping write-scope (`owns` globs). The shared file that
   every WP would touch (a barrel, a registry) is *eliminated from the edit path before dispatch* —
   the Conductor owns it. (v1's #1 conflict source; see the parallel-integration lesson.)
2. **Freeze contracts at the seams.** Where WPs depend on each other, freeze the interface first and
   hand each seat anchor code to transcribe — never "design the interface." (techlead-contract pillar.)
3. **The four axioms per WP** (LAW #1): completeness · invariants · qualityBar · DoD. A WP missing any
   is UNDER-DECIDED and **does not type-dispatch** (`WpContract` is required on `WorkBrief`).
4. **Build the merge DAG.** The DAG is the *merge order*, NOT a dispatch barrier — independent WPs
   dispatch immediately; the DAG only orders integration.

### Act II — DISPATCH (chew, arm, fire — then get out of the way)

For each ready WP:

1. **Chew the brief.** Assemble the `WorkBrief`: the anchor (target marked), `owns`, the four-axiom
   `contract`, the real `gates`, and the `returnShape`. This is the ONLY channel to the seat (SOTA:
   the prompt string is the sole parent→child channel) — so it is pre-digested, minimal, no dumping.
2. **Arm the relay.** `relayToken = sha256(canonical(brief))` — the content-addressed arm↔release
   binding (v1 R6). The seat cannot release a chain whose brief doesn't hash to its token.
3. **Route by roster.** Generators (`charlie`/`patty`) get build WPs; evaluators get verify WPs;
   never cross (an evaluator is never asked to write product). Model tier from the seat manifest.
4. **The return-firewall.** The seat returns a `ResultCard` and NOTHING larger — the Conductor never
   ingests a transcript. **This is why the Conductor's context does not explode at scale** (the SOTA
   #1 failure: supervisor context is the cost center). It is a *contract*, not a discipline.

### Act III — INTEGRATE (verify, gate, seal — trust nothing self-reported)

1. **Cold-check the card.** Gate results are measured exit codes, not booleans the seat chose
   (v1 AP-5). Changed files are read from git, not from the seat's claim.
2. **GAN gate.** A generator WP is **not sealable** until an evaluator returns a passing ResultCard for
   it (enforced from the roster — [TEAM.md §3](../TEAM.md)).
3. **Merge in DAG order.** Each green WP integrates under a change-scoped gate; SEAL per branch;
   out-of-scope writes are held (the signed write-scope backstop, a v1 primitive kept).
4. **Absorb + meter.** Grounded `MemoryFact`s persist (fail-closed, no prose); real `meteredTokens`
   feed the cost/ROI ledger. Every guarantee emits a probe → the ledger folds GREEN from evidence.

## 4. What the Conductor enforces (guarantees, folded from the log)

Each is a producer (emits a probe on a live event) + a consumer (a fold) + a falsifiable fence (a test
that fails if violated). Carried from v1's one genuinely-strong idea, but architected:

- **atom-only dispatch** — an under-decided WP never dispatches.
- **content-addressed arm↔release** — a seat can't release a tampered chain.
- **return-firewall honored** — the card fits `returnShape`; no transcript ingested.
- **GAN** — no generator seal without an evaluator.
- **real gates** — release booleans are measured exit codes.
- **write-scope** — no out-of-scope write seals.
- **owner-approval** — a wave opens only under an ed25519-signed plan.

## 5. Failure modes → responses (fail-closed, always)

| situation | Conductor response |
|---|---|
| WP under-decided (missing an axiom) | refuse to dispatch; bounce UP to Define/Design |
| seat returns `held` (a red gate) | re-verify, do not merge; re-dispatch or escalate |
| seat returns `blocked` (out-of-scope / policy) | do not merge; the guard already denied the write |
| generator green but no evaluator card | NOT sealable — dispatch the evaluator first |
| a seat dies / returns nothing | the WP is not sealed; nothing half-merges (event log has no seal) |
| the merged tree fails the change-scoped gate | the wave closes `aborted`, never a silent green |

## 6. The load-bearing decisions to settle together (draft picks in **bold**)

1. **Who drives the Conductor?** A human lead in a Claude Code session using the `orchestra` CLI, **or**
   a dedicated lead-agent harness? → Draft: **the CLI + a human-or-lead session** first; a lead-agent is
   a later seat, not a phase-1 dependency.
2. **Rolling vs barrier waves.** → Draft: **rolling** — dispatch-on-ready, merge-on-DAG-order; the DAG
   is never a dispatch barrier (v1 lesson: barriers waste the fast seats).
3. **How much does the Conductor parallelize by default?** → Draft: **disjoint fan-out, cap ~6–8**;
   beyond that the integration-triage cost exceeds wall-clock saved (v1's 18-agent incident).
4. **Does the Conductor itself run on the Agent SDK, or is it plain orchestration code the lead calls?**
   → Draft: **plain, deterministic orchestration code** (`packages/orchestrator`) exposed via the CLI;
   the *lead* may be an SDK session, but the orchestration primitives are pure + testable, not an agent.
5. **Where does DEFINE/DESIGN hand off?** → Draft: a ratified **spec artifact + architecture ADR**
   the Conductor reads as the campaign input; if either is missing/unratified, no wave opens.

## 7. Next (post-agreement)

Once the spine above is agreed, the first buildable slice is: `packages/contracts` (freeze WorkBrief/
ResultCard) + the decompose→dispatch→integrate primitives in `packages/orchestrator`, each pure +
fenced, driven end-to-end against the `_template` seat — the first live governed run.
