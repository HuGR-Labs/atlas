# `atlas mine`

Run the one-time genesis bootstrap over the repository: walk it structurally, rank a frontier of sites, and
ask a configured model to propose facts at those sites. Everything it writes is a **candidate**, into a
staging sidecar — `mine` holds no truth gate, no authorization and no ratifier, so it structurally cannot
write governed knowledge.

This page describes the **CLI** command `atlas mine`. There is **no `atlas-mine` MCP tool**.

## Invocation

```
atlas mine <repo>
```

- `<repo>` — required by the parser (arity 1), and **currently ignored**: the entrypoint calls
  `runMine(process.cwd())` (`packages/cli/src/cli.ts`). Measured: `atlas mine /definitely/not/a/repo` run
  from a demo repository mined that demo repository and exited `0`. Pass `.` and run it from the repo root.
- No flags. The budget ceiling and scope seams exist in `MineDeps` but no CLI flag reaches them, so do not
  look for `--budget` or `--scope`.

The model is configured **outside the repository**, at `$ATLAS_MODEL_CONFIG`, else
`$XDG_CONFIG_HOME/atlas/model.json`, else `~/.config/atlas/model.json`. That location is enforced, not just
recommended — see *What it refuses*.

## Worked example — the zero-config run

```
$ atlas mine .
genesis: seeded 0 candidate fact(s); ratified 0
cost: llmCalls 0 · budgetSpent 0
mine: 0 candidate facts — 0 sites visited: the structural pass (skeleton → ranked frontier) yielded no site, so no proposer was ever consulted; wiring a model would not change this 0. Run `atlas doctor index` to see whether this repository has the SCIP index the frontier is derived from
# exit 0
```

**Read the third line before concluding anything.** A `0` here has more than one cause and `mine` computes
which one from the run's own report rather than guessing:

- `0 sites visited` — the run stopped *upstream* of the model. The structural frontier was empty, so no
  proposer was ever consulted. Wiring a model changes nothing; run
  [`atlas doctor index`](./doctor.md#doctor-index--why-mine-found-nothing), which reports whether this
  repository has the SCIP index the frontier is derived from and prints the command that produces one. It
  points, it does not promise — an indexed repository can still have an empty frontier, and that leg says
  which case you are in.
- `N site(s) visited and every one abstained: no proposer model is wired` — *this* is the abstention case.
  No model is configured, so nothing could be proposed. Facts are never fabricated.
- `N site(s) visited and every one abstained` with a model wired — the model was asked and declined, or the
  admission gate refused. Also not a failure.
- `the pass did not run to completion` — a `0` that is not a finished result at all (exit `1`).

The first of those four is the one printed above. The other three are the remaining branches of
`mineWhyEmpty` (`packages/cli/src/mine-render.ts`) and need a non-empty frontier, which this repository does
not have; they are listed so a `0` is never read as "the tool is broken".

With a model configured, the run also prints its prompt provenance:

```
$ atlas mine .
genesis: seeded 0 candidate fact(s); ratified 0
cost: llmCalls 0 · budgetSpent 0
prompt: 170c27cd1ec1854cb7a5af59ea0186ea1c3ddf78e6f25554bd920eb2d1dcaf57 — the artifact every proposal on this run was built from
mine: 0 candidate facts — 0 sites visited: the structural pass (skeleton → ranked frontier) yielded no site, so no proposer was ever consulted; wiring a model would not change this 0. Run `atlas doctor index` to see whether this repository has the SCIP index the frontier is derived from
# exit 0
```

## Exit codes

| code | meaning |
| --- | --- |
| `0` | the pass ran to completion (a `0`-candidate pass is still a completed pass) |
| `1` | the pass was partial — a budget ran out, or a staging commit was refused. The report says which, and prints `partial: resume at rank <n>` |
| `2` | a governed refusal: the model configuration could not be trusted |

The `1`/`2` split is deliberate: a run that legitimately ran out of budget keeps its report and exits `1`,
so it stays distinguishable from a misconfiguration. The `0` and `2` rows below are executed on this page;
the `1` row is read off `foldVerdict` (`packages/cli/src/mine-render.ts`) and is not reachable in a
repository whose frontier is empty.

## What it refuses, and why

Both blocks below are real runs with the absolute paths shortened to `/tmp/demo` and `/tmp/config`;
everything else is verbatim.

**A model config inside the repository under analysis.** The config names an executable Atlas will *run*, so
sourcing it from a cloned repository would be an arbitrary-code-execution path. Checked before the file is
even opened, so the refusal cannot depend on its contents:

```
$ ATLAS_MODEL_CONFIG=$PWD/.atlas/model.json atlas mine .
status: rejected
next: refusing to read the model command from inside the repository under analysis (/tmp/demo/.atlas/model.json). The command names an executable Atlas will RUN, so sourcing it from the repo would make `atlas mine` on a cloned repository an arbitrary-code-execution path. Move it to ~/.config/atlas/model.json.
invariant: CLI-3b: a governed refusal exits 2 — the invocation was well-formed and a gate declined it, so re-running it with different arguments will not help; exit 1 is reserved for a usage/wiring error
reason: refusing to read the model command from inside the repository under analysis […]
# exit 2
```

**A malformed model config.** It throws rather than degrading to "no model", because a broken config that
silently abstained would report a clean empty run — indistinguishable from a repository that genuinely holds
no groundable fact:

```
$ atlas mine .
status: rejected
next: the model config at /tmp/config/atlas/model.json is not valid JSON: SyntaxError: Unexpected token 'o', "oops" is not valid JSON
invariant: CLI-3b: a governed refusal exits 2 — the invocation was well-formed and a gate declined it, so re-running it with different arguments will not help; exit 1 is reserved for a usage/wiring error
reason: the model config at /tmp/config/atlas/model.json is not valid JSON: SyntaxError: Unexpected token 'o', "oops" is not valid JSON
# exit 2
```

Every field rejection names the offending field, so you do not have to bisect your own file. Measured
examples: `` `roles.propose.cmd` must be a non-empty string ``, and — for the `costCap` key an operator will
reasonably write — `` `costCap` is not a knob: a decimal cannot be canonicalized … Give the EXACT ratio
instead — `"costCapNum": 5, "costCapDen": 100` for 0.05 ``.

**An absent config is not a refusal.** It is the honest zero-config state: `mine` abstains and says so.

**A model binary that is missing, times out, or exits non-zero** is a governed refusal too (exit `2`), with
the command name and its stderr in the message rather than an anonymous partial run — `packages/cli/src/cli.ts`
routes `ModelCommandError` through the same refusal path as the two config errors. This one is **not
exercised in this page**: it is raised per visited site, and no run reachable without a SCIP-indexed
repository visits one (see below).

## Things worth knowing before you rely on it

- **The structural frontier needs a SCIP index.** `axes.edges` is derived from SCIP occurrences alone, and
  the structural frontier ranks by dependency-graph degree, so a repository with no `.atlas/index.scip` has
  zero edges, zero seeds and zero sites — regardless of the model.
  `packages/adapter-io/src/skeleton-source.ts` states this in its header as an honest hole. Measured: two
  demo repositories, one of them with real TypeScript `import` edges between three files, both reported
  `0 sites visited`.
  **Atlas does not build that index for you** — it plans it. Run
  [`atlas doctor index`](./doctor.md#doctor-index--why-mine-found-nothing) to get the exact pinned command
  for the languages in your repository, run it yourself, then re-run `mine`. Measured on this repository:
  `0 sites visited` before, `200` after (`llmCalls 200 · budgetSpent 200`, still 0 facts because no model
  was wired — the frontier is what changed).
- **Everything `mine` writes is a candidate**, in `.atlas/staging.json`, stamped with the reserved scope
  `atlas:mined`. Granting that scope in `.atlas/policy.json` is what APPOINTS a curator; this repository
  grants it to `seat:orchestrator`, and without the grant every promotion is correctly refused
  `unauthorized`.
- **[`promote`](./promote.md) is the command that carries a candidate into knowledge**, through the same
  governed emit door everything else writes through, and only with a ratifier named. What you still cannot
  plan around this page is a mine-to-**query** loop, and the reason is no longer that `mine` stages nothing
  (its admission gate is wired — REQ-CLI-4d): a mined candidate is `T2`, which `atlas query` bounds OUT of
  the pack, so a promoted mined fact is read back with [`node`](./node.md).

## Related

- [`emit`](./emit.md) — the governed door a fact must pass to become knowledge.
- [`query`](./query.md) — reads governed knowledge only; staged candidates do not appear.
- [`doctor index`](./doctor.md#doctor-index--why-mine-found-nothing) — whether this repository is
  SCIP-indexed, and the command that indexes it.
