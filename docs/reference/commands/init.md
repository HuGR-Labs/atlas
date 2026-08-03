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

- `<path>` — required (the parser refuses a bare `atlas init`). **Repo-relative**, and it selects what is
  walked: `.` is the whole repository, `src` is that subtree, `src/greet.ts` is that one file. A path that
  names nothing in the tree is refused (see *Refusals*).
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
  territory: src
gitignore: .atlas/* already denied in /tmp/demo/.gitignore — nothing to do
# exit 0
```

(The second run lists `.gitignore` because the first run created it.)

The path selects what is walked. Same repository, same moment, three paths:

```
$ atlas init src
data:
  territory: src/greet.ts
  territory: src/math.ts
# exit 0

$ atlas init src/greet.ts
data:
  territory: src/greet.ts
# exit 0

$ atlas init README.md
data:
  territory: README.md
# exit 0
```

(Real runs, trimmed to the `data:` block and the exit code; the `status:`/`next:`/`invariant:`/`gitignore:`
lines are identical to the first transcript. The absolute path is shortened to `/tmp/demo`.)

A directory reports what is under it; a file reports itself. A file is never decomposed into the sub-file
AST units the index folds beneath it — a territory is a file or a directory.

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
- **A `<path>` that names nothing in the tree**, including an ABSOLUTE path — the index is keyed by
  repo-relative paths, so `/home/me/repo` names no unit in it:

  ```
  $ atlas init no/such/path
  status: error
  next: review the T2/advisory move-in skeleton, then promote territories via atlas-emit
  invariant: TOOLS-5: $0-LLM structural move-in, no auto-promotion above T2
  reason: no-such-path: no structural unit at 'no/such/path' — atlas init walks a path that exists in the
  repository tree, spelled repo-relative (`.` for the whole repo, `src`, `src/lib.ts`)
  # exit 1
  ```

  (One long `reason:` line, wrapped here.) It used to exit `0` and print the repository's full top-level
  territory block for any path at all, which read as a successful move-in of a directory that does not
  exist. An empty list would be no better — it is indistinguishable from an empty repository.
- **Nothing else, by design.** `init` is the one command **exempt** from the committed-store refusal below
  (`packages/cli/src/cli.ts`): it touches no durable state and it writes the very `.gitignore` rule that
  repairs that state, so refusing it would leave a user with a disabled Atlas and no supported way back on.
  Every other command refuses on a committed store — see [`query`](./query.md).

## Things worth knowing before you rely on it

- **The blast radius is computed and not rendered.** `<path>` selects both the territory list (shown) and
  the reverse-dependency blast radius (not shown by the CLI). Over MCP the whole `InitOut` comes back, so
  `blastRadius` is readable there.
- **The `.gitignore` write is CLI-only.** It happens at the CLI entrypoint, not behind the `atlas-init`
  tool, so an MCP `atlas-init` call moves in *without* installing the ignore rule. It is also attempted on
  the refusal path above, so a refused `init` can still print a `gitignore:` line.
- **A failed ignore-rule write does not change the exit code.** It is reported as one extra line; the
  move-in itself is still a valid structural result.

## Related

- [`query`](./query.md) — read a territory's pack back.
- [`emit`](./emit.md) — the governed write door that puts knowledge into a territory.
- How-to: [move a repository in](../../how-to/move-a-repo-in.md).
