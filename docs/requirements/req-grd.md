# Requirements — Block GRD (grounding) · S1 lift-and-tag

### REQ-GROUND-1a — subtreeHash is the drift oracle
source: INV-GROUND-1 @ reference/atlas-grounding.md#ground-1
The grounding gate shall use each grounding entry's `subtreeHash` as its drift oracle.
normative-clause: "A grounding entry's drift oracle MUST be its `subtreeHash`."

### REQ-GROUND-1b — displayLines excluded from drift
source: INV-GROUND-1 @ reference/atlas-grounding.md#ground-1
If drift is being detected for a grounding entry, then the grounding gate shall not let `displayLines` participate.
normative-clause: "`displayLines` MUST NOT participate in drift detection."

### REQ-GROUND-1c — line-ranges are never an anchor
source: INV-GROUND-1 @ reference/atlas-grounding.md#ground-1
If a grounding entry is anchored by line-ranges alone, then the grounding gate shall reject it as an invalid anchor.
normative-clause: "Line-ranges alone are NEVER a valid anchor."

### REQ-GROUND-2a — definition of a real grounding
source: INV-GROUND-2 @ reference/atlas-grounding.md#ground-2
The grounding gate shall treat a `Grounding` as real if and only if it has at least one entry and every entry carries a non-empty `subtreeHash`.
normative-clause: "A `Grounding` is real iff it has ≥1 entry and every entry carries a non-empty `subtreeHash`."

### REQ-GROUND-2b — ungrounded is never FRESH
source: INV-GROUND-2 @ reference/atlas-grounding.md#ground-2
If a grounding is ungrounded, then the grounding gate shall never report it as FRESH.
normative-clause: "An ungrounded grounding MUST NOT ever be FRESH."

### REQ-GROUND-3a — unresolvable citation dropped
source: INV-GROUND-3 @ reference/atlas-grounding.md#ground-3
If a citation is unresolvable, then the grounding gate shall drop it in `ground()`.
normative-clause: "An unresolvable citation (unit gone, path absent) MUST fail closed — dropped by `ground()`"

### REQ-GROUND-3b — unresolvable citation reads DRIFTED
source: INV-GROUND-3 @ reference/atlas-grounding.md#ground-3
If a citation is unresolvable, then the grounding gate shall treat it as `DRIFTED` in `driftDetect()`.
normative-clause: "treated as `DRIFTED` by `driftDetect()`"

### REQ-GROUND-3c — resolution never throws
source: INV-GROUND-3 @ reference/atlas-grounding.md#ground-3
If a citation is unresolvable, then the grounding gate shall not throw.
normative-clause: "It MUST NOT throw."

### REQ-GROUND-4 — truth-gate on grounded and FRESH
source: INV-GROUND-4 @ reference/atlas-grounding.md#ground-4
The grounding gate shall enforce the truth-gate through `gateHolds`, gating on the grounded and FRESH inputs supplied by GROUND-2, GROUND-3, and GROUND-5.
normative-clause: "enforced in atlas-grounding by `gateHolds` (GROUND-2/3/5 supply the grounded ∧ FRESH inputs it gates on)"

### REQ-GROUND-5a — real change drifts the fact
source: INV-GROUND-5 @ reference/atlas-grounding.md#ground-5
When a real change is made to the cited unit, the grounding gate shall drift the fact.
normative-clause: "a real change to the cited unit MUST drift it."

### REQ-GROUND-5b — irrelevant edit never drifts
source: INV-GROUND-5 @ reference/atlas-grounding.md#ground-5
If a semantically-irrelevant edit (reformat, import added above, unrelated rename) is made, then the grounding gate shall not drift the fact.
normative-clause: "A semantically-irrelevant edit (reformat, import added above, unrelated rename) MUST NOT drift a fact"

### REQ-GROUND-6 — fail-closed write at emit
source: INV-GROUND-6 @ reference/atlas-grounding.md#ground-6
If a fact is ungrounded, then the grounding gate shall not let it enter at `emit`.
normative-clause: "ungrounded facts do not enter"

### REQ-GROUND-7a — admit iff both doors pass
source: INV-GROUND-7 @ reference/atlas-grounding.md#ground-7
The grounding gate shall admit a fact if and only if it passes both the truth door and the usefulness door.
normative-clause: "A fact is admitted iff it passes **both**: (1) **truth** — its grounding re-checks FRESH (GROUND-4); and (2) **usefulness** — it is actionable AND non-obvious."

### REQ-GROUND-7b — reject the true-but-obvious
source: INV-GROUND-7 @ reference/atlas-grounding.md#ground-7
If a fact is true but obvious, then the grounding gate shall reject it.
normative-clause: "A true-but-obvious fact is noise and MUST be rejected."

### REQ-GROUND-7c — failing either door blocks admission
source: INV-GROUND-7 @ reference/atlas-grounding.md#ground-7
If a fact fails either door, then the grounding gate shall block its admission.
normative-clause: "Failing either door blocks admission."

### REQ-GROUND-8 — untrusted source excluded from gate
source: INV-GROUND-8 @ reference/atlas-grounding.md#ground-8
If a claim's source is `untrusted`, then the grounding gate shall exclude it from `gateHolds`.
normative-clause: "an `untrusted`-source claim is excluded from `gateHolds`."

### REQ-GROUND-9 — no free-prose fact persists
source: INV-GROUND-9 @ reference/atlas-grounding.md#ground-9
If a fact is free-prose, then the grounding gate shall not persist it at `emit`.
normative-clause: "no free-prose fact persists"

### REQ-GROUND-10a — subtreeHash computed via the seam
source: INV-GROUND-10 @ reference/atlas-grounding.md#ground-10
The grounding gate shall compute `subtreeHash` through the `@orchestra/kernel` encoder seam.
normative-clause: "`subtreeHash` MUST be computed through the `@orchestra/kernel` encoder seam"

### REQ-GROUND-10b — no locally-inlined hash call
source: INV-GROUND-10 @ reference/atlas-grounding.md#ground-10
If a hash is needed for `subtreeHash`, then the grounding gate shall not use a locally-inlined hash call.
normative-clause: "not a locally-inlined hash call"

### REQ-GROUND-11a — freshness folds own hash and closure interface
source: INV-GROUND-11 @ reference/atlas-grounding.md#ground-11
The grounding gate shall fold into a fact's freshness both its own grounding-set's `subtreeHash` and its forward-closure's interface/signature-level `rState`.
normative-clause: "A fact's freshness MUST fold **both** (a) its own grounding-set's `subtreeHash` **and** (b) its forward-closure's **interface/signature-level `rState`** (the type/contract-relevant structure) on the dependency axis (INDEX-12)"

### REQ-GROUND-11b — never fold callee full body
source: INV-GROUND-11 @ reference/atlas-grounding.md#ground-11
If the freshness fold traverses a callee, then the grounding gate shall not fold the callee's full-body `subtreeHash`.
normative-clause: "**NOT** the callee's full-body `subtreeHash`"

### REQ-GROUND-11c — callee contract change drifts callers
source: INV-GROUND-11 @ reference/atlas-grounding.md#ground-11
When a callee's signature or contract changes, the grounding gate shall drift its callers.
normative-clause: "a callee whose **signature/contract** changed MUST DRIFT its callers"

### REQ-GROUND-11d — pure-body refactor never drifts callers
source: INV-GROUND-11 @ reference/atlas-grounding.md#ground-11
If a callee undergoes a pure-body refactor with an unchanged signature, then the grounding gate shall not drift its callers.
normative-clause: "while a pure-body refactor of that callee MUST NOT."

### REQ-GROUND-11e — freshness never asserts truth
source: INV-GROUND-11 @ reference/atlas-grounding.md#ground-11
If freshness is phrased, then the grounding gate shall not phrase it as "the claim is true."
normative-clause: "never as \"the claim is true.\""

### REQ-GROUND-11f — freshness phrased as structural unchange
source: INV-GROUND-11 @ reference/atlas-grounding.md#ground-11
When freshness is phrased, the grounding gate shall phrase it as the cited unit and its dependencies' interfaces being structurally unchanged.
normative-clause: "Freshness MUST be phrased as \"the cited unit **and its dependencies' interfaces** are structurally unchanged,\""

### REQ-GROUND-12a — repo-wide rule grounds to policy artifact
source: INV-GROUND-12 @ reference/atlas-grounding.md#ground-12
The grounding gate shall make a genuinely repo-wide rule groundable to the `repo`/`project` level, anchored to a policy artifact.
normative-clause: "A genuinely repo-wide rule with no single symbol anchor (\"all handlers must be idempotent\") MUST be groundable to the spatial `repo`/`project` level, anchored to a **policy artifact**."

### REQ-GROUND-12b — anchor to the section block hash
source: INV-GROUND-12 @ reference/atlas-grounding.md#ground-12
When grounding a rule to a parseable policy artifact, the grounding gate shall anchor it to the relevant heading/section block's `subtreeHash`.
normative-clause: "the anchor MUST be the **relevant heading/section block's `subtreeHash`**"

### REQ-GROUND-12c — never anchor to whole-file byte-hash
source: INV-GROUND-12 @ reference/atlas-grounding.md#ground-12
If a policy artifact is parseable, then the grounding gate shall not anchor the rule to the whole-file byte-hash.
normative-clause: "NOT the whole-file byte-hash"

### REQ-GROUND-12d — byte-hash reserved for non-parseable files
source: INV-GROUND-12 @ reference/atlas-grounding.md#ground-12
While a policy file is genuinely non-parseable, the grounding gate shall reserve the whole-file byte-hash for it.
normative-clause: "The whole-file byte-hash is reserved for genuinely **non-parseable** policy files."

### REQ-GROUND-12e — anchorless rule rejected
source: INV-GROUND-12 @ reference/atlas-grounding.md#ground-12
If a rule has no artifact anchor, then the grounding gate shall reject it as anchorless.
normative-clause: "A rule with **no** artifact anchor stays anchorless and MUST be rejected"

### REQ-GROUND-13a — predicate drift takes the KNOW-5 split
source: INV-GROUND-13 @ reference/atlas-grounding.md#ground-13
When a predicate fact drifts, the grounding gate shall route it through the KNOW-5 mechanical/semantic split.
normative-clause: "A **predicate** fact (carrying a re-runnable `check`) that drifts takes the KNOW-5 mechanical/semantic split."

### REQ-GROUND-13b — advisory drift resolves to STALE
source: INV-GROUND-13 @ reference/atlas-grounding.md#ground-13
When an advisory fact's grounding drifts, the grounding gate shall resolve it to `STALE`.
normative-clause: "An advisory fact whose grounding drifts MUST resolve to `STALE`"

### REQ-GROUND-13c — advisory never forced into an arm
source: INV-GROUND-13 @ reference/atlas-grounding.md#ground-13
If an advisory fact's grounding drifts, then the grounding gate shall not force it into either arm of the KNOW-5 split.
normative-clause: "it MUST NOT be forced into either arm"

### REQ-GROUND-13d — advisory never silently re-grounded
source: INV-GROUND-13 @ reference/atlas-grounding.md#ground-13
If an advisory fact's grounding drifts, then the grounding gate shall never silently re-ground it.
normative-clause: "**never** silently re-grounded"

### REQ-GROUND-13e — STALE advisory never blocks a merge
source: INV-GROUND-13 @ reference/atlas-grounding.md#ground-13
If an advisory fact is STALE, then the grounding gate shall not block a merge.
normative-clause: "it MUST NOT block a merge."

## [NEEDS RECONCILIATION]
- INV-GROUND-4: the HOLDS→NA downgrade threshold ("serves NA when not grounded∧FRESH") is normative in spec A-1, not in the GROUND-4 Invariants clause (a `→ see spec A-1` pointer); route the A-1 lift so GROUND-4 gets a verifiable downgrade REQ.
- INV-GROUND-9: the missing-field / over-cap reject guard is normative in spec A-13 (ref Acceptance), not in the GROUND-9 clause (which states only "no free-prose fact persists"); route the A-13 lift so the reject path gets its own `If-then` guard REQ.
