# `atlas init`

Move a repository in: walk it structurally and report the territories Atlas will hold knowledge about,
then install the `.gitignore` rule that keeps Atlas's durable store out of git. `$0`-LLM — it reads the tree
and writes no knowledge.

This page describes the **CLI** command `atlas init`. The MCP tool of the same job is `atlas-init`; both
route through the same handler, but only the CLI writes the `.gitignore` rule.

## Invocation

```
atlas init <path>
```

- `<path>` — required (the parser refuses a bare `atlas init`). See the note under *Refusals* about what it
  currently affects.
- No flags. Any flag you pass is folded into the argument bag and ignored (`packages/cli/src/parse.ts`).

## Worked example

A fresh git repo with `README.md` and `src/{greet,math}.ts`:

```
$ atlas init .
status: ok
next: review the T2/advisory move-in skeleton, then promote territories via atlas-emit
invariant: TOOLS-5: $0-LLM structural move-in, no auto-promotion above T2
data:
  territory: README.md
  territory: src
gitignore: created /tmp/demo/.gitignore denying .atlas/* (Atlas's durable store is DATA, never source)
# exit 0
```

Run it a second time and the ignore line changes — the rule is installed once, and `init` says so rather
than rewriting it:

```
$ atlas init .
status: ok
next: review the T2/advisory move-in skeleton, then promote territories via atlas-emit
invariant: TOOLS-5: $0-LLM structural move-in, no auto-promotion above T2
data:
  territory: .atlas
  territory: .gitignore
  territory: README.md
  territory: greet-fact.json
  territory: src
gitignore: .atlas/* already denied in /tmp/demo/.gitignore — nothing to do
# exit 0
```

(The transcripts above are real runs with the absolute path shortened to `/tmp/demo`; everything else is
verbatim. The second run lists more territories because the first run created `.gitignore` and the working
tree had picked up `.atlas/` and a fact file in between.)

Every territory moves in at **T2/advisory** with zero invariants. `init` promotes nothing — promotion is a
separate governed write through [`emit`](./emit.md).

## Exit codes

| code | meaning |
| --- | --- |
| `0` | the move-in ran |
| `1` | usage error — no `<path>`, or the runtime is not composed |
| `2` | a governance gate refused the invocation |

## What it refuses, and why

- **A missing `<path>`.** `atlas init` with no argument is a parse error (`exit 1`), not a defaulted `.`.
- **Nothing else, by design.** `init` is the one command **exempt** from the committed-store refusal below
  (`packages/cli/src/cli.ts`): it touches no durable state and it writes the very `.gitignore` rule that
  repairs that state, so refusing it would leave a user with a disabled Atlas and no supported way back on.
  Every other command refuses on a committed store — see [`query`](./query.md).

## Things worth knowing before you rely on it

- **`<path>` does not currently narrow the rendered territory list.** The move-in index returns the
  repository's top-level territories regardless of the path
  (`packages/adapter-io/src/index-adapter.ts`, `territories(_path)` ignores its argument); the path selects
  the blast radius, which the CLI does not render. Measured back-to-back in one repo state:
  `atlas init .`, `atlas init src` and `atlas init README.md` printed the identical five-territory block.
- **The `.gitignore` write is CLI-only.** It happens at the CLI entrypoint, not behind the `atlas-init`
  tool, so an MCP `atlas-init` call moves in *without* installing the ignore rule.
- **A failed ignore-rule write does not change the exit code.** It is reported as one extra line; the
  move-in itself is still a valid structural result.

## Related

- [`query`](./query.md) — read a territory's pack back.
- [`emit`](./emit.md) — the governed write door that puts knowledge into a territory.
- How-to: [move a repository in](../../how-to/move-a-repo-in.md).
