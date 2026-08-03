# `atlas reconcile`

The merge gate. Classify every fact whose grounding has moved since a merge base into `mechanical` (the
claim survived, the anchor moved) or `semantic` (the claim rotted), and block the merge on any semantic
flip. Read-only — it persists nothing.

This page describes the **CLI** command `atlas reconcile`. The MCP tool is `atlas-reconcile`.

## Invocation

```
atlas reconcile <mergeBase> [--accept-reground]
```

- `<mergeBase>` — required. The revision to classify drift against.
- `--accept-reground` — optional bare flag. Counts the mechanical subset as accepted for one-pass
  re-grounding. It never touches the semantic subset and never changes the exit code.
- Any other flag is folded into the argument bag and ignored.

## Worked example

A fact grounded at `src/greet.ts`, then `src/greet.ts` edited and committed. `20ff947…` is the commit
before the edit:

```
$ atlas reconcile 20ff947f42e7a2052326a59399a94a1864301b47
status: rejected
next: a semantic flip blocks the merge (exit 2) — re-author before merging
invariant: TOOLS-8: reviewable drift, block on any semantic flip
# exit 2
```

Against a base with no drift (here, current `HEAD`):

```
$ atlas reconcile 22b3ca01865aaa34fff93f050db9c7bd927b4546
status: ok
next: a semantic flip blocks the merge (exit 2) — re-author before merging
invariant: TOOLS-8: reviewable drift, block on any semantic flip
# exit 0
```

That is the whole CLI output. **The exit code is the entire signal on this transport** — the CLI renders no
`data:` block for reconcile, so the drifted set, the mechanical/semantic split and the counts are not shown.
To find out *what* drifted, use [`atlas doctor why <nodeKey>`](./doctor.md), or call the `atlas-reconcile`
tool over MCP, which returns the full `ReconcileOut` as JSON:

```json
{"data":{"drift":[{"fact":"f9517988…","class":"mechanical","anchorWas":{…},"anchorNow":{…}}],
 "mechanical":["f9517988…"],"semantic":[],"regroundedCount":1,"reauthorCount":0,"exitCode":0}}
```

(A real MCP response from a second demo repo whose drift classified `mechanical`, trimmed to the `data`
object with the hashes elided.)

## Exit codes

| code | meaning |
| --- | --- |
| `0` | no semantic flip — the merge is not blocked |
| `1` | usage error — missing `<mergeBase>`, or the runtime is not composed |
| `2` | at least one semantic flip. Re-author before merging |

Note the shape of the `2`: reconcile's refusal is carried on the verdict `data` as a non-zero `exitCode`,
which `deriveStatus` (`packages/cli/src/map.ts`) maps to `rejected`. That is why the block prints
`status: rejected` with no `reason:` line — there is no rejection string, only a classification.

## What it refuses, and why

- **Any semantic flip.** A claim that no longer re-derives anywhere is not a rename; it is a fact that has
  become false, and merging past it would publish a lie. Re-author or retire it first.
- **A committed durable store** — the same provenance refusal every other command gets; see
  [`query`](./query.md).

## Things worth knowing before you rely on it

- **It does not validate `<mergeBase>`.** Measured: `atlas reconcile deadbeef`, `atlas reconcile
  not-a-sha-at-all` and `atlas reconcile ""` all exit `0` with `status: ok` in a repository that has real
  drift against its actual base. An unresolvable rev yields an empty drift set, and an empty drift set is
  indistinguishable from a clean one. If you wire this into CI, resolve the merge base yourself first.
- **`--accept-reground` is unobservable from the CLI.** It is parsed, marshalled and passed to the door,
  but its only effect is `regroundedCount`, which the CLI does not render. Measured over MCP:
  `{"mergeBase":…,"options":{"acceptReground":true}}` returns `regroundedCount: 1` where the same call
  without it returns `0`.
- **Drift is measured against the base you name, not against "is my store fresh".** Re-grounding a fact
  clears `stale` on [`query`](./query.md) but does not make the anchor un-move relative to an older base,
  so `reconcile <oldBase>` can still report drift afterwards. Measured in the demo repo.

## Transport differences

The published `atlas-reconcile` schema declares a top-level `acceptReground` boolean. The wired leg reads
`args.options.acceptReground` (`packages/adapter-io/src/wire.ts`). Measured over real MCP stdio: the
schema-declared spelling `{"mergeBase":…,"acceptReground":true}` returns `regroundedCount: 0` — it is
accepted and then ignored — while the undeclared `{"mergeBase":…,"options":{"acceptReground":true}}` returns
`regroundedCount: 1`. The CLI's `--accept-reground` marshals into the `options` shape and therefore works.
**Over MCP the documented knob does nothing.** This is recorded here as a fact about the product; it is not
fixed by this page.

## Related

- [`doctor`](./doctor.md) — `why` explains one drifted fact; `reground` proposes the fix.
- [`emit`](./emit.md) — the door a re-ground actually goes through.
- How-to: [find and fix drifted knowledge](../../how-to/find-and-fix-drift.md).
