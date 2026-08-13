// @atlas/knowledge — src/proven/receipt.ts  (the SPIKE-1 R1 taproot — the per-clause receipt a PROVEN fact carries)
//
// DESIGN_sound_genesis_v2 · SPIKE-1 · R1 (contract: docs/design/SPIKE1-R1-receipt-carrier-contract.md,
// ENGINEERING-FROZEN v2). This file freezes ONE new type: the receipt a PROVEN `dependency` fact carries so
// that "proven" is not a self-declared verdict but a re-runnable, content-addressed obligation. The receipt is
// a POINTER STRUCTURE, never a copy of evidence: it says WHAT was claimed (a typed predicate), HOW it was
// discharged (which deterministic oracle), WHERE in the cited bytes (a `GroundingSpan`), and WHICH model
// output produced it (a per-candidate CAS id) — and stores none of the underlying text (AC-2).
//
// WHY IT LIVES HERE, and not in kernel. The receipt references `GroundingSpan` (grounding L3), is consumed by
// genesis (L8) + ring, and @atlas/knowledge (L4) is the LOWEST legal home that sees both — kernel (L1) would
// invert the dependency and is forbidden by `layer-guard.mjs` (contract §1). The receipt is stored as a CAS
// OBJECT (`store.put(receipt)`), never a loose sidecar row, so `id(receipt)` covers every field it carries.
//
// ID-COVERAGE, the crux (contract §3.5 / billy claim-3). `id` runs the canonical preimage, which EXCLUDES the
// mutable side-indexes `{grounding, status, freshness}` BY LITERAL KEY NAME (`canonical.ts:36`). The span here
// is named `sourceSpan` — NOT under a `grounding` key — so it is genuinely part of the preimage and
// `id(receipt)` commits to it. Altering any of {predicate, check, sourceSpan, answerRef} changes `id(receipt)`,
// and the disk store's re-hash-on-read (`adapter-io/src/store.ts:280`) then refuses the tampered bytes (AC-24).
//
// WHAT THE TYPE DELIBERATELY DOES NOT CARRY, stated so it is not read as more than it is: no verdict/
// confidence/admit field (AC-37 — a proposal is not a truth assertion; admission is a store property, §2), and
// no raw-answer digest (the answer binding is `answerRef`, NFC-blind, contract §3.2 — the KNOW-11-mandated
// price of the struck raw-bytes digest #195 already ratified away).

import type { GroundingSpan } from '@atlas/grounding';

/** The typed dependency predicate — the model's PROPOSAL, never a truth assertion. Carries NO
 *  verdict/confidence/admit field (AC-37, enforced at the propose boundary in P1). */
export interface DepPredicate {
  readonly class: 'dependency';
  readonly sourceScope: string;   // the symbol/scope that depends
  readonly target: string;        // the symbol it depends on
  readonly worldScope: string;    // the resolution world (mirrors DepClaim, verify-fact.ts:40)
}

/** The re-runnable check dispatch — WHICH deterministic oracle discharged the predicate (AC-20).
 *  Slimmed from v1: the claim IS `predicate`, the class is `predicate.class` — no duplicate copies (bobby). */
export interface DepCheckInvocation {
  readonly oracle: 'symbol-reverse';   // the only dependency oracle today (verify-fact.ts:62)
}

/** The receipt a PROVEN dependency fact carries. A CAS object: `id(receipt)` covers every field (AC-24). */
export interface ProvenReceipt {
  readonly predicate: DepPredicate;    // WHAT was claimed (typed, not prose — AC-8)
  readonly check: DepCheckInvocation;  // HOW discharged, re-runnably (AC-20)
  readonly sourceSpan: GroundingSpan;  // WHERE in the cited UNIT's bytes — unit-granular drift (§3.6, AC-5/6/19/29)
  readonly answerRef: string;          // CAS id of THIS candidate's OWN scrubbed answer slice (#195b, per-candidate — AC-31/45)
}
