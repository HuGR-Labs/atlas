# ADR-0019 — the sound-predicate amendment: typed args, harness-rendered claim, specificity teeth

- **Status:** Proposed (2026-08-11). Grounded against master `4bb54a5`. The ONE correctly-scoped, owner-gated
  amendment that makes shipped `atlas mine` admit facts by mechanical TRUTH (a harness-synthesized check that
  HOLDS and flips under an entity-swap mutant) instead of by aboutness. Supersedes the withdrawn ADR-0016 and
  the refuted-framing ADR-0018 (whose §Review findings this design honors). Amends ratified surfaces
  (`INV-GEN-12` `PredicateApi`, `KNOW-16` `Check`) — the owner (admin) ratifies; the lead does not self-amend.
- **Spec author:** lead. Design converged over two cold-review rounds (ADR-0016, ADR-0018).
- **What is already real (do not rebuild):** the mechanical admission ENGINE (`admit-harness.ts` —
  `admit`/`admitPredicate`/`attest`/`VerifiedCheck` brand, verdict-before-teeth ordering) and its tests
  (`wp-8.28-b-gen.test.ts`); the `EvaluatorApi`+`evaluator.ts` interpreter; relation/negation admission. The
  literal ADR-0016 T0 is closed (no `check` field on any proposal; `buildPredicate` discards model prose).
  This ADR supplies the concrete legs the engine calls and the two ratified-surface widenings they require.

## The load-bearing problem this ADR exists to close

Cold review proved the ADR-0016 **F1 residual is still open**: the teeth gate proves a check is *sensitive to
the anchored bytes*, NOT that it *encodes the specific claim*. A `subtree-hash` fingerprint (the only check a
site-only `synthesize` can build) flips on ANY byte change, so it passes teeth while asserting nothing. Any
design that lets the model hand over a check, or that verifies byte-sensitivity alone, ships false or
content-free facts. This ADR closes it with two mechanisms, specified — not asserted "by construction":

1. **Claim ≡ check by construction, because both are projections of the same TYPED ARGS.** The model proposes
   only typed args `{op, unit, target...}`; the harness synthesizes the `Check` FROM the args AND renders the
   human claim FROM the args (`renderClaim(op, args)`); the model's prose is discarded. There is no free-text
   claim that can diverge from the check.
2. **Specificity teeth (entity-swap), not byte-sensitivity.** A check is admitted only if it BREAKS on a
   mutant that swaps the NAMED TARGET for a fresh distinct symbol while leaving surrounding bytes intact — AND
   still HOLDS on a control mutant that changes an unrelated sibling. A check that survives target-swap, or
   that breaks on any change (a fingerprint), is vacuous ⇒ DROP. Fingerprint-only checks are additionally
   rejected at synthesize time (the synthesized check MUST reference the target).

## The typed predicate vocabulary (closed; the model emits ARGS, never a check or free claim)

```
PredicateArgs =                                   // substrate: 'ast-body' (Lens A) | 'index' (structural)
  | { op:'call',          unit, callee }          // unit's body calls callee
  | { op:'memberAccess',  unit, member }          // unit's body reads/writes obj.prop
  | { op:'references',    unit, name }             // unit's body references identifier (not a param)
  | { op:'stringLiteral', unit, text }            // unit's body contains string literal
  | { op:'operator',      unit, opKw }            // unit's body uses operator/keyword
  | { op:'orderBefore',   unit, a, b }            // a occurs before b in unit's body
  | { op:'absence',       unit, inner }           // inner (one of the above) is NOT present in unit's body
```
Each `target` (callee/member/name/text/a/b) is a DATA VALUE, compared by string-equality against AST node text
in the evaluator — NEVER interpolated into a tree-sitter query string (no query-injection, no wildcard-widen).
Target length is capped; no regex arg exists in the vocabulary (no ReDoS surface). The `subtree-hash`
fingerprint is NOT in the vocabulary — it is unrepresentable, so it cannot be admitted.

## Decision — the amendment

**1. Widen the proposal path to carry typed args (`INV-GEN-12` `PredicateApi` surface — owner ratifies).**
- `PredicateSeed` (`extract.ts:67`) and `PredicateProposal` (`admit-proposals.ts:28`) gain a `readonly args:
  PredicateArgs` field. No `check` field — the model still cannot hand over a check.
- `PredicateApi.synthesize` (`admit-harness.ts:48`) widens from `(cand: Candidate)` to
  `(cand: Candidate, args: PredicateArgs)`; the call site `admit-harness.ts:252` passes `p.args`. This is the
  minimal signature change; `verify`/`teeth` signatures are unchanged.

**2. The concrete `PredicateApi` legs (harness, zero-model — replace the `compose-mine-admission.ts:74` no-ops).**
- `synthesize(cand, args)` → a `Check` built deterministically from `op`+`target`. For an `ast-body` op →
  `{kind:'ast-body', op, unit, target}` (the new leg, D3); for a structural op expressible over the index →
  an `index-query`/`assertion` Check. If the args do not form a valid check → `null` (candidate abstains).
- `verify(check, indexState)` → wire the EXISTING tested `evaluate` (`evaluator.ts:240`) — the cheapest leg;
  extended for the `ast-body` kind (D3).
- `teeth(check, anchor)` → the **specificity** gate: admit iff (a) the target-swap mutant flips to BROKEN and
  (b) an unrelated-sibling control mutant still HOLDS. A real mutant engine over the anchored subtree
  (`astq.mjs` `negate`/mutate is the proven prototype); replace `()=>false`.

**3. Add the `ast-body` `Check` leg (`KNOW-16` surface — owner ratifies) and extend its four consumers.**
- `Check` (`knowledge/types.ts:55`) gains `| { kind:'ast-body'; op; unit; target }`; `cv` (contract-version)
  bumped.
- Consumers extended in the SAME amendment (each is a frozen surface — enumerated per ADR-0018 §Review):
  `evaluator.ts:240-243` (evaluate the new kind via the AST interpreter), `router.ts:204-207`
  (`normalizeCheck` → a canonical nodeKey string for the new kind), `mine-claim-scrub.ts:69-73`
  (`scrubCheck` scrubs `target` before CAS — #219 stays closed), `upsert.ts:228` (`checkSame` via the
  extended normalize).

**4. Render the human claim from the args.** `buildPredicate` (or its renderer) stores/display a claim =
`renderClaim(op, args)` — a fixed template per op. The model's prose is never stored (it already isn't). So the
stored claim is a faithful rendering of exactly what the check tests.

## What is UNCHANGED / out of scope
- Engine, `VerifiedCheck` brand, ordering, refine≤K — untouched. `K:0` stays (HOLDS-on-first needs no refine).
- INV-ADAPTER-11 (one call/site) and GEN-13 (zero-model synth/verify/teeth, `K≤1`) — NOT breached (verified).
- `typeOracle` (its arm emits an advisory, not a predicate), relation/negation seed producers — follow-on.
- Structural/index predicates beyond what the current `Check` expresses — the `ast-body` leg is the rich lens;
  wider index predicates are follow-on.

## Definition of Done (all mechanizable on the SHIPPED path unless marked)
- **known-true admits:** blackbox `atlas mine` admits ≥1 real predicate whose check HOLDS and whose
  target-swap teeth flips — on the shipped path (the D5/#155 reachability gate).
- **known-false drops:** a planted typed-arg naming a target the unit does NOT contain → check BROKEN → DROP,
  on the shipped path.
- **specificity teeth:** unit test — a check whose target is swapped for a fresh symbol flips BROKEN; a
  fingerprint-shaped check is REJECTED at synthesize (unrepresentable) and, if injected, dropped by teeth.
- **encoding fidelity:** unit test — `renderClaim(op,args)` and the synthesized check derive from the same
  args; no stored free-text claim path exists for a predicate.
- **the four `ast-body` consumers:** each extended + mutation-tested (evaluate non-NA, nodeKey stable,
  scrubCheck redacts target, checkSame agrees).
- **no false-admit** across a mined sample (offline panel, labeled non-CI).
- Each WP cold-reviewed; no ratified invariant self-amended.

## What the owner ratifies
1. `INV-GEN-12` `PredicateApi.synthesize` signature widening `(cand) → (cand, args)` + the `PredicateSeed`/
   `PredicateProposal` `args` field.
2. `KNOW-16` `Check` additive `ast-body` leg + `cv` bump (+ the four consumer extensions it forces).

Nothing merges on a ratified surface until (1)+(2) are owner-ratified and `gate` is green. The prompt win
(ADR-0017) is the PROPOSE half — its reasoning is what makes the model emit good typed args.
