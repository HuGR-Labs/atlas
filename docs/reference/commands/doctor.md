# `atlas doctor`

Diagnose the knowledge base: browse the archive, explain why a fact broke, check the hot set against a
budget, and get a proposed repair. Read-only and advisory — every leg is built over a port with no write
method, so `doctor` **cannot** persist anything, including its own repair plans.

This page describes the **CLI** command `atlas doctor`. There is **no `atlas-doctor` MCP tool** — see
*Transport differences*.

## Invocation

```
atlas doctor archive  [scope]
atlas doctor why      <nodeKey>
atlas doctor hotset   <budget>
atlas doctor reground <nodeKey>
```

- Exactly four subcommands (`DOCTOR_SUBCOMMANDS` in `packages/cli/src/doctor.ts`). Anything else is refused.
- `archive`'s `[scope]` is optional and filters on the fact's declared `scope` field, not on a path.
- `why` and `reground` take a **nodeKey** — the identifier `atlas query` prints on its `inv` lines.
- `hotset` takes a number.
- No flags on any subcommand.

## Worked examples

```
$ atlas doctor archive
status: ok
doctor: archive
archive: [20512b7622b0d8864f20311700f4091b991ea5317797ce6158371d06adca0b06, 87ab346d3bd8dacdb87e9594ee8cc9f2649fc25706421d80619e8bf278e02153]
next: doctor is read-only — run any proposed RegroundPlan through atlas-emit to persist it
invariant: TOOLS-12: read/advisory-only diagnosis, persists nothing, carries no write authority
# exit 0
```

Those are **content addresses**, which is what [`atlas node`](./node.md) takes. `archive` is the only
shipped command that hands you one for a fact you did not just emit.

After `src/greet.ts` was edited under a fact grounded at it:

```
$ atlas doctor why f9517988f330a775ffc767c072fa01e52f38642220442916ca6b9b8c20bef532
status: ok
doctor: why
whyBroken: fact=f9517988f330a775ffc767c072fa01e52f38642220442916ca6b9b8c20bef532 class=semantic anchorWas=ff0f2674ae3fde2702932c07aeb61ecb5108e9cd575d5788e3a85c02a2bca99d anchorNow=9e8d370d77f682bee731b20b6ae1dc35c48c8a16cf96f58df2d1929c032bef6f
next: doctor is read-only — run any proposed RegroundPlan through atlas-emit to persist it
invariant: TOOLS-12: read/advisory-only diagnosis, persists nothing, carries no write authority
# exit 0
```

`class=semantic` means the claim's anchor content is gone from the tree entirely — the fact rotted.
`class=mechanical` would mean the same content moved and the fact can be re-grounded.

```
$ atlas doctor reground f9517988f330a775ffc767c072fa01e52f38642220442916ca6b9b8c20bef532
status: ok
doctor: reground
plan: action=retire fact=f9517988f330a775ffc767c072fa01e52f38642220442916ca6b9b8c20bef532 — PROPOSAL only; persists nothing. Run through atlas-emit to persist.
next: doctor is read-only — run any proposed RegroundPlan through atlas-emit to persist it
invariant: TOOLS-12: read/advisory-only diagnosis, persists nothing, carries no write authority
# exit 0
```

`action` is `reground` for mechanical drift and `retire` for semantic drift. Either way nothing has changed
on disk; the plan becomes real only through [`emit`](./emit.md).

```
$ atlas doctor hotset 2000
status: ok
doctor: hotset
hotSet: size=1 budget=2000 over=false
next: doctor is read-only — run any proposed RegroundPlan through atlas-emit to persist it
invariant: TOOLS-12: read/advisory-only diagnosis, persists nothing, carries no write authority
# exit 0
```

A fact that is fine reports so rather than erroring — `whyBroken: none`, `plan: none`.

## Exit codes

| code | meaning |
| --- | --- |
| `0` | the diagnostic ran (including `none` results) |
| `1` | usage error — no subcommand, an unknown subcommand, a missing or non-numeric argument, or no wired diagnostic source |
| `2` | a governance gate refused the invocation (the committed-store tripwire) |

## What it refuses, and why

**An unknown subcommand** — the surface is exactly the four legs (`DOCTOR_SUBCOMMANDS`) and it names them:

```
$ atlas doctor bogus
status: error
next: unknown doctor subcommand 'bogus': expected one of archive|why|hotset|reground
invariant: TOOLS-12: read/advisory-only diagnosis, persists nothing, carries no write authority
reason: unknown doctor subcommand 'bogus': expected one of archive|why|hotset|reground
# exit 1
```

**No subcommand at all** — caught one layer earlier, by the parser's arity rule:

```
$ atlas doctor
status: error
next: command 'doctor' requires 1 positional argument(s), got 0
invariant: CLI-1b: a malformed invocation yields a structured error + guidance + non-zero exit, never a crash
reason: command 'doctor' requires 1 positional argument(s), got 0
# exit 1
```

**A missing or non-numeric argument** — `doctor why requires a <fact>`, `doctor hotset requires a numeric
<budget>`; both exit `1`.

**A committed durable store.** This one matters: without it, `atlas doctor hotset` would report
`size=0 … over=false` — "your knowledge base is empty and healthy" — about a store the read doors had just
refused to serve. Reporting health for state you have declined to read is worse than reporting nothing, so
the refusal is raised at the entrypoint and exits `2`. See [`query`](./query.md) for the full text.

**Writing anything.** Not a runtime check — a structural one. `doctor` never touches the wired handler and
its source port exposes no mutation, so there is no write path to refuse.

## Transport differences

`doctor` is **CLI-only**. The MCP server advertises `GOVERNANCE_SURFACE ∪ READ_SURFACE`, and `READ_SURFACE`
has no export site yet, so the advertised list is the five governance tools. Verified against the real
stdio server: `tools/list` returns `atlas-init`, `atlas-query`, `atlas-emit`, `atlas-reconcile`,
`atlas-link` — no `atlas-doctor`. Closing that gap is campaign 10, which is not built.

## Related

- [`node`](./node.md) — read a fact whole, using an address `doctor archive` printed.
- [`reconcile`](./reconcile.md) — the merge-gate view of the same drift.
- How-to: [find and fix drifted knowledge](../../how-to/find-and-fix-drift.md).
