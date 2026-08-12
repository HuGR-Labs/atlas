# `atlas verify-fact`

**PROVE, REFUTE, or ABSTAIN** on a typed claim about the code index — the read door of the *sound-genesis
PROVEN family*. Three pure, total, `$0`-LLM oracles (`@atlas/genesis`) decide a claim over the live
symbol-reverse view (the #99b N0 completeness feed): soundness comes from a **witnessed existence**, never
from an absence the index cannot guarantee. This is the program-checkable half of the sound-genesis gate —
the answers it gives are proofs against the index, not model judgements. Read-only: it opens no write path and
carries no governed token (`GOVERNANCE_SURFACE` stays 5).

## The three classes

| kind | claim | verdicts | soundness |
|---|---|---|---|
| `dependency` | *a caller of `<target>` exists under `--scope`* | `proven` / `abstain` | `proven` = a witnessed caller, sound in **any** world; never refutes (a cross-package absence is not sound) |
| `count` | *≥ N distinct callers of `<target>` exist under `--scope`* | `proven` / `abstain` | `proven` = a witnessed lower bound (`--exact` additionally needs a **closed** world) |
| `negation` | *no caller of `<target>` exists under `--scope`* | `proven` / `refuted` / `abstain` | the #220 closed-world dual: `refuted` = a witnessed counterexample (any world); `proven` only when the single scope is closed |

`abstain` is an **honest non-answer**, not a failure: the target is `local`/unresolvable, out of scope, or
the world is open. It is exit `0` with the verdict on `data`, exactly as `atlas negations` surfaces an
abstention rather than hiding it — the sound gate declining to decide is a valid answer.

## Invocation

```
atlas verify-fact <kind> <target> --scope <s> [--world <w>] [--min <n>] [--exact]
```

- `<kind>` — required. One of `dependency`, `count`, `negation`.
- `<target>` — required. The **SCIP global symbol** the claim is about (a `local ` symbol always abstains —
  it is document-scoped, #189).
- `--scope <s>` — required. The path prefix the claim ranges over (segment-wise containment: `src` covers
  `src/payments`, `sr` does **not** cover `src`). For `negation` this is the single closed scope (#220).
- `--world <w>` — optional. The completeness world the check ranges over; defaults to `--scope`. Used by
  `dependency` (to discriminate the abstain reason) and by `count --exact` (the closed-world requirement).
  Unused by `negation`.
- `--min <n>` — required for `count`. The integer lower bound N (`≤ 0` / non-integer abstains as malformed).
- `--exact` — optional boolean for `count`. Demand `=== N` under a **closed** world, not just `≥ N`.

A malformed invocation (unknown kind, empty target/scope, missing `--min` for a count) is a structured error
with guidance and a **non-zero** exit — never a throw.

## Worked examples

```
$ atlas verify-fact dependency 'scip-ts . . `foo`().' --scope packages/genesis
status: ok
next: PROVEN: the dependency claim about '…foo…' is witnessed in the live index — a caller/definition exists under the scope, sound in any world (a proof, not a heuristic)
data: { kind: 'dependency', verdict: 'proven', oracle: 'symbol-reverse', target: '…', scope: 'packages/genesis' }
```

```
$ atlas verify-fact negation 'scip-ts . . `bar`().' --scope packages/index
status: ok
next: REFUTED: '…bar…' has a witnessed counterexample under the scope — the negation is false (this verdict is reachable only for the closed-world negation class)
data: { kind: 'negation', verdict: 'refuted', oracle: 'symbol-reverse', target: '…', scope: 'packages/index' }
```

## Invariant

> **VF-1** — `atlas verify-fact <kind> <target>` PROVES / REFUTES / ABSTAINS on a typed claim over the live
> symbol-reverse feed via the sound-genesis oracles (`@atlas/genesis`): soundness from a **witnessed
> existence**, never a cross-package absence; `dependency`/`count` never refute, only `negation` does (the
> closed-world dual, #220); a malformed invocation is a structured error and non-zero exit, never a throw.

The oracles are pure and total — the verdict is a deterministic function of the code index at the composed
rev, so identical arguments yield a byte-identical verdict. The feed is built once at composition (the code
index is immutable within a process), unlike the mutable-projection read legs (`atlas negations`) which
re-read per call.
